/**
 * Analysis Provider Registry and Orchestrator.
 *
 * Implements the adaptive provider boundary (Checkpoint 4):
 * - A central ProviderRegistry that maps provider IDs to factory functions.
 * - A createAnalysisProvider() factory that selects the correct provider at
 *   runtime without hard-coding the selection logic in callers.
 * - A ProviderOrchestrator that wraps runSessionAnalysis() with retry,
 *   fallback, and structured error reporting.
 *
 * Design rules (ADR-020, hard principles):
 * - No API keys, no LLM calls, no external network calls in this file.
 * - The server boundary shape is documented in src/analysis/serverBoundary.js.
 * - Deterministic provider is always available as the fallback.
 * - Future providers register themselves; no provider logic lives here.
 */

import {
  AnalysisProvider,
  DeterministicTranscriptProvider,
  runSessionAnalysis,
  RequirementAssessmentStatus,
} from './provider.js';

/* ------------------------------------------------------------------
   Provider IDs
   ------------------------------------------------------------------ */

export const PROVIDER_ID = Object.freeze({
  DETERMINISTIC: 'deterministic-transcript-v1',
  SERVER_SEMANTIC: 'server-semantic-v1', // future LLM-backed server provider
});

/* ------------------------------------------------------------------
   Provider Registry
   ------------------------------------------------------------------ */

/**
 * @typedef {object} ProviderEntry
 * @property {string} id                 Provider ID
 * @property {'deterministic'|'semantic'} kind  Provider kind
 * @property {boolean} requiresServer    True when the provider needs a backend call
 * @property {() => AnalysisProvider} factory  Factory function (no arguments)
 */

/** @type {Map<string, ProviderEntry>} */
const _registry = new Map();

/**
 * Register a provider factory.
 *
 * @param {ProviderEntry} entry
 */
export function registerProvider(entry) {
  if (!entry || !entry.id || typeof entry.factory !== 'function') {
    throw new Error('[ProviderRegistry] entry.id and entry.factory are required.');
  }
  _registry.set(entry.id, entry);
}

/**
 * Look up a registered provider entry by ID.
 *
 * @param {string} id
 * @returns {ProviderEntry | undefined}
 */
export function getProviderEntry(id) {
  return _registry.get(id);
}

/**
 * List all registered provider IDs.
 * @returns {string[]}
 */
export function listProviderIds() {
  return [..._registry.keys()];
}

// Register the built-in deterministic provider immediately
registerProvider({
  id: PROVIDER_ID.DETERMINISTIC,
  kind: 'deterministic',
  requiresServer: false,
  factory: () => new DeterministicTranscriptProvider(),
});

/* ------------------------------------------------------------------
   Provider Factory
   ------------------------------------------------------------------ */

/**
 * Create an AnalysisProvider instance by ID, falling back to the
 * deterministic provider when the requested ID is unavailable.
 *
 * @param {string} [providerId]
 * @returns {{ provider: AnalysisProvider, usedFallback: boolean, reason?: string }}
 */
export function createAnalysisProvider(providerId) {
  const id = providerId || PROVIDER_ID.DETERMINISTIC;
  const entry = _registry.get(id);

  if (entry) {
    return { provider: entry.factory(), usedFallback: false };
  }

  // Requested provider not registered — fall back gracefully
  const fallbackEntry = _registry.get(PROVIDER_ID.DETERMINISTIC);
  return {
    provider: fallbackEntry.factory(),
    usedFallback: true,
    reason: `Provider '${id}' is not registered. Falling back to ${PROVIDER_ID.DETERMINISTIC}.`,
  };
}

/* ------------------------------------------------------------------
   Orchestrator
   ------------------------------------------------------------------ */

/**
 * @typedef {object} OrchestratorResult
 * @property {object}  analysis        Final analysis object stored on the session
 * @property {string}  providerId      Provider that generated the result
 * @property {boolean} usedFallback    Whether the fallback provider was used
 * @property {number}  attemptCount    How many provider attempts were made
 * @property {string[]} warnings       Non-fatal warnings (e.g. fallback reason)
 */

/**
 * Run session analysis through the adaptive orchestrator.
 *
 * Selects the requested provider, runs analysis via runSessionAnalysis(),
 * retries once on transient failure, then falls back to the deterministic
 * provider if the primary still fails.
 *
 * @param {object} session           Versioned InterviewSession
 * @param {string} [requestedProviderId]
 * @param {object} [opts]
 * @param {boolean} [opts.allowFallback=true]  Whether to retry with deterministic on failure
 * @returns {Promise<OrchestratorResult>}
 */
export async function orchestrateAnalysis(session, requestedProviderId, opts = {}) {
  if (!session) throw new Error('[Orchestrator] session is required.');

  const allowFallback = opts.allowFallback !== false;
  const warnings = [];
  let attemptCount = 0;

  // --- Primary attempt ---
  const { provider: primary, usedFallback: primaryIsFallback, reason: fallbackReason } =
    createAnalysisProvider(requestedProviderId);

  if (primaryIsFallback && fallbackReason) {
    warnings.push(fallbackReason);
  }

  try {
    attemptCount++;
    const analysis = await runSessionAnalysis(session, primary);

    // runSessionAnalysis catches provider errors and returns {status:'failed'}.
    // Treat that as a failure so we can attempt the fallback.
    if (analysis.status === 'failed') {
      throw new Error(analysis.error || 'Provider returned a failed analysis.');
    }

    return {
      analysis,
      providerId: primary.providerId,
      usedFallback: primaryIsFallback,
      attemptCount,
      warnings,
    };
  } catch (primaryErr) {
    warnings.push(`Primary provider '${primary.providerId}' failed: ${primaryErr.message}`);

    if (!allowFallback || primaryIsFallback) {
      // Already on fallback or caller disabled fallback — return error analysis
      return {
        analysis: {
          status: 'failed',
          providerId: primary.providerId,
          providerKind: primary.providerKind || 'unknown',
          error: primaryErr.message,
          generatedAt: new Date().toISOString(),
          requirements: [],
        },
        providerId: primary.providerId,
        usedFallback: primaryIsFallback,
        attemptCount,
        warnings,
      };
    }
  }

  // --- Fallback attempt (deterministic) ---
  const fallbackEntry = _registry.get(PROVIDER_ID.DETERMINISTIC);
  const fallback = fallbackEntry.factory();
  warnings.push(`Retrying with fallback provider '${PROVIDER_ID.DETERMINISTIC}'.`);

  try {
    attemptCount++;
    const analysis = await runSessionAnalysis(session, fallback);
    return {
      analysis,
      providerId: fallback.providerId,
      usedFallback: true,
      attemptCount,
      warnings,
    };
  } catch (fallbackErr) {
    return {
      analysis: {
        status: 'failed',
        providerId: fallback.providerId,
        providerKind: 'deterministic',
        error: `Primary and fallback both failed. Last error: ${fallbackErr.message}`,
        generatedAt: new Date().toISOString(),
        requirements: [],
      },
      providerId: fallback.providerId,
      usedFallback: true,
      attemptCount,
      warnings,
    };
  }
}
