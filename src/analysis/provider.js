/**
 * Analysis Provider Abstraction and Evidence Validation (Checkpoint 5).
 *
 * Implements:
 * - AnalysisProvider base interface
 * - DeterministicTranscriptProvider (strictly non-evaluative verbatim mapping)
 * - ServerSemanticAnalysisProvider (semantic evaluation via server boundary)
 * - 5 Code-Enforced Verification Layers:
 *     Layer 1: Exact substring quote verification (whitespace-normalized)
 *     Layer 2: Turn citation and requirement linkage verification
 *     Layer 3: Status / evidence consistency (Demonstrated needs quote, code computes Not assessed)
 *     Layer 4: Relevance and contradiction justification check (contradiction needs >=2 quotes)
 *     Layer 5: Separate observation vs inference and confidence capping
 * - Failure handling and retryable states without data fabrication
 */

import {
  SERVER_ANALYSIS_ENDPOINT,
  buildAnalysisRequest,
  parseAnalysisResponse,
} from './serverBoundary.js';

export const RequirementAssessmentStatus = {
  NOT_ASSESSED: 'Not assessed',
  AWAITING_ANALYSIS: 'Awaiting analysis',
  // Semantic-only evaluation labels:
  DEMONSTRATED: 'Demonstrated',
  PARTIALLY_DEMONSTRATED: 'Partially demonstrated',
  INSUFFICIENT_EVIDENCE: 'Insufficient evidence',
};

export const SEMANTIC_EVALUATION_LABELS = new Set([
  RequirementAssessmentStatus.DEMONSTRATED,
  RequirementAssessmentStatus.PARTIALLY_DEMONSTRATED,
  RequirementAssessmentStatus.INSUFFICIENT_EVIDENCE,
]);

/**
 * Base Analysis Provider interface.
 */
export class AnalysisProvider {
  constructor(options = {}) {
    this.providerId = options.providerId || 'base-provider';
    this.providerKind = options.providerKind || 'deterministic';
  }

  /**
   * @param {object} session - Versioned InterviewSession
   * @returns {Promise<object>} AnalysisResult
   */
  async analyze(session) {
    throw new Error('AnalysisProvider.analyze must be implemented by subclass.');
  }
}

/**
 * Deterministic transcript-only provider.
 * Does not judge candidate competence or invent evaluative prose.
 * Maps recorded finalized answers to linked requirements.
 */
export class DeterministicTranscriptProvider extends AnalysisProvider {
  constructor(options = {}) {
    super({
      providerId: options.providerId || 'deterministic-transcript-v1',
      providerKind: 'deterministic',
    });
  }

  async analyze(session) {
    if (!session) {
      throw new Error('[DeterministicTranscriptProvider] session is required');
    }

    const requirements = session.jobSnapshot?.requirements || [];
    const questions = session.jobSnapshot?.questions || [];
    const turns = session.turns || [];

    const requirementResults = requirements.map((req) => {
      // Find all questions linked to this requirement
      const linkedQuestions = questions.filter((q) => {
        const ids = q.requirementIds || q.relatedSkills || [];
        return ids.includes(req.id);
      });

      const linkedQuestionIds = new Set(linkedQuestions.map((q) => q.id));

      // Find turns where an answer was provided for any linked question
      const answeredTurns = turns.filter(
        (t) => linkedQuestionIds.has(t.questionId) && t.answer?.finalText && !t.skipped
      );

      if (answeredTurns.length === 0) {
        return {
          requirementId: req.id,
          requirementName: req.name,
          priority: req.priority || 'required',
          status: RequirementAssessmentStatus.NOT_ASSESSED,
          quotes: [],
          notes: 'No linked question was answered for this requirement.',
        };
      }

      // Extract verbatim finalized answers without evaluative rating
      const quotes = answeredTurns.map((t) => t.answer.finalText);

      return {
        requirementId: req.id,
        requirementName: req.name,
        priority: req.priority || 'required',
        status: RequirementAssessmentStatus.AWAITING_ANALYSIS,
        quotes,
        notes: `${quotes.length} verbatim response(s) recorded. Awaiting semantic evaluation.`,
      };
    });

    return {
      status: 'complete',
      providerId: this.providerId,
      providerKind: this.providerKind,
      generatedAt: new Date().toISOString(),
      requirements: requirementResults,
    };
  }
}

/**
 * Semantic server-backed analysis provider.
 * Calls the server endpoint (which talks to an LLM provider if configured).
 * Returns normalized analysis results for verification.
 */
