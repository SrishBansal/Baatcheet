import { describe, it, expect, beforeEach } from 'vitest';
import {
  sessionStore,
  createSessionRecord,
  createTurn,
  SESSION_SCHEMA_VERSION,
  SessionStatus,
  AnalysisStatus,
} from '../../src/data/sessions.js';

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

describe('sessionStore and SessionRecord Domain Model', () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  const mockJob = {
    id: 'job-101',
    title: 'Senior Systems Engineer',
    description: 'Build robust distributed architectures.',
    skills: [
      { id: 'skill-dist', name: 'Distributed Systems', priority: 'required' },
      { id: 'skill-k8s', name: 'Kubernetes', priority: 'preferred' },
    ],
    questions: [
      {
        id: 'q1',
        text: 'How do you handle consensus in network partitions?',
        category: 'technical',
        requirementIds: ['skill-dist'],
        order: 0,
        maxFollowUps: 1,
      },
      {
        id: 'q2',
        text: 'Describe your cluster autoscaling strategy.',
        category: 'infrastructure',
        requirementIds: ['skill-k8s'],
        order: 1,
        maxFollowUps: 0,
      },
    ],
    criteria: [
      { id: 'crit-1', name: 'Fault Tolerance', description: 'Handles node failure gracefully' },
    ],
  };

  it('performs storage round-trip with createSessionRecord', () => {
    const session = createSessionRecord({ id: 'sess-roundtrip-1', job: mockJob });
    expect(session.schemaVersion).toBe(SESSION_SCHEMA_VERSION);
    expect(session.status).toBe(SessionStatus.IN_PROGRESS);
    expect(session.jobSnapshot.requirements.length).toBe(2);
    expect(session.turns).toEqual([]);

    sessionStore.save(session);
    const retrieved = sessionStore.getById('sess-roundtrip-1');
    expect(retrieved).not.toBeNull();
    expect(retrieved.id).toBe('sess-roundtrip-1');
    expect(retrieved.jobSnapshot.title).toBe('Senior Systems Engineer');
    expect(sessionStore.count()).toBe(1);
  });

  it('surfaces errors and skips unreadable or corrupted storage items without crashing', () => {
    // Write corrupted non-JSON or invalid records to storage
    localStorage.setItem(
      'hirepilot:sessions',
      JSON.stringify([
        null,
        { missingId: true },
        { id: 'corrupt-version', schemaVersion: 999, status: 'completed' },
        {
          id: 'valid-session',
          schemaVersion: SESSION_SCHEMA_VERSION,
          jobId: 'job-1',
          status: 'completed',
          turns: [],
        },
      ])
    );

    const { sessions, errors } = sessionStore.getAllWithStatus();
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe('valid-session');
    expect(errors.length).toBe(3);
    expect(errors.some((e) => e.error.includes('Null or non-object'))).toBe(true);
    expect(errors.some((e) => e.error.includes('missing required "id"'))).toBe(true);
    expect(errors.some((e) => e.error.includes('Unsupported schema version'))).toBe(true);
  });

  it('throws an informative error when getById targets an unreadable corrupted session', () => {
    localStorage.setItem(
      'hirepilot:sessions',
      JSON.stringify([
        { id: 'corrupted-target', schemaVersion: 888 },
      ])
    );

    expect(() => sessionStore.getById('corrupted-target')).toThrow(/is unreadable: Unsupported schema version/);
  });

  it('provides safe migration for unversioned prototype sessions', () => {
    localStorage.setItem(
      'hirepilot:sessions',
      JSON.stringify([
        {
          id: 'prototype-sess-1',
          status: 'completed',
          turns: [],
        },
      ])
    );

    const { sessions, errors } = sessionStore.getAllWithStatus();
    expect(errors.length).toBe(0);
    expect(sessions.length).toBe(1);
    expect(sessions[0].id).toBe('prototype-sess-1');
    expect(sessions[0].schemaVersion).toBe(SESSION_SCHEMA_VERSION);
  });

  it('createTurn factory enforces questionId and validates kind', () => {
    expect(() => createTurn({ text: 'Hello' })).toThrow(/questionId is required/);
    expect(() => createTurn({ questionId: 'q1', kind: 'invalid', text: 'Hello' })).toThrow(
      /Invalid kind/
    );
  });

  it('P0.3: SESSION_SCHEMA_VERSION is 2', () => {
    expect(SESSION_SCHEMA_VERSION).toBe(2);
  });

  it('P0.3: createSessionRecord includes v2 fields (contradictions, reasoning)', () => {
    const session = createSessionRecord({ id: 'sess-v2-check', job: mockJob });
    expect(session.schemaVersion).toBe(2);
    expect(Array.isArray(session.analysis.contradictions)).toBe(true);
    expect(session.reasoning).toEqual({ providerId: 'none', providerKind: 'deterministic' });
  });

  it('P0.3: createTurn includes v2 fields (decision, parentTurnId, requirementIds)', () => {
    const turn = createTurn({ questionId: 'q1', kind: 'question', text: 'Tell me about yourself.' });
    expect(turn.decision).toBe(null);
    expect(turn.parentTurnId).toBe(null);
    expect(Array.isArray(turn.requirementIds)).toBe(true);
  });

  it('P0.3: migrateSession v1→v2 adds reasoning, contradictions, and turn fields', async () => {
    const { migrateSession } = await import('../../src/data/sessions.js');
    const v1Record = {
      id: 'sess-migrate-v1',
      jobId: 'job-1',
      schemaVersion: 1,
      status: 'completed',
      turns: [{ id: 't1', questionId: 'q1', kind: 'question', text: 'Tell me...', askedAt: new Date().toISOString(), skipped: false }],
      analysis: { status: 'not_requested', providerId: 'x', providerKind: 'deterministic', requirements: [] },
    };
    const migrated = migrateSession(v1Record);
    expect(migrated.schemaVersion).toBe(2);
    expect(Array.isArray(migrated.analysis.contradictions)).toBe(true);
    expect(migrated.reasoning).toEqual({ providerId: 'none', providerKind: 'deterministic' });
    expect(migrated.turns[0].decision).toBe(null);
    expect(migrated.turns[0].parentTurnId).toBe(null);
    expect(Array.isArray(migrated.turns[0].requirementIds)).toBe(true);
  });
});
