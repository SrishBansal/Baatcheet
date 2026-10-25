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
import { VoiceTurnEndpointer } from './endpointing.js';
import { GeminiReasoner, DeterministicReasoner } from '../analysis/reasoner.js';

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
    this.inputMode = this.capabilities.hasSpeechRecognition ? 'voice' : 'text';
    this.isSubmitting = false;
    this.isAdvancing = false;
    this.isDestroyed = false;

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
    return this.questionManager.getCurrentQuestion();
  }

  getActivePrompt() {
    return this.questionManager.getActivePrompt();
  }

  getProgress() {
    return this.questionManager.getProgress();
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
      this._persistSession();
    }

    this.stateMachine.transition(InterviewEvent.START_INTERVIEW);
    this._presentCurrentQuestion();
  }

  /**
   * Present the current active question (speech synthesis + visual presentation).
   */
  _presentCurrentQuestion() {
    if (this.isDestroyed) return;

    const prompt = this.questionManager.getActivePrompt();
    if (!prompt) {
      this._finishInterview();
      return;
    }

    this.questionStartTime = Date.now();
    this.interimText = '';
    this.currentAnswerDraft = '';
    this.isSubmitting = false;

    // Mark synthesis as playing so endpointer discards any stale mic activity
    this._endpointer.setSynthPlaying();

    // Log question presentation turn in transcript
    this.eventLog.logQuestion({
      questionId: prompt.questionId,
      text: prompt.text,
      isFollowUp: prompt.isFollowUp,
      category: this.questionManager.getCurrentQuestion()?.category || 'general',
    });

    if (this.sessionRecord) {
      const isFollowUp = Boolean(prompt.isFollowUp);
      if (isFollowUp && (!prompt.rationale || !prompt.rationale.trim())) {
        throw new Error('[InterviewController] Rationale is required for follow-up turns.');
      }

      const isSamePrompt =
        this.currentTurn &&
        this.currentTurn.questionId === prompt.questionId &&
        this.currentTurn.kind === (isFollowUp ? 'followup' : 'question') &&
        !this.currentTurn.answer &&
        !this.currentTurn.skipped;

      if (!isSamePrompt) {
        const turn = createTurn({
          id: `turn-${this.sessionRecord.turns.length + 1}-${Date.now()}`,
          questionId: prompt.questionId || 'unknown',
          kind: isFollowUp ? 'followup' : 'question',
          text: prompt.text || '',
          rationale: isFollowUp ? prompt.rationale : undefined,
          askedAt: new Date().toISOString(),
          skipped: false,
        });
        this.currentTurn = turn;
        this.sessionRecord.turns.push(turn);
        this._persistSession();
      }
    }

    if (this.onTranscriptUpdate) {
      this.onTranscriptUpdate(this.eventLog.getTranscript());
    }

    // If speech synthesis is supported, speak the prompt
    if (this.synthesizer.isSupported()) {
      this.synthesizer.speak(prompt.text, {
        onStart: () => {},
        onEnd: () => {
          this._endpointer.setSynthFinished();
          this._handleQuestionPlaybackFinished();
        },
        onError: (err) => {
          // Guard: If synthesis was intentionally canceled (e.g. pause, barge-in interruption,
          // skip, repeat, or stop), NEVER treat cancellation as playback completion.
          if (err?.isCanceled) {
            return;
          }

          // For genuine, unexpected speech synthesis errors (e.g. audio device failure, speech crash):
          this._endpointer.setSynthFinished();
          this.speechErrorMessage = 'Audio playback was unavailable. You can read the question text and answer.';
          if (this.onError) {
            this.onError(this.speechErrorMessage);
          }

          // Graceful recovery: allow candidate to read visible question and submit answer
          this._handleQuestionPlaybackFinished();
        },
      });
    } else {
      // If synthesis is unsupported, present visually and transition immediately
      this._endpointer.setSynthFinished();
      this._handleQuestionPlaybackFinished();
    }
  }

  /**
   * Invoked when interviewer finishes speaking prompt. Transitions to LISTENING.
   */
  _handleQuestionPlaybackFinished() {
    if (this.isDestroyed) return;

    if (this.stateMachine.getState() === InterviewState.SPEAKING_QUESTION) {
      this.stateMachine.transition(InterviewEvent.QUESTION_SPOKEN);
      this.questionEndTime = Date.now();

      // Begin listening if in voice mode and recognition is available
      if (this.inputMode === 'voice' && this.recognizer.isSupported()) {
        this._endpointer.startTurn();
        this.recognizer.start();
      }
    } else if (this.stateMachine.getState() === InterviewState.FOLLOW_UP) {
      this.stateMachine.transition(InterviewEvent.FOLLOW_UP_SPOKEN);
      this.questionEndTime = Date.now();

      if (this.inputMode === 'voice' && this.recognizer.isSupported()) {
        this._endpointer.startTurn();
        this.recognizer.start();
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
        this._endpointer.startTurn();
        this.recognizer.start();
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

    this._handleDeciding();
    return true;
  }

  /**
   * Handle adaptive evaluation and deciding phase for the current response.
   */
  _handleDeciding() {
    const turnToken = ++this._turnToken;

    if (!this.reasoner) {
      this._advanceOrFinish();
      return;
    }

    const currentPrompt = this.questionManager.getActivePrompt();
    const candidateAnswer = this.currentTurn?.answer?.finalText || '';
    const currentQuestion = currentPrompt?.text || '';
    const followUpCount = this.questionManager.getCurrentFollowUpCount();

    const canFollowUp =
      !currentPrompt?.isFollowUp &&
      this.questionManager.canFollowUp() &&
      this.globalFollowUpCount < this.maxGlobalFollowUps;

    const reasonParams = {
      jobTitle: this.job?.title,
      requirements: this.job?.requirements,
      currentQuestion,
      candidateAnswer,
      history: (this.sessionRecord?.turns || []).slice(0, -1).map((t) => ({
        question: t.text || '',
        answer: t.answer?.finalText || '',
      })),
      followUpCount,
      globalFollowUpCount: this.globalFollowUpCount,
    };

    let result;
    try {
      result = this.reasoner.reason(reasonParams);
    } catch {
      result = {
        action: 'ADVANCE',
        reasoning: 'Reasoner call failed synchronously; advancing.',
        providerId: 'deterministic-fallback',
        providerKind: 'deterministic',
      };
    }

    if (result && typeof result.then === 'function') {
      result
        .then((decision) => {
          this._applyDecision(turnToken, decision, canFollowUp);
        })
        .catch(() => {
          this._applyDecision(
            turnToken,
            {
              action: 'ADVANCE',
              reasoning: 'Reasoner promise rejected; advancing.',
              providerId: 'deterministic-fallback',
              providerKind: 'deterministic',
            },
            canFollowUp
          );
        });
    } else {
      this._applyDecision(turnToken, result, canFollowUp);
    }
  }

  _applyDecision(turnToken, decision, canFollowUp) {
    if (
      turnToken !== this._turnToken ||
      this.isDestroyed ||
      this.stateMachine.getState() !== InterviewState.PROCESSING_RESPONSE
    ) {
      return;
    }

    if (this.currentTurn) {
      this.currentTurn.decision = decision;
    }
    if (this.sessionRecord) {
      this.sessionRecord.reasoning = {
        providerId: decision?.providerId || 'deterministic-fallback',
        providerKind: decision?.providerKind || 'deterministic',
      };
      this._persistSession();
    }

    if (decision?.action === 'END') {
      this.isSubmitting = false;
      this._finishInterview();
      return;
    }

    if (canFollowUp && decision?.action === 'ASK_FOLLOW_UP' && decision.followUpQuestion) {
      this.globalFollowUpCount++;
      this.questionManager.recordFollowUp(
        decision.followUpQuestion,
        decision.reasoning || 'Follow-up elaboration'
      );
      this.isSubmitting = false;
      this.stateMachine.transition(InterviewEvent.TRIGGER_FOLLOW_UP);

      if (this.onTranscriptUpdate) {
        this.onTranscriptUpdate(this.eventLog.getTranscript());
      }

      this._presentCurrentQuestion();
    } else {
      this.isSubmitting = false;
      this._advanceOrFinish();
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

    const currentPrompt = this.questionManager.getActivePrompt();
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

    this.questionManager.skipQuestion();
    this.stateMachine.transition(InterviewEvent.SKIP_QUESTION);

    this._advanceOrFinish();
    return true;
  }

  /**
   * Advance to the next question or complete interview.
   */
  _advanceOrFinish() {
    if (this.isAdvancing || this.isDestroyed) return;
    this.isAdvancing = true;

    if (this.questionManager.hasNextQuestion()) {
      this.questionManager.advanceQuestion();
      this.stateMachine.transition(InterviewEvent.NEXT_QUESTION);
      this.isSubmitting = false;
      this.isAdvancing = false;
      this._presentCurrentQuestion();
    } else {
      this._finishInterview();
    }
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
      totalQuestions: this.questionManager.getTotalCount(),
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
      questionId: this.questionManager.getActivePrompt()?.questionId,
    });

    this.stateMachine.transition(InterviewEvent.REQUEST_REPEAT);
    this._presentCurrentQuestion();
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
      questionId: this.questionManager.getActivePrompt()?.questionId,
    });

    this.stateMachine.transition(InterviewEvent.REQUEST_CLARIFY);
    this._presentCurrentQuestion();
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
    // Interruption detected while interviewer is speaking
    if (this.stateMachine.getState() === InterviewState.SPEAKING_QUESTION) {
      this.interruptQuestion();
    }
  }

  _handleRecognitionResult({ text, isFinal, interimText, finalText }) {
    if (this.isDestroyed) return;
    if (this.stateMachine.getState() !== InterviewState.LISTENING) return;

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
  }

  _handleRecognitionEnd() {
    this.interimText = '';
    // Notify endpointer: recognition ended; may auto-fire silence timeout if
    // sufficient draft text exists.
    this._endpointer.onRecognitionEnd(this.currentAnswerDraft);
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
    if (this.synthesizer) {
      this.synthesizer.stop();
    }
    if (this.recognizer && this.recognizer.isListening) {
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
}
