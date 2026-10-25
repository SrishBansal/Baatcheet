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
} from '../components/ui/Icons.jsx';
import { formatRelativeTime } from '../utils/time.js';
import './Positions.css';

/**
 * Positions Directory — Dense searchable, filterable table of all job positions.
 * Supports quick status filtering, search by title/department, and direct actions.
 */
export default function Positions() {
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
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  useEffect(() => {
    try {
      setJobs(store.jobs.getAll());
      setSessions(store.sessions.getAll());
    } catch (err) {
      console.error('[Positions] Failed to read store:', err);
    }
  }, []);

  // Compute session metrics per job
  const sessionsByJob = new Map();
  for (const session of sessions) {
    const list = sessionsByJob.get(session.jobId) || [];
    list.push(session);
    sessionsByJob.set(session.jobId, list);
  }

  // Filter jobs by search and status
  const filteredJobs = jobs.filter((job) => {
    if (statusFilter !== 'all' && job.status !== statusFilter) {
      return false;
    }
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchTitle = job.title?.toLowerCase().includes(q);
      const matchDept = job.department?.toLowerCase().includes(q);
      if (!matchTitle && !matchDept) return false;
    }
    return true;
  });

  const activeCount = jobs.filter((j) => j.status === 'active').length;
  const draftCount = jobs.filter((j) => j.status === 'draft').length;
  const closedCount = jobs.filter((j) => j.status === 'closed').length;
  const refresh = () => { setJobs(store.jobs.getAll()); setSessions(store.sessions.getAll()); };
  const activate = (job) => {
    if (!job.title || !(job.skills || job.requirements || []).length) { window.alert('A title and at least one requirement are required to activate this position.'); return; }
    store.jobs.update(job.id, { status: 'active' }); refresh();
  };
  const close = (job) => { if (window.confirm('Candidates will no longer be able to start this interview.')) { store.jobs.update(job.id, { status: 'closed', closedReason: 'manual', closedAt: new Date().toISOString() }); refresh(); } };
  const reopen = (job) => { store.jobs.update(job.id, { status: 'active', closedReason: null, hiredSessionId: null, closedAt: null }); refresh(); };

  return (
    <div className="positions-page">
      {/* Page Header */}
      <div className="positions-header">
        <div>
          <h1 className="positions-title">Positions</h1>
          <p className="positions-subtitle">
            Manage open roles, screening criteria, and live candidate interview links.
          </p>
        </div>
        <div className="positions-header__actions">
          <Button
            id="create-position-btn"
            variant="primary"
            icon={<PlusIcon />}
            onClick={() => navigate('/positions/new')}
          >
            New Position
          </Button>
        </div>
      </div>

      {/* Toolbar: Search + Filter Tabs */}
      <div className="positions-toolbar">
        <div className="positions-search-wrapper">
          <input
            id="positions-search-input"
            type="search"
            className="positions-search-input input"
            placeholder="Search positions by title or department..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search positions"
          />
        </div>

        <div className="positions-filter-tabs" role="tablist" aria-label="Filter positions by status">
          <button
            type="button"
            className={`filter-tab ${statusFilter === 'all' ? 'filter-tab--active' : ''}`}
            onClick={() => setStatusFilter('all')}
          >
            All ({jobs.length})
          </button>
          <button
            type="button"
            className={`filter-tab ${statusFilter === 'active' ? 'filter-tab--active' : ''}`}
            onClick={() => setStatusFilter('active')}
          >
            Active ({activeCount})
          </button>
          <button
            type="button"
            className={`filter-tab ${statusFilter === 'draft' ? 'filter-tab--active' : ''}`}
            onClick={() => setStatusFilter('draft')}
          >
            Drafts ({draftCount})
          </button>
          {closedCount > 0 && (
            <button
              type="button"
            className={`filter-tab ${statusFilter === 'closed' ? 'filter-tab--active' : ''}`}
            onClick={() => setStatusFilter('closed')}
            >
              Closed ({closedCount})
            </button>
          )}
        </div>
      </div>

      {/* Table or Empty State */}
      {filteredJobs.length === 0 ? (
        <EmptyState
          icon={<BriefcaseIcon />}
          title={jobs.length === 0 ? 'No positions created yet' : 'No matching positions'}
          description={
            jobs.length === 0
              ? 'Create your first hiring position to configure requirements, add questions, and start screening candidates.'
              : 'Try clearing your search query or switching filters.'
          }
          action={
            jobs.length === 0 ? (
              <Button variant="primary" onClick={() => navigate('/positions/new')}>
                Create Position
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="positions-table-container card">
          <table className="positions-table" aria-label="Positions directory">
            <thead>
              <tr>
                <th scope="col">Role & Department</th>
                <th scope="col">Status</th>
                <th scope="col">Criteria & Questions</th>
                <th scope="col">Interviews</th>
                <th scope="col">Last Activity</th>
                <th scope="col" className="positions-table__actions-head">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredJobs.map((job) => {
                const jobSessions = sessionsByJob.get(job.id) || [];
                const completedCount = jobSessions.filter((s) => s.status === 'completed').length;
                const inProgressCount = jobSessions.filter((s) => s.status === 'in_progress').length;
                const questionsCount = job.questions?.length || 0;
                const requirementsCount = (job.requirements || job.skills || []).length;

                // Determine last activity timestamp
                let lastActivityTime = job.updatedAt || job.createdAt;
                if (jobSessions.length > 0) {
                  const latestSessionTime = jobSessions.reduce((latest, s) => {
                    const t = new Date(s.startedAt || 0).getTime();
                    return t > latest ? t : latest;
                  }, 0);
                  if (latestSessionTime > new Date(lastActivityTime || 0).getTime()) {
                    lastActivityTime = new Date(latestSessionTime).toISOString();
                  }
                }

                let badgeVariant = 'draft';
                if (job.status === 'active') badgeVariant = 'active';
                else if (job.status === 'closed') badgeVariant = 'warning';

                return (
                  <tr key={job.id} className="positions-table__row">
                    <td className="positions-table__cell-title">
                      <div className="position-title-link" onClick={() => navigate(`/positions/${job.id}`)}>
                        <strong>{job.title}</strong>
                      </div>
                      <div className="position-dept">
                        {job.department || 'General'} · ID: <span className="position-id-mono">{job.id}</span>
                      </div>
                    </td>

                    <td>
                      <Badge variant={badgeVariant} size="sm">
                        {job.status ? job.status.toUpperCase() : 'DRAFT'}
                      </Badge>
                    </td>

                    <td>
                      <span className="metric-chip">
                        {requirementsCount} req{requirementsCount !== 1 ? 's' : ''}
                      </span>
                      <span className="metric-chip metric-chip--subtle">
                        {questionsCount} question{questionsCount !== 1 ? 's' : ''}
                      </span>
                    </td>

                    <td>
                      <div>
                        <strong>{completedCount}</strong> completed
                        {inProgressCount > 0 && (
                          <span className="in-progress-note"> ({inProgressCount} active)</span>
                        )}
                      </div>
                      <span className="total-sessions-sub">
                        {jobSessions.length} total session{jobSessions.length !== 1 ? 's' : ''}
                      </span>
                    </td>

                    <td className="positions-table__cell-time">
                      {lastActivityTime ? formatRelativeTime(lastActivityTime) : 'Never'}
                    </td>

                    <td className="positions-table__cell-actions">
                      <div className="positions-actions-group">
                        {job.status === 'active' && (
                          <Button
                            variant="secondary"
                            size="sm"
                            onClick={() => navigate(`/interview/${job.id}`)}
                            title="Open candidate interview room"
                          >
                            Start interview
                          </Button>
                        )}
                        {job.status === 'active' && <Button variant="ghost" size="sm" onClick={() => close(job)}>Close position</Button>}
                        {job.status === 'draft' && <><Button variant="secondary" size="sm" onClick={() => activate(job)}>Activate</Button><Button variant="secondary" size="sm" onClick={() => navigate(`/interview/${job.id}`)}>Test interview</Button></>}
                        {job.status === 'closed' && <Button variant="secondary" size="sm" onClick={() => reopen(job)}>Reopen</Button>}
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => navigate(`/positions/${job.id}`)}
                        >
                          Configure
                        </Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
