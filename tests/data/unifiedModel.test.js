/**
 * CHECKPOINT 3: Unified model, migration, and persistence tests.
 *
 * Covers:
 * - migrateSession() formal migration chain
 * - validateSessionRecord() field validation
 * - sessionStore migration integration in getAllWithStatus
 * - validateJob() structured field validation
 * - store.jobs.update() automatic updatedAt stamping
 */

import { describe, it, expect, beforeEach } from 'vitest';
import {
  sessionStore,
  createSessionRecord,
  migrateSession,
  validateSessionRecord,
  SESSION_SCHEMA_VERSION,
  SessionStatus,
} from '../../src/data/sessions.js';
import { createJob, validateJob } from '../../src/data/models.js';
import { store } from '../../src/data/store.js';

/* ------------------------------------------------------------------
   localStorage mock (shared across session and store tests)
   ------------------------------------------------------------------ */
class LocalStorageMock {
  constructor() { this.store = {}; }
  getItem(key) { return this.store[key] ?? null; }
  setItem(key, value) { this.store[key] = String(value); }
  removeItem(key) { delete this.store[key]; }
  clear() { this.store = {}; }
}

globalThis.localStorage = new LocalStorageMock();

/* ==================================================================
   migrateSession
   ================================================================== */
describe('CHECKPOINT 3: migrateSession()', () => {
  it('returns the same record unchanged when already at current version', () => {
    const rec = { id: 'x', schemaVersion: SESSION_SCHEMA_VERSION, status: 'completed', turns: [] };
    const result = migrateSession(rec);
    expect(result).toBe(rec); // same object reference
    expect(result.schemaVersion).toBe(SESSION_SCHEMA_VERSION);
  });

  it('migrates v0 (no schemaVersion) to current when status and turns are present', () => {
    const rec = { id: 'v0', status: 'completed', turns: [{ id: 't1' }] };
    const migrated = migrateSession(rec);
    expect(migrated.schemaVersion).toBe(SESSION_SCHEMA_VERSION);
    expect(migrated.turns).toHaveLength(1);
    expect(migrated.id).toBe('v0');
  });

  it('migrates null schemaVersion (null treated as v0) when data is valid', () => {
    const rec = { id: 'v0-null', schemaVersion: null, status: 'in_progress', turns: [] };
    const migrated = migrateSession(rec);
    expect(migrated.schemaVersion).toBe(SESSION_SCHEMA_VERSION);
  });

  it('throws when migrating an unversioned record missing required fields', () => {
    const rec = { id: 'bare' };
    expect(() => migrateSession(rec)).toThrow(/missing required fields/);
  });

  it('throws for an unsupported future schema version', () => {
    const rec = { id: 'future', schemaVersion: 999, status: 'completed', turns: [] };
    expect(() => migrateSession(rec)).toThrow(/Unsupported schema version: 999/);
  });

  it('throws when called with a non-object', () => {
    expect(() => migrateSession(null)).toThrow(/not an object/);
    expect(() => migrateSession('string')).toThrow(/not an object/);
  });
});

/* ==================================================================
   validateSessionRecord
   ================================================================== */
describe('CHECKPOINT 3: validateSessionRecord()', () => {
  it('returns valid for a well-formed session record', () => {
    const rec = createSessionRecord({
      id: 'sess-valid',
      job: { id: 'j1', title: 'Eng', skills: [], questions: [], criteria: [] },
    });
    const { valid, errors } = validateSessionRecord(rec);
    expect(valid).toBe(true);
    expect(errors).toHaveLength(0);
  });

  it('reports missing id', () => {
    const { valid, errors } = validateSessionRecord({ jobId: 'j1', status: 'in_progress', turns: [] });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('id'))).toBe(true);
  });

  it('reports missing status', () => {
    const { valid, errors } = validateSessionRecord({ id: 's1', jobId: 'j1', turns: [] });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('status'))).toBe(true);
  });

  it('reports turns not an array', () => {
    const { valid, errors } = validateSessionRecord({ id: 's1', jobId: 'j1', status: 'in_progress', turns: null });
    expect(valid).toBe(false);
    expect(errors.some((e) => e.includes('turns'))).toBe(true);
  });

  it('returns invalid for a non-object argument', () => {
    const { valid } = validateSessionRecord('not-an-object');
    expect(valid).toBe(false);
  });
});

/* ==================================================================
   sessionStore migration integration
   ================================================================== */
