import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../data/store.js';
import Button from '../components/ui/Button.jsx';
import Badge from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import {
  BriefcaseIcon,
  PlusIcon,
  ChevronRightIcon,
  ClipboardIcon,
  CheckIcon,
} from '../components/ui/Icons.jsx';
import { formatRelativeTime } from '../utils/time.js';
import './Dashboard.css';

/**
 * Operational Recruiter Dashboard (Checkpoint 6).
 *
 * Operational overview strictly from stored data only:
 * - Open positions, interviews in progress, completed awaiting review, total screened
 * - Positions needing attention (missing questions/requirements, failed analysis)
 * - Chronological recent activity stream
 * - Quick actions and honest empty states
 * - Zero job-editing forms or fabricated metrics
 */
export default function Dashboard() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState(() => {
    try {
      return store.jobs.getAll() || [];
    } catch {
      return [];
    }
  });
  const [sessions, setSessions] = useState(() => {
    try {
      return store.sessions.getAll() || [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      setJobs(store.jobs.getAll());
      setSessions(store.sessions.getAll());
    } catch (err) {
      console.error('[Dashboard] Failed to read store:', err);
    }
  }, []);

  // Operational metrics computed directly from stored entities
  const activePositions = jobs.filter((j) => j.status === 'active');
  const draftPositions = jobs.filter((j) => j.status === 'draft');
  const interviewsInProgress = sessions.filter((s) => s.status === 'in_progress');
  const completedSessions = sessions.filter((s) => s.status === 'completed');
  const failedAnalysisSessions = sessions.filter((s) => s.analysis?.status === 'failed');

  // Positions needing attention
  const incompletePositions = jobs.filter(
    (j) => (j.questions?.length || 0) === 0 || (j.requirements?.length || j.skills?.length || 0) === 0
  );

  // Recent activity stream (sessions + jobs sorted by timestamp)
  const activityEvents = [
    ...sessions.map((s) => ({
      id: `session-${s.id}`,
      type: 'session',
      timestamp: s.endedAt || s.startedAt,
      title: s.jobSnapshot?.title || 'Screening Session',
      status: s.status,
      link: `/interviews/${s.id}`,
      detail: `${(s.turns || []).filter((t) => t.answer?.finalText && !t.skipped).length} answers recorded`,
    })),
    ...jobs.map((j) => ({
      id: `job-${j.id}`,
      type: 'job',
      timestamp: j.updatedAt || j.createdAt,
      title: j.title,
      status: j.status,
      link: `/positions/${j.id}`,
      detail: `${j.questions?.length || 0} questions · ${j.department || 'General'}`,
    })),
  ]
    .filter((e) => e.timestamp)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, 6);

  const hasAnyData = jobs.length > 0 || sessions.length > 0;

  return (
    <div className="dashboard-page">
      {/* Dashboard Top Header */}
      <div className="dashboard-header">
        <div>
          <span className="dashboard-eyebrow">RECRUITING WORKSPACE</span>
          <h1 className="dashboard-title">Overview</h1>
          <p className="dashboard-subtitle">
            A clear view of your hiring pipeline and what needs attention.
          </p>
        </div>
        <div className="dashboard-header__actions">
          <Button
            id="quick-create-position-btn"
            variant="primary"
            icon={<PlusIcon />}
            onClick={() => navigate('/positions/new')}
          >
            New position
          </Button>
        </div>
      </div>

      {!hasAnyData ? (
        <EmptyState
          icon={<BriefcaseIcon />}
          title="No recruitment activity recorded yet"
          description="Get started by creating your first job position. You can import criteria from a posting or build custom structured questions."
          action={
            <Button variant="primary" icon={<PlusIcon />} onClick={() => navigate('/positions/new')}>
              Create First Position
            </Button>
          }
        />
      ) : (
        <>
          {/* Key Operational Stat Cards */}
          <section className="stats-grid" aria-label="Key operational metrics">
            <div className="stat-card">
              <div className="stat-card__label">Open Positions</div>
              <div className="stat-card__value">{activePositions.length}</div>
              <div className="stat-card__detail">active for candidate interviews</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">Interviews In Progress</div>
              <div className="stat-card__value">{interviewsInProgress.length}</div>
              <div className="stat-card__detail">live sessions currently underway</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">Awaiting Review</div>
              <div className="stat-card__value">{completedSessions.length}</div>
              <div className="stat-card__detail">completed candidate reports</div>
            </div>
            <div className="stat-card">
              <div className="stat-card__label">Total Candidates Screened</div>
              <div className="stat-card__value">{sessions.length}</div>
              <div className="stat-card__detail">recorded session archives</div>
            </div>
          </section>

          {/* Attention & Action Grid */}
          <div className="dashboard-main-grid">
            {/* Left: Items Needing Attention */}
            <div className="dashboard-col">
              <div className="dashboard-card card">
                <div className="dashboard-card__header">
                  <h2 className="dashboard-card__title">Positions Needing Attention</h2>
                  <span className="attention-badge">
                    {incompletePositions.length + failedAnalysisSessions.length} alerts
                  </span>
                </div>

                {incompletePositions.length === 0 && failedAnalysisSessions.length === 0 ? (
                  <div className="empty-subtext">
                    <span style={{ color: '#10b981', marginRight: '6px' }}>✓</span>
                    All positions have complete criteria and questions. No failed analyses detected.
                  </div>
                ) : (
                  <div className="attention-list">
                    {incompletePositions.map((job) => (
                      <div key={job.id} className="attention-item">
                        <div className="attention-item__main">
                          <strong>{job.title}</strong>
                          <span className="attention-item__desc">
                            {(job.questions?.length || 0) === 0
                              ? 'Missing interview questions — candidates cannot start screening.'
                              : 'No requirements defined — questions will be unmapped.'}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/positions/${job.id}`)}
                        >
                          Configure
                        </Button>
                      </div>
                    ))}

                    {failedAnalysisSessions.map((session) => (
                      <div key={session.id} className="attention-item attention-item--danger">
                        <div className="attention-item__main">
                          <strong>Analysis Failed: {session.jobSnapshot?.title || session.id}</strong>
                          <span className="attention-item__desc">
                            {session.analysis?.error || 'Upstream provider error during evaluation.'}
                          </span>
                        </div>
                        <Button
                          variant="secondary"
                          size="sm"
                          onClick={() => navigate(`/interviews/${session.id}`)}
                        >
                          Review & Retry
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Right: Recent Operational Activity */}
            <div className="dashboard-col">
              <div className="dashboard-card card">
                <div className="dashboard-card__header">
                  <h2 className="dashboard-card__title">Recent Activity</h2>
                  <span className="dashboard-card__meta-sub">Latest pipeline updates</span>
                </div>

                {activityEvents.length === 0 ? (
                  <div className="empty-subtext">No recent activity recorded yet.</div>
                ) : (
                  <div className="activity-timeline">
                    {activityEvents.map((event) => (
                      <div
                        key={event.id}
                        className="activity-item"
                        onClick={() => navigate(event.link)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') navigate(event.link);
                        }}
                      >
                        <div className="activity-item__icon">
                          {event.type === 'session' ? <ClipboardIcon /> : <BriefcaseIcon />}
                        </div>
                        <div className="activity-item__content">
                          <div className="activity-item__title-row">
                            <strong>{event.title}</strong>
                            <Badge
                              variant={event.status === 'completed' || event.status === 'active' ? 'active' : 'draft'}
                              size="sm"
                            >
                              {event.status}
                            </Badge>
                          </div>
                          <div className="activity-item__detail">{event.detail}</div>
                          <div className="activity-item__time">
                            {formatRelativeTime(event.timestamp)}
                          </div>
                        </div>
                        <ChevronRightIcon className="activity-item__chevron" />
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
