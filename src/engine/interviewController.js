/**
 * Interview Controller.
 *
 * Coordinates the deterministic finite state machine, question manager,
 * event log/transcript, speech recognition adapter, and speech synthesis adapter.
 *
 * Designed according to ADR-007, ADR-020, ADR-023, and ADR-024:
 * - State machine owns all transitions.
 * - Voice adapters are purely I/O; they report events to the controller.
 * - Explicit consent is required before any audio capture or playback starts.
 * - Duplicate submissions and duplicate question advancements are guarded.
 * - Manual text input fallback is seamlessly integrated.
 * - Voice-turn endpointing (Checkpoint 2): 2 s of post-speech silence auto-submits
 *   the accumulated answer. A monotonic turn token ensures stale timers never fire
 *   against a subsequent question's turn.
 */

import { InterviewStateMachine, InterviewState, InterviewEvent } from './stateMachine.js';
import { QuestionManager } from './questionManager.js';
import { InterviewEventLog, EventType } from './eventLog.js';
import { BrowserSpeechRecognizer } from '../voice/speechRecognition.js';
import { BrowserSpeechSynthesizer } from '../voice/speechSynthesis.js';
import { detectCapabilities } from '../voice/capabilities.js';
import { createSessionRecord, createTurn, sessionStore, SessionStatus } from '../data/sessions.js';
import { DeterministicTranscriptProvider, runSessionAnalysis } from '../analysis/provider.js';
import { VoiceTurnEndpointer, shouldPerformDoneCheck, DONE_PATTERN, POST_CHECK_SILENCE_MS } from './endpointing.js';
import { GeminiReasoner, DeterministicReasoner } from '../analysis/reasoner.js';
import { nextTurn } from '../data/engineApi.js';
import { toEngineJob } from './engineJob.js';

