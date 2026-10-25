/**
 * CHECKPOINT 4: Adaptive orchestrator and server boundary tests.
 *
 * Covers:
 * - Provider registry: register, lookup, list
 * - createAnalysisProvider factory: known ID, unknown ID (fallback), no ID
 * - orchestrateAnalysis: success, fallback on primary failure, total failure
 * - serverBoundary: buildAnalysisRequest shape, parseAnalysisResponse, validateServerResponse
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  registerProvider,
  getProviderEntry,
  listProviderIds,
  createAnalysisProvider,
  orchestrateAnalysis,
  PROVIDER_ID,
} from '../../src/analysis/orchestrator.js';
import {
  buildAnalysisRequest,
  parseAnalysisResponse,
  validateServerResponse,
  SERVER_ANALYSIS_ENDPOINT,
} from '../../src/analysis/serverBoundary.js';
import { AnalysisProvider } from '../../src/analysis/provider.js';

/* ------------------------------------------------------------------
   Shared fixtures
   ------------------------------------------------------------------ */

const mockSession = {
  id: 'sess-orch-1',
  jobId: 'job-1',
  jobSnapshot: {
    requirements: [
      { id: 'req-1', name: 'Node.js', priority: 'required' },
      { id: 'req-2', name: 'SQL', priority: 'preferred' },
    ],
    questions: [
      { id: 'q1', text: 'Describe your Node.js experience.', requirementIds: ['req-1'] },
      { id: 'q2', text: 'How do you optimize SQL queries?', requirementIds: ['req-2'] },
    ],
  },
  turns: [
    {
      id: 't1',
      questionId: 'q1',
      kind: 'question',
      text: 'Describe your Node.js experience.',
      answer: { finalText: 'I have five years building REST APIs with Express.', answeredAt: '2026-10-25T10:00:00Z', inputMode: 'voice' },
      skipped: false,
    },
  ],
};

/* ==================================================================
   Provider Registry
   ================================================================== */
describe('CHECKPOINT 4: ProviderRegistry', () => {
  it('deterministic provider is pre-registered', () => {
    const entry = getProviderEntry(PROVIDER_ID.DETERMINISTIC);
    expect(entry).toBeDefined();
    expect(entry.kind).toBe('deterministic');
    expect(entry.requiresServer).toBe(false);
  });

  it('listProviderIds includes the deterministic provider', () => {
    expect(listProviderIds()).toContain(PROVIDER_ID.DETERMINISTIC);
  });

  it('can register a custom provider and retrieve it', () => {
    registerProvider({
      id: 'test-custom-v1',
      kind: 'deterministic',
      requiresServer: false,
      factory: () => ({ providerId: 'test-custom-v1', analyze: async () => ({ requirements: [] }) }),
    });
    const entry = getProviderEntry('test-custom-v1');
    expect(entry).toBeDefined();
    expect(entry.id).toBe('test-custom-v1');
  });

  it('throws when registering without an id', () => {
    expect(() => registerProvider({ factory: () => {} })).toThrow(/id.*required/i);
  });

  it('throws when registering without a factory function', () => {
    expect(() => registerProvider({ id: 'no-factory' })).toThrow(/factory.*required/i);
  });
});

/* ==================================================================
   createAnalysisProvider factory
   ================================================================== */
describe('CHECKPOINT 4: createAnalysisProvider()', () => {
  it('returns the deterministic provider for its known ID', () => {
    const { provider, usedFallback } = createAnalysisProvider(PROVIDER_ID.DETERMINISTIC);
    expect(usedFallback).toBe(false);
    expect(provider.providerId).toBe(PROVIDER_ID.DETERMINISTIC);
  });

  it('returns deterministic provider when no ID is supplied', () => {
    const { provider, usedFallback } = createAnalysisProvider();
    expect(usedFallback).toBe(false);
    expect(provider.providerId).toBe(PROVIDER_ID.DETERMINISTIC);
  });

  it('falls back to deterministic when an unknown ID is requested', () => {
    const { provider, usedFallback, reason } = createAnalysisProvider('unknown-provider-v99');
    expect(usedFallback).toBe(true);
    expect(provider.providerId).toBe(PROVIDER_ID.DETERMINISTIC);
    expect(reason).toMatch(/unknown-provider-v99/);
    expect(reason).toMatch(/Falling back/);
  });
});