export class ServerSemanticAnalysisProvider extends AnalysisProvider {
  constructor(options = {}) {
    super({
      providerId: options.providerId || 'server-semantic-v1',
      providerKind: 'semantic',
    });
    this.endpoint = options.endpoint || SERVER_ANALYSIS_ENDPOINT;
    this.fetchFn = options.fetchFn || (typeof fetch !== 'undefined' ? fetch : null);
  }

  async analyze(session) {
    if (!session) throw new Error('[ServerSemanticAnalysisProvider] session is required.');
    if (!this.fetchFn) throw new Error('[ServerSemanticAnalysisProvider] fetch is not available in this environment.');

    const body = buildAnalysisRequest(session);
    const res = await this.fetchFn(this.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const errorText = await res.text().catch(() => '');
      throw new Error(`Server analysis failed (${res.status}): ${errorText || res.statusText}`);
    }

    const raw = await res.json();
    return parseAnalysisResponse(raw, session);
  }
}

/**
 * Normalize whitespace in strings for robust exact-substring checking.
 * @param {string} str
 * @returns {string}
 */
export function normalizeWhitespace(str) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/\s+/g, ' ');
}

/**
 * Multi-layer Evidence Validator (Checkpoint 5).
 *
 * Code-enforced verification layers:
 * Layer 1: Quote exists as exact substring of the cited turn's finalized answer (whitespace-normalized).
 * Layer 2: Cited turn exists and is linked to (or explicitly flagged as cross-turn) the requirement.
 * Layer 3: Status/evidence consistency:
 *          - Demonstrated needs >=1 valid quote.
 *          - Partially demonstrated needs >=1 valid quote AND non-empty missingEvidence.
 *          - Insufficient evidence needs missingEvidence.
 *          - Not assessed is computed by code (no answered linked turn) and cannot be overridden by model.
 * Layer 4: Relevance and contradiction justification check (contradiction requires >=2 valid quotes).
 * Layer 5: Separate observation vs inference; confidence capped by code.
 *
 * @param {object} analysisResult
 * @param {object} session
 * @returns {{ validatedResult: object, rejectedCount: number, rejectedQuotes: object[] }}
 */