export class InterviewController {
  /**
   * @param {object} options
   * @param {import('../data/models.js').Job} options.job
   * @param {string} [options.interviewId]
   * @param {BrowserSpeechRecognizer} [options.speechRecognizer]
   * @param {BrowserSpeechSynthesizer} [options.speechSynthesizer]
   * @param {import('../voice/capabilities.js').VoiceCapabilities} [options.capabilities]
   * @param {function(string, string, object): void} [options.onStateChange]
   * @param {function(object[]): void} [options.onTranscriptUpdate]
   * @param {function(string): void} [options.onInterimSpeech]
   * @param {function(string): void} [options.onError]
   */
  constructor(options = {}) {
    if (!options.job) {
      throw new Error('[InterviewController] job is required.');
    }

    this.job = options.job;
    this.interviewId = options.interviewId;

    // Core domain modules
    this.stateMachine = new InterviewStateMachine();
    this.questionManager = new QuestionManager(this.job.questions || []);
    this.eventLog = new InterviewEventLog(this.interviewId);

    // Capabilities and speech adapters
    this.capabilities = options.capabilities || detectCapabilities();
    this.recognizer =
      options.speechRecognizer ||
      new BrowserSpeechRecognizer({
        onResult: this._handleRecognitionResult.bind(this),
        onError: this._handleRecognitionError.bind(this),
        onStart: this._handleRecognitionStart.bind(this),
        onEnd: this._handleRecognitionEnd.bind(this),
        onSpeechStart: this._handleCandidateSpeechStart.bind(this),
      });

    this.synthesizer =
      options.speechSynthesizer ||
      new BrowserSpeechSynthesizer();

    // Session flags
    this.hasConsented = false;
    this.candidate = null;
    this.allowTyping = this.job.settings?.allowTyping === true;
    this.inputMode = !this.capabilities.hasSpeechRecognition && this.allowTyping ? 'text' : 'voice';
    this._checksUsed = 0;
    this._checksTurnToken = 0;
    this._postCheckTimer = null;
    this._speechSafetyTimer = null;
    this._recognitionRestartTimer = null;
    this._recognitionRestartAttempts = 0;
    this.microphoneStalled = false;
    this._awaitingDoneCheck = false;
    this.isSubmitting = false;
    this.isAdvancing = false;
    this.isDestroyed = false;
    this._setTimeout = options.setTimeout || globalThis.setTimeout.bind(globalThis);
    this._clearTimeout = options.clearTimeout || globalThis.clearTimeout.bind(globalThis);

    // Voice-turn endpointer (Checkpoint 2)
    this._endpointer = new VoiceTurnEndpointer({
      silenceMs: options.silenceMs !== undefined ? options.silenceMs : 2000,
      minAnswerMs: options.minAnswerMs !== undefined ? options.minAnswerMs : 400,
      onSilenceTimeout: this._handleSilenceTimeout.bind(this),
    });

    // Adaptive reasoner module
    this.reasoner =
      options.reasoner !== undefined
        ? options.reasoner
        : (typeof window !== 'undefined' ? new GeminiReasoner() : null);
    this.globalFollowUpCount = 0;
    this.maxGlobalFollowUps = options.maxGlobalFollowUps || 8;
    this._turnToken = 0;
    this._isCallingNextTurn = false;
    this.engineError = null;

    if (options.reasoner && !options.nextTurn) {
      this._nextTurn = ({ job, transcript }) => {
        if (!transcript || transcript.length === 0) {
          return {
            action: 'INTRO',
            say: job?.questions?.[0]?.text || 'Welcome to the interview. Tell me about your background.',
            why: 'intro',
            requirement: job?.requirements?.[0]?.name || '',
            questionIndex: 0,
          };
        }
        const lastCandidate = [...transcript].reverse().find((t) => t.role === 'candidate');
        const candAnswer = lastCandidate?.text || '';
        const lastInterviewer = [...transcript].reverse().find((t) => t.role === 'interviewer');

        const mapDecision = (decision) => {
          if (decision?.action === 'ASK_FOLLOW_UP' && decision.followUpQuestion) {
            return {
              action: 'FOLLOW_UP',
              say: decision.followUpQuestion,
              why: decision.reasoning || 'Follow-up elaboration',
              requirement: job?.requirements?.[0]?.name || '',
              questionIndex: this.currentTurn?.questionIndex ?? 0,
              providerId: decision.providerId,
              providerKind: decision.providerKind,
            };
          }
          if (decision?.action === 'END') {
            return {
              action: 'WRAP_UP',
              say: 'Thank you for your responses. The interview is complete.',
              why: decision.reasoning || 'Interview ended',
            };
          }
          const nextIdx = (this.currentTurn?.questionIndex ?? 0) + 1;
          const nextQ = job?.questions?.[nextIdx];
          if (nextQ) {
            return {
              action: 'NEXT_QUESTION',
              say: nextQ.text,
              why: 'advance',
              requirement: nextQ.requirementName || '',
              questionIndex: nextIdx,
            };
          }
          return {
            action: 'WRAP_UP',
            say: 'Thank you for your time. The interview is complete.',
            why: 'All questions covered',
          };
        };

        const decisionRes = options.reasoner.reason({
          jobTitle: job?.title,
          requirements: job?.requirements,
          currentQuestion: lastInterviewer?.text || '',
          candidateAnswer: candAnswer,
          history: [],
          followUpCount: 0,
          globalFollowUpCount: this.globalFollowUpCount || 0,
        });

        if (decisionRes && typeof decisionRes.then === 'function') {
          return decisionRes.then(mapDecision);
        }
        return mapDecision(decisionRes);
      };
    } else {
      this._nextTurn = options.nextTurn || nextTurn;
    }

    // Session persistence & analysis abstraction
    this.sessionStore = options.sessionStore || sessionStore;
    this.analysisProvider = options.analysisProvider || new DeterministicTranscriptProvider();
    this.sessionRecord = null;
    this.currentTurn = null;

    if (this.interviewId) {
      try {
        const existing = this.sessionStore.getById(this.interviewId);
        if (existing) {
          this.sessionRecord = existing;
          if (this.sessionRecord.turns && this.sessionRecord.turns.length > 0) {
            this.currentTurn = this.sessionRecord.turns[this.sessionRecord.turns.length - 1];
          }
        }
      } catch {
        // Ignore unreadable session during initialization; fresh session will be created
      }
    }

    // Live transcription state
    this.interimText = '';
    this.currentAnswerDraft = '';
    this.speechErrorMessage = null;
    this.questionStartTime = 0;
    this.questionEndTime = 0;

    // Listeners / external callbacks
    this.onStateChange = options.onStateChange || null;
    this.onTranscriptUpdate = options.onTranscriptUpdate || null;
    this.onInterimSpeech = options.onInterimSpeech || null;
    this.onError = options.onError || null;

    // Subscribe to state machine transitions
    this._unsubscribeSM = this.stateMachine.subscribe((state, prev, ctx) => {
      if (this.onStateChange) {
        this.onStateChange(state, prev, ctx);
      }
    });
  }

  _persistSession() {
    if (!this.sessionRecord) return;
    try {
      this.sessionStore.save(this.sessionRecord);
    } catch (err) {
      console.error('[InterviewController] Failed to persist session:', err);
    }
  }

  async _executeAnalysis() {
    if (!this.sessionRecord) return;
    try {
      const result = await runSessionAnalysis(this.sessionRecord, this.analysisProvider);
      this.sessionRecord.analysis = result;
      this._persistSession();
    } catch (err) {
      this.sessionRecord.analysis = {
        status: 'failed',
        providerId: this.analysisProvider.providerId || 'unknown',
        providerKind: this.analysisProvider.providerKind || 'deterministic',
        error: err.message || 'Analysis failed',
        generatedAt: new Date().toISOString(),
        requirements: [],
      };
      this._persistSession();
    }
  }

  /* ----------------------------------------------------------------
     Getters
     ---------------------------------------------------------------- */

  getState() {
    return this.stateMachine.getState();
  }

