/**
 * Interview Session Domain Model and Persistence Adapter.
 *
 * Implements versioned InterviewSession schema with incremental persistence,
 * schema versioning, formal migration chain, and corruption handling.
 *
 * Migration chain:
 *   v0 (unversioned prototypes) → v1: add schemaVersion field, keep data intact.
 *   v1 → v2: add reasoning, turn.decision, turn.parentTurnId, turn.requirementIds,
 *             analysis.contradictions.
 */

import { generateId } from '../utils/id.js';

export const SESSION_SCHEMA_VERSION = 2;
const SUPPORTED_VERSIONS = new Set([1, 2]);

const STORAGE_KEY = 'hirepilot:sessions';

/**
 * Valid session statuses
 */
export const SessionStatus = {
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  ABORTED: 'aborted',
};

/**
 * Valid analysis statuses
 */
export const AnalysisStatus = {
  NOT_REQUESTED: 'not_requested',
  PENDING: 'pending',
  COMPLETE: 'complete',
  FAILED: 'failed',
  UNAVAILABLE: 'unavailable',
};

/**
 * Factory for creating a new, properly structured InterviewSession.
 *
 * @param {object} params
 * @param {string} params.id
 * @param {object} params.job - Job object to snapshot
 * @returns {object} InterviewSession
 */
export function createSessionRecord({ id, job }) {
  if (!id) throw new Error('[SessionRecord] id is required.');
  if (!job) throw new Error('[SessionRecord] job is required.');

  // Normalize requirements snapshot from job skills
  const requirements = (job.skills || []).map((s) => ({
    id: s.id,
    name: s.name,
    priority: s.priority || 'required',
  }));

  const jobSnapshot = {
    title: job.title || 'Untitled Role',
    description: job.description || '',
    requirements,
    questions: (job.questions || []).map((q) => ({
      id: q.id,
      text: q.text,
      category: q.category || 'general',
      order: q.order ?? 0,
      maxFollowUps: q.maxFollowUps ?? 1,
      requirementIds: q.requirementIds || q.relatedSkills || [],
    })),
    criteria: (job.criteria || []).map((c) => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      relatedSkills: c.relatedSkills || [],
    })),
  };

  return {
    schemaVersion: SESSION_SCHEMA_VERSION,
    id,
    jobId: job.id,
    jobSnapshot,
    status: SessionStatus.IN_PROGRESS,
    outcome: 'undecided',
    outcomeAt: null,
    startedAt: new Date().toISOString(),
    endedAt: null,
    turns: [],
    analysis: {
      status: AnalysisStatus.NOT_REQUESTED,
      providerId: 'deterministic-transcript-v1',
      providerKind: 'deterministic',
      requirements: [],
      contradictions: [],
    },
    reasoning: {
      providerId: 'none',
      providerKind: 'deterministic',
    },
  };
}

/**
 * Validates that a session record has all mandatory top-level fields.
 *
 * @param {object} record
 * @returns {{ valid: boolean, errors: string[] }}
 */
export function validateSessionRecord(record) {
  const errors = [];
  if (!record || typeof record !== 'object') {
    return { valid: false, errors: ['Record is not an object.'] };
  }
  if (!record.id) errors.push('Missing required field: id');
  if (!record.jobId) errors.push('Missing required field: jobId');
  if (!record.status) errors.push('Missing required field: status');
  if (!Array.isArray(record.turns)) errors.push('Field "turns" must be an array');
  return { valid: errors.length === 0, errors };
}

/**
 * Attempt to migrate a session record from an older schema version to the
 * current SESSION_SCHEMA_VERSION. Returns a new record object on success or
 * throws an Error with a human-readable reason if migration is not possible.
 *
 * Migration chain:
 *   v0 (undefined / prototype) → v1: stamp schemaVersion; data shape is unchanged.
 *   v1 → v2: add reasoning, turn.decision, turn.parentTurnId, turn.requirementIds,
 *             analysis.contradictions.
 *
 * @param {object} record
 * @returns {object} Migrated record at SESSION_SCHEMA_VERSION
 */
export function migrateSession(record) {
  if (!record || typeof record !== 'object') {
    throw new Error('Cannot migrate: record is not an object.');
  }

  let current = record;
  let version = current.schemaVersion;

  // Already current
  if (version === SESSION_SCHEMA_VERSION) {
    current.outcome ??= 'undecided';
    current.outcomeAt ??= null;
    return current;
  }

  // v0 → v1: unversioned prototype sessions — stamp the version, keep all data
  if (version === undefined || version === null) {
    if (current.status && Array.isArray(current.turns)) {
      current = { ...current, schemaVersion: 1 };
      version = 1;
    } else {
      throw new Error(
        'Cannot migrate unversioned record: missing required fields (status, turns).'
      );
    }
  }

  // v1 → v2: add reasoning, contradictions, and turn fields
  if (version === 1) {
    const migratedTurns = (current.turns || []).map((t) => ({
      decision: null,
      parentTurnId: null,
      requirementIds: [],
      ...t,
    }));
    const migratedAnalysis = {
      ...current.analysis,
      contradictions: current.analysis?.contradictions ?? [],
    };
    current = {
      ...current,
      schemaVersion: 2,
      turns: migratedTurns,
      analysis: migratedAnalysis,
      reasoning: current.reasoning ?? { providerId: 'none', providerKind: 'deterministic' },
      outcome: current.outcome ?? 'undecided',
      outcomeAt: current.outcomeAt ?? null,
    };
    version = 2;
  }

  if (version === SESSION_SCHEMA_VERSION) {
    return current;
  }

  throw new Error(
    `Unsupported schema version: ${version} (expected ${SESSION_SCHEMA_VERSION}).`
  );
}

