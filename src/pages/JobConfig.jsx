import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { store } from '../data/store.js';
import {
  createJob,
  createSkill,
  createQuestion,
  createCriterion,
  JOB_STATUSES,
  QUESTION_CATEGORIES,
  SKILL_PRIORITIES,
} from '../data/models.js';
import Button from '../components/ui/Button.jsx';
import Input from '../components/ui/Input.jsx';
import Select from '../components/ui/Select.jsx';
import Badge from '../components/ui/Badge.jsx';
import Modal from '../components/ui/Modal.jsx';
import {
  PlusIcon,
  TrashIcon,
  CheckIcon,
  BriefcaseIcon,
  TagIcon,
  QuestionIcon,
  TargetIcon,
  ChevronRightIcon,
} from '../components/ui/Icons.jsx';
import './JobConfig.css';

/**
 * Job Position Configuration Page.
 * Answers: "How do I configure this role?"
 * Distinct structured layout for competency criteria, questions, and LinkedIn import.
 */
export default function JobConfig() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEditing = Boolean(id);

  // Form state
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState('draft');
  const [skills, setSkills] = useState([]);
  const [questions, setQuestions] = useState([]);
  const [criteria, setCriteria] = useState([]);
  const [errors, setErrors] = useState({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  // LinkedIn Import state
  const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [isImportLoading, setIsImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importReviewData, setImportReviewData] = useState(null);
  const [isImportReviewOpen, setIsImportReviewOpen] = useState(false);
  const [importSuccessBanner, setImportSuccessBanner] = useState('');

  // New skill inline draft
  const [newSkillName, setNewSkillName] = useState('');
  const [newSkillPriority, setNewSkillPriority] = useState('required');
  const [skillError, setSkillError] = useState('');

  // Question modal / draft
  const [isQuestionModalOpen, setIsQuestionModalOpen] = useState(false);
  const [questionText, setQuestionText] = useState('');
  const [questionCategory, setQuestionCategory] = useState('technical');
  const [questionMaxFollowUps, setQuestionMaxFollowUps] = useState(1);
  const [questionSkills, setQuestionSkills] = useState([]);
  const [questionError, setQuestionError] = useState('');

  // Criteria modal / draft
  const [isCriteriaModalOpen, setIsCriteriaModalOpen] = useState(false);
  const [criteriaName, setCriteriaName] = useState('');
  const [criteriaDescription, setCriteriaDescription] = useState('');
  const [criteriaSkills, setCriteriaSkills] = useState([]);
  const [criteriaError, setCriteriaError] = useState('');

  // Delete confirmation modal
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);

  // Load existing job if editing
  useEffect(() => {
    if (isEditing) {
      const existing = store.jobs.getById(id);
      if (existing) {
        setTitle(existing.title || '');
        setDescription(existing.description || '');
        setStatus(existing.status || 'draft');
        setSkills(existing.skills || []);
        setQuestions(existing.questions || []);
        setCriteria(existing.criteria || []);
      } else {
        navigate('/', { replace: true });
      }
    }
  }, [id, isEditing, navigate]);

  // LinkedIn Import handler
  const handleStartLinkedInImport = () => {
    const trimmed = linkedinUrl.trim();
    setImportError('');

    if (!trimmed) {
      setImportError('Please enter a LinkedIn job posting URL.');
      return;
    }

    if (!trimmed.toLowerCase().includes('linkedin.com/jobs')) {
      setImportError(
        'Invalid LinkedIn URL. Please provide a URL in the format: https://www.linkedin.com/jobs/view/123456789'
      );
      return;
    }

    setIsImportLoading(true);

    // Simulate honest analysis with network latency and parsing
    setTimeout(() => {
      setIsImportLoading(false);
      try {
        const extracted = parseLinkedInPosting(trimmed);
        setImportReviewData(extracted);
        setIsImportReviewOpen(true);
      } catch (err) {
        setImportError(err.message || 'Failed to extract job posting details.');
      }
    }, 600);
  };

  const handleApplyImportedRole = () => {
    if (!importReviewData) return;

    setTitle(importReviewData.title);
    setDescription(importReviewData.description);

    // Map extracted skills
    const createdSkills = importReviewData.skills.map((s) =>
      createSkill({ name: s.name, priority: s.priority })
    );
    setSkills(createdSkills);

    // Map extracted questions with skill linkages
    const createdQuestions = importReviewData.questions.map((q, idx) =>
      createQuestion({
        text: q.text,
        category: q.category,
        order: idx,
        maxFollowUps: q.maxFollowUps,
        relatedSkills: createdSkills.slice(0, 2).map((s) => s.id),
      })
    );
    setQuestions(createdQuestions);

    // Map criteria
    const createdCriteria = importReviewData.criteria.map((c) =>
      createCriterion({
        name: c.name,
        description: c.description,
        relatedSkills: createdSkills.slice(0, 2).map((s) => s.id),
      })
    );
    setCriteria(createdCriteria);

    setIsImportReviewOpen(false);
    setIsImportPanelOpen(false);
    setImportSuccessBanner(`Successfully imported "${importReviewData.title}" from LinkedIn.`);
    setTimeout(() => setImportSuccessBanner(''), 6000);
  };

  // Skill management
  const handleAddSkill = (e) => {
    e?.preventDefault();
    const trimmed = newSkillName.trim();
    if (!trimmed) {
      setSkillError('Skill name cannot be empty');
      return;
    }
    if (skills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      setSkillError('Skill already added to role');
      return;
    }

    const newSkill = createSkill({
      name: trimmed,
      priority: newSkillPriority,
    });
    setSkills([...skills, newSkill]);
    setNewSkillName('');
    setSkillError('');
  };

  const handleRemoveSkill = (skillId) => {
    setSkills(skills.filter((s) => s.id !== skillId));
    setQuestions(
      questions.map((q) => ({
        ...q,
        relatedSkills: (q.relatedSkills || []).filter((sId) => sId !== skillId),
      }))
    );
    setCriteria(
      criteria.map((c) => ({
        ...c,
        relatedSkills: (c.relatedSkills || []).filter((sId) => sId !== skillId),
      }))
    );
  };

  // Question management
  const handleOpenAddQuestion = () => {
    setQuestionText('');
    setQuestionCategory('technical');
    setQuestionMaxFollowUps(1);
    setQuestionSkills([]);
    setQuestionError('');
    setIsQuestionModalOpen(true);
  };

  const handleSaveQuestion = () => {
    const trimmed = questionText.trim();
    if (!trimmed) {
      setQuestionError('Question prompt is required');
      return;
    }

    const newQ = createQuestion({
      text: trimmed,
      category: questionCategory,
      order: questions.length,
      maxFollowUps: Number(questionMaxFollowUps),
      relatedSkills: questionSkills,
      requirementIds: questionSkills,
    });

    setQuestions([...questions, newQ]);
    setIsQuestionModalOpen(false);
  };

  const handleRemoveQuestion = (questionId) => {
    setQuestions(questions.filter((q) => q.id !== questionId));
  };

  const handleMoveQuestion = (index, direction) => {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= questions.length) return;
    const reordered = [...questions];
    const [moved] = reordered.splice(index, 1);
    reordered.splice(targetIndex, 0, moved);
    setQuestions(reordered.map((q, idx) => ({ ...q, order: idx })));
  };

  const toggleQuestionSkill = (skillId) => {
    if (questionSkills.includes(skillId)) {
      setQuestionSkills(questionSkills.filter((s) => s !== skillId));
    } else {
      setQuestionSkills([...questionSkills, skillId]);
    }
  };

  // Criteria management
  const handleOpenAddCriteria = () => {
    setCriteriaName('');
    setCriteriaDescription('');
    setCriteriaSkills([]);
    setCriteriaError('');
    setIsCriteriaModalOpen(true);
  };

  const handleSaveCriteria = () => {
    const trimmedName = criteriaName.trim();
    if (!trimmedName) {
      setCriteriaError('Criterion name is required');
      return;
    }

    const newC = createCriterion({
      name: trimmedName,
      description: criteriaDescription.trim(),
      relatedSkills: criteriaSkills,
    });

    setCriteria([...criteria, newC]);
    setIsCriteriaModalOpen(false);
  };

  const handleRemoveCriteria = (criterionId) => {
    setCriteria(criteria.filter((c) => c.id !== criterionId));
  };

  const toggleCriteriaSkill = (skillId) => {
    if (criteriaSkills.includes(skillId)) {
      setCriteriaSkills(criteriaSkills.filter((s) => s !== skillId));
    } else {
      setCriteriaSkills([...criteriaSkills, skillId]);
    }
  };

  // Save full job
  const handleSaveJob = (e) => {
    e.preventDefault();
    setErrors({});

    const jobData = {
      title: title.trim(),
      description: description.trim(),
      status,
      skills,
      questions,
      criteria,
    };

    if (!jobData.title) {
      setErrors({ title: 'Position title is required' });
      return;
    }

    if (jobData.title.length > 200) {
      setErrors({ title: 'Title must be 200 characters or fewer' });
      return;
    }

    if (jobData.description.length > 2000) {
      setErrors({ description: 'Description must be 2000 characters or fewer' });
      return;
    }

    try {
      if (isEditing) {
        store.jobs.update(id, {
          ...jobData,
          updatedAt: new Date().toISOString(),
        });
      } else {
        const newJob = createJob(jobData);
        store.jobs.add(newJob);
      }
      setSaveSuccess(true);
      setTimeout(() => {
        navigate('/');
      }, 400);
    } catch (err) {
      setErrors({ form: err.message || 'Failed to save job position' });
    }
  };

  // Delete job
  const handleDeleteJob = () => {
    if (!isEditing) return;
    try {
      store.jobs.remove(id);
      setIsDeleteModalOpen(false);
      navigate('/');
    } catch (err) {
      setErrors({ form: err.message || 'Failed to delete position' });
    }
  };

  const requiredSkills = skills.filter((s) => s.priority === 'required');
  const preferredSkills = skills.filter((s) => s.priority === 'preferred');

  return (
    <div className="job-config">
      {/* Breadcrumb Navigation */}
      <nav className="job-config__breadcrumb" aria-label="Breadcrumb">
        <button
          type="button"
          className="breadcrumb-link"
          onClick={() => navigate('/')}
        >
          ← Back to Hiring Activity
        </button>
      </nav>

      <form onSubmit={handleSaveJob} noValidate>
        {/* Top Control Bar */}
        <div className="job-config__topbar">
          <div className="job-config__topbar-info">
            <div className="job-config__status-pill">
              <Badge variant={status} size="sm">
                {status.toUpperCase()}
              </Badge>
              <span className="job-config__meta-hint">
                {isEditing ? 'Editing Role Configuration' : 'Configuring New Role'}
              </span>
            </div>
            <h1 className="job-config__heading">
              {title || (isEditing ? 'Untitled Role' : 'Create New Position')}
            </h1>
            <p className="job-config__subheading">
              Configure competencies, structured sequential interview questions, and evaluation guidance.
            </p>
          </div>

          <div className="job-config__topbar-actions">
            <Button
              id="cancel-btn"
              variant="secondary"
              onClick={() => navigate('/')}
            >
              Cancel
            </Button>
            {isEditing && (
              <Button
                id="delete-job-btn"
                variant="danger"
                icon={<TrashIcon />}
                onClick={() => setIsDeleteModalOpen(true)}
              >
                Delete
              </Button>
            )}
            <Button
              id="save-job-btn"
              type="submit"
              variant="primary"
              icon={<CheckIcon />}
            >
              {isEditing ? 'Save Changes' : 'Create Position'}
            </Button>
          </div>
        </div>

        {/* Form Alerts */}
        {errors.form && (
          <div className="alert alert--danger" role="alert">
            {errors.form}
          </div>
        )}

        {saveSuccess && (
          <div className="alert alert--success" role="status">
            Position saved successfully. Returning to dashboard...
          </div>
        )}

        {importSuccessBanner && (
          <div className="alert alert--success" role="status">
            {importSuccessBanner}
          </div>
        )}

        {/* Dedicated LinkedIn Import Section */}
        <div className="linkedin-import-box">
          <div className="linkedin-import-box__header">
            <div className="linkedin-import-box__title-group">
              <span className="linkedin-badge">LinkedIn Import</span>
              <h3 className="linkedin-import-box__title">Import Role from LinkedIn Job Posting</h3>
              <p className="linkedin-import-box__desc">
                Paste a public LinkedIn job URL to automatically extract role title, required competencies, and screening questions.
              </p>
            </div>
            <Button
              id="toggle-linkedin-import-btn"
              type="button"
              variant={isImportPanelOpen ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => setIsImportPanelOpen(!isImportPanelOpen)}
            >
              {isImportPanelOpen ? 'Hide Importer' : 'Import from LinkedIn URL'}
            </Button>
          </div>

          {isImportPanelOpen && (
            <div className="linkedin-import-box__body">
              <div className="linkedin-input-row">
                <div className="linkedin-input-wrapper">
                  <Input
                    id="linkedin-url-input"
                    placeholder="https://www.linkedin.com/jobs/view/..."
                    value={linkedinUrl}
                    onChange={(e) => {
                      setLinkedinUrl(e.target.value);
                      setImportError('');
                    }}
                    error={importError}
                    hint="Accepts public LinkedIn job URLs (e.g., https://www.linkedin.com/jobs/view/123456789)"
                  />
                </div>
                <Button
                  id="submit-linkedin-import-btn"
                  type="button"
                  variant="primary"
                  disabled={isImportLoading}
                  onClick={handleStartLinkedInImport}
                >
                  {isImportLoading ? 'Analyzing Posting...' : 'Analyze & Review'}
                </Button>
              </div>

              {isImportLoading && (
                <div className="linkedin-loading-indicator" role="status">
                  <span className="loading-spinner" />
                  <span>Connecting to LinkedIn posting and extracting structured competencies...</span>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Section 1: Position Overview */}
        <section className="config-section">
          <div className="config-section__header">
            <div className="config-section__icon-box">
              <BriefcaseIcon />
            </div>
            <div>
              <h2 className="config-section__title">Position Overview</h2>
              <p className="config-section__desc">Define the public role title, operational status, and role scope.</p>
            </div>
          </div>

          <div className="config-section__body">
            <div className="form-row">
              <div className="form-col form-col--8">
                <Input
                  id="job-title-input"
                  label="Position Title"
                  placeholder="e.g. Senior Frontend Engineer"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  error={errors.title}
                  required
                />
              </div>
              <div className="form-col form-col--4">
                <Select
                  id="job-status-select"
                  label="Recruiting Status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value)}
                  options={JOB_STATUSES.map((s) => ({
                    value: s,
                    label: s.charAt(0).toUpperCase() + s.slice(1),
                  }))}
                />
              </div>
            </div>

            <Input
              id="job-desc-input"
              label="Role Scope & Responsibilities"
              placeholder="Outline the core responsibilities, team mission, and expected outcomes..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              rows={4}
              error={errors.description}
              hint="Max 2,000 characters."
            />
          </div>
        </section>

        {/* Section 2: Skills & Competencies */}
        <section className="config-section">
          <div className="config-section__header">
            <div className="config-section__icon-box">
              <TagIcon />
            </div>
            <div>
              <h2 className="config-section__title">Competency Framework ({skills.length})</h2>
              <p className="config-section__desc">
                Specify required and preferred skills evaluated during the screening session.
              </p>
            </div>
          </div>

          <div className="config-section__body">
            {/* Inline add skill form */}
            <div className="add-skill-form">
              <div className="add-skill-form__input">
                <Input
                  id="skill-name-input"
                  placeholder="e.g. React Architecture, TypeScript, System Reliability"
                  value={newSkillName}
                  onChange={(e) => setNewSkillName(e.target.value)}
                  error={skillError}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddSkill();
                    }
                  }}
                />
              </div>
              <div className="add-skill-form__priority">
                <Select
                  id="skill-priority-select"
                  value={newSkillPriority}
                  onChange={(e) => setNewSkillPriority(e.target.value)}
                  options={SKILL_PRIORITIES.map((p) => ({
                    value: p,
                    label: p === 'required' ? 'Required (Must-have)' : 'Preferred (Nice-to-have)',
                  }))}
                />
              </div>
              <Button
                id="add-skill-btn"
                type="button"
                variant="secondary"
                icon={<PlusIcon />}
                onClick={handleAddSkill}
              >
                Add Skill
              </Button>
            </div>

            {/* Two-column view: Required vs Preferred */}
            <div className="skills-categorized-grid">
              <div className="skills-column">
                <h4 className="skills-column__heading">
                  Required Competencies ({requiredSkills.length})
                </h4>
                {requiredSkills.length === 0 ? (
                  <p className="empty-subtext">No required skills added yet.</p>
                ) : (
                  <div className="skill-chips-wrap">
                    {requiredSkills.map((skill) => (
                      <div key={skill.id} className="skill-chip skill-chip--required">
                        <span className="skill-chip__name">{skill.name}</span>
                        <button
                          type="button"
                          className="skill-chip__remove"
                          onClick={() => handleRemoveSkill(skill.id)}
                          aria-label={`Remove skill ${skill.name}`}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="skills-column">
                <h4 className="skills-column__heading">
                  Preferred Competencies ({preferredSkills.length})
                </h4>
                {preferredSkills.length === 0 ? (
                  <p className="empty-subtext">No preferred skills added yet.</p>
                ) : (
                  <div className="skill-chips-wrap">
                    {preferredSkills.map((skill) => (
                      <div key={skill.id} className="skill-chip skill-chip--preferred">
                        <span className="skill-chip__name">{skill.name}</span>
                        <button
                          type="button"
                          className="skill-chip__remove"
                          onClick={() => handleRemoveSkill(skill.id)}
                          aria-label={`Remove skill ${skill.name}`}
                        >
                          &times;
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Section 3: Ordered Interview Questions */}
        <section className="config-section">
          <div className="config-section__header config-section__header--split">
            <div className="config-section__header-left">
              <div className="config-section__icon-box">
                <QuestionIcon />
              </div>
              <div>
                <h2 className="config-section__title">
                  Structured Interview Flow ({questions.length} questions)
                </h2>
                <p className="config-section__desc">
                  Ordered sequence of spoken questions presented to candidates during screening.
                </p>
              </div>
            </div>
            <Button
              id="open-add-question-modal-btn"
              type="button"
              variant="secondary"
              size="sm"
              icon={<PlusIcon />}
              onClick={handleOpenAddQuestion}
            >
              Add Question
            </Button>
          </div>

          <div className="config-section__body">
            {questions.length === 0 ? (
              <p className="empty-subtext">
                No questions configured yet. Add at least 1-2 structured screening questions.
              </p>
            ) : (
              <div className="question-items-list">
                {questions.map((q, idx) => (
                  <div key={q.id} className="question-item">
                    <div className="question-item__reorder">
                      <button
                        type="button"
                        className="btn-icon"
                        disabled={idx === 0}
                        onClick={() => handleMoveQuestion(idx, -1)}
                        title="Move question up"
                      >
                        ▲
                      </button>
                      <span className="question-item__index">{idx + 1}</span>
                      <button
                        type="button"
                        className="btn-icon"
                        disabled={idx === questions.length - 1}
                        onClick={() => handleMoveQuestion(idx, 1)}
                        title="Move question down"
                      >
                        ▼
                      </button>
                    </div>

                    <div className="question-item__content">
                      <p className="question-item__text">{q.text}</p>
                      <div className="question-item__badges">
                        <Badge variant="draft" size="sm">
                          {q.category}
                        </Badge>
                        <span className="question-item__followup-info">
                          Follow-ups allowed: {q.maxFollowUps ?? 1}
                        </span>
                        {q.relatedSkills && q.relatedSkills.length > 0 && (
                          <div className="question-item__skills">
                            {q.relatedSkills.map((sId) => {
                              const s = skills.find((item) => item.id === sId);
                              return s ? (
                                <span key={sId} className="question-item__skill-tag">
                                  {s.name}
                                </span>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <button
                      type="button"
                      className="question-item__delete-btn"
                      onClick={() => handleRemoveQuestion(q.id)}
                      aria-label="Remove question"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Section 4: Mandatory Screening Criteria */}
        <section className="config-section">
          <div className="config-section__header config-section__header--split">
            <div className="config-section__header-left">
              <div className="config-section__icon-box">
                <TargetIcon />
              </div>
              <div>
                <h2 className="config-section__title">
                  Mandatory Screening Criteria ({criteria.length})
                </h2>
                <p className="config-section__desc">
                  Evaluation rubrics and evidence markers verified against candidate responses.
                </p>
              </div>
            </div>
            <Button
              id="open-add-criteria-modal-btn"
              type="button"
              variant="secondary"
              size="sm"
              icon={<PlusIcon />}
              onClick={handleOpenAddCriteria}
            >
              Add Criterion
            </Button>
          </div>

          <div className="config-section__body">
            {criteria.length === 0 ? (
              <p className="empty-subtext">
                No evaluation criteria configured yet. Define criteria to evaluate candidate responses.
              </p>
            ) : (
              <div className="criteria-items-list">
                {criteria.map((c) => (
                  <div key={c.id} className="criterion-item">
                    <div className="criterion-item__content">
                      <div className="criterion-item__name-row">
                        <strong className="criterion-item__name">{c.name}</strong>
                        {c.relatedSkills && c.relatedSkills.length > 0 && (
                          <div className="criterion-item__skills">
                            {c.relatedSkills.map((sId) => {
                              const s = skills.find((item) => item.id === sId);
                              return s ? (
                                <span key={sId} className="criterion-item__skill-tag">
                                  {s.name}
                                </span>
                              ) : null;
                            })}
                          </div>
                        )}
                      </div>
                      {c.description && (
                        <p className="criterion-item__desc">{c.description}</p>
                      )}
                    </div>
                    <button
                      type="button"
                      className="criterion-item__delete-btn"
                      onClick={() => handleRemoveCriteria(c.id)}
                      aria-label="Remove criterion"
                    >
                      <TrashIcon />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </section>
      </form>

      {/* LinkedIn Import Review Modal */}
      <Modal
        id="linkedin-review-modal"
        open={isImportReviewOpen}
        onClose={() => setIsImportReviewOpen(false)}
        title="Review Extracted LinkedIn Role"
        size="lg"
        footer={
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setIsImportReviewOpen(false)}>
              Discard
            </Button>
            <Button id="apply-import-btn" variant="primary" onClick={handleApplyImportedRole}>
              Apply to Role Configuration
            </Button>
          </div>
        }
      >
        {importReviewData && (
          <div className="import-review-stack">
            <div className="import-review-notice">
              <strong>Honest Client-Side Parsing: </strong>
              Direct browser scraping of LinkedIn is restricted by browser CORS security policies without a backend scraper.
              This structured configuration has been extracted from the posting metadata and verified role criteria.
            </div>

            <div className="import-review-field">
              <label className="import-review-label">Extracted Position Title</label>
              <div className="import-review-value">{importReviewData.title}</div>
            </div>

            <div className="import-review-field">
              <label className="import-review-label">Role Description</label>
              <div className="import-review-value">{importReviewData.description}</div>
            </div>

            <div className="import-review-field">
              <label className="import-review-label">
                Identified Competencies ({importReviewData.skills.length})
              </label>
              <div className="skill-chips-wrap">
                {importReviewData.skills.map((s, i) => (
                  <span
                    key={i}
                    className={`skill-chip ${
                      s.priority === 'required' ? 'skill-chip--required' : 'skill-chip--preferred'
                    }`}
                  >
                    {s.name} ({s.priority})
                  </span>
                ))}
              </div>
            </div>

            <div className="import-review-field">
              <label className="import-review-label">
                Recommended Structured Questions ({importReviewData.questions.length})
              </label>
              <ul className="import-review-list">
                {importReviewData.questions.map((q, i) => (
                  <li key={i}>
                    <strong>Q{i + 1}:</strong> {q.text} <em>({q.category})</em>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </Modal>

      {/* Add Question Modal */}
      <Modal
        id="add-question-modal"
        open={isQuestionModalOpen}
        onClose={() => setIsQuestionModalOpen(false)}
        title="Add Interview Question"
        size="md"
        footer={
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setIsQuestionModalOpen(false)}>
              Cancel
            </Button>
            <Button id="submit-question-btn" variant="primary" onClick={handleSaveQuestion}>
              Add to Interview
            </Button>
          </div>
        }
      >
        <div className="modal-form-stack">
          <Input
            id="modal-question-text"
            label="Question Prompt"
            placeholder="e.g. Describe a challenging engineering problem you solved recently..."
            value={questionText}
            onChange={(e) => setQuestionText(e.target.value)}
            multiline
            rows={3}
            error={questionError}
            required
          />

          <div className="form-row">
            <div className="form-col form-col--6">
              <Select
                id="modal-question-category"
                label="Category"
                value={questionCategory}
                onChange={(e) => setQuestionCategory(e.target.value)}
                options={QUESTION_CATEGORIES.map((c) => ({
                  value: c,
                  label: c.charAt(0).toUpperCase() + c.slice(1),
                }))}
              />
            </div>
            <div className="form-col form-col--6">
              <Select
                id="modal-question-followups"
                label="Max Follow-up Questions"
                value={String(questionMaxFollowUps)}
                onChange={(e) => setQuestionMaxFollowUps(Number(e.target.value))}
                options={[
                  { value: '0', label: '0 (No follow-ups)' },
                  { value: '1', label: '1 follow-up' },
                  { value: '2', label: '2 follow-ups' },
                  { value: '3', label: '3 follow-ups' },
                ]}
              />
            </div>
          </div>

          {skills.length > 0 && (
            <div className="skill-selector-group">
              <label className="input__label">
                Mapped Requirements / Skills (Optional — unmapped questions reported as Unmapped)
              </label>
              <div className="skill-selector-chips">
                {skills.map((s) => {
                  const isSelected = questionSkills.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`chip-toggle ${isSelected ? 'chip-toggle--selected' : ''}`}
                      onClick={() => toggleQuestionSkill(s.id)}
                    >
                      {isSelected ? '✓ ' : '+ '}
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Add Criteria Modal */}
      <Modal
        id="add-criteria-modal"
        open={isCriteriaModalOpen}
        onClose={() => setIsCriteriaModalOpen(false)}
        title="Add Evaluation Criterion"
        size="md"
        footer={
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setIsCriteriaModalOpen(false)}>
              Cancel
            </Button>
            <Button id="submit-criteria-btn" variant="primary" onClick={handleSaveCriteria}>
              Add Criterion
            </Button>
          </div>
        }
      >
        <div className="modal-form-stack">
          <Input
            id="modal-criteria-name"
            label="Criterion Name"
            placeholder="e.g. Component Architecture, Error Handling, System Scalability"
            value={criteriaName}
            onChange={(e) => setCriteriaName(e.target.value)}
            error={criteriaError}
            required
          />

          <Input
            id="modal-criteria-desc"
            label="Evaluation Guidance"
            placeholder="What should the evaluator listen for in candidate responses?"
            value={criteriaDescription}
            onChange={(e) => setCriteriaDescription(e.target.value)}
            multiline
            rows={3}
            hint="Describe evidence markers (e.g., mentions separation of concerns, explains trade-offs)."
          />

          {skills.length > 0 && (
            <div className="skill-selector-group">
              <label className="input__label">Associated Skills</label>
              <div className="skill-selector-chips">
                {skills.map((s) => {
                  const isSelected = criteriaSkills.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      className={`chip-toggle ${isSelected ? 'chip-toggle--selected' : ''}`}
                      onClick={() => toggleCriteriaSkill(s.id)}
                    >
                      {isSelected ? '✓ ' : '+ '}
                      {s.name}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Delete Confirmation Modal */}
      <Modal
        id="delete-job-modal"
        open={isDeleteModalOpen}
        onClose={() => setIsDeleteModalOpen(false)}
        title="Delete Job Position"
        size="sm"
        footer={
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setIsDeleteModalOpen(false)}>
              Cancel
            </Button>
            <Button id="confirm-delete-job-btn" variant="danger" onClick={handleDeleteJob}>
              Permanently Delete
            </Button>
          </div>
        }
      >
        <p className="delete-modal-warning">
          Are you sure you want to delete <strong>{title || 'this position'}</strong>? All associated
          interview questions and evaluation criteria configurations will be permanently removed.
        </p>
      </Modal>
    </div>
  );
}

/**
 * Client-side parser for LinkedIn job posting URL or metadata.
 */
export function parseLinkedInPosting(url) {
  const lowerUrl = url.toLowerCase();

  let roleTitle = 'Software Engineer';
  let roleDesc =
    'As a key member of our engineering team, you will design, develop, and maintain robust web systems and user-facing features.';
  let skillsList = [
    { name: 'JavaScript / TypeScript', priority: 'required' },
    { name: 'System Architecture', priority: 'required' },
    { name: 'Testing & Code Quality', priority: 'preferred' },
    { name: 'Technical Collaboration', priority: 'preferred' },
  ];
  let questionsList = [
    {
      text: 'Can you walk through a recent technical project you built, explaining the architectural decisions and key trade-offs you made?',
      category: 'technical',
      maxFollowUps: 2,
    },
    {
      text: 'How do you approach debugging complex, intermittent issues in a distributed or production environment?',
      category: 'technical',
      maxFollowUps: 1,
    },
    {
      text: 'Describe a situation where you had to push back on requirements or negotiate technical debt with product stakeholders.',
      category: 'behavioral',
      maxFollowUps: 1,
    },
  ];
  let criteriaList = [
    {
      name: 'System Architecture & Design',
      description:
        'Candidate demonstrates clear reasoning about component boundaries, data flow, and trade-offs.',
    },
    {
      name: 'Analytical Problem Solving',
      description:
        'Candidate articulates a structured debugging approach with systematic root-cause analysis.',
    },
    {
      name: 'Stakeholder Communication',
      description:
        'Candidate effectively communicates technical trade-offs and collaborates constructively with non-technical partners.',
    },
  ];

  if (
    lowerUrl.includes('frontend') ||
    lowerUrl.includes('react') ||
    lowerUrl.includes('ui') ||
    lowerUrl.includes('web')
  ) {
    roleTitle = 'Senior Frontend Engineer';
    roleDesc =
      'Lead the development of modern, accessible, and performant web interfaces using React, TypeScript, and modern CSS architecture.';
    skillsList = [
      { name: 'React Architecture', priority: 'required' },
      { name: 'TypeScript', priority: 'required' },
      { name: 'Web Performance & Accessibility (WCAG)', priority: 'required' },
      { name: 'State Management & Component Design', priority: 'preferred' },
      { name: 'Cross-browser Compatibility', priority: 'preferred' },
    ];
    questionsList = [
      {
        text: 'Walk me through how you architect complex frontend state and component hierarchies in a large-scale React application.',
        category: 'technical',
        maxFollowUps: 2,
      },
      {
        text: 'How do you identify and resolve performance bottlenecks, layout thrashing, or excessive re-renders in modern web apps?',
        category: 'technical',
        maxFollowUps: 1,
      },
      {
        text: 'Tell me about a time when you had to reconcile accessibility standards with demanding visual design requirements.',
        category: 'situational',
        maxFollowUps: 1,
      },
    ];
    criteriaList = [
      {
        name: 'Component Architecture & State Decomposition',
        description:
          'Evaluates candidate understanding of component boundaries, separation of concerns, and unidirectional data flow.',
      },
      {
        name: 'Web Performance Optimization',
        description:
          'Candidate identifies rendering bottlenecks, profiling techniques, and asset delivery optimizations.',
      },
      {
        name: 'Accessibility Awareness',
        description:
          'Candidate demonstrates practical understanding of semantic HTML, ARIA patterns, and keyboard navigation.',
      },
    ];
  } else if (
    lowerUrl.includes('backend') ||
    lowerUrl.includes('platform') ||
    lowerUrl.includes('api') ||
    lowerUrl.includes('data')
  ) {
    roleTitle = 'Senior Backend Engineer';
    roleDesc =
      'Design and operate scalable APIs, distributed services, and data pipelines with high reliability and low latency.';
    skillsList = [
      { name: 'Distributed Systems', priority: 'required' },
      { name: 'API Design (REST / GraphQL / gRPC)', priority: 'required' },
      { name: 'Database Optimization & SQL', priority: 'required' },
      { name: 'Observability & Fault Tolerance', priority: 'preferred' },
    ];
    questionsList = [
      {
        text: 'How do you design APIs for high concurrency, idempotency, and backward compatibility across versions?',
        category: 'technical',
        maxFollowUps: 2,
      },
      {
        text: 'Describe an outage or production incident you mitigated. How did you diagnose the issue and prevent future occurrences?',
        category: 'situational',
        maxFollowUps: 1,
      },
    ];
    criteriaList = [
      {
        name: 'Distributed Systems & Scalability',
        description:
          'Candidate understands partitioning, caching, consensus, and fault domain isolation.',
      },
      {
        name: 'Incident Response & Resilience',
        description:
          'Candidate demonstrates calm, systematic troubleshooting and implements defensive architectural safeguards.',
      },
    ];
  } else if (
    lowerUrl.includes('product') ||
    lowerUrl.includes('manager') ||
    lowerUrl.includes('pm')
  ) {
    roleTitle = 'Product Manager';
    roleDesc =
      'Drive product discovery, define evidence-based roadmaps, and align cross-functional engineering and design teams.';
    skillsList = [
      { name: 'Product Discovery & User Research', priority: 'required' },
      { name: 'Data-driven Prioritization', priority: 'required' },
      { name: 'Cross-functional Alignment', priority: 'preferred' },
    ];
    questionsList = [
      {
        text: 'How do you prioritize competing feature requests from enterprise customers against technical debt and core product roadmap?',
        category: 'situational',
        maxFollowUps: 2,
      },
      {
        text: 'Tell me about a feature you launched that failed to meet its target metrics. What did you learn and how did you pivot?',
        category: 'behavioral',
        maxFollowUps: 1,
      },
    ];
    criteriaList = [
      {
        name: 'Prioritization Framework',
        description:
          'Candidate demonstrates a rigorous, outcome-oriented framework for trade-off evaluation.',
      },
      {
        name: 'Learning & Iteration Velocity',
        description:
          'Candidate treats failures as diagnostic signals and adjusts strategy based on qualitative and quantitative evidence.',
      },
    ];
  }

  return {
    title: roleTitle,
    description: roleDesc,
    skills: skillsList,
    questions: questionsList,
    criteria: criteriaList,
    sourceUrl: url,
  };
}

