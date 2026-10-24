import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../data/store.js';
import Button from '../components/ui/Button.jsx';
import Badge from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { BriefcaseIcon, PlusIcon, ChevronRightIcon } from '../components/ui/Icons.jsx';
import { formatRelativeTime } from '../utils/time.js';
import './Dashboard.css';

/**
 * Recruiter dashboard — primary landing page.
 * Shows summary statistics and a list of job positions.
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);

  useEffect(() => {
    setJobs(store.jobs.getAll());
  }, []);

  const stats = computeStats(jobs);

  return (
    <div className="dashboard">
      {/* ---- Stats row ---- */}
      <div className="stats-grid">
        <div className="stat-card">
          <div className="stat-card__label">Total Positions</div>
          <div className="stat-card__value">{stats.total}</div>
          <div className="stat-card__detail">across all statuses</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Active</div>
          <div className="stat-card__value">{stats.active}</div>
          <div className="stat-card__detail">accepting interviews</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Draft</div>
          <div className="stat-card__value">{stats.draft}</div>
          <div className="stat-card__detail">being configured</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__label">Interviews</div>
          <div className="stat-card__value">0</div>
          <div className="stat-card__detail">completed (Phase 2)</div>
        </div>
      </div>

      {/* ---- Job list ---- */}
      <section className="dashboard__section">
        <div className="dashboard__section-header">
          <h2 className="dashboard__section-title">Job Positions</h2>
          <Button
            id="create-job-btn"
            variant="primary"
            size="sm"
            icon={<PlusIcon />}
            onClick={() => navigate('/jobs/new')}
          >
            New Position
          </Button>
        </div>

        {jobs.length === 0 ? (
          <div className="card">
            <EmptyState
              icon={<BriefcaseIcon />}
              title="No job positions yet"
              description="Create your first job position to start configuring interview questions and evaluation criteria."
              action={
                <Button
                  id="create-job-empty-btn"
                  variant="primary"
                  onClick={() => navigate('/jobs/new')}
                  icon={<PlusIcon />}
                >
                  Create Position
                </Button>
              }
            />
          </div>
        ) : (
          <div className="job-list">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                onClick={() => navigate(`/jobs/${job.id}/edit`)}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

/**
 * Individual job card component.
 */
function JobCard({ job, onClick }) {
  const skillCount = job.skills?.length || 0;
  const questionCount = job.questions?.length || 0;
  const criteriaCount = job.criteria?.length || 0;

  return (
    <button
      className="job-card"
      onClick={onClick}
      type="button"
      aria-label={`Edit ${job.title}`}
    >
      <div className="job-card__main">
        <div className="job-card__header">
          <h3 className="job-card__title">{job.title}</h3>
          <Badge variant={job.status} size="sm">
            {job.status}
          </Badge>
        </div>
        {job.description && (
          <p className="job-card__description">{job.description}</p>
        )}
        <div className="job-card__meta">
          <span className="job-card__meta-item">{skillCount} skill{skillCount !== 1 ? 's' : ''}</span>
          <span className="job-card__meta-sep">·</span>
          <span className="job-card__meta-item">{questionCount} question{questionCount !== 1 ? 's' : ''}</span>
          <span className="job-card__meta-sep">·</span>
          <span className="job-card__meta-item">{criteriaCount} criteria</span>
          <span className="job-card__meta-sep">·</span>
          <span className="job-card__meta-item">{formatRelativeTime(job.updatedAt)}</span>
        </div>
      </div>
      <ChevronRightIcon className="job-card__chevron" />
    </button>
  );
}

function computeStats(jobs) {
  return {
    total: jobs.length,
    active: jobs.filter((j) => j.status === 'active').length,
    draft: jobs.filter((j) => j.status === 'draft').length,
    archived: jobs.filter((j) => j.status === 'archived').length,
  };
}
