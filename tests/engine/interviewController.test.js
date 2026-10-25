import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InterviewController } from '../../src/engine/interviewController.js';
import { InterviewState } from '../../src/engine/stateMachine.js';
import { EventType } from '../../src/engine/eventLog.js';

let defaultMockNextTurn;
vi.mock('../../src/data/engineApi.js', () => ({
  nextTurn: vi.fn((...args) => defaultMockNextTurn(...args)),
}));

describe('InterviewController', () => {
  let sampleJob;
  let mockRecognizer;
  let mockSynthesizer;
  let capabilities;

  beforeEach(() => {
    defaultMockNextTurn = vi.fn().mockImplementation(({ job, transcript = [] }) => {
      const cand = transcript.filter((x) => x.role === 'candidate');
      if (transcript.length === 0) {
        return {
          action: 'INTRO',
          say: sampleJob?.questions?.[0]?.text || 'Explain how React concurrency works.',
          requirement: 'React concurrency',
          why: 'Introductory turn',
          questionIndex: 0,
        };
      }
      if (cand.length >= 2) {
        return {
          action: 'WRAP_UP',
          say: 'Thank you for your time. The recruiter will review your responses.',
          why: 'Interview completed',
          questionIndex: null,
        };
      }
      return {
        action: 'NEXT_QUESTION',
        say: sampleJob?.questions?.[1]?.text || 'How do you structure micro-frontends?',
        requirement: 'Micro-frontends',
        why: 'Next question in interview',
        questionIndex: 1,
      };
    });
    sampleJob = {
      id: 'job-test-1',
      title: 'Senior Frontend Engineer',
      questions: [
        {
          id: 'q1',
          text: 'Explain how React concurrency works.',
          category: 'technical',
          order: 1,
          allowFollowUp: true,
          maxFollowUps: 1,
        },
        {
          id: 'q2',
          text: 'How do you structure micro-frontends?',
          category: 'architecture',
          order: 2,
          allowFollowUp: false,
          maxFollowUps: 0,
        },
      ],
    };

    mockRecognizer = {
      isListening: false,
      start: vi.fn().mockImplementation(() => {
        mockRecognizer.isListening = true;
      }),
      stop: vi.fn().mockImplementation(() => {
        mockRecognizer.isListening = false;
      }),
      abort: vi.fn().mockImplementation(() => {
        mockRecognizer.isListening = false;
      }),
      isSupported: vi.fn().mockReturnValue(true),
      destroy: vi.fn(),
    };

    mockSynthesizer = {
      isSpeaking: false,
      speak: vi.fn().mockImplementation((text, callbacks) => {
        mockSynthesizer.isSpeaking = true;
        // Provide hook so test can simulate speech completion
        mockSynthesizer._lastCallbacks = callbacks;
      }),
      stop: vi.fn().mockImplementation(() => {
        mockSynthesizer.isSpeaking = false;
      }),
      isSupported: vi.fn().mockReturnValue(true),
      destroy: vi.fn(),
    };

    capabilities = {
      hasSpeechRecognition: true,
      hasSpeechSynthesis: true,
      browserName: 'chrome',
      isFullySupported: true,
    };
  });

  it('requires explicit candidate consent before starting the interview', () => {
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    expect(controller.getState()).toBe(InterviewState.IDLE);
    expect(() => controller.startInterview()).toThrow(/consent is required/i);

    // Grant consent moves state through PRE_CHECK to READY
    controller.grantConsent();
    expect(controller.getState()).toBe(InterviewState.READY);

    // Now starting interview succeeds
    controller.startInterview();
    expect(controller.getState()).toBe(InterviewState.SPEAKING_QUESTION);
  });

  it('records CANDIDATE_CONSENT_GRANTED in event log', () => {
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    controller.grantConsent();
    const events = controller.getEvents();
    const consentEvent = events.find((e) => e.type === EventType.CANDIDATE_CONSENT_GRANTED);
    expect(consentEvent).toBeDefined();
    expect(consentEvent.metadata.jobId).toBe(sampleJob.id);
  });

  it('scopes done checks to one literal listening-turn token', () => {
    const controller = new InterviewController({ job: sampleJob, speechRecognizer: mockRecognizer, speechSynthesizer: mockSynthesizer, capabilities });
    controller.grantConsent();
    controller.startInterview();
    mockSynthesizer._lastCallbacks.onEnd();
    controller._checksUsed = 1;
    const token = controller._checksTurnToken;
    controller._handleRecognitionResult({ text: 'an unrelated re-render result', isFinal: false, interimText: '', finalText: '' });
    expect(controller._checksUsed).toBe(1);
    expect(controller._checksTurnToken).toBe(token);
    controller._beginListeningTurn(true);
    expect(controller._checksUsed).toBe(0);
    expect(controller._checksTurnToken).not.toBe(token);
  });

  it('keeps only one answer-completion timer and cancels a spoken check on new speech', () => {
    vi.useFakeTimers();
    const controller = new InterviewController({ job: sampleJob, speechRecognizer: mockRecognizer, speechSynthesizer: mockSynthesizer, capabilities });
    controller.grantConsent();
    controller.startInterview();
    mockSynthesizer._lastCallbacks.onEnd();
    controller.currentAnswerDraft = 'Short answer.';
    controller._handleSilenceTimeout();
    expect(controller._awaitingDoneCheck).toBe(true);
    expect(vi.getTimerCount()).toBe(1); // speech watchdog; no second silence/check timer is armed
    controller._handleRecognitionResult({ text: 'Short answer with more detail.', isFinal: false, interimText: 'more detail', finalText: '' });
    expect(mockSynthesizer.stop).toHaveBeenCalled();
    expect(controller._awaitingDoneCheck).toBe(false);
    expect(mockRecognizer.start).toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('progresses through ordered questions to completion', () => {
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    controller.grantConsent();
    controller.startInterview();

    // Q1 is being spoken
    expect(controller.getState()).toBe(InterviewState.SPEAKING_QUESTION);
    expect(controller.getCurrentQuestion().id).toBe('q1');
    expect(mockSynthesizer.speak).toHaveBeenCalledWith(
      expect.stringContaining('React concurrency'),
      expect.any(Object)
    );

    // Synthesizer finishes speaking Q1 -> transitions to LISTENING and starts recognizer
    mockSynthesizer._lastCallbacks.onEnd();
    expect(controller.getState()).toBe(InterviewState.LISTENING);
    expect(mockRecognizer.start).toHaveBeenCalled();

    // Candidate submits answer for Q1
    const submittedQ1 = controller.submitAnswer('React concurrency uses fiber architecture to yield work.');
    expect(submittedQ1).toBe(true);

    // State machine advanced to Q2 (SPEAKING_QUESTION)
    expect(controller.getState()).toBe(InterviewState.SPEAKING_QUESTION);
    expect(controller.getCurrentQuestion().id).toBe('q2');

    // Synthesizer finishes speaking Q2
    mockSynthesizer._lastCallbacks.onEnd();
    expect(controller.getState()).toBe(InterviewState.LISTENING);

    // Candidate submits answer for Q2
    const submittedQ2 = controller.submitAnswer('Using module federation with decoupled deployment pipelines.');
    expect(submittedQ2).toBe(true);

    // Wrap-up is spoken aloud; when playback ends, session transitions to COMPLETED
    mockSynthesizer._lastCallbacks.onEnd();
    expect(controller.getState()).toBe(InterviewState.COMPLETED);
    const transcript = controller.getTranscript();
    expect(transcript.length).toBe(5); // Q1, A1, Q2, A2, WRAP_UP
    expect(transcript[1].recognizedText).toContain('React concurrency');
    expect(transcript[3].recognizedText).toContain('module federation');
  });

  it('supports manual text-answer path without speech recognition', () => {
    const textOnlyCapabilities = {
      hasSpeechRecognition: false,
      hasSpeechSynthesis: true,
      browserName: 'firefox',
      isFullySupported: false,
    };

    const controller = new InterviewController({
      job: { ...sampleJob, settings: { allowTyping: true } },
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities: textOnlyCapabilities,
    });

    expect(controller.getInputMode()).toBe('text');
    controller.grantConsent();
    controller.startInterview();

    // Synthesis finishes
    mockSynthesizer._lastCallbacks.onEnd();
    expect(controller.getState()).toBe(InterviewState.LISTENING);
    // Recognizer should NOT be started when in text mode
    expect(mockRecognizer.start).not.toHaveBeenCalled();

    // Submit text answer
    controller.submitAnswer('Handwritten text response for testing.');
    expect(controller.getCurrentQuestion().id).toBe('q2');
  });

  it('supports repeating the active question', () => {
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    controller.grantConsent();
    controller.startInterview();
    mockSynthesizer._lastCallbacks.onEnd();
    expect(controller.getState()).toBe(InterviewState.LISTENING);

    // Request repeat
    const repeated = controller.repeatQuestion();
    expect(repeated).toBe(true);
    expect(controller.getState()).toBe(InterviewState.SPEAKING_QUESTION);
    expect(controller.getCurrentQuestion().id).toBe('q1');

    const repeatEvent = controller.getEvents().find((e) => e.type === EventType.REPETITION_REQUESTED);
    expect(repeatEvent).toBeDefined();
  });

  it('supports asking for clarification on the active question', () => {
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    controller.grantConsent();
    controller.startInterview();
    mockSynthesizer._lastCallbacks.onEnd();
    expect(controller.getState()).toBe(InterviewState.LISTENING);

    const clarified = controller.clarifyQuestion();
    expect(clarified).toBe(true);
    expect(controller.getState()).toBe(InterviewState.SPEAKING_QUESTION);

    const clarifyEvent = controller.getEvents().find((e) => e.type === EventType.CLARIFICATION_REQUESTED);
    expect(clarifyEvent).toBeDefined();
  });

  it('skips a question without recording an answer in the transcript', () => {
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    controller.grantConsent();
    controller.startInterview();
    mockSynthesizer._lastCallbacks.onEnd();

    // Skip Q1
    const skipped = controller.skipQuestion('candidate_skip');
    expect(skipped).toBe(true);

    // Current question is now Q2
    expect(controller.getCurrentQuestion().id).toBe('q2');

    // Transcript contains Q1 (interviewer), skip marker (candidate, skipped: true), and Q2 (interviewer)
    const transcript = controller.getTranscript();
    expect(transcript.length).toBe(3); // Q1, skip marker, Q2
    const skipTurn = transcript.find((t) => t.skipped === true);
    expect(skipTurn).toBeDefined();
    expect(skipTurn.recognizedText).toBe(''); // No answer text recorded

    // Event log contains the skip event
    const skipEvent = controller.getEvents().find((e) => e.type === EventType.QUESTION_SKIPPED);
    expect(skipEvent).toBeDefined();
    expect(skipEvent.metadata.questionId).toBe('q1');
  });

  it('supports pausing and resuming the interview', () => {
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    controller.grantConsent();
    controller.startInterview();
    mockSynthesizer._lastCallbacks.onEnd();
    expect(controller.getState()).toBe(InterviewState.LISTENING);

    // Pause
    const paused = controller.pause();
    expect(paused).toBe(true);
    expect(controller.getState()).toBe(InterviewState.PAUSED);
    expect(mockRecognizer.stop).toHaveBeenCalled();

    // Resume
    const resumed = controller.resume();
    expect(resumed).toBe(true);
    expect(controller.getState()).toBe(InterviewState.LISTENING);
    expect(mockRecognizer.start).toHaveBeenCalled();
  });

  it('supports ending early and moving to ABORTED state', () => {
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    controller.grantConsent();
    controller.startInterview();
    expect(controller.getState()).toBe(InterviewState.SPEAKING_QUESTION);

    controller.endEarly();
    expect(controller.getState()).toBe(InterviewState.ABORTED);
    expect(mockSynthesizer.stop).toHaveBeenCalled();

    const abortEvent = controller.getEvents().find((e) => e.type === EventType.INTERVIEW_ABORTED);
    expect(abortEvent).toBeDefined();
  });

  it('prevents duplicate answer submission while submitting', () => {
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    controller.grantConsent();
    controller.startInterview();
    mockSynthesizer._lastCallbacks.onEnd();

    // Artificially lock isSubmitting
    controller.isSubmitting = true;
    const secondSubmit = controller.submitAnswer('Duplicate answer');
    expect(secondSubmit).toBe(false);
  });

  it('handles microphone permission denial by switching automatically to text mode', () => {
    let capturedError = null;
    const controller = new InterviewController({
      job: { ...sampleJob, settings: { allowTyping: true } },
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
      onError: (msg) => {
        capturedError = msg;
      },
    });

    controller.grantConsent();
    expect(controller.getInputMode()).toBe('voice');

    // Simulate recognition permission denial error
    controller._handleRecognitionError({
      error: 'not-allowed',
      message: 'Microphone permission denied',
      isPermissionDenied: true,
    });

    expect(controller.getInputMode()).toBe('text');
    expect(capturedError).toContain('Microphone permission denied');
  });

  it('handles completely unsupported speech synthesis and recognition gracefully', () => {
    const unsupportedCapabilities = {
      hasSpeechRecognition: false,
      hasSpeechSynthesis: false,
      browserName: 'other',
      isFullySupported: false,
    };

    mockSynthesizer.isSupported.mockReturnValue(false);
    mockRecognizer.isSupported.mockReturnValue(false);

    const controller = new InterviewController({
      job: { ...sampleJob, settings: { allowTyping: true } },
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities: unsupportedCapabilities,
    });

    expect(controller.getInputMode()).toBe('text');
    controller.grantConsent();
    controller.startInterview();

    // Since synthesis is unsupported, it skips speaking immediately and lands in LISTENING
    expect(controller.getState()).toBe(InterviewState.LISTENING);
    expect(mockSynthesizer.speak).not.toHaveBeenCalled();

    // Candidate types response and finishes
    controller.submitAnswer('Typed response 1');
    expect(controller.getState()).toBe(InterviewState.LISTENING);
    expect(controller.getCurrentQuestion().id).toBe('q2');
  });

  it('handles interruption during question playback (barge-in)', () => {
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    controller.grantConsent();
    controller.startInterview();
    expect(controller.getState()).toBe(InterviewState.SPEAKING_QUESTION);

    // Candidate interrupts while interviewer is speaking
    controller.interruptQuestion();

    expect(mockSynthesizer.stop).toHaveBeenCalled();
    expect(controller.getState()).toBe(InterviewState.LISTENING);
    // Active question must remain Q1
    expect(controller.getCurrentQuestion().id).toBe('q1');

    const interruptEvent = controller.getEvents().find((e) => e.type === EventType.CANDIDATE_INTERRUPTED);
    expect(interruptEvent).toBeDefined();
  });

  it('cleans up resources and listeners on destroy', () => {
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    controller.grantConsent();
    controller.startInterview();

    controller.destroy();
    expect(controller.isDestroyed).toBe(true);
    expect(mockSynthesizer.destroy).toHaveBeenCalled();
    expect(mockRecognizer.destroy).toHaveBeenCalled();
  });

  it('rejects invalid state transitions safely', () => {
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    // In IDLE state, submitAnswer should return false
    expect(controller.submitAnswer('Premature answer')).toBe(false);

    // In IDLE state, repeatQuestion should return false
    expect(controller.repeatQuestion()).toBe(false);

    // In IDLE state, pause should return false
    expect(controller.pause()).toBe(false);
  });

  it('prevents duplicate question advancement via isAdvancing guard', () => {
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    controller.grantConsent();
    controller.startInterview();
    mockSynthesizer._lastCallbacks.onEnd();

    controller.isAdvancing = true;
    controller._advanceOrFinish();
    // Question should not have advanced because isAdvancing was true
    expect(controller.getCurrentQuestion().id).toBe('q1');
  });

  // ---- Regression tests for defects fixed in the verification phase ----

  it('REGRESSION: startInterview with zero questions reaches COMPLETED without throwing', () => {
    // Defect: _finishInterview was called from SPEAKING_QUESTION state (no FINISH transition),
    // causing an unhandled 'Invalid state transition' exception.
    const emptyJob = { id: 'empty-job', title: 'Empty Role', questions: [] };

    const controller = new InterviewController({
      job: emptyJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    controller.grantConsent();
    // Should NOT throw even though there are no questions
    expect(() => controller.startInterview()).not.toThrow();
    expect(controller.getState()).toBe(InterviewState.COMPLETED);

    const completedEvent = controller.getEvents().find((e) => e.type === EventType.INTERVIEW_COMPLETED);
    expect(completedEvent).toBeDefined();
  });

  it('REGRESSION: _finishInterview is a no-op when session is already ABORTED', () => {
    // Defect: previous guard only checked for COMPLETED, not ABORTED.
    // Calling _finishInterview after endEarly could attempt an invalid FINISH transition.
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    controller.grantConsent();
    controller.startInterview();
    controller.endEarly();
    expect(controller.getState()).toBe(InterviewState.ABORTED);

    // Should be safe to call _finishInterview again — must not throw
    expect(() => controller._finishInterview()).not.toThrow();
    // State must remain ABORTED, not change to COMPLETED
    expect(controller.getState()).toBe(InterviewState.ABORTED);
  });

  it('REGRESSION: _finishInterview called from LISTENING state reaches COMPLETED without throwing', () => {
    // Additional coverage: _finishInterview must handle LISTENING state (e.g. direct call
    // from a future timeout or error path while in LISTENING state).
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    controller.grantConsent();
    controller.startInterview();
    mockSynthesizer._lastCallbacks.onEnd(); // → LISTENING

    expect(controller.getState()).toBe(InterviewState.LISTENING);
    expect(() => controller._finishInterview()).not.toThrow();
    expect(controller.getState()).toBe(InterviewState.COMPLETED);
  });

  it('REGRESSION: utterance cancellation does NOT advance question or trigger premature listening transition', () => {
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    controller.grantConsent();
    controller.startInterview();
    expect(controller.getState()).toBe(InterviewState.SPEAKING_QUESTION);

    // Pause interview — this calls synthesizer.stop() which triggers utterance.onerror with isCanceled: true
    controller.pause();
    expect(controller.getState()).toBe(InterviewState.PAUSED);

    // Simulate the browser asynchronous error event with isCanceled: true
    mockSynthesizer._lastCallbacks.onError({
      error: 'canceled',
      message: 'Speech was canceled.',
      isCanceled: true,
    });

    // The state must REMAIN PAUSED and not advance to LISTENING or next question!
    expect(controller.getState()).toBe(InterviewState.PAUSED);
    expect(controller.getCurrentQuestion().id).toBe('q1');
  });

  it('REGRESSION: candidate interruption activates speech recognition when in voice mode', () => {
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
    });

    controller.grantConsent();
    controller.startInterview();
    expect(controller.getState()).toBe(InterviewState.SPEAKING_QUESTION);
    expect(mockRecognizer.start).not.toHaveBeenCalled();

    // Interrupt question
    controller.interruptQuestion();
    expect(controller.getState()).toBe(InterviewState.LISTENING);
    // Recognizer must now be started so candidate can immediately speak
    expect(mockRecognizer.start).toHaveBeenCalled();
  });

  it('REGRESSION: genuine synthesis errors recover gracefully into LISTENING mode with question visible', () => {
    let capturedError = null;
    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
      onError: (err) => {
        capturedError = err;
      },
    });

    controller.grantConsent();
    controller.startInterview();
    expect(controller.getState()).toBe(InterviewState.SPEAKING_QUESTION);

    // Simulate unexpected audio hardware synthesis failure (not a cancellation)
    mockSynthesizer._lastCallbacks.onError({
      error: 'audio-hardware',
      message: 'Audio device unavailable.',
      isCanceled: false,
    });

    // Recovers gracefully into LISTENING so candidate can read question and answer
    expect(controller.getState()).toBe(InterviewState.LISTENING);
    expect(controller.getCurrentQuestion().id).toBe('q1');
    expect(capturedError).toContain('Audio playback was unavailable');
  });
});