  getCurrentQuestion() {
    if (this.currentTurn) {
      return {
        id: this.currentTurn.questionId,
        text: this.currentTurn.text,
        category: this.currentTurn.requirement || 'general',
      };
    }
    return this.questionManager.getCurrentQuestion();
  }

  getActivePrompt() {
    if (this.currentTurn) {
      return {
        questionId: this.currentTurn.questionId,
        text: this.currentTurn.text,
        isFollowUp: this.currentTurn.kind === 'followup',
        rationale: this.currentTurn.rationale || '',
      };
    }
    return this.questionManager.getActivePrompt();
  }

  getProgress() {
    const total = (this.job?.questions?.length && this.job.questions.length > 0)
      ? this.job.questions.length
      : 5;
    const current = Math.min(
      total,
      (this.currentTurn?.questionIndex !== undefined && this.currentTurn?.questionIndex !== null)
        ? this.currentTurn.questionIndex + 1
        : (this.sessionRecord?.turns?.filter((t) => t.kind === 'question').length || 0)
    );
    return {
      current,
      total,
      isComplete: this.stateMachine.getState() === InterviewState.COMPLETED,
    };
  }

  getTranscript() {
    return this.eventLog.getTranscript();
  }

  getEvents() {
    return this.eventLog.getEvents();
  }

  getInputMode() {
    return this.inputMode;
  }

  getSessionRecord() {
    return this.sessionRecord;
  }

  /* ----------------------------------------------------------------
     Session Lifecycle
     ---------------------------------------------------------------- */

  /**
   * Explicitly record candidate consent. Must be called before interview can start.
   */
  grantConsent() {
    if (this.hasConsented) return;
    this.hasConsented = true;

    this.eventLog.logEvent(EventType.CANDIDATE_CONSENT_GRANTED, {
      jobId: this.job.id,
      inputMode: this.inputMode,
      timestamp: new Date().toISOString(),
    });

    // Move state machine from IDLE -> PRE_CHECK -> READY
    if (this.stateMachine.getState() === InterviewState.IDLE) {
      this.stateMachine.transition(InterviewEvent.START_CHECK);
      this.stateMachine.transition(InterviewEvent.CHECK_PASSED);
    }
  }

  setCandidate(name) {
    this.candidate = { name: String(name || '').trim() };
  }

  /**
   * Start the live interview session.
   * Requires explicit consent and READY state.
   */
  startInterview() {
    if (!this.hasConsented) {
      throw new Error('[InterviewController] Candidate consent is required before starting the interview.');
    }

    if (this.stateMachine.getState() !== InterviewState.READY) {
      throw new Error(
        `[InterviewController] Cannot start interview from state '${this.stateMachine.getState()}'.`
      );
    }

    this.eventLog.logEvent(EventType.SESSION_STARTED, {
      jobId: this.job.id,
      totalQuestions: this.questionManager.getTotalCount(),
    });

    if (!this.sessionRecord) {
      this.sessionRecord = createSessionRecord({
        id: this.interviewId || `session-${this.job.id}-${Date.now()}`,
        job: this.job,
      });
      this.sessionRecord.candidate = this.candidate || { name: 'Unnamed candidate' };
      this._persistSession();
    }

    this.stateMachine.transition(InterviewEvent.START_INTERVIEW);

    const hasQuestions = Array.isArray(this.job?.questions) && this.job.questions.length > 0;
    const hasReqs = (Array.isArray(this.job?.skills) && this.job.skills.length > 0) ||
      (Array.isArray(this.job?.requirements) && this.job.requirements.length > 0);
    if (!hasQuestions && !hasReqs) {
      this._finishInterview();
      return Promise.resolve();
    }

    return this._callNextTurn();
  }

  _advanceOrFinish() {
    if (this.isAdvancing || this._isCallingNextTurn || this.isDestroyed) return;
    this._callNextTurn();
  }

  _buildTranscript() {
    const list = [];
    if (this.sessionRecord && Array.isArray(this.sessionRecord.turns)) {
      for (const turn of this.sessionRecord.turns) {
        if (turn.text) {
          list.push({
            role: 'interviewer',
            text: turn.text,
            action: turn.action || (turn.kind === 'followup' ? 'FOLLOW_UP' : 'NEXT_QUESTION'),
          });
        }
        if (turn.answer && turn.answer.finalText && !turn.skipped) {
          list.push({
            role: 'candidate',
            text: turn.answer.finalText,
          });
        }
      }
    }
    return list;
  }