/* ==================================================================
   orchestrateAnalysis
   ================================================================== */
describe('CHECKPOINT 4: orchestrateAnalysis()', () => {
  it('succeeds with the deterministic provider for a real session', async () => {
    const result = await orchestrateAnalysis(mockSession, PROVIDER_ID.DETERMINISTIC);
    expect(result.analysis).toBeDefined();
    expect(result.analysis.status).toBe('complete');
    expect(result.providerId).toBe(PROVIDER_ID.DETERMINISTIC);
    expect(result.usedFallback).toBe(false);
    expect(result.attemptCount).toBe(1);
    expect(result.warnings).toHaveLength(0);
  });

  it('falls back to deterministic when requested provider is unregistered', async () => {
    const result = await orchestrateAnalysis(mockSession, 'nonexistent-provider');
    expect(result.usedFallback).toBe(true);
    expect(result.providerId).toBe(PROVIDER_ID.DETERMINISTIC);
    expect(result.warnings.length).toBeGreaterThan(0);
  });

  it('falls back to deterministic when a custom provider throws', async () => {
    const FAILING_ID = 'failing-provider-v1';
    registerProvider({
      id: FAILING_ID,
      kind: 'semantic',
      requiresServer: true,
      factory: () => ({
        providerId: FAILING_ID,
        providerKind: 'semantic',
        analyze: async () => { throw new Error('Simulated network timeout'); },
      }),
    });

    const result = await orchestrateAnalysis(mockSession, FAILING_ID);
    expect(result.usedFallback).toBe(true);
    expect(result.attemptCount).toBe(2);
    expect(result.warnings.some((w) => w.includes('Simulated network timeout'))).toBe(true);
    expect(result.analysis.status).toBe('complete'); // fallback succeeded
  });

  it('returns a failed analysis when allowFallback is false and provider throws', async () => {
    const STRICT_FAILING_ID = 'strict-failing-v1';
    registerProvider({
      id: STRICT_FAILING_ID,
      kind: 'semantic',
      requiresServer: true,
      factory: () => ({
        providerId: STRICT_FAILING_ID,
        providerKind: 'semantic',
        analyze: async () => { throw new Error('Hard error'); },
      }),
    });

    const result = await orchestrateAnalysis(mockSession, STRICT_FAILING_ID, { allowFallback: false });
    expect(result.analysis.status).toBe('failed');
    expect(result.analysis.error).toMatch(/Hard error/);
    expect(result.attemptCount).toBe(1);
  });

  it('throws when session is not provided', async () => {
    await expect(orchestrateAnalysis(null)).rejects.toThrow(/session is required/);
  });
});

/* ==================================================================
   serverBoundary: buildAnalysisRequest
   ================================================================== */