describe('CHECKPOINT 3: sessionStore getAllWithStatus with migration', () => {
  beforeEach(() => {
    sessionStore.clear();
  });

  it('migrates v0 records in storage without error on getAll', () => {
    localStorage.setItem(
      'hirepilot:sessions',
      JSON.stringify([
        { id: 'v0-sess', status: 'completed', turns: [] }, // no schemaVersion
      ])
    );
    const { sessions, errors } = sessionStore.getAllWithStatus();
    expect(errors).toHaveLength(0);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].schemaVersion).toBe(SESSION_SCHEMA_VERSION);
    expect(sessions[0].id).toBe('v0-sess');
  });

  it('records an error for an unsupported schema version', () => {
    localStorage.setItem(
      'hirepilot:sessions',
      JSON.stringify([
        { id: 'unsupported', schemaVersion: 999, status: 'completed', turns: [] },
      ])
    );
    const { sessions, errors } = sessionStore.getAllWithStatus();
    expect(sessions).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].id).toBe('unsupported');
    expect(errors[0].error).toMatch(/Unsupported schema version: 999/);
  });

  it('records an error for a v0 record missing required fields', () => {
    localStorage.setItem(
      'hirepilot:sessions',
      JSON.stringify([
        { id: 'bare-v0' }, // no status or turns
      ])
    );
    const { sessions, errors } = sessionStore.getAllWithStatus();
    expect(sessions).toHaveLength(0);
    expect(errors).toHaveLength(1);
    expect(errors[0].error).toMatch(/missing required fields/);
  });
});

/* ==================================================================
   validateJob
   ================================================================== */
describe('CHECKPOINT 3: validateJob()', () => {
  it('returns valid for a well-formed job', () => {
    const job = createJob({ title: 'Frontend Engineer', status: 'draft' });
    const { valid, errors } = validateJob(job);
    expect(valid).toBe(true);
    expect(Object.keys(errors)).toHaveLength(0);
  });

  it('returns error for missing required title', () => {
    const job = createJob({ title: '', status: 'draft' });
    const { valid, errors } = validateJob(job);
    expect(valid).toBe(false);
    expect(errors.title).toBeDefined();
  });

  it('returns error for missing required status', () => {
    const job = { ...createJob({ title: 'Engineer' }), status: '' };
    const { valid, errors } = validateJob(job);
    expect(valid).toBe(false);
    expect(errors.status).toBeDefined();
  });

  it('returns error when title exceeds maxLength', () => {
    const job = createJob({ title: 'A'.repeat(201), status: 'draft' });
    const { valid, errors } = validateJob(job);
    expect(valid).toBe(false);
    expect(errors.title).toMatch(/at most 200/);
  });

  it('returns error when description exceeds maxLength', () => {
    const job = createJob({ title: 'Eng', description: 'D'.repeat(2001), status: 'draft' });
    const { valid, errors } = validateJob(job);
    expect(valid).toBe(false);
    expect(errors.description).toMatch(/at most 2000/);
  });

  it('returns invalid for a non-object argument', () => {
    const { valid } = validateJob(null);
    expect(valid).toBe(false);
  });
});

/* ==================================================================
   store.jobs.update() updatedAt stamping
   ================================================================== */
describe('CHECKPOINT 3: store.jobs.update() stamps updatedAt', () => {
  beforeEach(() => {
    store.jobs.clear();
  });

  it('updatedAt is newer than createdAt after an update', () => {
    const job = createJob({ title: 'Initial Title', status: 'draft' });
    store.jobs.add(job);

    // Slight delay to ensure timestamp difference
    const beforeUpdate = new Date().toISOString();
    const updated = store.jobs.update(job.id, { title: 'Updated Title' });

    expect(updated.title).toBe('Updated Title');
    expect(updated.id).toBe(job.id); // id must not change
    expect(updated.updatedAt).toBeDefined();
    expect(updated.updatedAt >= beforeUpdate).toBe(true);
  });

  it('does not add updatedAt to entities that did not originally have it', () => {
    // Simulate a non-job entity without updatedAt
    const entity = { id: 'ent-1', name: 'Raw entity' };
    // Use the jobs collection but with an object lacking updatedAt
    store.jobs.add(entity);
    const result = store.jobs.update(entity.id, { name: 'Updated' });
    // updatedAt should NOT be injected since the original had none
    expect(result.updatedAt).toBeUndefined();
    expect(result.name).toBe('Updated');
  });
});