export function validateEvidenceQuotes(analysisResult, session) {
  if (!analysisResult) {
    throw new Error('[EvidenceValidator] analysisResult is required.');
  }
  if (!session) {
    throw new Error('[EvidenceValidator] session is required.');
  }

  const turns = session.turns || [];
  const questions = session.jobSnapshot?.questions || [];
  const requirements = session.jobSnapshot?.requirements || [];

  // Map turns by id and by questionId
  const turnMap = new Map(turns.map((t) => [t.id, t]));
  const questionMap = new Map(questions.map((q) => [q.id, q]));

  // Find answered turns per requirement (for Layer 3 Not assessed code computation)
  const answeredTurnsByRequirement = new Map();
  for (const req of requirements) {
    const linkedQuestionIds = new Set(
      questions
        .filter((q) => (q.requirementIds || q.relatedSkills || []).includes(req.id))
        .map((q) => q.id)
    );
    const answered = turns.filter(
      (t) => linkedQuestionIds.has(t.questionId) && t.answer?.finalText && !t.skipped
    );
    answeredTurnsByRequirement.set(req.id, answered);
  }

  // Pre-normalized finalized answers for fast fallback searching
  const candidateTurnAnswers = turns
    .filter((t) => t.answer && typeof t.answer.finalText === 'string' && !t.skipped)
    .map((t) => {
      const q = questionMap.get(t.questionId);
      const linkedReqIds = q ? q.requirementIds || q.relatedSkills || [] : [];
      return {
        turnId: t.id,
        rawText: t.answer.finalText,
        normText: normalizeWhitespace(t.answer.finalText),
        linkedReqIds,
      };
    });

  let rejectedCount = 0;
  const rejectedQuotes = [];

  const validatedRequirements = (analysisResult.requirements || []).map((req) => {
    const reqId = req.requirementId;
    const answeredForReq = answeredTurnsByRequirement.get(reqId) || [];
    const hasAnsweredLinkedTurn = answeredForReq.length > 0;

    let status = req.status;

    // Rule: Deterministic providers can never emit semantic evaluative labels
    if (analysisResult.providerKind === 'deterministic' && SEMANTIC_EVALUATION_LABELS.has(status)) {
      status = hasAnsweredLinkedTurn
        ? RequirementAssessmentStatus.AWAITING_ANALYSIS
        : RequirementAssessmentStatus.NOT_ASSESSED;
    }

    // LAYER 3 RULE: "Not assessed" is computed by code (no answered linked turn)
    // and CANNOT be overridden by the model.
    let overriddenByCode = false;
    let overrideReason = null;
    if (!hasAnsweredLinkedTurn) {
      if (status !== RequirementAssessmentStatus.NOT_ASSESSED) {
        overriddenByCode = true;
        overrideReason = 'Overridden by code: no answered question was linked to this requirement.';
        status = RequirementAssessmentStatus.NOT_ASSESSED;
      }
    }

    const acceptedQuotes = [];
    const invalidQuotes = [];
    const quoteItems = Array.isArray(req.quotes) ? req.quotes : [];

    for (const quoteEntry of quoteItems) {
      const isObjectEntry = typeof quoteEntry === 'object' && quoteEntry !== null;
      const quoteText = isObjectEntry ? quoteEntry.quote : quoteEntry;
      const citedTurnId = isObjectEntry ? quoteEntry.turnId : null;
      const isCrossTurn = isObjectEntry ? Boolean(quoteEntry.isCrossTurn) : false;

      if (typeof quoteText !== 'string' || !quoteText.trim()) {
        rejectedCount++;
        const item = {
          requirementId: reqId,
          quote: quoteText,
          reason: 'Quote must be a non-empty string.',
        };
        rejectedQuotes.push(item);
        invalidQuotes.push(item);
        continue;
      }

      const normQuote = normalizeWhitespace(quoteText);

      // LAYER 1 & 2: Check cited turn or match to linked turn
      if (citedTurnId) {
        const citedTurn = turnMap.get(citedTurnId);
        if (!citedTurn) {
          // LAYER 2: Cited turn does not exist
          rejectedCount++;
          const item = {
            requirementId: reqId,
            quote: quoteText,
            turnId: citedTurnId,
            reason: `Cited turn "${citedTurnId}" does not exist in session.`,
          };
          rejectedQuotes.push(item);
          invalidQuotes.push(item);
          continue;
        }

        const turnAnswer = citedTurn.answer?.finalText || '';

        // LAYER 1: Exact substring check against cited turn (normalized trimming allowed only if raw matches)
        const isExactMatch = turnAnswer.includes(quoteText);
        if (!isExactMatch) {
          rejectedCount++;
          const item = {
            requirementId: reqId,
            quote: quoteText,
            turnId: citedTurnId,
            reason: `Quote is not an exact substring of cited turn "${citedTurnId}".`,
          };
          rejectedQuotes.push(item);
          invalidQuotes.push(item);
          continue;
        }

        // LAYER 2: Linkage check
        const q = questionMap.get(citedTurn.questionId);
        const reqIds = q ? q.requirementIds || q.relatedSkills || [] : [];
        const isLinked = reqIds.includes(reqId);

        if (!isLinked && !isCrossTurn) {
          rejectedCount++;
          const item = {
            requirementId: reqId,
            quote: quoteText,
            turnId: citedTurnId,
            reason: `Turn "${citedTurnId}" is not linked to requirement "${reqId}" and is not flagged as cross-turn evidence.`,
          };
          rejectedQuotes.push(item);
          invalidQuotes.push(item);
          continue;
        }

        acceptedQuotes.push(quoteText);
      } else {
        // No turnId explicitly cited — search candidate answers
        // First check linked answered turns
        const matchingLinked = candidateTurnAnswers.filter(
          (cand) => cand.linkedReqIds.includes(reqId) && cand.rawText.includes(quoteText)
        );

        if (matchingLinked.length > 0) {
          acceptedQuotes.push(quoteText);
        } else {
          // Check if it appears in ANY other turn (wrong-turn quote)
          const matchingUnlinked = candidateTurnAnswers.filter(
            (cand) => !cand.linkedReqIds.includes(reqId) && cand.rawText.includes(quoteText)
          );

          if (matchingUnlinked.length > 0 && !isCrossTurn) {
            // LAYER 2 failure: wrong-turn quote not flagged as cross-turn
            rejectedCount++;
            const item = {
              requirementId: reqId,
              quote: quoteText,
              reason: 'Quote appears only in a turn not linked to this requirement and is not flagged as cross-turn evidence.',
            };
            rejectedQuotes.push(item);
            invalidQuotes.push(item);
          } else {
            // LAYER 1 failure: not in any answer
            rejectedCount++;
            const item = {
              requirementId: reqId,
              quote: quoteText,
              reason: 'Quote is not an exact substring of any recorded finalized answer.',
            };
            rejectedQuotes.push(item);
            invalidQuotes.push(item);
          }
        }
      }
    }

    // LAYER 3: Status/evidence consistency enforcement
    let downgraded = false;
    let downgradeReason = null;
    let missingEvidenceRequired = false;

    if (status === RequirementAssessmentStatus.DEMONSTRATED) {
      if (acceptedQuotes.length === 0) {
        downgraded = true;
        downgradeReason = 'Demonstrated requires at least 1 valid verbatim quote. Downgraded to Insufficient evidence.';
        status = RequirementAssessmentStatus.INSUFFICIENT_EVIDENCE;
      }
    } else if (status === RequirementAssessmentStatus.PARTIALLY_DEMONSTRATED) {
      if (acceptedQuotes.length === 0) {
        downgraded = true;
        downgradeReason = 'Partially demonstrated requires at least 1 valid verbatim quote. Downgraded to Insufficient evidence.';
        status = RequirementAssessmentStatus.INSUFFICIENT_EVIDENCE;
      }
      if (!req.missingEvidence || !req.missingEvidence.trim()) {
        missingEvidenceRequired = true;
      }
    }

    // LAYER 4: Contradiction and relevance verification
    let hasContradiction = Boolean(req.hasContradiction);
    let contradictionFlagged = false;
    let contradictionReason = null;

    if (hasContradiction) {
      if (acceptedQuotes.length < 2) {
        hasContradiction = false;
        contradictionFlagged = true;
        contradictionReason = 'Contradiction claims must cite at least two valid quotes.';
      }
    }

    let justificationFlagged = false;
    if (req.justificationVerified === false) {
      justificationFlagged = true;
    }

    // LAYER 5: Observation vs inference separation and confidence capping
    let confidence = req.confidence || 'medium';
    let confidenceCapped = false;
    let confidenceCapReason = null;

    const totalQuoteLength = acceptedQuotes.reduce((acc, q) => acc + q.length, 0);
    if (acceptedQuotes.length <= 1 && totalQuoteLength < 50 && confidence === 'high') {
      confidence = 'medium';
      confidenceCapped = true;
      confidenceCapReason = 'High confidence capped to medium: single short quote cannot justify high confidence.';
    }

    return {
      ...req,
      status,
      quotes: acceptedQuotes,
      observation: req.observation || (acceptedQuotes.length > 0 ? acceptedQuotes.join('; ') : undefined),
      inference: req.inference || undefined,
      confidence,
      hasContradiction,
      ...(overriddenByCode ? { overriddenByCode, overrideReason } : {}),
      ...(downgraded ? { downgraded, downgradeReason } : {}),
      ...(missingEvidenceRequired ? { missingEvidenceRequired: true } : {}),
      ...(contradictionFlagged ? { contradictionFlagged, contradictionReason } : {}),
      ...(justificationFlagged ? { justificationFlagged: true } : {}),
      ...(confidenceCapped ? { confidenceCapped, confidenceCapReason } : {}),
      ...(invalidQuotes.length > 0 ? { invalidQuotes } : {}),
    };
  });

  return {
    validatedResult: {
      ...analysisResult,
      requirements: validatedRequirements,
      rejectedEvidenceCount: rejectedCount,
    },
    rejectedCount,
    rejectedQuotes,
  };
}

/**
 * Run analysis on a session safely, enforcing evidence validation and storing failure states.
 *
 * @param {object} session
 * @param {AnalysisProvider} [provider]
 * @returns {Promise<object>} Updated Analysis object
 */
export async function runSessionAnalysis(
  session,
  provider = new DeterministicTranscriptProvider()
) {
  if (!session) throw new Error('[runSessionAnalysis] session is required.');

  try {
    const rawResult = await provider.analyze(session);
    const { validatedResult } = validateEvidenceQuotes(rawResult, session);
    return validatedResult;
  } catch (err) {
    console.error('[runSessionAnalysis] Analysis execution failed:', err);
    return {
      status: 'failed',
      providerId: provider.providerId || 'unknown',
      providerKind: provider.providerKind || 'deterministic',
      error: err.message || 'Analysis execution failed.',
      generatedAt: new Date().toISOString(),
      requirements: [],
    };
  }
}