describe('CHECKPOINT 4: buildAnalysisRequest()', () => {
  it('builds a correct request payload from a session', () => {
    const body = buildAnalysisRequest(mockSession);
    expect(body.sessionId).toBe('sess-orch-1');
    expect(body.jobId).toBe('job-1');
    expect(body.requirements).toHaveLength(2);
    expect(body.questions).toHaveLength(2);
    // Only answered, non-skipped turns
    expect(body.turns).toHaveLength(1);
    expect(body.turns[0].finalText).toBe('I have five years building REST APIs with Express.');
    expect(body.turns[0].questionId).toBe('q1');
  });

  it('excludes skipped turns', () => {
    const sessionWithSkip = {
      ...mockSession,
      turns: [
        ...mockSession.turns,
        { id: 't-skip', questionId: 'q2', kind: 'question', text: '...', skipped: true },
      ],
    };
    const body = buildAnalysisRequest(sessionWithSkip);
    expect(body.turns).toHaveLength(1);
  });

  it('excludes turns without finalText', () => {
    const sessionNoAnswer = {
      ...mockSession,
      turns: [
        { id: 't-no-ans', questionId: 'q2', kind: 'question', text: '...', skipped: false },
      ],
    };
    const body = buildAnalysisRequest(sessionNoAnswer);
    expect(body.turns).toHaveLength(0);
  });

  it('throws when session is null', () => {
    expect(() => buildAnalysisRequest(null)).toThrow(/session is required/);
  });

  it('does NOT include any timing, audio, or biometric data in the payload', () => {
    const body = buildAnalysisRequest(mockSession);
    // Ensure no fields that could expose sensitive information
    const bodyStr = JSON.stringify(body);
    expect(bodyStr).not.toContain('answeredAt');
    expect(bodyStr).not.toContain('inputMode');
    expect(bodyStr).not.toContain('audio');
    expect(bodyStr).not.toContain('emotion');
  });
});

/* ==================================================================
   serverBoundary: validateServerResponse
   ================================================================== */
describe('CHECKPOINT 4: validateServerResponse()', () => {
  it('validates a correct response shape', () => {
    const raw = {
      status: 'complete',
      providerId: 'server-v1',
      providerKind: 'semantic',
      generatedAt: '2026-10-25T10:00:00Z',
      requirements: [],
    };
    const { valid, errors } = validateServerResponse(raw);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('rejects an invalid status value', () => {
    const { valid, errors } = validateServerResponse({
      status: 'unknown',
      providerId: 'p1',
      providerKind: 'semantic',
      generatedAt: '2026-10-25T10:00:00Z',
      requirements: [],
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('status'))).toBe(true);
  });

  it('rejects when requirements is not an array', () => {
    const { valid, errors } = validateServerResponse({
      status: 'complete',
      providerId: 'p1',
      providerKind: 'semantic',
      generatedAt: '2026-10-25T10:00:00Z',
      requirements: 'not-array',
    });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('requirements'))).toBe(true);
  });

  it('rejects null response', () => {
    const { valid } = validateServerResponse(null);
    expect(valid).toBe(false);
  });
});

/* ==================================================================
   serverBoundary: parseAnalysisResponse
   ================================================================== */
describe('CHECKPOINT 4: parseAnalysisResponse()', () => {
  it('normalizes a valid response', () => {
    const raw = {
      status: 'complete',
      providerId: 'server-v1',
      providerKind: 'semantic',
      generatedAt: '2026-10-25T10:00:00Z',
      requirements: [
        {
          requirementId: 'req-1',
          requirementName: 'Node.js',
          priority: 'required',
          status: 'Demonstrated',
          quotes: ['I have five years building REST APIs with Express.'],
        },
      ],
    };
    const result = parseAnalysisResponse(raw, mockSession);
    expect(result.status).toBe('complete');
    expect(result.requirements).toHaveLength(1);
    expect(result.requirements[0].quotes).toHaveLength(1);
  });

  it('throws for a non-object response', () => {
    expect(() => parseAnalysisResponse('bad', mockSession)).toThrow(/non-object/);
  });

  it('throws for an invalid status', () => {
    expect(() => parseAnalysisResponse({ status: 'bad', providerId: 'p', providerKind: 'k', generatedAt: 'g', requirements: [] }, mockSession))
      .toThrow(/Invalid status/);
  });

  it('throws when requirements is not an array', () => {
    expect(() => parseAnalysisResponse({ status: 'complete', providerId: 'p', providerKind: 'k', generatedAt: 'g', requirements: {} }, mockSession))
      .toThrow(/requirements must be an array/);
  });
});

describe('CHECKPOINT 4: SERVER_ANALYSIS_ENDPOINT', () => {
  it('is a string starting with /api/', () => {
    expect(typeof SERVER_ANALYSIS_ENDPOINT).toBe('string');
    expect(SERVER_ANALYSIS_ENDPOINT.startsWith('/api/')).toBe(true);
  });
});
