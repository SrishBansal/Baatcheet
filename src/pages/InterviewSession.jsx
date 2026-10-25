import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { store } from '../data/store.js';
import { sessionStore, SessionStatus } from '../data/sessions.js';
import { useInterviewSession } from '../hooks/useInterviewSession.js';
import Button from '../components/ui/Button.jsx';
import Badge from '../components/ui/Badge.jsx';
import Modal from '../components/ui/Modal.jsx';
import {
  BriefcaseIcon,
  CheckIcon,
  XIcon,
} from '../components/ui/Icons.jsx';
import './InterviewSession.css';
import { health, healthLabel } from '../data/engineApi.js';
import { engineErrorMessage } from '../utils/engineError.js';
import Banner from '../components/ui/Banner.jsx';

export default function InterviewSession() {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [candidateName, setCandidateName] = useState('');
  const [typedAnswer, setTypedAnswer] = useState('');
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const [showTranscriptDrawer, setShowTranscriptDrawer] = useState(false);
  const [reloadInterrupted, setReloadInterrupted] = useState(false);
  const [engineHealth, setEngineHealth] = useState(null);
  const [watchdogVisible, setWatchdogVisible] = useState(false);

  useEffect(() => {
    const loadedJob = store.jobs.getById(jobId);
    if (loadedJob) {
      setJob(loadedJob);
    }
  }, [jobId]);
  useEffect(() => { health().then(setEngineHealth).catch(() => setEngineHealth({ error: true })); }, []);

  // Compute a stable interviewId once per component mount.
  // IMPORTANT: Do NOT use Date.now() inline in the options object passed to useInterviewSession.
  // useInterviewSession lists options.interviewId in its useEffect dependency array; an inline
  // object literal with Date.now() produces a new value on every render, which causes the effect
  // to re-run, destroying and recreating the InterviewController on every forceUpdate() call.
  const activeSessionKey = `hirepilot:active_session:${jobId}`;

  // P0.4 Reload Guard: if sessionStorage holds an in_progress session with no live controller,
  // mark it aborted immediately (before mounting the hook) and generate a new interviewId.
  // NOTE: useRef initial value runs once; we use a lazy IIFE to compute it synchronously.
  const reloadDetectedRef = useRef(false);
  const interviewIdRef = useRef(null);
  if (interviewIdRef.current === null) {
    const freshId = `session-${jobId}-${Date.now()}`;
    if (typeof sessionStorage !== 'undefined') {
      const storedId = sessionStorage.getItem(activeSessionKey);
      if (storedId) {
        try {
          const existing = sessionStore.getById(storedId);
          if (existing && existing.status === SessionStatus.IN_PROGRESS) {
            // No live controller (fresh page load) — abort the orphaned session immediately.
            const aborted = {
              ...existing,
              status: SessionStatus.ABORTED,
              abortReason: 'page_reloaded',
              endedAt: new Date().toISOString(),
            };
            sessionStore.save(aborted);
            sessionStorage.removeItem(activeSessionKey);
            reloadDetectedRef.current = true;
          }
        } catch {
          // Corrupt stored session — ignore and start fresh.
          sessionStorage.removeItem(activeSessionKey);
        }
      }
    }
    interviewIdRef.current = freshId;
  }

  useEffect(() => {
    if (reloadDetectedRef.current) {
      setReloadInterrupted(true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(activeSessionKey, interviewIdRef.current);
    }
  }, [activeSessionKey]);

  const session = useInterviewSession(job, { interviewId: interviewIdRef.current });
  const allowTyping = job?.settings?.allowTyping === true;

  useEffect(() => {
    const waiting = session.state === 'SPEAKING_QUESTION' || session.state === 'FOLLOW_UP' || session.state === 'PROCESSING_RESPONSE';
    if (!waiting) {
      setWatchdogVisible(false);
      return undefined;
    }
    const timer = setTimeout(() => setWatchdogVisible(true), 20000);
    return () => clearTimeout(timer);
  }, [session.state]);

  if (!job) {
    return (
      <div className="interview-error-state">
        <div className="card interview-error-card">
          <h2>Position Not Found</h2>
          <p>The requested interview position could not be located.</p>
          <Button variant="primary" onClick={() => navigate('/')}>
            Return to Dashboard
          </Button>
        </div>
      </div>
    );
  }
  if (job.status === 'closed') {
    return <div className="interview-error-state"><div className="card interview-error-card"><h2>This position is closed.</h2></div></div>;
  }
  // 0.5 Reload-interrupted guard screen
  if (reloadInterrupted && job) {
    return (
      <div className="interview-container">
        <div className="interview-completion-card">
          <h1 className="completion-title" id="reload-interrupted-heading">Interview Interrupted</h1>
          <p className="completion-subtitle">
            Your previous session for <strong>{job.title}</strong> was interrupted when the page was
            reloaded. The answers you provided before the reload have been saved.
          </p>
          <p className="completion-subtitle">
            To start a new session, click the button below.
          </p>
          <div className="completion-actions">
            <Button
              id="reload-interrupted-restart-btn"
              variant="primary"
              onClick={() => setReloadInterrupted(false)}
            >
              Start New Session
            </Button>
            <Button variant="ghost" onClick={() => navigate('/')}>
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 1. Consent Screen (Before interview starts)
  if (!session.hasConsented && session.state !== 'COMPLETED' && session.state !== 'ABORTED') {
    return (
      <div className="interview-container">
        <div className="interview-consent-card">
          <div className="interview-consent-header">
            <div className="interview-consent-icon">
              <BriefcaseIcon />
            </div>
            <div>
              <span className="interview-consent-badge">Candidate Screening</span>
              <h1 className="interview-consent-title">{job.title}</h1>
            </div>
          </div>

          <div className="interview-consent-body">
            <div className="consent-checkbox-row">
              <label htmlFor="candidate-name">Your full name</label>
              <input id="candidate-name" value={candidateName} onChange={(e) => setCandidateName(e.target.value)} />
              <input
                id="consent-acknowledgement"
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
              />
              <label htmlFor="consent-acknowledgement">
                {engineHealth?.geminiConfigured === false
                  ? 'Before you start: Your spoken answers are transcribed and saved as a text transcript. Audio is not stored by this app. Chrome sends your audio to Google\'s speech service for transcription. AI is not configured; no follow-up questions will be generated. The recruiter will see: your full transcript; the questions asked and why. No hiring decision is made automatically. A requirement you were not asked about is marked \'Not assessed\' and is not held against you. You can end the interview at any time. Your name is saved with the transcript.'
                  : "Before you start: Your spoken answers are transcribed and saved as a text transcript. Audio is not stored by this app. Chrome sends your audio to Google's speech service for transcription. The transcript is also sent to Google Gemini to generate follow-up questions and an assessment. The recruiter will see: your full transcript; an AI-generated assessment of how your answers relate to each job requirement, with quotes from your answers; the questions asked and why. No hiring decision is made automatically. A requirement you were not asked about is marked 'Not assessed' and is not held against you. You can end the interview at any time. Your name is saved with the transcript."}
              </label>
            </div>
          </div>

          <div className="interview-consent-footer">
            <Button variant="secondary" onClick={() => navigate('/')}>
              Cancel
            </Button>
            <Button
              id="begin-interview-btn"
              variant="primary"
              disabled={!consentChecked || candidateName.trim().length < 2 || engineHealth?.geminiConfigured === false}
              onClick={() => {
                session.setCandidate(candidateName.trim());
                session.grantConsent();
                session.startInterview();
              }}
              icon={<CheckIcon />}
            >
              Begin Interview
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 2. Completed State
  if (session.state === 'COMPLETED' || session.sessionRecord?.status === 'completed') {
    return (
      <div className="interview-container">
        <div className="interview-completion-card">
          <div className="completion-icon-wrapper">
            <CheckIcon />
          </div>
          <h1 className="completion-title">Interview Completed</h1>
          <p className="completion-subtitle">
            Thank you for completing the screening interview for <strong>{job.title}</strong>.
            Your responses have been recorded and submitted to the recruiting team for review.
          </p>

          <div className="completion-actions">
            <Button id="completion-dashboard-btn" variant="primary" onClick={() => navigate('/')}>
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // 3. Aborted State
  if (session.state === 'ABORTED' || session.sessionRecord?.status === 'aborted') {
    return (
      <div className="interview-container">
        <div className="interview-completion-card">
          <h1 className="completion-title">Interview Ended</h1>
          <p className="completion-subtitle">
            You exited the interview session for <strong>{job.title}</strong>.
            The responses provided prior to exiting have been saved for the hiring team.
          </p>
          <div className="completion-actions">
            <Button variant="primary" onClick={() => navigate('/')}>
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }


  // 4. Live Interview Flow (SPEAKING_QUESTION, LISTENING, PROCESSING_RESPONSE, PAUSED)
  const isSpeaking = session.state === 'SPEAKING_QUESTION' || session.state === 'FOLLOW_UP';
  const isListening = session.state === 'LISTENING';
  const isPaused = session.state === 'PAUSED';
  const isDeciding = session.state === 'PROCESSING_RESPONSE';

  const handleManualSubmit = (e) => {
    e?.preventDefault();
    if (typedAnswer.trim()) {
      session.submitAnswer(typedAnswer.trim());
      setTypedAnswer('');
    }
  };

  const handleVoiceSubmit = () => {
    const textToSubmit = session.interimSpeech || typedAnswer;
    if (textToSubmit.trim()) {
      session.doneAnswer ? session.doneAnswer() : session.submitAnswer(textToSubmit.trim());
      setTypedAnswer('');
    }
  };

  if (!allowTyping && (!session.capabilities?.hasSpeechRecognition || /permission|denied/i.test(session.speechError || ''))) {
    return <div className="interview-error-state"><div className="card interview-error-card"><p>This interview needs a microphone and Chrome. Allow microphone access, then retry.</p><Button onClick={() => window.location.reload()}>Retry</Button></div></div>;
  }

  return (
    <div className="interview-live-layout">
      {/* Top status bar */}
      <header className="live-header">
        <div className="live-header__left">
          <span className="live-header__role">{job.title}</span>
          <span className="live-header__sep">·</span>
          <span className="live-header__progress">
            Question {session.progress.current} of {session.progress.total}
          </span>
        </div>

        <div className="live-header__right">
          <span
            className="adaptive-chip"
            data-testid="adaptive-chip"
            style={{
              fontSize: '0.75rem',
              fontWeight: 500,
              padding: '2px 8px',
              borderRadius: '9999px',
              backgroundColor: session.reasoning?.providerKind === 'gemini' ? '#e0f2fe' : '#f1f5f9',
              color: session.reasoning?.providerKind === 'gemini' ? '#0369a1' : '#475569',
              border: '1px solid currentColor',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            {healthLabel(engineHealth)}
          </span>

          {session.engineError ? (
            <Badge variant="warning" size="md">Paused: interviewer unavailable</Badge>
          ) : isPaused ? (
            <Badge variant="warning" size="md">Paused</Badge>
          ) : isSpeaking ? (
            <Badge variant="active" size="md">Interviewer Speaking</Badge>
          ) : isListening ? (
            <Badge variant="success" size="md">Listening for Answer</Badge>
          ) : isDeciding ? (
            <Badge variant="draft" size="md" aria-live="polite">Thinking…</Badge>
          ) : (
            <Badge variant="draft" size="md">Processing</Badge>
          )}

          <Button
            id="toggle-transcript-btn"
            variant="ghost"
            size="sm"
            onClick={() => setShowTranscriptDrawer(!showTranscriptDrawer)}
          >
            {showTranscriptDrawer ? 'Hide Transcript' : 'View Transcript'}
          </Button>

          <Button
            id="exit-interview-btn"
            variant="ghost"
            size="sm"
            onClick={() => setIsEndModalOpen(true)}
          >
            Exit
          </Button>
        </div>
      </header>

      {/* Visual Question Progress Bar */}
      <div
        className="live-progress-bar"
        role="progressbar"
        aria-valuenow={session.progress.current}
        aria-valuemin="1"
        aria-valuemax={session.progress.total}
      >
        <div
          className="live-progress-bar__fill"
          style={{
            width: `${session.progress.total > 0 ? (session.progress.current / session.progress.total) * 100 : 0}%`,
          }}
        />
      </div>

      {/* Main active question card */}
      <main className="live-main">
        {/* State line */}
        <div className="interview-state-line" role="status" aria-label={`Current state: ${session.state}`}>
          <span className={`state-line-dot state-line-dot--${session.state.toLowerCase()}`} />
          <span className="state-line-label">
            {isPaused
              ? 'Interview Paused'
              : isSpeaking
              ? 'Interviewer Speaking'
              : isListening
              ? 'Listening for Candidate Answer'
              : isDeciding
              ? 'Evaluating Response & Thinking…'
              : 'Processing'}
          </span>
        </div>

        {/* Real-time Caption Box */}
        <div className="live-caption-box" role="region" aria-label="Live Captions" aria-live="polite">
          <span className="caption-box__label">Live Transcript / Captions</span>
          <p className="caption-box__text">
            {session.interimSpeech
              ? `“${session.interimSpeech}”`
              : isSpeaking
              ? `“${session.activePrompt?.text || ''}”`
              : isListening
              ? 'Awaiting candidate speech...'
              : 'Captions will appear here when speaking or listening.'}
          </p>
        </div>

        {session.speechError && (
          <div className="alert alert--danger" role="alert">
            {session.speechError}
          </div>
        )}

        {session.engineError && (
          <Banner tone="error" actions={<Button
              id="retry-turn-btn"
              variant="secondary"
              size="sm"
              onClick={() => session.retryTurn()}
            >
              Retry
            </Button>}>
            {engineErrorMessage(session.engineError)} <small>{session.engineError}</small>
          </Banner>
        )}

        {session.microphoneStalled && (
          <Banner tone="warning" actions={<Button size="sm" variant="secondary" onClick={() => session.restartMicrophone()}>Manual restart</Button>}>
            Microphone stalled
          </Banner>
        )}

        {watchdogVisible && (
          <Banner tone="warning" actions={<Button size="sm" variant="secondary" onClick={() => { session.resetStep(); setWatchdogVisible(false); }}>Reset this step</Button>}>
            This is taking longer than expected.
          </Banner>
        )}

        <div className="active-question-card">
          <div className="active-question-card__header">
            {session.activePrompt?.isFollowUp && (
              <Badge variant="active" size="sm">Follow-up</Badge>
            )}
          </div>

          <h2 className="active-question-card__prompt">
            {session.activePrompt?.text || 'Loading prompt...'}
          </h2>

          {isSpeaking && !session.engineError && (
            <div className="speaking-indicator">
              <span className="speaking-pulse" />
              <span>Interviewer is speaking... Click to interrupt and answer.</span>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => session.interruptQuestion()}
              >
                Interrupt & Speak
              </Button>
            </div>
          )}

          {isListening && (
            <div className="listening-indicator" role="status">
              <span className="listening-pulse" />
              <span>Microphone Active — Listening for your response</span>
            </div>
          )}

          {isDeciding && (
            <div className="deciding-indicator" role="status" aria-live="polite" style={{ padding: '0.75rem 1rem', background: 'var(--color-bg-subtle, #f8fafc)', borderRadius: '6px', margin: '0.75rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem', fontStyle: 'italic', color: '#475569' }}>
              <span className="deciding-pulse">⏳</span>
              <span>Thinking…</span>
            </div>
          )}

          {isPaused && (
            <div className="paused-banner">
              <strong>Interview Paused.</strong> Take a breath. Click Resume when you are ready.
              <Button
                id="resume-btn"
                variant="primary"
                size="sm"
                onClick={() => session.resume()}
              >
                Resume Interview
              </Button>
            </div>
          )}
        </div>

        {/* Candidate Response Workspace */}
        {!isPaused && (
          <div className="response-card">
            <div className="response-card__header">
              {allowTyping && <>
              <div className="response-card__tabs">
                <button
                  type="button"
                  className={`tab-btn ${session.inputMode === 'voice' ? 'tab-btn--active' : ''}`}
                  onClick={() => session.setInputMode('voice')}
                  disabled={!session.capabilities?.hasSpeechRecognition}
                >
                  Voice Input
                </button>
                <button
                  type="button"
                  className={`tab-btn ${session.inputMode === 'text' ? 'tab-btn--active' : ''}`}
                  onClick={() => session.setInputMode('text')}
                >
                  Manual Text Input
                </button>
              </div>

              {!session.capabilities?.hasSpeechRecognition && (
                <span className="response-card__notice">
                  (Voice input unsupported in this browser; text mode active)
                </span>
              )}
              </>}
            </div>

            <div className="response-card__body">
              {!allowTyping || session.inputMode === 'voice' ? (
                <div className="voice-response-box">
                  <div className="voice-response-live">
                    {session.interimSpeech ? (
                      <p className="live-speech-text">{session.interimSpeech}</p>
                    ) : (
                      <p className="live-speech-placeholder">
                        {isListening ? 'Speak into your microphone now...' : 'Waiting for question to complete...'}
                      </p>
                    )}
                  </div>
                  <div className="voice-response-actions">
                    <Button
                      id="submit-voice-answer-btn"
                      variant="primary"
                      disabled={!session.interimSpeech.trim() || !isListening}
                      onClick={handleVoiceSubmit}
                    >
                      Done answering
                    </Button>
                  </div>
                </div>
              ) : (
                <form onSubmit={handleManualSubmit} className="text-response-form">
                  <textarea
                    id="manual-answer-input"
                    className="text-response-textarea"
                    placeholder="Type your response here..."
                    value={typedAnswer}
                    onChange={(e) => setTypedAnswer(e.target.value)}
                    rows={4}
                    disabled={!isListening}
                  />
                  <div className="text-response-actions">
                    <Button
                      id="submit-text-answer-btn"
                      type="submit"
                      variant="primary"
                      disabled={!typedAnswer.trim() || !isListening}
                    >
                      Submit Answer
                    </Button>
                  </div>
                </form>
              )}
            </div>
          </div>
        )}

        {/* Candidate Controls Bar */}
        <footer className="live-controls">
          <div className="live-controls__group">
            <Button
              id="repeat-btn"
              variant="secondary"
              size="sm"
              disabled={!isListening}
              onClick={() => session.repeatQuestion()}
            >
              Repeat Question
            </Button>
            <Button
              id="start-over-btn" variant="secondary" size="sm" disabled={!isListening} onClick={() => session.startOverAnswer?.()}>Start over</Button>
          </div>

          <div className="live-controls__group">
            {!isPaused && (
              <Button
                id="pause-btn"
                variant="secondary"
                size="sm"
                onClick={() => session.pause()}
              >
                Pause
              </Button>
            )}
          </div>
        </footer>
      </main>

      {/* Transcript Drawer overlay */}
      {showTranscriptDrawer && (
        <aside className="transcript-drawer">
          <div className="transcript-drawer__header">
            <h3>Interview Transcript</h3>
            <button
              type="button"
              className="btn-icon-close"
              onClick={() => setShowTranscriptDrawer(false)}
            >
              <XIcon />
            </button>
          </div>
          <div className="transcript-drawer__content">
            {session.transcript.length === 0 ? (
              <p className="empty-subtext">No transcript turns recorded yet.</p>
            ) : (
              session.transcript.map((turn) => (
                <div
                  key={turn.id}
                  className={`drawer-turn drawer-turn--${turn.role}`}
                >
                  <span className="drawer-turn__role">
                    {turn.role === 'interviewer' ? 'Interviewer' : session.sessionRecord?.candidate?.name || 'Candidate'}
                  </span>
                  <p className="drawer-turn__text">
                    {turn.text || turn.recognizedText || (turn.skipped ? '[Question Skipped]' : '')}
                  </p>
                </div>
              ))
            )}
          </div>
        </aside>
      )}

      {/* Confirmation Modal to End Interview Early */}
      <Modal
        id="confirm-end-modal"
        open={isEndModalOpen}
        onClose={() => setIsEndModalOpen(false)}
        title="Exit Interview Early?"
        size="sm"
        footer={
          <div className="modal-actions">
            <Button variant="secondary" onClick={() => setIsEndModalOpen(false)}>
              Continue Interview
            </Button>
            <Button
              id="confirm-end-btn"
              variant="danger"
              onClick={() => {
                setIsEndModalOpen(false);
                session.endEarly();
              }}
            >
              Exit Interview
            </Button>
          </div>
        }
      >
        <p className="delete-modal-warning">
          Are you sure you want to end this interview session? Your answers recorded so far
          will be saved, but remaining questions will not be completed.
        </p>
      </Modal>
    </div>
  );
}
