import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { store } from '../data/store.js';
import Button from '../components/ui/Button.jsx';
import Badge from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import { ClipboardIcon, ChevronRightIcon, CheckIcon } from '../components/ui/Icons.jsx';
import { formatRelativeTime } from '../utils/time.js';
import './InterviewList.css';

export default function InterviewList() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState([]);
  const [storageErrors, setStorageErrors] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const { sessions: loadedSessions, errors } = store.sessions.getAllWithStatus();
    // Sort reverse chronological
    const sorted = [...loadedSessions].sort((a, b) => {
      const timeA = new Date(a.startedAt || 0).getTime();
      const timeB = new Date(b.startedAt || 0).getTime();
      return timeB - timeA;
    });
    setSessions(sorted);
    setStorageErrors(errors || []);
  }, []);

  const filteredSessions = sessions.filter((s) => {
    if (filter === 'all') return true;
    return s.status === filter;
  });

  const completedCount = sessions.filter((s) => s.status === 'completed').length;
  const abortedCount = sessions.filter((s) => s.status === 'aborted').length;

  return (
    <div className="interview-list-page">
      <div className="interview-list-header">
        <div>
          <h1 className="interview-list-title">Completed Interviews & Reports</h1>
          <p className="interview-list-subtitle">
            Review durable session records, verified transcripts, and evidence-backed evaluation reports.
          </p>
        </div>
      </div>

      {storageErrors.length > 0 && (
        <div className="storage-error-alert" role="alert">
          <strong>Storage notice:</strong> {storageErrors.length} corrupted or unreadable session record(s) were detected and skipped:
          <ul>
            {storageErrors.map((e, idx) => (
              <li key={idx}>{e.id ? `Session ${e.id}: ` : ''}{e.error}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Filter Tabs */}
      <div className="interview-list-toolbar">
        <div className="interview-filter-tabs">
          <button
            type="button"
            className={`filter-tab ${filter === 'all' ? 'filter-tab--active' : ''}`}
            onClick={() => setFilter('all')}
          >
            All Sessions ({sessions.length})
          </button>
          <button
            type="button"
            className={`filter-tab ${filter === 'completed' ? 'filter-tab--active' : ''}`}
            onClick={() => setFilter('completed')}
          >
            Completed ({completedCount})
          </button>
          <button
            type="button"
            className={`filter-tab ${filter === 'aborted' ? 'filter-tab--active' : ''}`}
            onClick={() => setFilter('aborted')}
          >
            Aborted ({abortedCount})
          </button>
        </div>
      </div>

      {filteredSessions.length === 0 ? (
        <EmptyState
          icon={<ClipboardIcon />}
          title={sessions.length === 0 ? 'No interview sessions recorded yet' : 'No matching sessions'}
          description={
            sessions.length === 0
              ? 'When candidates complete or exit live screening interviews, durable session records and evaluation reports will appear here.'
              : 'Try selecting a different filter.'
          }
          action={
            sessions.length === 0 ? (
              <Button variant="primary" onClick={() => navigate('/jobs')}>
                View Job Positions
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="interview-session-cards">
          {filteredSessions.map((session) => {
            const jobTitle = session.jobSnapshot?.title || 'Unknown Position';
            const answersCount = (session.turns || []).filter(
              (t) => t.answer?.finalText && !t.skipped
            ).length;
            const totalTurns = (session.turns || []).length;
            const analysis = session.analysis || {};

            let statusBadgeVariant = 'draft';
            let statusLabel = session.status;
            if (session.status === 'completed') {
              statusBadgeVariant = 'active';
              statusLabel = 'Completed';
            } else if (session.status === 'aborted') {
              statusBadgeVariant = 'warning';
              statusLabel = 'Aborted';
            } else if (session.status === 'in_progress') {
              statusBadgeVariant = 'draft';
              statusLabel = 'In Progress';
            }

            return (
              <div key={session.id} className="session-card">
                <div className="session-card__left">
                  <div className="session-card__title-row">
                    <h3 className="session-card__title">{session.candidate?.name || 'Unnamed candidate'} — {jobTitle}</h3>
                    <Badge variant={statusBadgeVariant} size="sm">
                      {statusLabel}
                    </Badge>
                  </div>
                  <div className="session-card__meta">
                    <span className="session-card__id">ID: {session.id}</span>
                    <span className="session-card__dot">·</span>
                    <span>
                      {session.startedAt ? formatRelativeTime(session.startedAt) : 'Recently'}
                    </span>
                    <span className="session-card__dot">·</span>
                    <span>
                      {answersCount} answer{answersCount !== 1 ? 's' : ''} ({totalTurns} turn{totalTurns !== 1 ? 's' : ''})
                    </span>
                  </div>
                  <div className="session-card__analysis-tag">
                    <span className="analysis-provider-label">
                      Analysis: {analysis.status || 'not_requested'}
                    </span>
                    <span className="analysis-provider-kind">
                      ({analysis.providerKind || 'deterministic'})
                    </span>
                  </div>
                </div>

                <div className="session-card__right">
                  <Button
                    variant="secondary"
                    size="sm"
                    icon={<ChevronRightIcon />}
                    onClick={() => navigate(`/interviews/${session.id}`)}
                  >
                    Open Report
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
