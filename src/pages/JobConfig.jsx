import React, { useState, useEffect, useRef } from 'react';
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
import { importJob, suggestQuestions } from '../data/engineApi.js';
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
  const [allowTyping, setAllowTyping] = useState(false);
  const [suggestionError, setSuggestionError] = useState('');
  const [errors, setErrors] = useState({});
  const [saveSuccess, setSaveSuccess] = useState(false);

  // Import state
  const [isImportPanelOpen, setIsImportPanelOpen] = useState(false);
  const [importMode, setImportMode] = useState('link'); // 'link' | 'upload' | 'paste'
  const [importUrl, setImportUrl] = useState('');
  const [pastedJobText, setPastedJobText] = useState('');
  const [importFile, setImportFile] = useState(null);
  const [isImportLoading, setIsImportLoading] = useState(false);
  const [importError, setImportError] = useState('');
  const [importReviewData, setImportReviewData] = useState(null);
  const [importDiscarded, setImportDiscarded] = useState(0);
  const [isImportReviewOpen, setIsImportReviewOpen] = useState(false);
  const [importSuccessBanner, setImportSuccessBanner] = useState('');
  const fileInputRef = useRef(null);

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
        setAllowTyping(existing.settings?.allowTyping === true);
      } else {
        navigate('/', { replace: true });
      }
    }
  }, [id, isEditing, navigate]);

  // Unified import handler — calls engine /api/job
  const handleStartImport = async () => {
    setImportError('');
    setIsImportLoading(true);
    try {
      let body;
      if (importMode === 'link') {
        const trimmed = importUrl.trim();
        if (!trimmed) { setImportError('Please enter a URL.'); setIsImportLoading(false); return; }
        body = { url: trimmed };
      } else if (importMode === 'upload') {
        if (!importFile) { setImportError('Please select a file.'); setIsImportLoading(false); return; }
        const name = importFile.name.toLowerCase();
        if (name.endsWith('.pdf')) {
          if (importFile.size > 5 * 1024 * 1024) {
            setImportError('file_too_large');
            setIsImportLoading(false);
            return;
          }
          const buf = await importFile.arrayBuffer();
          const bytes = new Uint8Array(buf);
          let bin = '';
          for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
          body = { pdfBase64: btoa(bin) };
        } else {
          const fileText = await importFile.text();
          body = { fileText };
        }
      } else {
        const trimmed = pastedJobText.trim();
        if (!trimmed) { setImportError('Please paste some text.'); setIsImportLoading(false); return; }
        body = { text: trimmed };
      }

      const result = await importJob(body);
      setImportReviewData(result.job);
      setImportDiscarded(result.discarded || 0);
      setIsImportReviewOpen(true);
    } catch (err) {
      const code = err.message || 'server_error';
      setImportError(code);
      setImportMode('paste');
    } finally {
      setIsImportLoading(false);
    }
  };

  // Edit fields in review modal
  const [reviewTitle, setReviewTitle] = useState('');
  const [reviewCompany, setReviewCompany] = useState('');
  const [reviewSummary, setReviewSummary] = useState('');
  const [reviewReqs, setReviewReqs] = useState([]);

  useEffect(() => {
    if (importReviewData) {
      setReviewTitle(importReviewData.title || '');
      setReviewCompany(importReviewData.company || '');
      setReviewSummary(importReviewData.summary || '');
      setReviewReqs((importReviewData.requirements || []).map((r) => ({ ...r })));
    }
  }, [importReviewData]);

  const handleApplyImportedRole = () => {
    if (!importReviewData) return;

    setTitle(reviewTitle);
    setDescription(reviewSummary);

    const createdSkills = reviewReqs.map((r) =>
      createSkill({ name: r.name, priority: r.kind === 'preferred' ? 'preferred' : 'required' })
    );
    setSkills(createdSkills);
    if (createdSkills.length && questions.length === 0) {
      requestSuggestions(createdSkills, questions);
    }

    setIsImportReviewOpen(false);
    setIsImportPanelOpen(false);
    if (importReviewData.source) {
      // Store source fields on job for display
      setDescription([
        reviewSummary,
        (importReviewData.responsibilities || []).join('\n'),
      ].filter(Boolean).join('\n\n').slice(0, 2000));
    }
    setImportSuccessBanner(`Imported "${reviewTitle}". Questions unchanged.`);
    setTimeout(() => setImportSuccessBanner(''), 6000);
  };

  const requestSuggestions = async (skillList = skills, current = questions) => {
    setSuggestionError('');
    try {
      const draft = createJob({ title, description, skills: skillList, questions: current, criteria, settings: { allowTyping } });
      const result = await suggestQuestions({ job: { title: draft.title, requirements: skillList.map((s) => ({ name: s.name })) }, existing: current.map((q) => q.text) });
      const added = (result.questions || result.items || []).map((item, index) => {
        const skill = skillList.find((s) => s.name === item.requirementName);
        return createQuestion({ text: item.text, relatedSkills: skill ? [skill.id] : [], requirementIds: skill ? [skill.id] : [], source: 'ai', order: current.length + index });
      });
      setQuestions((prior) => [...prior, ...added].map((q, index) => ({ ...q, order: index })));
    } catch (err) { setSuggestionError(err.message || 'server_error'); }
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
      settings: { allowTyping },
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
              <span className="linkedin-badge">Import Role</span>
              <h3 className="linkedin-import-box__title">Import Role from Job Posting</h3>
              <p className="linkedin-import-box__desc">
                Import a job posting by URL, PDF/text upload, or paste. Title and requirements will be extracted.
              </p>
            </div>
            <Button
              id="toggle-linkedin-import-btn"
              type="button"
              variant={isImportPanelOpen ? 'secondary' : 'primary'}
              size="sm"
              onClick={() => setIsImportPanelOpen(!isImportPanelOpen)}
            >
              {isImportPanelOpen ? 'Hide Importer' : 'Import Role'}
            </Button>
          </div>

          {isImportPanelOpen && (
            <div className="linkedin-import-box__body">
              <div className="import-mode-tabs" style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
                {['link', 'upload', 'paste'].map((m) => (
                  <Button
                    key={m}
                    id={`tab-${m}-import-btn`}
                    type="button"
                    size="sm"
                    variant={importMode === m ? 'primary' : 'ghost'}
                    onClick={() => { setImportMode(m); setImportError(''); }}
                  >
                    {m === 'link' ? 'Link' : m === 'upload' ? 'Upload PDF/TXT' : 'Paste text'}
                  </Button>
                ))}
              </div>

              {importMode === 'link' && (
                <div className="linkedin-input-row">
                  <div className="linkedin-input-wrapper">
                    <Input
                      id="import-url-input"
                      placeholder="https://www.linkedin.com/jobs/view/... or any job posting URL"
                      value={importUrl}
                      onChange={(e) => { setImportUrl(e.target.value); setImportError(''); }}
                      hint="Supports LinkedIn job URLs and other public job pages"
                    />
                  </div>
                </div>
              )}

              {importMode === 'upload' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  <input
                    id="import-file-input"
                    ref={fileInputRef}
                    type="file"
                    accept=".pdf,.txt,.md"
                    style={{ display: 'none' }}
                    onChange={(e) => { setImportFile(e.target.files[0] || null); setImportError(''); }}
                  />
                  <Button
                    id="import-file-select-btn"
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {importFile ? importFile.name : 'Choose PDF or TXT/MD file…'}
                  </Button>
                  <span style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)' }}>PDF max 5 MB. Text/Markdown accepted.</span>
                </div>
              )}

              {importMode === 'paste' && (
                <div className="paste-input-stack" style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                  <textarea
                    id="paste-job-textarea"
                    rows={6}
                    placeholder="Paste the full job posting description here…"
                    value={pastedJobText}
                    onChange={(e) => { setPastedJobText(e.target.value); setImportError(''); }}
                    style={{
                      width: '100%', padding: '0.75rem', borderRadius: '6px',
                      border: '1px solid var(--color-border, #cbd5e1)',
                      fontFamily: 'inherit', fontSize: '0.875rem',
                    }}
                  />
                </div>
              )}

              {importError && (
                <div style={{ color: '#ef4444', fontSize: '0.85rem', marginTop: '0.5rem' }}>
                  {importError === 'gemini_not_configured'
                    ? 'Add GEMINI_API_KEY to .env.local and restart the dev server.'
                    : /^source_blocked/.test(importError)
                      ? 'This site blocks automated access. Paste the description or upload a PDF.'
                      : `Error: ${importError}. Keep your inputs — try the Paste text tab.`}
                </div>
              )}

              <div style={{ marginTop: '1rem' }}>
                <Button
                  id="submit-import-btn"
                  type="button"
                  variant="primary"
                  disabled={isImportLoading}
                  onClick={handleStartImport}
                >
                  {isImportLoading ? 'Importing…' : 'Import & Review'}
                </Button>
              </div>

              {isImportLoading && (
                <div className="linkedin-loading-indicator" role="status" style={{ marginTop: '0.75rem' }}>
                  <span className="loading-spinner" />
                  <span>Extracting job details via AI…</span>
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
              Add my own question
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => requestSuggestions()}>{questions.length ? 'Regenerate suggestions' : 'Suggest questions'}</Button>
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
                        {q.source === 'ai' && <Badge variant="active" size="sm">AI-suggested</Badge>}
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
          {suggestionError && <div className="alert alert--danger" role="alert">{suggestionError} <Button type="button" size="sm" onClick={() => requestSuggestions()}>Retry</Button></div>}
        </section>

        <section className="config-section"><h2 className="config-section__title">Settings</h2><label><input type="checkbox" checked={allowTyping} onChange={(e) => setAllowTyping(e.target.checked)} /> Allow typed answers</label><p>Typed answers cannot be verified as the candidate's own.</p></section>

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

      {/* Import Review Modal */}
      <Modal
        id="import-review-modal"
        open={isImportReviewOpen}
        onClose={() => setIsImportReviewOpen(false)}
        title="Review imported role"
        size="lg"
        footer={
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setIsImportReviewOpen(false)}>
              Discard
            </Button>
            <Button
              id="apply-import-btn"
              variant="primary"
              disabled={!reviewTitle.trim() || reviewReqs.length === 0}
              onClick={handleApplyImportedRole}
            >
              Apply to Role Configuration
            </Button>
          </div>
        }
      >
        {importReviewData && (
          <div className="import-review-stack">
            {importDiscarded > 0 && (
              <div style={{ background: '#fffbeb', border: '1px solid #fde68a', color: '#92400e', padding: '0.6rem 0.9rem', borderRadius: '6px', marginBottom: '0.75rem', fontSize: '0.85rem' }}>
                {importDiscarded} unsupported item(s) discarded (low word overlap with source).
              </div>
            )}

            {importReviewData.source && (
              <div style={{ fontSize: '0.8rem', color: 'var(--color-text-muted, #64748b)', marginBottom: '0.5rem' }}>
                Source: <strong>{importReviewData.source.label}</strong>
                {importReviewData.source.url && <> · <a href={importReviewData.source.url} target="_blank" rel="noopener noreferrer">{importReviewData.source.url}</a></>}
                {importReviewData.source.fetchedAt && <> · fetched {new Date(importReviewData.source.fetchedAt).toLocaleString()}</>}
              </div>
            )}

            <div className="import-review-field">
              <label className="import-review-label">Title *</label>
              <input
                id="review-title-input"
                value={reviewTitle}
                onChange={(e) => setReviewTitle(e.target.value)}
                style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid var(--color-border, #cbd5e1)', fontFamily: 'inherit', fontSize: '0.9rem' }}
              />
            </div>

            <div className="import-review-field">
              <label className="import-review-label">Company</label>
              <input
                id="review-company-input"
                value={reviewCompany}
                onChange={(e) => setReviewCompany(e.target.value)}
                style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid var(--color-border, #cbd5e1)', fontFamily: 'inherit', fontSize: '0.9rem' }}
              />
            </div>

            <div className="import-review-field">
              <label className="import-review-label">Summary</label>
              <textarea
                id="review-summary-input"
                rows={3}
                value={reviewSummary}
                onChange={(e) => setReviewSummary(e.target.value)}
                style={{ width: '100%', padding: '0.4rem 0.6rem', borderRadius: '4px', border: '1px solid var(--color-border, #cbd5e1)', fontFamily: 'inherit', fontSize: '0.9rem' }}
              />
            </div>

            {(importReviewData.responsibilities || []).length > 0 && (
              <div className="import-review-field">
                <label className="import-review-label">Responsibilities</label>
                <ul className="import-review-list">
                  {importReviewData.responsibilities.map((r, i) => <li key={i}>{r}</li>)}
                </ul>
              </div>
            )}

            <div className="import-review-field">
              <label className="import-review-label">Requirements ({reviewReqs.length}) *</label>
              {reviewReqs.length === 0 && (
                <p style={{ color: '#ef4444', fontSize: '0.85rem' }}>At least 1 requirement is required to apply.</p>
              )}
              {reviewReqs.map((r, i) => (
                <div key={i} style={{ display: 'flex', gap: '0.5rem', alignItems: 'center', marginBottom: '0.3rem' }}>
                  <input
                    value={r.name}
                    onChange={(e) => setReviewReqs(reviewReqs.map((x, j) => j === i ? { ...x, name: e.target.value } : x))}
                    style={{ flex: 1, padding: '0.3rem 0.5rem', borderRadius: '4px', border: '1px solid var(--color-border, #cbd5e1)', fontFamily: 'inherit', fontSize: '0.85rem' }}
                  />
                  <select
                    value={r.kind}
                    onChange={(e) => setReviewReqs(reviewReqs.map((x, j) => j === i ? { ...x, kind: e.target.value } : x))}
                    style={{ padding: '0.3rem', borderRadius: '4px', border: '1px solid var(--color-border, #cbd5e1)', fontSize: '0.85rem' }}
                  >
                    <option value="required">required</option>
                    <option value="preferred">preferred</option>
                  </select>
                  <button type="button" onClick={() => setReviewReqs(reviewReqs.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: '1rem' }}>✕</button>
                </div>
              ))}
              <Button
                type="button" size="sm" variant="ghost"
                onClick={() => setReviewReqs([...reviewReqs, { name: '', kind: 'required' }])}
                style={{ marginTop: '0.25rem' }}
              >+ Add requirement</Button>
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