  _callNextTurn() {
    if (this._isCallingNextTurn || this.isDestroyed) return Promise.resolve();
    this._isCallingNextTurn = true;
    this.engineError = null;

    const turnToken = ++this._turnToken;
    const transcript = this._buildTranscript();
    const jobSnapshot = this.sessionRecord?.jobSnapshot || this.job;
    const engineJob = toEngineJob(jobSnapshot);

    const handleSuccess = (result) => {
      this._isCallingNextTurn = false;
      if (
        turnToken !== this._turnToken ||
        this.isDestroyed ||
        this.stateMachine.getState() === InterviewState.COMPLETED ||
        this.stateMachine.getState() === InterviewState.ABORTED
      ) {
        return;
      }
      this._applyEngineResult(result);
    };

    const handleError = (err) => {
      this._isCallingNextTurn = false;
      if (
        turnToken !== this._turnToken ||
        this.isDestroyed ||
        this.stateMachine.getState() === InterviewState.COMPLETED ||
        this.stateMachine.getState() === InterviewState.ABORTED
      ) {
        return;
      }
      this.isSubmitting = false;
      this.engineError = err?.message || 'server_error';
      if (this.onStateChange) {
        this.onStateChange(this.stateMachine.getState(), this.stateMachine.getState(), {});
      }
    };

    let res;
    try {
      res = this._nextTurn({ job: engineJob, transcript });
    } catch (err) {
      handleError(err);
      return Promise.resolve();
    }

    if (res && typeof res.then === 'function') {
      return res.then(handleSuccess, handleError);
    } else {
      handleSuccess(res);
      return Promise.resolve();
    }
  }

  retryTurn() {
    if (this._isCallingNextTurn || this.isDestroyed) return Promise.resolve();
    this.engineError = null;
    return this._callNextTurn();
  }

  _applyEngineResult(result) {
    if (!result || !result.action) {
      this.engineError = 'invalid_turn';
      this.isSubmitting = false;
      return;
    }

    if (this.sessionRecord) {
      this.sessionRecord.reasoning = {
        providerId: result.providerId || 'gemini',
        providerKind: result.providerKind || 'semantic',
      };
    }

    const kind = (result.action === 'INTRO' || result.action === 'NEXT_QUESTION')
      ? 'question'
      : (result.action === 'FOLLOW_UP' ? 'followup' : 'closing');

    const qIndex = result.questionIndex;
    const matchedQ = (qIndex !== undefined && qIndex !== null && this.job?.questions)
      ? this.job.questions[qIndex]
      : null;
    const questionId = matchedQ?.id || `q-${qIndex ?? (this.sessionRecord?.turns?.length || 0)}`;

    const turn = createTurn({
      id: `turn-${(this.sessionRecord?.turns?.length || 0) + 1}-${Date.now()}`,
      questionId,
      kind,
      text: result.say,
      action: result.action,
      requirement: result.requirement || '',
      rationale: result.why || '',
      questionIndex: result.questionIndex,
      decision: { providerId: 'gemini', providerKind: 'semantic' },
      askedAt: new Date().toISOString(),
      skipped: false,
    });

    this.currentTurn = turn;
    if (this.sessionRecord) {
      this.sessionRecord.turns.push(turn);
      this._persistSession();
    }

    this.eventLog.logQuestion({
      questionId: turn.questionId,
      text: result.say,
      isFollowUp: kind === 'followup',
      category: result.requirement || 'general',
    });

    if (this.onTranscriptUpdate) {
      this.onTranscriptUpdate(this.eventLog.getTranscript());
    }

    const state = this.stateMachine.getState();
    if (state === InterviewState.PROCESSING_RESPONSE) {
      if (result.action === 'FOLLOW_UP') {
        this.stateMachine.transition(InterviewEvent.TRIGGER_FOLLOW_UP);
      } else {
        this.stateMachine.transition(InterviewEvent.NEXT_QUESTION);
      }
    }

    this._speakResult(result);
  }

  _speakResult(result) {
    this.questionStartTime = Date.now();
    this.interimText = '';
    this.currentAnswerDraft = '';
    this._awaitingDoneCheck = false;
    this._clearPostCheckTimer();
    this.isSubmitting = false;

    this._stopAllAudio();
    this._endpointer.setSynthPlaying();

    const onFinished = () => {
      this._endpointer.setSynthFinished();
      if (result.action === 'WRAP_UP') {
        this._finishInterview();
      } else {
        this._handleQuestionPlaybackFinished();
      }
    };

    if (this.synthesizer.isSupported()) {
      this._speakWithSafety(result.say, {
        onStart: () => {},
        onEnd: onFinished,
        onError: (err) => {
          if (err?.isCanceled) return;
          this.speechErrorMessage = 'Audio playback was unavailable. You can read the question text and answer.';
          if (this.onError) {
            this.onError(this.speechErrorMessage);
          }
          onFinished();
        },
      });
    } else {
      onFinished();
    }
  }

  _presentCurrentQuestion() {
    const prompt = this.questionManager?.getActivePrompt();
    if (prompt && prompt.isFollowUp && (!prompt.rationale || !prompt.rationale.trim())) {
      throw new Error('[InterviewController] Rationale is required for follow-up turns.');
    }
    if (this.currentTurn?.text) {
      this._speakResult({
        say: this.currentTurn.text,
        action: this.currentTurn.action || 'NEXT_QUESTION',
        why: this.currentTurn.rationale,
        requirement: this.currentTurn.requirement,
        questionIndex: this.currentTurn.questionIndex,
      });
    }
  }