/**
 * Factory for creating a validated session turn.
 * Followup turns strictly require a rationale.
 *
 * @param {object} params
 * @returns {object} Turn
 */
export function createTurn({
  id = generateId('turn'),
  questionId,
  kind = 'question',
  text,
  rationale,
  askedAt = new Date().toISOString(),
  answer,
  skipped = false,
  action,
  requirement,
  questionIndex,
  decision = null,
}) {
  if (!questionId) throw new Error('[SessionTurn] questionId is required.');
  if (kind !== 'question' && kind !== 'followup' && kind !== 'closing') {
    throw new Error(`[SessionTurn] Invalid kind: ${kind}. Must be 'question', 'followup', or 'closing'.`);
  }
  if (typeof text !== 'string' || !text.trim()) {
    throw new Error('[SessionTurn] text is required.');
  }
  if (kind === 'followup' && (!rationale || !String(rationale).trim())) {
    throw new Error('[SessionTurn] Rationale is required for follow-up turns.');
  }

  let formattedAnswer;
  if (answer && answer.finalText) {
    formattedAnswer = {
      finalText: String(answer.finalText),
      answeredAt: answer.answeredAt || new Date().toISOString(),
      inputMode: answer.inputMode === 'voice' ? 'voice' : 'text',
    };
  }

  return {
    id,
    questionId,
    kind,
    text: text.trim(),
    ...(kind === 'followup' || rationale ? { rationale: String(rationale || '').trim() } : {}),
    ...(action ? { action } : {}),
    ...(requirement !== undefined ? { requirement } : {}),
    ...(questionIndex !== undefined ? { questionIndex } : {}),
    askedAt,
    decision,
    parentTurnId: null,
    requirementIds: [],
    ...(formattedAnswer ? { answer: formattedAnswer } : {}),
    skipped: Boolean(skipped),
  };
}

/**
 * Interview Session Storage Interface with schema versioning and error reporting.
 */
export const sessionStore = {
  /**
   * Read raw storage array safely with error surfacing.
   * @private
   */
  _readRaw() {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) {
        throw new Error('Storage key contains non-array JSON data');
      }
      return parsed;
    } catch (err) {
      console.error(`[sessionStore] Failed to read ${STORAGE_KEY}:`, err);
      throw new Error(`Corrupted session storage: ${err.message}`);
    }
  },

  /**
   * Write items to storage.
   * @private
   */
  _writeRaw(items) {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      console.error(`[sessionStore] Failed to write ${STORAGE_KEY}:`, err);
      throw new Error(`Failed to save session data to localStorage: ${err.message}`);
    }
  },

  /**
   * Retrieve all valid sessions. Invalid/unreadable items surface errors.
   * @returns {{ sessions: object[], errors: Array<{ id?: string, error: string }> }}
   */
  getAllWithStatus() {
    let rawItems = [];
    const errors = [];
    try {
      rawItems = this._readRaw();
    } catch (err) {
      return { sessions: [], errors: [{ error: err.message }] };
    }

    const validSessions = [];
    for (const item of rawItems) {
      if (!item || typeof item !== 'object') {
        errors.push({ error: 'Null or non-object item found in session storage' });
        continue;
      }
      if (!item.id) {
        errors.push({ error: 'Session record missing required "id"' });
        continue;
      }

      // Schema migration path
      if (item.schemaVersion !== SESSION_SCHEMA_VERSION) {
        try {
          const migrated = migrateSession(item);
          validSessions.push(migrated);
        } catch (migErr) {
          errors.push({
            id: item.id,
            error: migErr.message,
          });
        }
        continue;
      }

      validSessions.push(item);
    }

    return { sessions: validSessions, errors };
  },

  /**
   * Get all readable sessions.
   * @returns {object[]}
   */
  getAll() {
    const { sessions } = this.getAllWithStatus();
    return sessions;
  },

  /**
   * Retrieve session by ID. Throws on corrupt specific session.
   * @param {string} id
   * @returns {object | null}
   */
  getById(id) {
    if (!id) return null;
    const { sessions, errors } = this.getAllWithStatus();
    const specificError = errors.find((e) => e.id === id);
    if (specificError) {
      throw new Error(`Session ${id} is unreadable: ${specificError.error}`);
    }
    return sessions.find((s) => s.id === id) || null;
  },

  /**
   * Save or update an InterviewSession incrementally.
   * @param {object} session
   * @returns {object}
   */
  save(session) {
    if (!session || !session.id) {
      throw new Error('[sessionStore] Cannot save session without an id');
    }

    session.schemaVersion = SESSION_SCHEMA_VERSION;
    let rawItems = [];
    try {
      rawItems = this._readRaw();
    } catch {
      rawItems = [];
    }

    const index = rawItems.findIndex((s) => s && s.id === session.id);

    if (index >= 0) {
      rawItems[index] = { ...session };
    } else {
      rawItems.push(session);
    }

    this._writeRaw(rawItems);
    return session;
  },

  /**
   * Remove session by ID.
   * @param {string} id
   * @returns {boolean}
   */
  remove(id) {
    let rawItems = [];
    try {
      rawItems = this._readRaw();
    } catch {
      rawItems = [];
    }
    const filtered = rawItems.filter((s) => s && s.id !== id);
    if (filtered.length === rawItems.length) return false;
    this._writeRaw(filtered);
    return true;
  },

  /**
   * Clear all sessions from storage.
   */
  clear() {
    this._writeRaw([]);
  },

  /**
   * Count of stored sessions.
   * @returns {number}
   */
  count() {
    return this.getAll().length;
  },
};
