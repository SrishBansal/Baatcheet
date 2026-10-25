import { describe, it, expect, beforeEach, vi } from 'vitest';
import { InterviewController } from '../../src/engine/interviewController.js';
import { sessionStore, SessionStatus } from '../../src/data/sessions.js';

class LocalStorageMock {
  constructor() {
    this.store = {};
  }
  getItem(key) {
    return this.store[key] || null;
  }
  setItem(key, value) {
    this.store[key] = String(value);
  }
  removeItem(key) {
    delete this.store[key];
  }
  clear() {
    this.store = {};
  }
}

globalThis.localStorage = new LocalStorageMock();

let defaultMockNextTurn;
vi.mock('../../src/data/engineApi.js', () => ({
  nextTurn: vi.fn((...args) => defaultMockNextTurn(...args)),
}));

describe('Session Recording & Controller Integration', () => {
  let sampleJob;
  let mockRecognizer;
  let mockSynthesizer;

  beforeEach(() => {
    defaultMockNextTurn = vi.fn().mockImplementation(({ job, transcript = [] }) => {
      const cand = transcript.filter((x) => x.role === 'candidate');
      if (transcript.length === 0) {
        return {
          action: 'INTRO',
          say: sampleJob?.questions?.[0]?.text || 'Explain React concurrency.',
          requirement: 'React concurrency',
          why: 'Initial question',
          questionIndex: 0,
        };
      }
      if (cand.length >= 2) {
        return {
          action: 'WRAP_UP',
          say: 'Thank you.',
          why: 'Done',
          questionIndex: null,
        };
      }
      return {
        action: 'NEXT_QUESTION',
        say: sampleJob?.questions?.[1]?.text || 'How do you structure micro-frontends?',
        requirement: 'Micro-frontends',
        why: 'Next question',
        questionIndex: 1,
      };
    });
    sessionStore.clear();

    sampleJob = {
      id: 'job-rec-1',
      title: 'Full Stack Engineer',
      skills: [
        { id: 'skill-react', name: 'React', priority: 'required' },
        { id: 'skill-node', name: 'Node.js', priority: 'required' },
      ],
      questions: [
        {
          id: 'q1',
          text: 'How do you optimize React re-renders?',
          category: 'frontend',
          requirementIds: ['skill-react'],
          order: 0,
          maxFollowUps: 1,
        },
        {
          id: 'q2',
          text: 'Explain Node.js event loop phases.',
          category: 'backend',
          requirementIds: ['skill-node'],
          order: 1,
          maxFollowUps: 0,
        },
        {
          id: 'q3',
          text: 'How do you structure database migrations?',
          category: 'architecture',
          requirementIds: [],
          order: 2,
          maxFollowUps: 0,
        },
      ],
    };

    mockRecognizer = {
      isListening: false,
      start: vi.fn(),
      stop: vi.fn(),
      abort: vi.fn(),
      isSupported: vi.fn().mockReturnValue(true),
    };

    mockSynthesizer = {
      speak: vi.fn().mockImplementation((text, opts) => {
        // Immediate completion for synchronous state testing
        opts?.onEnd?.();
      }),
      stop: vi.fn(),
      isSupported: vi.fn().mockReturnValue(true),
    };
  });

  it('records incremental session at interview start, question presentation, and finalized answer', () => {
    const controller = new InterviewController({
      job: { ...sampleJob, settings: { allowTyping: true } },
      interviewId: 'sess-rec-test-1',
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
    });

    controller.grantConsent();
    controller.startInterview();

    // Verify session was persisted at start
    let stored = sessionStore.getById('sess-rec-test-1');
    expect(stored).not.toBeNull();
    expect(stored.status).toBe(SessionStatus.IN_PROGRESS);
    expect(stored.turns.length).toBe(1);
    expect(stored.turns[0].questionId).toBe('q1');
    expect(stored.turns[0].text).toBe('How do you optimize React re-renders?');
    expect(stored.turns[0].answer).toBeUndefined();

    // Submit answer via manual text input
    controller.setInputMode('text');
    controller.submitAnswer('I use memoization with useMemo, React.memo, and proper state colocation.');

    stored = sessionStore.getById('sess-rec-test-1');
    expect(stored.turns[0].answer).toBeDefined();
    expect(stored.turns[0].answer.finalText).toBe(
      'I use memoization with useMemo, React.memo, and proper state colocation.'
    );
    expect(stored.turns[0].answer.inputMode).toBe('text');
    expect(stored.turns[0].skipped).toBe(false);

    // Controller should have advanced to question 2
    expect(stored.turns.length).toBe(2);
    expect(stored.turns[1].questionId).toBe('q2');
  });

  it('records skip cleanly without creating an answer property', () => {
    const controller = new InterviewController({
      job: sampleJob,
      interviewId: 'sess-skip-test',
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
    });

    controller.grantConsent();
    controller.startInterview();

    controller.skipQuestion('candidate_skipped');

    const stored = sessionStore.getById('sess-skip-test');
    expect(stored.turns[0].skipped).toBe(true);
    expect(stored.turns[0].answer).toBeUndefined();
    // After skip, advanced to q2
    expect(stored.turns.length).toBe(2);
    expect(stored.turns[1].questionId).toBe('q2');
  });

  it('records abort mid-interview: status is aborted and unasked questions are absent, not skipped', () => {
    const controller = new InterviewController({
      job: sampleJob,
      interviewId: 'sess-abort-test',
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
    });

    controller.grantConsent();
    controller.startInterview();

    // Candidate answers question 1
    controller.submitAnswer('Optimized re-renders with React.memo.');

    // Now at question 2, candidate decides to abort early
    controller.endEarly();

    const stored = sessionStore.getById('sess-abort-test');
    expect(stored.status).toBe(SessionStatus.ABORTED);
    expect(stored.endedAt).not.toBeNull();

    // Turn 1 was answered, Turn 2 was asked but aborted
    expect(stored.turns.length).toBe(2);
    expect(stored.turns[0].questionId).toBe('q1');
    expect(stored.turns[1].questionId).toBe('q2');

    // CRITICAL: Question 3 was never asked, so it MUST be absent, NOT marked skipped
    const q3Turn = stored.turns.find((t) => t.questionId === 'q3');
    expect(q3Turn).toBeUndefined();
  });

  it('strictly requires rationale for follow-up turns', () => {
    const controller = new InterviewController({
      job: sampleJob,
      interviewId: 'sess-followup-test',
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
    });

    controller.grantConsent();
    controller.startInterview();

    // Mock questionManager to return a follow-up without rationale
    vi.spyOn(controller.questionManager, 'getActivePrompt').mockReturnValue({
      questionId: 'q1',
      text: 'Can you elaborate on that?',
      isFollowUp: true,
      rationale: '', // Empty rationale violates rule
    });

    expect(() => controller._presentCurrentQuestion()).toThrow(
      /Rationale is required for follow-up turns/
    );
  });

  it('confirms interim recognition speech never enters the persisted record', () => {
    const controller = new InterviewController({
      job: sampleJob,
      interviewId: 'sess-interim-test',
      speechRecognizer: mockRecognizer,
      speechSynthesizer: mockSynthesizer,
    });

    controller.grantConsent();
    controller.startInterview();

    // Simulate interim recognition events
    controller._handleRecognitionResult({
      text: 'Draft interim answer piece',
      isFinal: false,
      interimText: 'Draft interim answer piece',
      finalText: '',
    });

    // Check storage before submission
    let stored = sessionStore.getById('sess-interim-test');
    expect(stored.turns[0].answer).toBeUndefined();

    // Even if cancelled or ended, interim text must never be persisted as final answer
    controller.endEarly();
    stored = sessionStore.getById('sess-interim-test');
    expect(stored.turns[0].answer).toBeUndefined();
  });
});