  /**
   * Invoked when interviewer finishes speaking prompt. Transitions to LISTENING.
   */
  _handleQuestionPlaybackFinished() {
    if (this.isDestroyed) return;

    if (this.currentTurn?.action === 'WRAP_UP') {
      this._finishInterview();
      return;
    }

    if (this.stateMachine.getState() === InterviewState.SPEAKING_QUESTION) {
      this.stateMachine.transition(InterviewEvent.QUESTION_SPOKEN);
      this.questionEndTime = Date.now();

      // Begin listening if in voice mode and recognition is available
      if (this.inputMode === 'voice' && this.recognizer.isSupported()) {
        this._beginListeningTurn(true);
      }
    } else if (this.stateMachine.getState() === InterviewState.FOLLOW_UP) {
      this.stateMachine.transition(InterviewEvent.FOLLOW_UP_SPOKEN);
      this.questionEndTime = Date.now();

      if (this.inputMode === 'voice' && this.recognizer.isSupported()) {
        this._beginListeningTurn(true);
      }
    }
  }

  /**
   * Candidate interruption handling (barge-in).
   * Stops synthesizer immediately and transitions to LISTENING.
   */
  interruptQuestion() {
    const currentState = this.stateMachine.getState();
    if (
      currentState === InterviewState.SPEAKING_QUESTION ||
      currentState === InterviewState.FOLLOW_UP
    ) {
      this.synthesizer.stop();
      this._endpointer.setSynthFinished();
      this.eventLog.logEvent(EventType.CANDIDATE_INTERRUPTED, {
        questionId: this.questionManager.getActivePrompt()?.questionId,
        state: currentState,
      });
      this.stateMachine.transition(InterviewEvent.CANDIDATE_INTERRUPTED);
      this.questionEndTime = Date.now();

      // Begin listening immediately upon candidate barge-in if in voice mode
      if (this.inputMode === 'voice' && this.recognizer.isSupported()) {
        this._beginListeningTurn(true);
      }
    }
  }

  /* ----------------------------------------------------------------
     Answer Submission & Navigation
     ---------------------------------------------------------------- */

  /**
   * Submit candidate answer (via voice completion or manual text submission).
   * @param {string} text
   */
  submitAnswer(text) {
    if (this.isDestroyed) return;

    const answerText = (text || this.currentAnswerDraft || '').trim();
    if (!answerText) {
      return false;
    }

    if (this.stateMachine.getState() !== InterviewState.LISTENING) {
      return false;
    }

    if (this.isSubmitting) {
      // Prevent duplicate submissions
      return false;
    }
    this.isSubmitting = true;

    // Stop recognition if active
    if (this.recognizer.isListening) {
      this.recognizer.stop();
    }

    const currentPrompt = this.questionManager.getActivePrompt();
    const now = Date.now();
    const durationSeconds = this.questionEndTime > 0 ? (now - this.questionEndTime) / 1000 : 0;
    const latencyMs = this.questionEndTime > 0 ? Math.max(0, this.questionEndTime - this.questionStartTime) : 0;

    // Strict separation: record raw recognizedText
    this.eventLog.logAnswer({
      questionId: currentPrompt?.questionId || 'unknown',
      recognizedText: answerText,
      durationSeconds,
      latencyMs,
    });

    if (this.currentTurn && this.sessionRecord) {
      this.currentTurn.answer = {
        finalText: answerText,
        answeredAt: new Date().toISOString(),
        inputMode: this.inputMode || 'text',
      };
      this.currentTurn.skipped = false;
      this._persistSession();
    }

    this.currentAnswerDraft = '';
    this.interimText = '';

    if (this.onTranscriptUpdate) {
      this.onTranscriptUpdate(this.eventLog.getTranscript());
    }

    // Transition state machine: LISTENING -> PROCESSING_RESPONSE
    this.stateMachine.transition(InterviewEvent.RESPONSE_RECEIVED);

    this._callNextTurn();
    return true;
  }

  doneAnswer() {
    return this.submitAnswer(this.currentAnswerDraft);
  }

  startOverAnswer() {
    this.currentAnswerDraft = '';
    this.interimText = '';
    this._awaitingDoneCheck = false;
    this._clearPostCheckTimer();
    this._endpointer.cancelTurn();
    if (this.stateMachine.getState() === InterviewState.LISTENING && this.recognizer.isSupported()) {
      this._beginListeningTurn(false);
    }
  }

