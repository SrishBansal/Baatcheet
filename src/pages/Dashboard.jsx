import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../data/store.js';
import Button from '../components/ui/Button.jsx';
import Badge from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { BriefcaseIcon, PlusIcon, ChevronRightIcon, QuestionIcon, TagIcon } from '../components/ui/Icons.jsx';
import { formatRelativeTime } from '../utils/time.js';
import './Dashboard.css';

/**
 * Recruiter dashboard — Hiring Activity Overview.
 * Answers: "What is happening across my hiring activity?"
 * Uses only real data stored in the application.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    setJobs(store.jobs.getAll());
  }, []);

  const stats = computeRealStats(jobs);

  const filteredJobs = jobs.filter((job) => {
    if (statusFilter === 'all') return true;
    return job.status === statusFilter;
  });

  return (
    <div className="dashboard">
      {/* Page Header */}
      <div className="dashboard__header">
        <div>
          <h1 className="dashboard__title">Hiring Activity & Positions</h1>
          <p className="dashboard__subtitle">
            Configure screening criteria, manage structured interview questions, and run automated candidate interviews.
          </p>
        </div>
        <div className="dashboard__header-actions">
          <Button
            id="create-job-btn"
            variant="primary"
            icon={<PlusIcon />}
            onClick={() => navigate('/jobs/new')}
          >
            Create Position
          </Button>
        </div>
      </div>

      {/* Real Data Overview Cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card__label">Total Positions</div>
          <div className="stat-card__value">{stats.total}</div>
          <div className="stat-card__detail">in recruiting pipeline</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Active Screening</div>
          <div className="stat-card__value">{stats.active}</div>
          <div className="stat-card__detail">live for candidate interviews</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Draft Positions</div>
          <div className="stat-card__value">{stats.draft}</div>
          <div className="stat-card__detail">criteria in configuration</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Configured Questions</div>
          <div className="stat-card__value">{stats.totalQuestions}</div>
          <div className="stat-card__detail">structured screening prompts</div>
        </div>
      </div>

      {/* Job Directory Section */}
      <section className="dashboard__section">
        <div className="dashboard__section-toolbar">
          <div className="dashboard__filter-tabs">
            <button
              type="button"
              id="filter-all-btn"
              className={`filter-tab ${statusFilter === 'all' ? 'filter-tab--active' : ''}`}
              onClick={() => setStatusFilter('all')}
            >
              All Roles ({stats.total})
            </button>
            <button
              type="button"
              id="filter-active-btn"
              className={`filter-tab ${statusFilter === 'active' ? 'filter-tab--active' : ''}`}
              onClick={() => setStatusFilter('active')}
            >
              Active ({stats.active})
            </button>
            <button
              type="button"
              id="filter-draft-btn"
              className={`filter-tab ${statusFilter === 'draft' ? 'filter-tab--active' : ''}`}
              onClick={() => setStatusFilter('draft')}
            >
              Drafts ({stats.draft})
            </button>
            {stats.archived > 0 && (
              <button
                type="button"
                id="filter-archived-btn"
                className={`filter-tab ${statusFilter === 'archived' ? 'filter-tab--active' : ''}`}
                onClick={() => setStatusFilter('archived')}
              >
                Archived ({stats.archived})
              </button>
            )}
          </div>
        </div>

        {filteredJobs.length === 0 ? (
          <div className="card dashboard__empty-card">
            <EmptyState
              icon={<BriefcaseIcon />}
              title={jobs.length === 0 ? "No job positions created yet" : `No positions matching "${statusFilter}"`}
              description={
                jobs.length === 0
                  ? "Create your first role configuration to define competencies, structured interview questions, and evaluation criteria."
                  : "Change the status filter above or configure a new position for this status."
              }
              action={
                jobs.length === 0 ? (
                  <Button
                    id="create-job-empty-btn"
                    variant="primary"
                    onClick={() => navigate('/jobs/new')}
                    icon={<PlusIcon />}
                  >
                    Create First Position
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={() => setStatusFilter('all')}>
                    View All Positions
                  </Button>
                )
              }
            />
          </div>
        ) : (
          <div className="positions-directory">
            {filteredJobs.map((job) => (
              <PositionRow
                key={job.id}
                job={job}
                onEdit={() => navigate(`/jobs/${job.id}/edit`)}
                onLaunchInterview={() => navigate(`/interview/${job.id}`)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Dedicated position row for recruiter dashboard.
 */
function PositionRow({ job, onEdit, onLaunchInterview }) {
  const skillCount = job.skills?.length || 0;
  const questionCount = job.questions?.length || 0;
  const criteriaCount = job.criteria?.length || 0;
  const topSkills = (job.skills || []).slice(0, 3);
  const remainingSkills = skillCount - topSkills.length;

  return (
    <div className="position-row" role="article" aria-label={`Position: ${job.title}`}>
      <div className="position-row__main" onClick={onEdit} role="button" tabIndex={0} onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onEdit();
        }
      }}>
        <div className="position-row__title-group">
          <h3 className="position-row__title">{job.title}</h3>
          <Badge variant={job.status} size="sm">
            {job.status}
          </Badge>
        </div>

        {job.description && (
          <p className="position-row__description">{job.description}</p>
        )}

        <div className="position-row__meta-bar">
          {topSkills.length > 0 && (
            <div className="position-row__skills">
              {topSkills.map((s) => (
                <span key={s.id} className="position-row__skill-tag">
                  {s.name}
                  {s.priority === 'required' && <span className="position-row__req-dot" title="Required skill" />}
                </span>
              ))}
              {remainingSkills > 0 && (
                <span className="position-row__skill-more">+{remainingSkills} more</span>
              )}
            </div>
          )}

          <div className="position-row__counts">
            <span className="meta-metric" title="Structured interview questions">
              <QuestionIcon /> {questionCount} question{questionCount !== 1 ? 's' : ''}
            </span>
            <span className="meta-sep">·</span>
            <span className="meta-metric" title="Screening evaluation criteria">
              <TagIcon /> {criteriaCount} criteria
            </span>
            <span className="meta-sep">·</span>
            <span className="meta-time">Updated {formatRelativeTime(job.updatedAt)}</span>
          </div>
        </div>
      </div>

      <div className="position-row__actions">
        <Button
          id={`configure-job-${job.id}`}
          variant="secondary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
        >
          Configure Role
        </Button>
        <Button
          id={`launch-interview-${job.id}`}
          variant="primary"
          size="sm"
          onClick={(e) => {
            e.stopPropagation();
            onLaunchInterview();
          }}
          aria-label={`Launch candidate interview for ${job.title}`}
        >
          Candidate Interview
        </Button>
      </div>
    </div>
  );
}

function computeRealStats(jobs) {
  const totalQuestions = jobs.reduce((sum, j) => sum + (j.questions?.length || 0), 0);
  return {
    total: jobs.length,
    active: jobs.filter((j) => j.status === 'active').length,
    draft: jobs.filter((j) => j.status === 'draft').length,
    archived: jobs.filter((j) => j.status === 'archived').length,
    totalQuestions,
  };
}

