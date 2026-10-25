import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { store } from '../data/store.js';
import Button from '../components/ui/Button.jsx';
import Badge from '../components/ui/Badge.jsx';
import EmptyState from '../components/ui/EmptyState.jsx';
import {
  BriefcaseIcon,
  ChevronRightIcon,
  CheckIcon,
  XIcon,
  ClipboardIcon,
} from '../components/ui/Icons.jsx';
import { formatRelativeTime } from '../utils/time.js';
import { computeReportData } from '../utils/reportData.js';
import { orchestrateAnalysis } from '../analysis/orchestrator.js';
import { makeReport, health } from '../data/engineApi.js';
import { toEngineJob } from '../engine/engineJob.js';
import GeminiReport from './GeminiReport.jsx';
import './InterviewReport.css';

export default function InterviewReport() {
  const { sessionId } = useParams();
  const navigate = useNavigate();

  const [isRetrying, setIsRetrying] = useState(false);
  const [retryError, setRetryError] = useState(null);

  const [session, setSession] = useState(() => {
    try {
      return store.sessions.getById(sessionId) || null;
    } catch {
      return null;
    }
  });

  const [loadError, setLoadError] = useState(() => {
    try {
      const loaded = store.sessions.getById(sessionId);
      if (!loaded) return `Interview session "${sessionId}" not found.`;
      return null;
    } catch (err) {
      return err.message;
    }
  });

  useEffect(() => {
    try {
      const loaded = store.sessions.getById(sessionId);
      if (!loaded) {
        setLoadError(`Interview session "${sessionId}" not found.`);
        setSession(null);
      } else {
        setSession(loaded);
        setLoadError(null);
      }
    } catch (err) {
      setLoadError(err.message);
      setSession(null);
    }
  }, [sessionId]);

  useEffect(() => {
    if (!session || !['completed', 'aborted'].includes(session.status) || session.analysis?.status === 'complete' || !session.turns?.some((t) => t.answer?.finalText)) return;
    makeReport({ job: toEngineJob(session.jobSnapshot), transcript: session.turns.flatMap((t) => [{ role: 'interviewer', text: t.text, action: t.action }, ...(t.answer?.finalText ? [{ role: 'candidate', text: t.answer.finalText }] : [])]) })
      .then((analysis) => { const updated = { ...session, analysis: { status: 'complete', providerId: 'gemini', providerKind: 'semantic', generatedAt: new Date().toISOString(), ...analysis } }; store.sessions.save(updated); setSession(updated); })
      .catch((err) => { const updated = { ...session, analysis: { ...session.analysis, status: 'failed', error: err.message || 'server_error' } }; store.sessions.save(updated); setSession(updated); });
  }, [session]);

  const handleRetryAnalysis = async () => {
    if (!session) return;
    setIsRetrying(true);
    setRetryError(null);
    try {
      const result = await orchestrateAnalysis(session, session.analysis?.providerId);
      const updatedSession = {
        ...session,
        analysis: result.analysis,
        updatedAt: new Date().toISOString(),
      };
      store.sessions.save(updatedSession);
      setSession(updatedSession);
    } catch (err) {
      setRetryError(err.message || 'Analysis retry failed.');
    } finally {
      setIsRetrying(false);
    }
  };

  if (loadError) {
    return (
      <div className="report-error-state">
        <div className="card report-error-card">
          <h2>Report Not Available</h2>
          <p>{loadError}</p>
          <Button variant="primary" onClick={() => navigate('/interviews')}>
            Back to Completed Interviews
          </Button>
        </div>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="report-loading">
        <p>Loading session report...</p>
      </div>
    );
  }

  const { jobSnapshot, turns = [], analysis = {} } = session;
  const requirements = jobSnapshot?.requirements || [];
  if (!turns.some((t) => t.answer?.finalText)) return <div className="interview-report-page"><p>No answers were recorded; nothing to analyze.</p></div>;
  const questions = jobSnapshot?.questions || [];

  // Delegate all report computation to the pure utility (no inline logic)
  const report = computeReportData(session);
  const {
    questionsAskedCount,
    questionsAnsweredCount,
    questionsSkippedCount,
    requirementsTotal,
    requirementsCoveredCount,
    requirementReports,
    demonstratedRequirements = [],
    partiallyDemonstratedRequirements = [],
    insufficientEvidenceRequirements = [],
    transcriptTurns,
    notAssessedRequirements,
    unmappedTurns,
    limitations = [],
    analysisStatus,
    analysisError,
    analysisProviderKind,
    analysisProviderId,
    rejectedEvidenceCount,
    durationText,
  } = report;

  // Analysis requirement mappings (for backwards compatibility with existing JSX)
  const analysisRequirements = analysis.requirements || [];

  // Status badge config
  let statusBadgeVariant = 'draft';
  if (session.status === 'completed') statusBadgeVariant = 'active';
  else if (session.status === 'aborted') statusBadgeVariant = 'warning';

  return (
    <div className="interview-report-page">
      {/* Navigation & Header */}
      <div className="report-top-bar">
        <Button variant="secondary" size="sm" onClick={() => navigate('/interviews')}>
          ← Back to Completed Interviews
        </Button>
      </div>

      <header className="report-header card">
        <div className="report-header__main">
          <div>
            <div className="report-header__badge-row">
              <span className="report-header__role-label">Screening Assessment Report</span>
              <Badge variant={statusBadgeVariant} size="sm">
                {session.status ? session.status.toUpperCase() : 'UNKNOWN'}
              </Badge>
            </div>
            <h1 className="report-header__title">{jobSnapshot?.title || 'Screening Session'}</h1>
          </div>
          <div className="report-header__meta-grid">
            <div className="meta-cell">
              <span className="meta-label">Session ID</span>
              <span className="meta-value meta-value--mono">{session.id}</span>
            </div>
            <div className="meta-cell">
              <span className="meta-label">Job ID</span>
              <span className="meta-value meta-value--mono">{session.jobId}</span>
            </div>
            <div className="meta-cell">
              <span className="meta-label">Started</span>
              <span className="meta-value">
                {session.startedAt ? new Date(session.startedAt).toLocaleString() : 'N/A'}
              </span>
            </div>
            <div className="meta-cell">
              <span className="meta-label">Ended</span>
              <span className="meta-value">
                {session.endedAt ? new Date(session.endedAt).toLocaleString() : 'In progress / unended'}
              </span>
            </div>
            <div className="meta-cell">
              <span className="meta-label">Duration</span>
              <span className="meta-value">{durationText}</span>
            </div>
          </div>
        </div>
      </header>

      {/* Honest Analysis Status Banner */}
      <section className="report-banner-container">
        {analysis.status === 'failed' ? (
          <div className="report-banner report-banner--failed" role="alert">
            <div className="banner-title">
              <strong>Analysis Status: Failed</strong>
            </div>
            <p className="banner-desc">
              Automated analysis encountered an error: {analysis.error || 'Unknown analysis error'}.
              The full interview transcript and recorded candidate responses remain intact and verifiable below.
            </p>
            <div className="banner-actions" style={{ marginTop: '0.75rem' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={handleRetryAnalysis}
                disabled={isRetrying}
              >
                {isRetrying ? 'Retrying Analysis...' : 'Retry Analysis'}
              </Button>
            </div>
            {retryError && (
              <p className="banner-retry-error" style={{ color: '#ef4444', marginTop: '0.5rem', fontSize: '0.875rem' }}>
                {retryError}
              </p>
            )}
          </div>
        ) : analysis.providerKind === 'deterministic' ? (
          <div className="report-banner report-banner--deterministic">
            <div className="banner-title">
              <strong>Transcript-only assessment: no AI evaluation performed</strong>
            </div>
            <p className="banner-desc">
              Candidate responses are mapped verbatim to configured job requirements without automated competence scoring.
              Evaluations must be made by human reviewers using the verified evidence quotes below.
            </p>
          </div>
        ) : (
          <div className="report-banner report-banner--semantic">
            <div className="banner-title">
              <strong>Semantic AI Evaluation ({analysis.providerId || 'semantic-provider'})</strong>
            </div>
            <p className="banner-desc">
              Candidate responses were evaluated by semantic inference. All supporting quotes have been verified as exact substrings of recorded candidate answers.
            </p>
          </div>
        )}

        {analysis.rejectedEvidenceCount > 0 && (
          <div className="report-banner report-banner--warning" role="alert">
            <strong>Evidence Validator Notice:</strong> {analysis.rejectedEvidenceCount} evidence quote(s) emitted by the provider were rejected and excluded because they did not exactly match recorded candidate responses.
          </div>
        )}

        {session.status === 'aborted' && (
          <div
            className="report-banner report-banner--warning"
            role="region"
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem', marginTop: '0.75rem' }}
          >
            <div>
              <div className="banner-title">
                <strong>Session Aborted Early</strong>
              </div>
              <p className="banner-desc" style={{ margin: 0 }}>
                Candidate exited before completing all questions. Recorded answers prior to exit are preserved.
              </p>
            </div>
            <Button
              id="run-aborted-analysis-btn"
              variant="primary"
              size="sm"
              onClick={handleRetryAnalysis}
              disabled={isRetrying}
            >
              {isRetrying ? 'Running Analysis...' : 'Run Analysis on Recorded Responses'}
            </Button>
          </div>
        )}
      </section>

      {analysis.providerId === 'gemini' && analysis.status === 'complete' && <GeminiReport analysis={analysis} turns={turns} />}

      {/* Executive Summary (Computed Facts Only) */}
      <section className="report-section">
        <h2 className="report-section__title">Executive Summary</h2>
        <div className="report-stats-grid">
          <div className="stat-card">
            <div className="stat-card__label">Questions Asked</div>
            <div className="stat-card__value">{questionsAskedCount}</div>
            <div className="stat-card__detail">in live interview session</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Questions Answered</div>
            <div className="stat-card__value">{questionsAnsweredCount}</div>
            <div className="stat-card__detail">finalized candidate responses</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Questions Skipped</div>
            <div className="stat-card__value">{questionsSkippedCount}</div>
            <div className="stat-card__detail">skipped during interview</div>
          </div>
          <div className="stat-card">
            <div className="stat-card__label">Requirements Covered</div>
            <div className="stat-card__value">
              {requirementsCoveredCount} / {requirementsTotal}
            </div>
            <div className="stat-card__detail">with verbatim answer evidence</div>
          </div>
        </div>
      </section>

      {/* Key Demonstrated Areas & Material Gaps */}
      <section className="report-section">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: '#10b981' }}>✓</span> Key Demonstrated Areas ({demonstratedRequirements.length})
            </h3>
            {demonstratedRequirements.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary, #6b7280)', fontSize: '0.875rem' }}>
                No requirements currently classified as Demonstrated.
              </p>
            ) : (
              <ul style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.875rem' }}>
                {demonstratedRequirements.map((r) => (
                  <li key={r.id} style={{ marginBottom: '0.375rem' }}>
                    <strong>{r.name}</strong> ({r.priority})
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="card" style={{ padding: '1.25rem' }}>
            <h3 style={{ fontSize: '1rem', fontWeight: 600, marginBottom: '0.75rem', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <span style={{ color: '#f59e0b' }}>⚠</span> Material Gaps / Unresolved Items ({notAssessedRequirements.length + insufficientEvidenceRequirements.length})
            </h3>
            {notAssessedRequirements.length === 0 && insufficientEvidenceRequirements.length === 0 ? (
              <p style={{ color: 'var(--color-text-secondary, #6b7280)', fontSize: '0.875rem' }}>
                No material coverage gaps identified.
              </p>
            ) : (
              <ul style={{ paddingLeft: '1.25rem', margin: 0, fontSize: '0.875rem' }}>
                {insufficientEvidenceRequirements.map((r) => (
                  <li key={r.id} style={{ marginBottom: '0.375rem' }}>
                    <strong>{r.name}</strong>: Insufficient evidence recorded
                  </li>
                ))}
                {notAssessedRequirements.map((r) => (
                  <li key={r.id} style={{ marginBottom: '0.375rem' }}>
                    <strong>{r.name}</strong>: Not assessed (coverage gap, not deficiency)
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </section>

      {/* Requirement-by-Requirement Coverage */}
      <section className="report-section">
        <h2 className="report-section__title">
          Requirement-by-Requirement Coverage ({requirementsTotal})
        </h2>

        {requirementsTotal === 0 ? (
          <div className="empty-subtext card">
            No specific requirements were snapshot for this position.
          </div>
        ) : (
          <div className="requirement-cards-list">
            {requirementReports.map((reqReport) => {
              let statusVariant = 'draft';
              if (reqReport.status === 'Demonstrated') statusVariant = 'active';
              else if (reqReport.status === 'Partially demonstrated' || reqReport.status === 'Awaiting analysis') {
                statusVariant = 'warning';
              }

              return (
                <div key={reqReport.id} className="requirement-card card">
                  <div className="requirement-card__header">
                    <div>
                      <h3 className="requirement-card__name">{reqReport.name}</h3>
                      <span className="requirement-card__priority">
                        Priority: {reqReport.priority}
                      </span>
                    </div>
                    <Badge variant={statusVariant} size="md">
                      {reqReport.status}
                    </Badge>
                  </div>

                  <div className="requirement-card__body">
                    <h4 className="evidence-header">Supporting Evidence (Verbatim Quotes)</h4>
                    {reqReport.quotes.length === 0 ? (
                      <p className="no-evidence-text">
                        No candidate answers recorded for this requirement.
                      </p>
                    ) : (
                      <div className="evidence-quotes-list">
                        {reqReport.quotes.map((quote, qIdx) => (
                          <blockquote key={qIdx} className="evidence-quote">
                            "{quote}"
                          </blockquote>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Requirements Not Assessed */}
      {notAssessedRequirements.length > 0 && (
        <section className="report-section">
          <h2 className="report-section__title">Requirements Not Assessed</h2>
          <div className="not-assessed-box card">
            <p className="not-assessed-notice">
              The following configured requirements had no answered questions during this session.
              This indicates lack of interview coverage, <strong>not</strong> candidate deficiency:
            </p>
            <ul className="not-assessed-list">
              {notAssessedRequirements.map((r) => (
                <li key={r.id} className="not-assessed-item">
                  <strong>{r.name}</strong> ({r.priority}) —{' '}
                  <span className="not-assessed-label">Not assessed</span>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Unmapped Questions */}
      {unmappedTurns.length > 0 && (
        <section className="report-section">
          <h2 className="report-section__title">Unmapped Questions</h2>
          <div className="unmapped-box card">
            <p className="unmapped-notice">
              The following questions were asked during the session without linkage to a configured job requirement.
              These answers are recorded verbatim and never guessed:
            </p>
            <div className="unmapped-list">
              {unmappedTurns.map((turn) => (
                <div key={turn.id} className="unmapped-turn">
                  <div className="unmapped-turn__prompt">
                    <strong>Question:</strong> {turn.text}
                  </div>
                  <div className="unmapped-turn__answer">
                    <strong>Response:</strong>{' '}
                    {turn.isSkipped
                      ? '[Question was skipped]'
                      : turn.finalText || '[No finalized response recorded]'}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Full Transcript in Order */}
      <section className="report-section">
        <h2 className="report-section__title">Full Interview Transcript ({transcriptTurns.length} turns)</h2>

        {transcriptTurns.length === 0 ? (
          <div className="empty-subtext card">No turns were recorded for this session.</div>
        ) : (
          <div className="transcript-flow">
            {transcriptTurns.map((turn) => (
              <div key={turn.id} className={`transcript-card card ${turn.isSkipped ? 'transcript-card--skipped' : ''}`}>
                <div className="transcript-card__meta">
                  <span className="transcript-turn-num">#{turn.index}</span>
                  <Badge variant={turn.kind === 'followup' ? 'warning' : 'draft'} size="sm">
                    {turn.kind === 'followup' ? 'Follow-up' : 'Question'}
                  </Badge>
                  {turn.isSkipped && (
                    <Badge variant="draft" size="sm">
                      Skipped by candidate
                    </Badge>
                  )}
                  {turn.askedAt && (
                    <span className="transcript-time">
                      {new Date(turn.askedAt).toLocaleTimeString()}
                    </span>
                  )}
                </div>

                <div className="transcript-card__question">
                  <strong>Prompt: </strong> {turn.text}
                </div>

                {turn.kind === 'followup' && turn.rationale && (
                  <div className="transcript-card__rationale">
                    <strong>Interviewer Rationale: </strong> {turn.rationale}
                  </div>
                )}

                {turn.hasAnswer && (
                  <div className="transcript-card__answer">
                    <div className="answer-header">
                      <strong>Candidate Answer</strong>
                      <span className="answer-mode-badge">
                        Mode: {turn.inputMode || 'text'}
                      </span>
                    </div>
                    <p className="answer-text">"{turn.finalText}"</p>
                    {turn.answeredAt && (
                      <span className="answer-time">
                        Answered at: {new Date(turn.answeredAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Assessment Limitations Notice */}
      <section className="report-section">
        <div className="card" style={{ padding: '1.25rem', borderLeft: '4px solid #6366f1', background: 'rgba(99, 102, 241, 0.04)' }}>
          <h4 style={{ fontSize: '0.9375rem', fontWeight: 600, margin: '0 0 0.5rem 0', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            System Assessment Limitations
          </h4>
          <ul style={{ margin: 0, paddingLeft: '1.25rem', fontSize: '0.875rem', color: 'var(--color-text-secondary, #4b5563)' }}>
            {limitations.map((lim, idx) => (
              <li key={idx} style={{ marginBottom: '0.25rem' }}>{lim}</li>
            ))}
          </ul>
        </div>
      </section>
    </div>
  );
}
