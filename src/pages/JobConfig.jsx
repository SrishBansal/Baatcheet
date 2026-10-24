import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { store } from '../data/store.js';
import { createJob, createSkill, createQuestion, createCriterion, JOB_STATUSES, QUESTION_CATEGORIES, SKILL_PRIORITIES } from '../data/models.js';
import { validate } from '../utils/validation.js';
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
} from '../components/ui/Icons.jsx';
import './JobConfig.css';

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

  // Skill management
  const handleAddSkill = (e) => {
    e?.preventDefault();
    const trimmed = newSkillName.trim();
    if (!trimmed) {
      setSkillError('Skill name cannot be empty');
      return;
    }
    if (skills.some((s) => s.name.toLowerCase() === trimmed.toLowerCase())) {
      setSkillError('Skill already added');
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
    // Also clean up references in questions and criteria
    setQuestions(questions.map((q) => ({
      ...q,
      relatedSkills: (q.relatedSkills || []).filter((sId) => sId !== skillId),
    })));
    setCriteria(criteria.map((c) => ({
      ...c,
      relatedSkills: (c.relatedSkills || []).filter((sId) => sId !== skillId),
    })));
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
      setQuestionError('Question text is required');
      return;
    }

    const newQ = createQuestion({
      text: trimmed,
      category: questionCategory,
      order: questions.length,
      maxFollowUps: Number(questionMaxFollowUps),
      relatedSkills: questionSkills,
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
    // update order numbers
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

  return (
    <div className="job-config">
      <form onSubmit={handleSaveJob} noValidate>
        {/* Header bar */}
        <div className="job-config__topbar">
          <div className="job-config__topbar-info">
            <h2 className="job-config__heading">
              {isEditing ? 'Edit Position' : 'Create New Position'}
            </h2>
            <p className="job-config__subheading">
              Configure job requirements, interview questions, and evaluation criteria.
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

        {/* Section 1: Basic Information */}
        <div className="config-card">
          <div className="config-card__header">
            <div className="config-card__icon-box">
              <BriefcaseIcon />
            </div>
            <div>
              <h3 className="config-card__title">Position Details</h3>
              <p className="config-card__desc">Define the core role title, status, and responsibilities.</p>
            </div>
          </div>

          <div className="config-card__body">
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
                  label="Position Status"
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
              label="Job Description"
              placeholder="Provide an overview of the role, team context, and responsibilities..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              multiline
              rows={4}
              error={errors.description}
              hint="Max 2,000 characters."
            />
          </div>
        </div>

        {/* Section 2: Skills Definition */}
        <div className="config-card">
          <div className="config-card__header">
            <div className="config-card__icon-box">
              <TagIcon />
            </div>
            <div>
              <h3 className="config-card__title">Skills & Competencies</h3>
              <p className="config-card__desc">Specify required and preferred skills evaluated during screening.</p>
            </div>
          </div>

          <div className="config-card__body">
            {/* Inline add skill form */}
            <div className="add-skill-form">
              <div className="add-skill-form__input">
                <Input
                  id="skill-name-input"
                  placeholder="e.g. React Architecture, TypeScript, System Design"
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
                    label: p.charAt(0).toUpperCase() + p.slice(1),
                  }))}
                />
              </div>
              <Button
                id="add-skill-btn"
                variant="secondary"
                icon={<PlusIcon />}
                onClick={handleAddSkill}
              >
                Add Skill
              </Button>
            </div>

            {/* List of skills */}
            <div className="skill-tags-list">
              {skills.length === 0 ? (
                <p className="empty-subtext">No skills added yet. Add at least 1-2 core competencies for this role.</p>
              ) : (
                skills.map((skill) => (
                  <div key={skill.id} className="skill-chip">
                    <span className="skill-chip__name">{skill.name}</span>
                    <Badge variant={skill.priority === 'required' ? 'active' : 'draft'} size="sm">
                      {skill.priority}
                    </Badge>
                    <button
                      type="button"
                      className="skill-chip__remove"
                      onClick={() => handleRemoveSkill(skill.id)}
                      aria-label={`Remove skill ${skill.name}`}
                    >
                      &times;
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Section 3: Interview Questions */}
        <div className="config-card">
          <div className="config-card__header config-card__header--split">
            <div className="config-card__header-left">
              <div className="config-card__icon-box">
                <QuestionIcon />
              </div>
              <div>
                <h3 className="config-card__title">Interview Questions ({questions.length})</h3>
                <p className="config-card__desc">Structured questions asked sequentially during the automated voice interview.</p>
              </div>
            </div>
            <Button
              id="open-add-question-modal-btn"
              variant="secondary"
              size="sm"
              icon={<PlusIcon />}
              onClick={handleOpenAddQuestion}
            >
              Add Question
            </Button>
          </div>

          <div className="config-card__body">
            {questions.length === 0 ? (
              <p className="empty-subtext">No questions configured yet. Add questions for the screening interview.</p>
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
                          Max follow-ups: {q.maxFollowUps ?? 1}
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
        </div>

        {/* Section 4: Evaluation Criteria */}
        <div className="config-card">
          <div className="config-card__header config-card__header--split">
            <div className="config-card__header-left">
              <div className="config-card__icon-box">
                <TargetIcon />
              </div>
              <div>
                <h3 className="config-card__title">Evaluation Criteria ({criteria.length})</h3>
                <p className="config-card__desc">Criteria against which the interview answers will be evaluated with direct transcript evidence.</p>
              </div>
            </div>
            <Button
              id="open-add-criteria-modal-btn"
              variant="secondary"
              size="sm"
              icon={<PlusIcon />}
              onClick={handleOpenAddCriteria}
            >
              Add Criterion
            </Button>
          </div>

          <div className="config-card__body">
            {criteria.length === 0 ? (
              <p className="empty-subtext">No evaluation criteria configured yet. Define criteria to generate an evidence-backed score report.</p>
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
        </div>
      </form>

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
              <label className="input__label">Mapped Skills (Optional)</label>
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
          Are you sure you want to delete <strong>{title || 'this position'}</strong>?
          All associated interview questions and evaluation criteria configurations will be permanently removed.
        </p>
      </Modal>
    </div>
  );
}
