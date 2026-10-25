/**
 * Evidence-backed Report Data Computation.
 *
 * Derives all observable, verifiable facts from a stored InterviewSession.
 * This module is intentionally pure: no side effects, no rendering, no network.
 *
 * HARD PRINCIPLES enforced here:
 * - No fabricated data. All derived values come directly from stored turns.
 * - Missing / unanswered ≠ negative. Not-assessed requirements are surfaced
 *   as coverage gaps, never as candidate deficiencies.
 * - Evidence quotes are accepted only if present in the stored analysis;
 *   this function does not generate or infer any quotes.
 * - inputMode (voice vs. text) is never used to infer quality or effort.
 */

/**
 * @typedef {object} RequirementReport
 * @property {string}   id
 * @property {string}   name
 * @property {string}   priority
 * @property {string}   status         AssessmentStatus value
 * @property {string[]} quotes         Verbatim evidence quotes (exact substrings of recorded answers)
 * @property {string}   [notes]        Optional analysis notes
 * @property {boolean}  isAssessed     Whether the requirement was assessed (not 'Not assessed')
 */

/**
 * @typedef {object} TranscriptTurnReport
 * @property {string}   id
 * @property {number}   index          1-based display index
 * @property {string}   questionId
 * @property {'question'|'followup'} kind
 * @property {string}   text           Question prompt
 * @property {string}   [rationale]    Rationale for follow-up turns
 * @property {boolean}  isSkipped
 * @property {boolean}  hasAnswer
 * @property {string}   [finalText]    Recorded candidate answer
 * @property {string}   [inputMode]    'voice' | 'text'
 * @property {string}   [askedAt]      ISO 8601
 * @property {string}   [answeredAt]   ISO 8601
 * @property {boolean}  isMapped       Whether the question is linked to at least one requirement
 */

/**
 * @typedef {object} ReportData
 * @property {string}   sessionId
 * @property {string}   jobId
 * @property {string}   jobTitle
 * @property {string}   sessionStatus
 * @property {string}   [startedAt]
 * @property {string}   [endedAt]
 * @property {string}   durationText             Human-readable duration or 'N/A'
 * @property {number}   questionsAskedCount      Total turns in session
 * @property {number}   questionsAnsweredCount   Turns with non-empty finalText and not skipped
 * @property {number}   questionsSkippedCount    Turns explicitly skipped
 * @property {number}   requirementsTotal        Count from jobSnapshot
 * @property {number}   requirementsCoveredCount Requirements where status !== 'Not assessed'
 * @property {RequirementReport[]}      requirementReports  Per-requirement evidence summaries
 * @property {TranscriptTurnReport[]}   transcriptTurns     All turns in order
 * @property {RequirementReport[]}      notAssessedRequirements  Requirements with no coverage
 * @property {TranscriptTurnReport[]}   unmappedTurns       Turns with no requirementId linkage
 * @property {object}   analysisStatus  Raw analysis.status string
 * @property {string}   [analysisError] Analysis error message, if analysis failed
 * @property {string}   analysisProviderKind  'deterministic' | 'semantic' | 'unknown'
 * @property {string}   analysisProviderId
 * @property {number}   rejectedEvidenceCount Count of evidence quotes excluded by validator
 */

/**
 * Derive all report data from a stored InterviewSession.
 * Pure function — safe to unit test, safe to memoize.
 *
 * @param {object} session - Versioned InterviewSession
 * @returns {ReportData}
 */