  /**
   * Skip the current active question without recording an answer turn.
   * @param {string} [reason='candidate_requested']
   */
  skipQuestion(reason = 'candidate_requested') {
    const state = this.stateMachine.getState();
    if (
      state !== InterviewState.SPEAKING_QUESTION &&
      state !== InterviewState.LISTENING &&
      state !== InterviewState.FOLLOW_UP
    ) {
      return false;
    }

    this.synthesizer.stop();
    this._endpointer.cancelTurn();
    if (this.recognizer.isListening) {
      this.recognizer.stop();
    }

    const currentPrompt = this.getActivePrompt();
    this.eventLog.logSkip({
      questionId: currentPrompt?.questionId || 'unknown',
      isFollowUp: currentPrompt?.isFollowUp || false,
      reason,
    });

    if (this.currentTurn && this.sessionRecord) {
      this.currentTurn.skipped = true;
      this._persistSession();
    }

    if (this.onTranscriptUpdate) {
      this.onTranscriptUpdate(this.eventLog.getTranscript());
    }

    this.stateMachine.transition(InterviewEvent.SKIP_QUESTION);
    this._callNextTurn();
    return true;
  }

  _finishInterview() {
    const currentState = this.stateMachine.getState();
    // Guard: already in a terminal state — nothing to do.
    if (
      currentState === InterviewState.COMPLETED ||
      currentState === InterviewState.ABORTED
    ) {
      return;
    }

    // If called from SPEAKING_QUESTION (e.g. empty question list at session start),
    // the state machine has no direct FINISH transition from SPEAKING_QUESTION.
    // Transition through QUESTION_SPOKEN -> LISTENING -> PROCESSING_RESPONSE first.
    if (currentState === InterviewState.SPEAKING_QUESTION) {
      this._stopAllAudio();
      this.stateMachine.transition(InterviewEvent.QUESTION_SPOKEN);
      this.stateMachine.transition(InterviewEvent.RESPONSE_RECEIVED);
    } else if (currentState === InterviewState.LISTENING) {
      this.stateMachine.transition(InterviewEvent.RESPONSE_RECEIVED);
    } else if (currentState === InterviewState.FOLLOW_UP) {
      this._stopAllAudio();
      this.stateMachine.transition(InterviewEvent.FOLLOW_UP_SPOKEN);
      this.stateMachine.transition(InterviewEvent.RESPONSE_RECEIVED);
    }
    // State should now be PROCESSING_RESPONSE, which has the FINISH transition.

    this.stateMachine.transition(InterviewEvent.FINISH);
    this.eventLog.logEvent(EventType.INTERVIEW_COMPLETED, {
      totalQuestions: this.sessionRecord?.turns?.filter((t) => t.kind === 'question').length || 0,
      completedAt: new Date().toISOString(),
    });

    if (this.sessionRecord) {
      this.sessionRecord.status = SessionStatus.COMPLETED;
      this.sessionRecord.endedAt = new Date().toISOString();
      this._persistSession();
      this._executeAnalysis();
    }

    this.isSubmitting = false;
    this.isAdvancing = false;
    this._stopAllAudio();
  }

  /**
   * Re-speak the current question.
   */
  repeatQuestion() {
    if (this.stateMachine.getState() !== InterviewState.LISTENING) {
      return false;
    }

    if (this.recognizer.isListening) {
      this.recognizer.stop();
    }

    this.eventLog.logEvent(EventType.REPETITION_REQUESTED, {
      questionId: this.currentTurn?.questionId,
    });

    this.stateMachine.transition(InterviewEvent.REQUEST_REPEAT);
    this._speakResult({
      say: this.currentTurn?.text || '',
      action: this.currentTurn?.action || 'NEXT_QUESTION',
      why: this.currentTurn?.rationale,
      requirement: this.currentTurn?.requirement,
      questionIndex: this.currentTurn?.questionIndex,
    });
    return true;
  }

  /**
   * Ask for question clarification.
   */
  clarifyQuestion() {
    if (this.stateMachine.getState() !== InterviewState.LISTENING) {
      return false;
    }

    if (this.recognizer.isListening) {
      this.recognizer.stop();
    }

    this.eventLog.logEvent(EventType.CLARIFICATION_REQUESTED, {
      questionId: this.currentTurn?.questionId,
    });

    this.stateMachine.transition(InterviewEvent.REQUEST_CLARIFY);
    this._speakResult({
      say: this.currentTurn?.text || '',
      action: this.currentTurn?.action || 'NEXT_QUESTION',
      why: this.currentTurn?.rationale,
      requirement: this.currentTurn?.requirement,
      questionIndex: this.currentTurn?.questionIndex,
    });
    return true;
  }

  /**
   * Pause the interview.
   */
  pause() {
    if (!this.stateMachine.can(InterviewEvent.PAUSE)) {
      return false;
    }

    this._stopAllAudio();
    this._endpointer.cancelTurn();
    this.eventLog.logEvent(EventType.INTERVIEW_PAUSED);
    this.stateMachine.transition(InterviewEvent.PAUSE);
    return true;
  }

