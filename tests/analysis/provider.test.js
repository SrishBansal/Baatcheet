import { describe, it, expect } from 'vitest';
import {
  DeterministicTranscriptProvider,
  validateEvidenceQuotes,
  runSessionAnalysis,
  RequirementAssessmentStatus,
  AnalysisProvider,
} from '../../src/analysis/provider.js';

describe('Analysis Provider Abstraction & Evidence Validation', () => {
  const baseSession = {
    id: 'test-session-1',
    jobSnapshot: {
      requirements: [
        { id: 'req-arch', name: 'Software Architecture', priority: 'required' },
        { id: 'req-perf', name: 'Performance Optimization', priority: 'preferred' },
        { id: 'req-unassessed', name: 'GraphQL API Design', priority: 'required' },
      ],
      questions: [
        {
          id: 'q1',
          text: 'Describe architectural trade-offs.',
          requirementIds: ['req-arch'],
        },
        {
          id: 'q2',
          text: 'How do you profile rendering bottlenecks?',
          requirementIds: ['req-perf'],
        },
        {
          id: 'q3',
          text: 'Design a GraphQL schema.',
          requirementIds: ['req-unassessed'],
        },
      ],
    },
    turns: [
      {
        id: 'turn-1',
        questionId: 'q1',
        kind: 'question',
        text: 'Describe architectural trade-offs.',
        answer: {
          finalText:
            'I prefer event-driven microservices for decoupled scale, but monoliths are better for early velocity.',
          answeredAt: '2026-10-25T10:00:00.000Z',
          inputMode: 'voice',
        },
        skipped: false,
      },
      {
        id: 'turn-2',
        questionId: 'q2',
        kind: 'question',
        text: 'How do you profile rendering bottlenecks?',
        answer: {
          finalText: 'I use Chrome Performance DevTools and React Profiler to identify long tasks.',
          answeredAt: '2026-10-25T10:05:00.000Z',
          inputMode: 'text',
        },
        skipped: false,
      },
      // Note: q3 was never answered or skipped; req-unassessed is unassessed
    ],
  };

  describe('DeterministicTranscriptProvider', () => {
    it('maps recorded answers to requirements as Awaiting analysis and unassessed as Not assessed', async () => {
      const provider = new DeterministicTranscriptProvider();
      const result = await provider.analyze(baseSession);

      expect(result.status).toBe('complete');
      expect(result.providerKind).toBe('deterministic');
      expect(result.requirements.length).toBe(3);

      const archReq = result.requirements.find((r) => r.requirementId === 'req-arch');
      expect(archReq.status).toBe(RequirementAssessmentStatus.AWAITING_ANALYSIS);
      expect(archReq.quotes).toEqual([
        'I prefer event-driven microservices for decoupled scale, but monoliths are better for early velocity.',
      ]);

      const perfReq = result.requirements.find((r) => r.requirementId === 'req-perf');
      expect(perfReq.status).toBe(RequirementAssessmentStatus.AWAITING_ANALYSIS);
      expect(perfReq.quotes).toEqual([
        'I use Chrome Performance DevTools and React Profiler to identify long tasks.',
      ]);

      const unassessedReq = result.requirements.find(
        (r) => r.requirementId === 'req-unassessed'
      );
      expect(unassessedReq.status).toBe(RequirementAssessmentStatus.NOT_ASSESSED);
      expect(unassessedReq.quotes).toEqual([]);
    });

    it('never emits Demonstrated, Partially demonstrated, or Insufficient evidence in deterministic mode', async () => {
      const provider = new DeterministicTranscriptProvider();
      const result = await provider.analyze(baseSession);

      for (const req of result.requirements) {
        expect(req.status).not.toBe('Demonstrated');
        expect(req.status).not.toBe('Partially demonstrated');
        expect(req.status).not.toBe('Insufficient evidence');
      }
    });
  });

  describe('Evidence Validator (validateEvidenceQuotes)', () => {
    it('accepts exact substring evidence quotes', () => {
      const mockResult = {
        status: 'complete',
        providerKind: 'semantic',
        requirements: [
          {
            requirementId: 'req-arch',
            status: 'Demonstrated',
            quotes: ['event-driven microservices for decoupled scale'],
          },
        ],
      };

      const { validatedResult, rejectedCount } = validateEvidenceQuotes(mockResult, baseSession);
      expect(rejectedCount).toBe(0);
      expect(validatedResult.requirements[0].quotes).toEqual([
        'event-driven microservices for decoupled scale',
      ]);
    });

    it('rejects altered evidence quotes that are not exact substrings', () => {
      const mockResult = {
        status: 'complete',
        providerKind: 'semantic',
        requirements: [
          {
            requirementId: 'req-arch',
            status: 'Demonstrated',
            quotes: [
              'event driven micro services for scale', // Altered punctuation/words
              'fabricated quote never spoken by candidate',
            ],
          },
        ],
      };

      const { validatedResult, rejectedCount, rejectedQuotes } = validateEvidenceQuotes(
        mockResult,
        baseSession
      );
      expect(rejectedCount).toBe(2);
      expect(validatedResult.requirements[0].quotes).toEqual([]);
      expect(validatedResult.rejectedEvidenceCount).toBe(2);
      expect(rejectedQuotes.length).toBe(2);
      expect(rejectedQuotes[0].reason).toContain('not an exact substring');
    });

    it('rejects whitespace edge cases (extra internal spaces or non-matching surrounding whitespace)', () => {
      const mockResult = {
        status: 'complete',
        providerKind: 'semantic',
        requirements: [
          {
            requirementId: 'req-perf',
            status: 'Partially demonstrated',
            quotes: [
              'Chrome  Performance   DevTools', // Multiple spaces
              ' I use Chrome Performance ', // Surrounding spaces not in sentence
              '', // Empty
              '   ', // Whitespace only
            ],
          },
        ],
      };

      const { validatedResult, rejectedCount } = validateEvidenceQuotes(mockResult, baseSession);
      expect(rejectedCount).toBe(4);
      expect(validatedResult.requirements[0].quotes).toEqual([]);
      expect(validatedResult.rejectedEvidenceCount).toBe(4);
    });

    it('enforces that deterministic providers can never emit semantic labels even if attempted', () => {
      const mockDeterministicWithIllegalLabel = {
        status: 'complete',
        providerKind: 'deterministic',
        requirements: [
          {
            requirementId: 'req-arch',
            status: 'Demonstrated', // Illegal for deterministic
            quotes: ['monoliths are better for early velocity'],
          },
        ],
      };

      const { validatedResult } = validateEvidenceQuotes(
        mockDeterministicWithIllegalLabel,
        baseSession
      );
      expect(validatedResult.requirements[0].status).toBe(
        RequirementAssessmentStatus.AWAITING_ANALYSIS
      );
    });

    it('rejects wrong-turn quotes cited without cross-turn flag (Layer 2)', () => {
      // turn-2 is about performance (req-perf), not architecture (req-arch)
      const mockResult = {
        status: 'complete',
        providerKind: 'semantic',
        requirements: [
          {
            requirementId: 'req-arch',
            status: 'Partially demonstrated',
            quotes: [
              {
                quote: 'Chrome Performance DevTools',
                turnId: 'turn-2', // turn-2 is linked to req-perf, not req-arch
                isCrossTurn: false,
              },
            ],
            missingEvidence: 'Needs more architectural trade-off discussion',
          },
        ],
      };

      const { validatedResult, rejectedCount, rejectedQuotes } = validateEvidenceQuotes(
        mockResult,
        baseSession
      );

      expect(rejectedCount).toBe(1);
      expect(validatedResult.requirements[0].quotes).toEqual([]);
      expect(rejectedQuotes[0].reason).toContain('not linked to requirement');
    });

    it('accepts cross-turn quotes when explicitly flagged (Layer 2)', () => {
      const mockResult = {
        status: 'complete',
        providerKind: 'semantic',
        requirements: [
          {
            requirementId: 'req-arch',
            status: 'Partially demonstrated',
            quotes: [
              {
                quote: 'React Profiler to identify long tasks',
                turnId: 'turn-2',
                isCrossTurn: true, // explicitly flagged cross-turn
              },
            ],
            missingEvidence: 'Needs microservices details',
          },
        ],
      };

      const { validatedResult, rejectedCount } = validateEvidenceQuotes(
        mockResult,
        baseSession
      );

      expect(rejectedCount).toBe(0);
      expect(validatedResult.requirements[0].quotes).toEqual([
        'React Profiler to identify long tasks',
      ]);
    });

    it('downgrades unjustified Demonstrated when 0 valid quotes exist (Layer 3)', () => {
      const mockResult = {
        status: 'complete',
        providerKind: 'semantic',
        requirements: [
          {
            requirementId: 'req-arch',
            status: 'Demonstrated',
            quotes: [], // No quotes provided for Demonstrated
          },
        ],
      };

      const { validatedResult } = validateEvidenceQuotes(mockResult, baseSession);
      const req = validatedResult.requirements[0];

      expect(req.status).toBe(RequirementAssessmentStatus.INSUFFICIENT_EVIDENCE);
      expect(req.downgraded).toBe(true);
      expect(req.downgradeReason).toContain('requires at least 1 valid verbatim quote');
    });

    it('code overrides model-claimed status on unassessed requirement to Not assessed (Layer 3)', () => {
      // req-unassessed was never asked or answered
      const mockResult = {
        status: 'complete',
        providerKind: 'semantic',
        requirements: [
          {
            requirementId: 'req-unassessed',
            status: 'Demonstrated', // Model falsely claims Demonstrated
            quotes: ['monoliths are better for early velocity'],
          },
        ],
      };

      const { validatedResult } = validateEvidenceQuotes(mockResult, baseSession);
      const req = validatedResult.requirements[0];

      // Code overrides to Not assessed unconditionally
      expect(req.status).toBe(RequirementAssessmentStatus.NOT_ASSESSED);
      expect(req.overriddenByCode).toBe(true);
      expect(req.overrideReason).toContain('Overridden by code');
    });

    it('rejects contradiction claims when fewer than 2 valid quotes are cited (Layer 4)', () => {
      const mockResult = {
        status: 'complete',
        providerKind: 'semantic',
        requirements: [
          {
            requirementId: 'req-arch',
            status: 'Partially demonstrated',
            hasContradiction: true,
            quotes: ['event-driven microservices for decoupled scale'], // Only 1 quote!
            missingEvidence: 'Contradicted scaling strategy',
          },
        ],
      };

      const { validatedResult } = validateEvidenceQuotes(mockResult, baseSession);
      const req = validatedResult.requirements[0];

      expect(req.hasContradiction).toBe(false);
      expect(req.contradictionFlagged).toBe(true);
      expect(req.contradictionReason).toContain('at least two valid quotes');
    });

    it('separates observation from inference and caps confidence for single short quotes (Layer 5)', () => {
      const mockResult = {
        status: 'complete',
        providerKind: 'semantic',
        requirements: [
          {
            requirementId: 'req-arch',
            status: 'Partially demonstrated',
            quotes: ['early velocity'], // 14 chars (< 50)
            observation: 'Candidate mentioned early velocity.',
            inference: 'Candidate understands fast bootstrapping.',
            confidence: 'high', // High confidence with single short quote
            missingEvidence: 'No deep discussion',
          },
        ],
      };

      const { validatedResult } = validateEvidenceQuotes(mockResult, baseSession);
      const req = validatedResult.requirements[0];

      expect(req.observation).toBe('Candidate mentioned early velocity.');
      expect(req.inference).toBe('Candidate understands fast bootstrapping.');
      expect(req.confidence).toBe('medium'); // Capped to medium
      expect(req.confidenceCapped).toBe(true);
    });
  });

  describe('runSessionAnalysis with failure handling and retry', () => {
    it('stores status: failed and error message when provider throws, keeping full record intact', async () => {
      class FailingProvider extends AnalysisProvider {
        constructor() {
          super({ providerId: 'failing-provider', providerKind: 'deterministic' });
        }
        async analyze() {
          throw new Error('Upstream calculation failed.');
        }
      }

      const result = await runSessionAnalysis(baseSession, new FailingProvider());
      expect(result.status).toBe('failed');
      expect(result.error).toBe('Upstream calculation failed.');
      expect(result.requirements).toEqual([]);
    });

    it('allows clean retry after failure without mutating interview session turns', async () => {
      let attempt = 0;
      class FlakyProvider extends AnalysisProvider {
        constructor() {
          super({ providerId: 'flaky-provider', providerKind: 'semantic' });
        }
        async analyze(session) {
          attempt++;
          if (attempt === 1) {
            throw new Error('Temporary gateway timeout (504)');
          }
          return {
            status: 'complete',
            providerId: 'flaky-provider',
            providerKind: 'semantic',
            generatedAt: new Date().toISOString(),
            requirements: [
              {
                requirementId: 'req-arch',
                status: 'Demonstrated',
                quotes: ['event-driven microservices for decoupled scale'],
              },
            ],
          };
        }
      }

      const provider = new FlakyProvider();

      // First run: fails
      const failedResult = await runSessionAnalysis(baseSession, provider);
      expect(failedResult.status).toBe('failed');
      expect(failedResult.error).toContain('Temporary gateway timeout');

      // The original session turns are unchanged
      expect(baseSession.turns.length).toBe(2);
      expect(baseSession.turns[0].answer.finalText).toContain('event-driven microservices');

      // Second run (retry): succeeds without altering interview data
      const retryResult = await runSessionAnalysis(baseSession, provider);
      expect(retryResult.status).toBe('complete');
      expect(retryResult.requirements[0].status).toBe('Demonstrated');
      expect(retryResult.requirements[0].quotes).toEqual([
        'event-driven microservices for decoupled scale',
      ]);
      expect(baseSession.turns.length).toBe(2);
    });
  });

  describe('Different transcripts produce different statuses via mock provider', () => {
    // NOTE: This tests the pipeline and status mapping, NOT model quality.
    class MockEvaluatorProvider extends AnalysisProvider {
      constructor() {
        super({ providerId: 'mock-evaluator', providerKind: 'semantic' });
      }
      async analyze(session) {
        const turn = session.turns[0];
        const answer = turn?.answer?.finalText || '';

        // Pipeline mapping logic based on candidate content:
        if (answer.includes('deeply familiar') || answer.includes('production systems')) {
          return {
            status: 'complete',
            providerId: 'mock-evaluator',
            providerKind: 'semantic',
            generatedAt: new Date().toISOString(),
            requirements: [
              {
                requirementId: 'req-arch',
                status: 'Demonstrated',
                quotes: ['production systems'],
              },
            ],
          };
        } else {
          return {
            status: 'complete',
            providerId: 'mock-evaluator',
            providerKind: 'semantic',
            generatedAt: new Date().toISOString(),
            requirements: [
              {
                requirementId: 'req-arch',
                status: 'Insufficient evidence',
                quotes: [],
                missingEvidence: 'Answer did not describe practical experience.',
              },
            ],
          };
        }
      }
    }

    it('evaluates comprehensive transcript to Demonstrated and brief transcript to Insufficient evidence', async () => {
      const provider = new MockEvaluatorProvider();

      const strongSession = {
        ...baseSession,
        turns: [
          {
            id: 't-strong',
            questionId: 'q1',
            text: 'Describe architecture.',
            answer: {
              finalText: 'I built production systems at scale with high availability.',
              inputMode: 'voice',
            },
            skipped: false,
          },
        ],
      };

      const weakSession = {
        ...baseSession,
        turns: [
          {
            id: 't-weak',
            questionId: 'q1',
            text: 'Describe architecture.',
            answer: {
              finalText: 'I have heard of it but never used it.',
              inputMode: 'text',
            },
            skipped: false,
          },
        ],
      };

      const strongResult = await runSessionAnalysis(strongSession, provider);
      const weakResult = await runSessionAnalysis(weakSession, provider);

      expect(strongResult.status).toBe('complete');
      expect(strongResult.requirements[0].status).toBe('Demonstrated');
      expect(strongResult.requirements[0].quotes).toEqual(['production systems']);

      expect(weakResult.status).toBe('complete');
      expect(weakResult.requirements[0].status).toBe('Insufficient evidence');
      expect(weakResult.requirements[0].quotes).toEqual([]);
      expect(weakResult.requirements[0].missingEvidence).toContain('did not describe practical experience');
    });
  });
});
