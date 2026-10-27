/**
 * Adaptive Reasoners for Baatcheet.
 * Implements GeminiReasoner with client timeout and strict validation,
 * with graceful fallback to DeterministicReasoner.
 */

export function validateReasoningDecision(decision, { candidateAnswer = '', currentQuestion = '' } = {}) {
  if (!decision || typeof decision !== 'object') {
    return { valid: false, reason: 'Decision is not an object' };
  }

  const validActions = ['ADVANCE', 'ASK_FOLLOW_UP', 'END'];
  if (!validActions.includes(decision.action)) {
    return { valid: false, reason: `Invalid action: ${decision.action}` };
  }

  if (decision.action === 'ASK_FOLLOW_UP') {
    if (!decision.followUpQuestion || typeof decision.followUpQuestion !== 'string') {
      return { valid: false, reason: 'Missing followUpQuestion' };
    }
    const q = decision.followUpQuestion.trim();
    if (q.length === 0 || q.length > 220) {
      return { valid: false, reason: `followUpQuestion length (${q.length}) outside 1-220 chars` };
    }
    const questionMarks = (q.match(/\?/g) || []).length;
    if (questionMarks > 1) {
      return { valid: false, reason: `followUpQuestion contains ${questionMarks} question marks (max 1 allowed)` };
    }

    // Token overlap check: ensure follow-up is contextually tied to candidate answer or question
    const STOP_WORDS = new Set([
      'and', 'the', 'for', 'with', 'that', 'this', 'from', 'are', 'was', 'were',
      'have', 'has', 'had', 'you', 'your', 'about', 'can', 'could', 'what', 'how', 'tell', 'our', 'all'
    ]);
    const contextTokens = new Set(
      `${candidateAnswer} ${currentQuestion}`
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 3 && !STOP_WORDS.has(t))
    );
    const followUpTokens = q
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((t) => t.length >= 3 && !STOP_WORDS.has(t));

    const hasOverlap = followUpTokens.some((t) => contextTokens.has(t));
    const isElaboration = /\b(elaborate|example|clarify|detail|explain|more|specific)\b/i.test(q);
    if (!hasOverlap && !isElaboration && contextTokens.size > 0) {
      return { valid: false, reason: 'followUpQuestion lacks token overlap with context' };
    }
  }

  if (decision.acknowledgement && typeof decision.acknowledgement === 'string') {
    const ackWords = decision.acknowledgement.trim().split(/\s+/).filter(Boolean);
    if (ackWords.length > 10) {
      return { valid: false, reason: `Acknowledgement exceeds 10 words (${ackWords.length})` };
    }
    const nonNeutralRegex = /\b(terrible|horrible|awful|amazing|genius|incredible|worst|failure)\b/i;
    if (nonNeutralRegex.test(decision.acknowledgement)) {
      return { valid: false, reason: 'Acknowledgement contains non-neutral tone' };
    }
  }

  return { valid: true };
}

export class DeterministicReasoner {
  constructor() {
    this.providerKind = 'deterministic';
    this.providerId = 'deterministic-fallback';
  }

  reason({ candidateAnswer = '', followUpCount = 0 } = {}) {
    const words = (candidateAnswer || '').trim().split(/\s+/).filter(Boolean);
    if (followUpCount === 0 && words.length < 12) {
      return {
        action: 'ASK_FOLLOW_UP',
        followUpQuestion: 'Could you elaborate on that with a concrete example or more detail?',
        acknowledgement: 'Thanks.',
        reasoning: 'Candidate answer had fewer than 12 words; requested clarification.',
        providerId: this.providerId,
        providerKind: this.providerKind,
      };
    }

    return {
      action: 'ADVANCE',
      followUpQuestion: null,
      acknowledgement: 'Understood.',
      reasoning: 'Candidate provided sufficient initial detail.',
      providerId: this.providerId,
      providerKind: this.providerKind,
    };
  }
}

export class GeminiReasoner {
  constructor({ baseUrl = '', fallback = new DeterministicReasoner() } = {}) {
    this.providerKind = 'gemini';
    this.providerId = 'gemini-1.5-flash';
    this.baseUrl = baseUrl;
    this.fallback = fallback;
  }

  async reason(params = {}) {
    const {
      jobTitle,
      requirements,
      currentQuestion,
      candidateAnswer,
      history,
      followUpCount = 0,
      globalFollowUpCount = 0,
    } = params;

    // Hard caps enforced before network call
    if (followUpCount >= 1 || globalFollowUpCount >= 8) {
      return {
        action: 'ADVANCE',
        followUpQuestion: null,
        acknowledgement: 'Understood.',
        reasoning: 'Follow-up cap reached; advancing to next question.',
        providerId: this.providerId,
        providerKind: this.providerKind,
      };
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);

    try {
      const response = await fetch(`${this.baseUrl}/api/reason`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobTitle,
          requirements,
          currentQuestion,
          candidateAnswer,
          history,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeout);

      if (!response.ok) {
        throw new Error(`Server returned HTTP ${response.status}`);
      }

      const json = await response.json();
      if (!json?.ok || !json?.data) {
        throw new Error(json?.error || 'Invalid API response format');
      }

      const decision = json.data;
      const validation = validateReasoningDecision(decision, { candidateAnswer, currentQuestion });
      if (!validation.valid) {
        console.warn(`[GeminiReasoner] Validation failed: ${validation.reason}. Falling back to deterministic.`);
        return await this.fallback.reason(params);
      }

      return {
        action: decision.action,
        followUpQuestion: decision.action === 'ASK_FOLLOW_UP' ? (decision.followUpQuestion || '').trim() : null,
        acknowledgement: decision.acknowledgement ? decision.acknowledgement.trim() : null,
        reasoning: decision.reasoning || '',
        providerId: this.providerId,
        providerKind: this.providerKind,
      };
    } catch (err) {
      clearTimeout(timeout);
      console.warn(`[GeminiReasoner] Call failed (${err.message}). Using deterministic fallback.`);
      return await this.fallback.reason(params);
    }
  }
}
