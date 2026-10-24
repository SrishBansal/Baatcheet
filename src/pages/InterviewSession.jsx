import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { store } from '../data/store.js';
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

export default function InterviewSession() {
  const { jobId } = useParams();
  const navigate = useNavigate();

  const [job, setJob] = useState(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [typedAnswer, setTypedAnswer] = useState('');
  const [isEndModalOpen, setIsEndModalOpen] = useState(false);
  const [showTranscriptDrawer, setShowTranscriptDrawer] = useState(false);

  useEffect(() => {
    const loadedJob = store.jobs.getById(jobId);
    if (loadedJob) {
      setJob(loadedJob);
    }
  }, [jobId]);

  const session = useInterviewSession(job, { interviewId: `session-${jobId}-${Date.now()}` });

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

  // 1. Consent Screen (Before interview starts)
  if (!session.hasConsented) {
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
            <h3>Interview Overview</h3>
            <p>
              Welcome to the HirePilot screening interview. This session consists of{' '}
              <strong>{job.questions?.length || 0} structured questions</strong> designed to assess role competencies.
            </p>

            <div className="interview-features-grid">
              <div className="feature-item">
                <strong>Voice or Text</strong>
                <span>Speak your answers naturally, or switch to manual typing at any point.</span>
              </div>
              <div className="feature-item">
                <strong>In Your Control</strong>
                <span>You can ask to repeat a question, request clarification, or skip ahead.</span>
              </div>
              <div className="feature-item">
                <strong>Evidence-Backed</strong>
                <span>Recruiters evaluate verified transcripts with human oversight.</span>
              </div>
            </div>

            {session.capabilities && (
              <div className="capability-notice">
                <strong>Audio Environment: </strong>
                {session.capabilities.summary}
              </div>
            )}

            <div className="consent-checkbox-row">
              <input
                id="consent-acknowledgement"
                type="checkbox"
                checked={consentChecked}
                onChange={(e) => setConsentChecked(e.target.checked)}
              />
              <label htmlFor="consent-acknowledgement">
                I understand this is an AI-assisted screening interview. I consent to my responses
                and transcript being recorded for evaluation by the hiring team.
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
              disabled={!consentChecked}
              onClick={() => {
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
  if (session.state === 'COMPLETED') {
    return (
      <div className="interview-container">
        <div className="interview-completion-card">
          <div className="completion-icon-wrapper">
            <CheckIcon />
          </div>
          <h1 className="completion-title">Interview Completed</h1>
          <p className="completion-subtitle">
            Thank you for completing the screening interview for <strong>{job.title}</strong>.
            Your verified transcript has been recorded and submitted to the recruiting team for review.
          </p>

          <div className="completion-summary">
            <h3>Transcript Summary ({session.transcript.length} turns)</h3>
            <div className="transcript-list">
              {session.transcript.map((turn) => (
                <div
                  key={turn.id}
                  className={`transcript-item transcript-item--${turn.role} ${turn.skipped ? 'transcript-item--skipped' : ''}`}
                >
                  <div className="transcript-item__meta">
                    <strong>{turn.role === 'interviewer' ? 'HirePilot' : 'You'}</strong>
                    {turn.skipped && <Badge variant="draft" size="sm">Skipped</Badge>}
                  </div>
                  <p className="transcript-item__text">
                    {turn.text || turn.recognizedText || (turn.skipped ? 'Question skipped by candidate.' : '')}
                  </p>
                </div>
              ))}
            </div>
          </div>

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
  if (session.state === 'ABORTED') {
    return (
      <div className="interview-container">
        <div className="interview-completion-card">
          <h1 className="completion-title">Interview Ended</h1>
          <p className="completion-subtitle">
            You exited the interview session for <strong>{job.title}</strong>.
            Your recorded responses have been preserved.
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
      session.submitAnswer(textToSubmit.trim());
      setTypedAnswer('');
    }
  };

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
          {isPaused ? (
            <Badge variant="warning" size="md">Paused</Badge>
          ) : isSpeaking ? (
            <Badge variant="active" size="md">Interviewer Speaking</Badge>
          ) : isListening ? (
            <Badge variant="success" size="md">Listening for Answer</Badge>
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

      {/* Main active question card */}
      <main className="live-main">
        {session.speechError && (
          <div className="alert alert--danger" role="alert">
            {session.speechError}
          </div>
        )}

        <div className="active-question-card">
          <div className="active-question-card__header">
            <Badge variant="draft" size="sm">
              {session.currentQuestion?.category || 'General'}
            </Badge>
            {session.activePrompt?.isFollowUp && (
              <Badge variant="active" size="sm">Follow-up</Badge>
            )}
          </div>

          <h2 className="active-question-card__prompt">
            {session.activePrompt?.text || 'Loading prompt...'}
          </h2>

          {isSpeaking && (
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
            </div>

            <div className="response-card__body">
              {session.inputMode === 'voice' ? (
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
                      Submit Answer
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
              id="clarify-btn"
              variant="secondary"
              size="sm"
              disabled={!isListening}
              onClick={() => session.clarifyQuestion()}
            >
              Clarify
            </Button>
            <Button
              id="skip-btn"
              variant="secondary"
              size="sm"
              disabled={!isListening && !isSpeaking}
              onClick={() => session.skipQuestion()}
            >
              Skip Question
            </Button>
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
                    {turn.role === 'interviewer' ? 'HirePilot' : 'You'}
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