  /**
   * Resume paused interview.
   */
  resume() {
    if (this.stateMachine.getState() !== InterviewState.PAUSED) {
      return false;
    }

    this.eventLog.logEvent(EventType.INTERVIEW_RESUMED);
    this.stateMachine.transition(InterviewEvent.RESUME);

    const currentState = this.stateMachine.getState();
    if (currentState === InterviewState.SPEAKING_QUESTION) {
      this._presentCurrentQuestion();
    } else if (currentState === InterviewState.LISTENING) {
      if (this.inputMode === 'voice' && this.recognizer.isSupported()) {
        this.recognizer.start();
      }
    }
    return true;
  }

  /**
   * Candidate explicitly aborts the interview early.
   */
  endEarly() {
    this._turnToken++;
    const currentState = this.stateMachine.getState();
    if (
      currentState === InterviewState.COMPLETED ||
      currentState === InterviewState.ABORTED
    ) {
      return;
    }

    this._stopAllAudio();
    this.eventLog.logEvent(EventType.INTERVIEW_ABORTED, {
      stoppedAtQuestion: this.questionManager.getCurrentIndex(),
    });

    if (this.sessionRecord) {
      this.sessionRecord.status = SessionStatus.ABORTED;
      this.sessionRecord.endedAt = new Date().toISOString();
      this._persistSession();
    }

    this.stateMachine.transition(InterviewEvent.ABORT);
  }

  /**
   * Switch candidate response mode between 'voice' and 'text'.
   * @param {'voice' | 'text'} mode
   */
  setInputMode(mode) {
    if (!this.allowTyping && mode === 'text') return;
    if (mode === this.inputMode) return;
    this.inputMode = mode;

    if (mode === 'text' && this.recognizer.isListening) {
      this.recognizer.stop();
      this.interimText = '';
    } else if (
      mode === 'voice' &&
      this.stateMachine.getState() === InterviewState.LISTENING &&
      this.recognizer.isSupported()
    ) {
      this.recognizer.start();
    }
  }

  /* ----------------------------------------------------------------
     Internal Voice Callbacks
     ---------------------------------------------------------------- */

  _handleCandidateSpeechStart() {
    if (this._awaitingDoneCheck) this._cancelDoneCheck();
    // Interruption detected while interviewer is speaking
    if (this.stateMachine.getState() === InterviewState.SPEAKING_QUESTION) {
      this.interruptQuestion();
    }
  }

  _handleRecognitionResult({ text, isFinal, interimText, finalText }) {
    if (this.isDestroyed) return;
    if (this.stateMachine.getState() !== InterviewState.LISTENING) return;

    if (this._awaitingDoneCheck && isFinal && DONE_PATTERN.test(text || '')) {
      this._clearPostCheckTimer();
      this._awaitingDoneCheck = false;
      this.submitAnswer(this.currentAnswerDraft);
      return;
    }
    if (this._awaitingDoneCheck) this._cancelDoneCheck();
    this.interimText = interimText;
    this.currentAnswerDraft = text;

    if (this.onInterimSpeech) {
      this.onInterimSpeech(text);
    }

    // Feed result into endpointer to reset silence countdown
    this._endpointer.onRecognitionResult({ text, isFinal });
  }

  _handleRecognitionError(err) {
    this.speechErrorMessage = err.message;
    if (err.isPermissionDenied) {
      // Permission denied: automatically switch to text mode
      this.setInputMode('text');
    }
    if (this.onError) {
      this.onError(err.message);
    }
  }

  _handleRecognitionStart() {
    this.speechErrorMessage = null;
    this.microphoneStalled = false;
    this._recognitionRestartAttempts = 0;
    this._clearRecognitionRestartTimer();
  }

  _handleRecognitionEnd() {
    this.interimText = '';
    // Notify endpointer: recognition ended; may auto-fire silence timeout if
    // sufficient draft text exists.
    this._endpointer.onRecognitionEnd(this.currentAnswerDraft);
    if (this.stateMachine.getState() === InterviewState.LISTENING && !this._awaitingDoneCheck && !this.isSubmitting && this.inputMode === 'voice') {
      this._scheduleRecognitionRestart();
    }
  }

  /**
   * Called by the endpointer when post-speech silence duration has elapsed.
   * Auto-submits the accumulated draft answer, or if no draft exists, skips.
   * Guard: only acts when state is LISTENING and not already submitting.
   */
  _handleSilenceTimeout() {
    if (this.isDestroyed) return;
    if (this.stateMachine.getState() !== InterviewState.LISTENING) return;
    if (this.isSubmitting) return;

    const draft = (this.currentAnswerDraft || '').trim();
    if (draft && this.inputMode === 'voice' && this._checksTurnToken === this._endpointer._currentToken && shouldPerformDoneCheck(draft, this._checksUsed)) {
      this._checksUsed += 1;
      this._awaitingDoneCheck = true;
      this._endpointer.setSynthPlaying();
      if (this.recognizer.isListening) this.recognizer.stop();
      this._speakWithSafety('Is that everything, or would you like to add more?', {
        onEnd: () => {
          if (this.isDestroyed || !this._awaitingDoneCheck) return;
          this._endpointer.setSynthFinished();
          this._beginListeningTurn(false);
          this._postCheckTimer = this._setTimeout(() => {
            this._postCheckTimer = null;
            if (this._awaitingDoneCheck) {
              this._awaitingDoneCheck = false;
              this.submitAnswer(this.currentAnswerDraft);
            }
          }, POST_CHECK_SILENCE_MS);
        },
      });
      return;
    }
    if (draft) {
      // Auto-submit the voice answer
      this.eventLog.logEvent(EventType.CANDIDATE_ANSWERED_AUTO, {
        questionId: this.questionManager.getActivePrompt()?.questionId,
        trigger: 'silence_timeout',
      });
      this.submitAnswer(draft);
    }
    // If no draft: do nothing — candidate may still be thinking.
    // The manual Submit / Skip buttons remain available.
  }