export function computeReportData(session) {
  if (!session || typeof session !== 'object') {
    throw new Error('[computeReportData] session is required and must be an object.');
  }

  const { jobSnapshot = {}, turns = [], analysis = {} } = session;
  const requirements = jobSnapshot.requirements || [];
  const questions = jobSnapshot.questions || [];

  // ---- Turn aggregates (objective counts only) ----
  const questionsAskedCount = turns.length;
  const questionsAnsweredCount = turns.filter(
    (t) => t.answer?.finalText && !t.skipped
  ).length;
  const questionsSkippedCount = turns.filter((t) => t.skipped).length;

  // ---- Duration ----
  const durationText = _computeDuration(session.startedAt, session.endedAt);

  // ---- Requirement reports ----
  const analysisRequirements = analysis.requirements || [];

  const requirementReports = requirements.map((req) => {
    const analysisReq = analysisRequirements.find((r) => r.requirementId === req.id);
    const status = analysisReq?.status || 'Not assessed';
    const quotes = Array.isArray(analysisReq?.quotes) ? analysisReq.quotes : [];
    const isAssessed = status !== 'Not assessed';

    return {
      id: req.id,
      name: req.name,
      priority: req.priority || 'required',
      status,
      quotes,
      ...(analysisReq?.notes ? { notes: analysisReq.notes } : {}),
      isAssessed,
    };
  });

  const requirementsCoveredCount = requirementReports.filter((r) => r.isAssessed).length;
  const notAssessedRequirements = requirementReports.filter((r) => !r.isAssessed);

  // ---- Transcript turns ----
  // Build a fast lookup: questionId → requirementIds
  const questionRequirementsMap = new Map(
    questions.map((q) => [q.id, q.requirementIds || q.relatedSkills || []])
  );

  const transcriptTurns = turns.map((turn, idx) => {
    const reqIds = questionRequirementsMap.get(turn.questionId) || [];
    return {
      id: turn.id,
      index: idx + 1,
      questionId: turn.questionId,
      kind: turn.kind || 'question',
      text: turn.text || '',
      ...(turn.rationale ? { rationale: turn.rationale } : {}),
      isSkipped: Boolean(turn.skipped),
      hasAnswer: Boolean(turn.answer?.finalText) && !turn.skipped,
      ...(turn.answer?.finalText ? { finalText: turn.answer.finalText } : {}),
      ...(turn.answer?.inputMode ? { inputMode: turn.answer.inputMode } : {}),
      ...(turn.askedAt ? { askedAt: turn.askedAt } : {}),
      ...(turn.answer?.answeredAt ? { answeredAt: turn.answer.answeredAt } : {}),
      isMapped: reqIds.length > 0,
    };
  });

  const unmappedTurns = transcriptTurns.filter((t) => !t.isMapped);

  // ---- Analysis metadata ----
  const analysisStatus = analysis.status || 'not_requested';
  const analysisError = analysis.error || undefined;
  const analysisProviderKind = analysis.providerKind || 'unknown';
  const analysisProviderId = analysis.providerId || 'unknown';
  const rejectedEvidenceCount = analysis.rejectedEvidenceCount || 0;

  // ---- Summaries: demonstrated areas & material gaps ----
  const demonstratedRequirements = requirementReports.filter((r) => r.status === 'Demonstrated');
  const partiallyDemonstratedRequirements = requirementReports.filter((r) => r.status === 'Partially demonstrated');
  const insufficientEvidenceRequirements = requirementReports.filter((r) => r.status === 'Insufficient evidence');

  const limitations = [
    'Baatcheet reports are evidence summaries for human recruiter review and never constitute an automated hiring decision.',
    'No personality, emotional state, or sentiment is inferred from voice tone or delivery characteristics.',
    'Verbatim evidence quotes are code-validated exact substrings of candidate responses.',
  ];

  return {
    sessionId: session.id,
    jobId: session.jobId,
    jobTitle: jobSnapshot.title || 'Untitled Role',
    sessionStatus: session.status || 'unknown',
    startedAt: session.startedAt,
    endedAt: session.endedAt,
    durationText,
    questionsAskedCount,
    questionsAnsweredCount,
    questionsSkippedCount,
    requirementsTotal: requirements.length,
    requirementsCoveredCount,
    requirementReports,
    demonstratedRequirements,
    partiallyDemonstratedRequirements,
    insufficientEvidenceRequirements,
    transcriptTurns,
    notAssessedRequirements,
    unmappedTurns,
    limitations,
    analysisStatus,
    ...(analysisError ? { analysisError } : {}),
    analysisProviderKind,
    analysisProviderId,
    rejectedEvidenceCount,
  };
}

/**
 * Compute a human-readable session duration.
 * @param {string} [startedAt]
 * @param {string} [endedAt]
 * @returns {string}
 */
export function computeSessionDuration(startedAt, endedAt) {
  return _computeDuration(startedAt, endedAt);
}

function _computeDuration(startedAt, endedAt) {
  if (!startedAt || !endedAt) return 'N/A';
  const start = new Date(startedAt).getTime();
  const end = new Date(endedAt).getTime();
  if (isNaN(start) || isNaN(end) || end <= start) return 'N/A';
  const seconds = Math.floor((end - start) / 1000);
  const minutes = Math.floor(seconds / 60);
  const remSeconds = seconds % 60;
  return `${minutes}m ${remSeconds}s`;
}
