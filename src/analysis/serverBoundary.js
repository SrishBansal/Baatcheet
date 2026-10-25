/**
 * Analysis Server Boundary Contract.
 *
 * Defines the request/response shapes for the future server-backed semantic
 * analysis provider. No network calls are made here; this is a contract document
 * and a validator for future implementors.
 *
 * SERVER BOUNDARY RULES (hard principles):
 * - API keys and model credentials MUST NEVER appear in this file or any
 *   file imported by the frontend bundle.
 * - The frontend only sends anonymized session data (transcript text, requirement
 *   names, question text). No PII, no candidate biometrics.
 * - The server response must be validated by validateEvidenceQuotes() before
 *   being stored (see src/analysis/provider.js).
 * - If the server is unavailable, the orchestrator falls back to the
 *   DeterministicTranscriptProvider (see src/analysis/orchestrator.js).
 *
 * FUTURE IMPLEMENTATION NOTE:
 * When the server provider is ready, implement a class extending AnalysisProvider:
 *
 *   import { AnalysisProvider } from './provider.js';
 *   import { SERVER_ANALYSIS_ENDPOINT, buildAnalysisRequest, parseAnalysisResponse } from './serverBoundary.js';
 *
 *   export class ServerSemanticProvider extends AnalysisProvider {
 *     async analyze(session) {
 *       const body = buildAnalysisRequest(session);
 *       const res = await fetch(SERVER_ANALYSIS_ENDPOINT, {
 *         method: 'POST',
 *         headers: { 'Content-Type': 'application/json' },
 *         body: JSON.stringify(body),
 *       });
 *       if (!res.ok) throw new Error(`Server analysis failed: ${res.status}`);
 *       return parseAnalysisResponse(await res.json(), session);
 *     }
 *   }
 */

/**
 * The API endpoint the frontend calls for server-backed semantic analysis.
 * The server routes this to the configured LLM provider.
 * No credentials are sent from the frontend.
 */
export const SERVER_ANALYSIS_ENDPOINT = '/api/analysis/session';

/**
 * Build the analysis request body from a session record.
 * Only transcript content (verbatim text) and structured metadata are included.
 * No biometric data, no audio recordings, no inferred personality.
 *
 * @param {object} session - Versioned InterviewSession
 * @returns {object} Request payload safe to send to the analysis server
 */
export function buildAnalysisRequest(session) {
  if (!session) throw new Error('[serverBoundary] session is required.');

  const requirements = (session.jobSnapshot?.requirements || []).map((r) => ({
    id: r.id,
    name: r.name,
    priority: r.priority || 'required',
  }));

  const questions = (session.jobSnapshot?.questions || []).map((q) => ({
    id: q.id,
    text: q.text,
    requirementIds: q.requirementIds || [],
  }));

  // Only finalized answer text is sent — no interim results, no audio, no timing data
  const turns = (session.turns || [])
    .filter((t) => t.answer?.finalText && !t.skipped)
    .map((t) => ({
      questionId: t.questionId,
      kind: t.kind,
      finalText: t.answer.finalText,
    }));

  return {
    sessionId: session.id,
    jobId: session.jobId,
    requirements,
    questions,
    turns,
  };
}

/**
 * @typedef {object} ServerAnalysisResponseRequirement
 * @property {string}   requirementId
 * @property {string}   requirementName
 * @property {string}   priority          'required' | 'preferred'
 * @property {string}   status            RequirementAssessmentStatus value
 * @property {string[]} quotes            Exact substrings from candidate answers
 * @property {string}   [notes]           Optional free-text explanation
 */

/**
 * @typedef {object} ServerAnalysisResponse
 * @property {'complete'|'partial'|'failed'} status
 * @property {string}                         providerId
 * @property {string}                         providerKind
 * @property {string}                         generatedAt  ISO 8601
 * @property {ServerAnalysisResponseRequirement[]} requirements
 * @property {string}                         [error]
 */

/**
 * Parse and normalize a server analysis response into the internal AnalysisResult shape.
 * Throws if the response is structurally invalid.
 *
 * @param {object} raw - Raw JSON response from the server
 * @param {object} session - Original session (used for evidence validation)
 * @returns {object} Normalized AnalysisResult
 */
export function parseAnalysisResponse(raw, session) {
  if (!raw || typeof raw !== 'object') {
    throw new Error('[serverBoundary] Server returned a non-object response.');
  }

  const status = raw.status;
  if (!['complete', 'partial', 'failed'].includes(status)) {
    throw new Error(
      `[serverBoundary] Invalid status in server response: '${status}'. Expected complete|partial|failed.`
    );
  }

  if (!raw.providerId || !raw.providerKind || !raw.generatedAt) {
    throw new Error(
      '[serverBoundary] Server response missing required fields: providerId, providerKind, generatedAt.'
    );
  }

  if (!Array.isArray(raw.requirements)) {
    throw new Error('[serverBoundary] Server response.requirements must be an array.');
  }

  // Normalize requirements — enforce non-null arrays
  const requirements = raw.requirements.map((r) => ({
    requirementId: r.requirementId || '',
    requirementName: r.requirementName || '',
    priority: r.priority || 'required',
    status: r.status || 'Not assessed',
    quotes: Array.isArray(r.quotes) ? r.quotes : [],
    ...(r.notes ? { notes: r.notes } : {}),
  }));

  return {
    status,
    providerId: raw.providerId,
    providerKind: raw.providerKind,
    generatedAt: raw.generatedAt,
    requirements,
    ...(raw.error ? { error: raw.error } : {}),
  };
}

/**
 * Validate that a server response shape conforms to the contract.
 * Returns structured errors instead of throwing (suitable for unit tests and diagnostics).
 *
 * @param {object} raw
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateServerResponse(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['Response is not an object.'] };
  }
  if (!['complete', 'partial', 'failed'].includes(raw.status)) {
    errors.push(`status must be complete|partial|failed, got: ${raw.status}`);
  }
  if (!raw.providerId) errors.push('Missing required field: providerId');
  if (!raw.providerKind) errors.push('Missing required field: providerKind');
  if (!raw.generatedAt) errors.push('Missing required field: generatedAt');
  if (!Array.isArray(raw.requirements)) {
    errors.push('requirements must be an array');
  }
  return { valid: errors.length === 0, errors };
}