  _stopAllAudio() {
    this._clearPostCheckTimer();
    this._clearSpeechSafetyTimer();
    this._clearRecognitionRestartTimer();
    if (this.synthesizer && typeof this.synthesizer.stop === 'function') {
      this.synthesizer.stop();
    }
    if (this.recognizer && this.recognizer.isListening && typeof this.recognizer.stop === 'function') {
      this.recognizer.stop();
    }
  }

  /**
   * Destroy and clean up resources when component unmounts.
   */
  destroy() {
    this.isDestroyed = true;
    this._turnToken++;
    this._stopAllAudio();
    this._endpointer.destroy();

    if (this._unsubscribeSM) {
      this._unsubscribeSM();
      this._unsubscribeSM = null;
    }

    if (this.recognizer) {
      this.recognizer.destroy();
    }
    if (this.synthesizer) {
      this.synthesizer.destroy();
    }
  }

  _clearPostCheckTimer() {
    if (this._postCheckTimer !== null) {
      this._clearTimeout(this._postCheckTimer);
      this._postCheckTimer = null;
    }
  }

  _beginListeningTurn(newTurn) {
    const token = newTurn ? this._endpointer.startTurn() : this._endpointer.resumeTurn();
    if (newTurn) {
      this._checksTurnToken = token;
      this._checksUsed = 0;
    }
    this._recognitionRestartAttempts = 0;
    this.recognizer.start();
  }

  _speakWithSafety(text, callbacks = {}) {
    let settled = false;
    const finish = (kind, value) => {
      if (settled) return;
      settled = true;
      this._clearSpeechSafetyTimer();
      if (kind === 'error') callbacks.onError?.(value);
      else callbacks.onEnd?.();
    };
    this._clearSpeechSafetyTimer();
    this._speechSafetyTimer = this._setTimeout(() => finish('end'), 10000);
    const started = this.synthesizer.speak(text, { onStart: callbacks.onStart, onEnd: () => finish('end'), onError: (err) => finish('error', err) });
    if (started === false) finish('end');
  }

  _clearSpeechSafetyTimer() {
    if (this._speechSafetyTimer !== null) {
      this._clearTimeout(this._speechSafetyTimer);
      this._speechSafetyTimer = null;
    }
  }

  _cancelDoneCheck() {
    if (!this._awaitingDoneCheck) return;
    this._awaitingDoneCheck = false;
    this._clearPostCheckTimer();
    this._clearSpeechSafetyTimer();
    this.synthesizer.stop();
    this._endpointer.setSynthFinished();
    this._beginListeningTurn(false);
  }

  _scheduleRecognitionRestart() {
    this._clearRecognitionRestartTimer();
    this._recognitionRestartTimer = this._setTimeout(() => {
      this._recognitionRestartTimer = null;
      if (this.isDestroyed || this.stateMachine.getState() !== InterviewState.LISTENING || this.recognizer.isListening) return;
      if (this._recognitionRestartAttempts++ === 0) {
        this.recognizer.start();
        this._scheduleRecognitionRestart();
      } else {
        this.microphoneStalled = true;
        if (this.onStateChange) this.onStateChange(this.stateMachine.getState(), this.stateMachine.getState(), {});
      }
    }, 5000);
  }

  _clearRecognitionRestartTimer() {
    if (this._recognitionRestartTimer !== null) {
      this._clearTimeout(this._recognitionRestartTimer);
      this._recognitionRestartTimer = null;
    }
  }

  restartMicrophone() {
    this.microphoneStalled = false;
    this._recognitionRestartAttempts = 0;
    if (this.stateMachine.getState() === InterviewState.LISTENING) this._beginListeningTurn(false);
  }

  resetStep() {
    this._awaitingDoneCheck = false;
    this._stopAllAudio();
    this.isSubmitting = false;
    this.microphoneStalled = false;
    if (this.stateMachine.getState() === InterviewState.LISTENING) this._beginListeningTurn(false);
    else if (this.engineError && this.onStateChange) this.onStateChange(this.stateMachine.getState(), this.stateMachine.getState(), {});
  }
}
