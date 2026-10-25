import { describe, it, expect, vi, beforeEach } from 'vitest';
import { InterviewController } from '../../src/engine/interviewController.js';
import { InterviewState } from '../../src/engine/stateMachine.js';

describe('Phase 3: Interview Engine (nextTurn integration)', () => {
  let sampleJob;
  let mockRecognizer;
  let mockSynthesizer;
  let capabilities;

  beforeEach(() => {
    sampleJob = {
      id: 'job-engine-1',
      title: 'Full Stack Engineer',
      requirements: [
        { id: 'req-1', name: 'Node.js', priority: 'required' },
        { id: 'req-2', name: 'System Design', priority: 'preferred' },
      ],
      questions: [
        { id: 'q1', text: 'How do you handle async errors in Node.js?', requirementIds: ['req-1'] },
      ],
    };

    mockRecognizer = {
      isListening: false,
      start: vi.fn().mockImplementation(() => { mockRecognizer.isListening = true; }),
      stop: vi.fn().mockImplementation(() => { mockRecognizer.isListening = false; }),
      isSupported: vi.fn().mockReturnValue(true),
      destroy: vi.fn(),
    };

    mockSynthesizer = {
      isSpeaking: false,
      speak: vi.fn().mockImplementation((text, callbacks) => {
        mockSynthesizer.isSpeaking = true;
        mockSynthesizer._lastCallbacks = callbacks;
      }),
      stop: vi.fn().mockImplementation(() => { mockSynthesizer.isSpeaking = false; }),
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

  it('INTRO is spoken first upon startInterview', async () => {
    const mockNextTurn = vi.fn().mockResolvedValue({
      action: 'INTRO',
      say: 'Hello, welcome to Baatcheet for Full Stack Engineer. Tell me about your background with Node.js.',
      requirement: 'Node.js',
      why: 'Warm intro and first question',
      questionIndex: 0,
    });

    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
      nextTurn: mockNextTurn,
    });

    controller.grantConsent();
    await controller.startInterview();

    expect(mockNextTurn).toHaveBeenCalledWith(
      expect.objectContaining({
        transcript: [],
        job: expect.objectContaining({ title: 'Full Stack Engineer' }),
      })
    );
    expect(mockSynthesizer.speak).toHaveBeenCalledWith(
      expect.stringContaining('welcome to Baatcheet'),
      expect.any(Object)
    );
    expect(controller.getState()).toBe(InterviewState.SPEAKING_QUESTION);

    // Phase 3.6: Verify session.reasoning set to gemini semantic
    expect(controller.getSessionRecord().reasoning).toEqual({
      providerId: 'gemini',
      providerKind: 'semantic',
    });
  });

  it('FOLLOW_UP stored as followup with rationale', async () => {
    let turnCount = 0;
    const mockNextTurn = vi.fn().mockImplementation(async () => {
      turnCount++;
      if (turnCount === 1) {
        return {
          action: 'INTRO',
          say: 'Question 1: Explain your experience with Node.js streams.',
          requirement: 'Node.js',
          why: 'Initial question',
          questionIndex: 0,
        };
      }
      return {
        action: 'FOLLOW_UP',
        say: 'How did you handle backpressure in those streams?',
        requirement: 'Node.js',
        why: 'Candidate mentioned piping large files but omitted backpressure details.',
        questionIndex: 0,
      };
    });

    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
      nextTurn: mockNextTurn,
    });

    controller.grantConsent();
    await controller.startInterview();
    mockSynthesizer._lastCallbacks.onEnd();

    expect(controller.getState()).toBe(InterviewState.LISTENING);

    // Candidate submits answer
    await controller.submitAnswer('I piped data directly from request to file stream.');

    const turns = controller.getSessionRecord().turns;
    expect(turns.length).toBe(2);

    const followUpTurn = turns[1];
    expect(followUpTurn.kind).toBe('followup');
    expect(followUpTurn.action).toBe('FOLLOW_UP');
    expect(followUpTurn.rationale).toBe('Candidate mentioned piping large files but omitted backpressure details.');
    expect(followUpTurn.requirement).toBe('Node.js');
    expect(followUpTurn.text).toBe('How did you handle backpressure in those streams?');
    expect(controller.getState()).toBe(InterviewState.FOLLOW_UP);
  });

  it('stale result after abort or next token is discarded', async () => {
    let resolveTurn;
    const slowTurnPromise = new Promise((resolve) => {
      resolveTurn = resolve;
    });

    let callCount = 0;
    const mockNextTurn = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) {
        return Promise.resolve({
          action: 'INTRO',
          say: 'Introductory question.',
          why: 'intro',
          questionIndex: 0,
        });
      }
      return slowTurnPromise;
    });

    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
      nextTurn: mockNextTurn,
    });

    controller.grantConsent();
    await controller.startInterview();
    mockSynthesizer._lastCallbacks.onEnd();

    // Candidate submits answer -> triggers slow turn
    controller.submitAnswer('My answer to the intro.');

    // Candidate aborts interview while nextTurn is still in flight
    controller.endEarly();
    expect(controller.getState()).toBe(InterviewState.ABORTED);

    const turnsBeforeResolve = controller.getSessionRecord().turns.length;

    // Slow promise resolves now
    resolveTurn({
      action: 'NEXT_QUESTION',
      say: 'This question arrived too late.',
      why: 'stale',
      questionIndex: 1,
    });
    await slowTurnPromise;

    // Stale result discarded
    expect(controller.getSessionRecord().turns.length).toBe(turnsBeforeResolve);
    expect(controller.getState()).toBe(InterviewState.ABORTED);
  });

  it('failure shows Retry and does not advance', async () => {
    let shouldFail = true;
    const mockNextTurn = vi.fn().mockImplementation(async () => {
      if (shouldFail) {
        throw new Error('gemini_rate_limit');
      }
      return {
        action: 'INTRO',
        say: 'Recovered intro question.',
        why: 'intro',
        questionIndex: 0,
      };
    });

    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
      nextTurn: mockNextTurn,
    });

    controller.grantConsent();
    await controller.startInterview();

    // Stay in room, show error
    expect(controller.engineError).toBe('gemini_rate_limit');
    expect(controller.getSessionRecord().turns.length).toBe(0);

    // Call retryTurn
    shouldFail = false;
    await controller.retryTurn();

    expect(controller.engineError).toBe(null);
    expect(controller.getSessionRecord().turns.length).toBe(1);
    expect(controller.getSessionRecord().turns[0].text).toBe('Recovered intro question.');
  });

  it('WRAP_UP completes the interview after speech ends', async () => {
    let turnCount = 0;
    const mockNextTurn = vi.fn().mockImplementation(async () => {
      turnCount++;
      if (turnCount === 1) {
        return {
          action: 'INTRO',
          say: 'Question 1 text.',
          why: 'intro',
          questionIndex: 0,
        };
      }
      return {
        action: 'WRAP_UP',
        say: 'Thank you for your time. The recruiter will be in touch.',
        why: 'Interview done',
      };
    });

    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
      nextTurn: mockNextTurn,
    });

    controller.grantConsent();
    await controller.startInterview();
    mockSynthesizer._lastCallbacks.onEnd();

    await controller.submitAnswer('Here is my complete answer.');

    // WRAP_UP text is spoken
    expect(mockSynthesizer.speak).toHaveBeenCalledWith(
      expect.stringContaining('The recruiter will be in touch'),
      expect.any(Object)
    );
    expect(controller.getState()).toBe(InterviewState.SPEAKING_QUESTION);

    // Speech finishes -> completes interview
    mockSynthesizer._lastCallbacks.onEnd();
    expect(controller.getState()).toBe(InterviewState.COMPLETED);
  });

  it('no fixed-list advance remains (engine drives turns exclusively)', async () => {
    // Job has question "Q-A", but engine returns completely different text "Q-Engine"
    const mockNextTurn = vi.fn().mockResolvedValue({
      action: 'INTRO',
      say: 'Engine generated customized question.',
      requirement: 'Node.js',
      why: 'Engine decided dynamically',
      questionIndex: 0,
    });

    const controller = new InterviewController({
      job: sampleJob,
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
      capabilities,
      nextTurn: mockNextTurn,
    });

    controller.grantConsent();
    await controller.startInterview();

    expect(controller.getCurrentQuestion().text).toBe('Engine generated customized question.');
    expect(controller.getCurrentQuestion().text).not.toBe(sampleJob.questions[0].text);
  });
});
