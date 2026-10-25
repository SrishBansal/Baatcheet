import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GeminiAnalysisProvider, RequirementAssessmentStatus } from '../../src/analysis/provider.js';
import { InterviewController } from '../../src/engine/interviewController.js';
import { InterviewState } from '../../src/engine/stateMachine.js';

describe('GeminiAnalysisProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const sampleSession = {
    id: 'session-1',
    jobId: 'job-1',
    jobSnapshot: {
      requirements: [{ id: 'req-1', name: 'React', priority: 'required' }],
      questions: [{ id: 'q1', text: 'Explain React', requirementIds: ['req-1'] }],
    },
    turns: [
      {
        id: 'turn-1',
        questionId: 'q1',
        kind: 'question',
        answer: { finalText: 'I have deep expertise with React hooks and concurrency.' },
        skipped: false,
      },
    ],
  };

  it('calls /api/analysis/session and /api/verify-evidence successfully', async () => {
    const mockAnalysisJson = {
      ok: true,
      data: {
        overallSummary: 'Strong candidate with React experience.',
        recommendation: 'advance',
        requirementEvaluations: [
          {
            requirementId: 'req-1',
            status: 'met',
            evidenceQuotes: ['deep expertise with React hooks'],
            reasoning: 'Candidate mentioned deep expertise.',
          },
        ],
        contradictions: [],
      },
    };

    const mockVerifyJson = {
      ok: true,
      data: {
        verified: true,
        results: [
          {
            quote: 'deep expertise with React hooks',
            found: true,
            exactMatch: true,
          },
        ],
      },
    };

    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/analysis/session')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockAnalysisJson,
        });
      }
      if (url.includes('/api/verify-evidence')) {
        return Promise.resolve({
          ok: true,
          json: async () => mockVerifyJson,
        });
      }
      return Promise.reject(new Error(`Unexpected url: ${url}`));
    });

    const provider = new GeminiAnalysisProvider({ fetchFn: fetchMock });
    const result = await provider.analyze(sampleSession);

    expect(result.status).toBe('complete');
    expect(result.providerKind).toBe('semantic');
    expect(result.summary).toContain('Strong candidate');
    expect(result.requirements[0].quotes).toEqual(['deep expertise with React hooks']);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('filters out quotes flagged as unverified by /api/verify-evidence', async () => {
    const mockAnalysisJson = {
      ok: true,
      data: {
        overallSummary: 'Candidate evaluation.',
        recommendation: 'hold',
        requirementEvaluations: [
          {
            requirementId: 'req-1',
            status: 'met',
            evidenceQuotes: ['deep expertise with React hooks', 'fabricated hallucinated quote'],
            reasoning: 'Reasoning.',
          },
        ],
      },
    };

    const mockVerifyJson = {
      ok: true,
      data: {
        verified: false,
        results: [
          {
            quote: 'deep expertise with React hooks',
            found: true,
            exactMatch: true,
          },
          {
            quote: 'fabricated hallucinated quote',
            found: false,
            exactMatch: false,
          },
        ],
      },
    };

    const fetchMock = vi.fn().mockImplementation((url) => {
      if (url.includes('/api/analysis/session')) {
        return Promise.resolve({ ok: true, json: async () => mockAnalysisJson });
      }
      if (url.includes('/api/verify-evidence')) {
        return Promise.resolve({ ok: true, json: async () => mockVerifyJson });
      }
      return Promise.reject(new Error(`Unexpected url: ${url}`));
    });

    const provider = new GeminiAnalysisProvider({ fetchFn: fetchMock });
    const result = await provider.analyze(sampleSession);

    expect(result.requirements[0].quotes).toEqual(['deep expertise with React hooks']);
  });

  it('falls back to DeterministicTranscriptProvider when server call fails', async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error('500 Internal Server Error'));

    const provider = new GeminiAnalysisProvider({ fetchFn: fetchMock });
    const result = await provider.analyze(sampleSession);

    expect(result.providerKind).toBe('deterministic');
    expect(result.status).toBe('complete');
  });

  it('auto-runs analysis on completion but not on abort', async () => {
    const job = {
      id: 'job-1',
      title: 'Engineer',
      requirements: [{ id: 'req-1', name: 'React' }],
      questions: [{ id: 'q1', text: 'Q1' }],
    };

    const fakeStore = {
      sessions: new Map(),
      save(s) {
        this.sessions.set(s.id, s);
      },
      getById(id) {
        return this.sessions.get(id);
      },
    };

    const mockAnalysisProvider = {
      providerId: 'mock-provider',
      providerKind: 'semantic',
      analyze: vi.fn().mockResolvedValue({
        status: 'complete',
        providerId: 'mock-provider',
        providerKind: 'semantic',
        requirements: [],
      }),
    };

    const mockNextTurn = vi.fn().mockImplementation(({ transcript = [] }) => {
      if (transcript.length === 0) {
        return { action: 'INTRO', say: 'Intro question.', why: 'intro', questionIndex: 0 };
      }
      return { action: 'WRAP_UP', say: 'Thank you.', why: 'done' };
    });

    // Case 1: Session aborted early via endEarly()
    const abortedController = new InterviewController({
      job,
      sessionStore: fakeStore,
      analysisProvider: mockAnalysisProvider,
      speechRecognizer: { isSupported: () => false, stop: () => {}, destroy: () => {} },
      speechSynthesizer: { isSupported: () => false, stop: () => {}, destroy: () => {} },
      nextTurn: mockNextTurn,
    });
    abortedController.grantConsent();
    abortedController.startInterview();
    abortedController.endEarly();

    expect(abortedController.getState()).toBe(InterviewState.ABORTED);
    expect(mockAnalysisProvider.analyze).not.toHaveBeenCalled();

    // Case 2: Session completes naturally
    const completedController = new InterviewController({
      job,
      sessionStore: fakeStore,
      analysisProvider: mockAnalysisProvider,
      speechRecognizer: { isSupported: () => false, stop: () => {}, destroy: () => {} },
      speechSynthesizer: { isSupported: () => false, stop: () => {}, destroy: () => {} },
      nextTurn: mockNextTurn,
    });
    completedController.grantConsent();
    completedController.startInterview();
    completedController.submitAnswer('Answering the only question');

    expect(completedController.getState()).toBe(InterviewState.COMPLETED);
    expect(mockAnalysisProvider.analyze).toHaveBeenCalledOnce();
  });
});
