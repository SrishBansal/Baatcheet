import { describe, it, expect, beforeEach } from 'vitest';

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

const { store } = await import('../../src/data/store.js');
const { seedIfEmpty } = await import('../../src/data/synthetic.js');

describe('synthetic data initialization', () => {
  beforeEach(() => {
    globalThis.localStorage.clear();
    store.jobs.clear();
  });

  it('seeds data when storage is completely empty', () => {
    expect(store.jobs.count()).toBe(0);
    expect(globalThis.localStorage.getItem('hirepilot:seeded')).toBeNull();

    seedIfEmpty();

    expect(store.jobs.count()).toBeGreaterThan(0);
    expect(globalThis.localStorage.getItem('hirepilot:seeded')).toBe('true');
  });

  it('is idempotent and does not duplicate data on repeated calls', () => {
    seedIfEmpty();
    const countAfterFirst = store.jobs.count();

    seedIfEmpty();
    expect(store.jobs.count()).toBe(countAfterFirst);
  });

  it('never overwrites existing user jobs on startup', () => {
    // Simulate user having added their own job before seed was called
    const customJob = {
      id: 'custom-job-1',
      title: 'Principal Distributed Systems Architect',
      skills: [],
      questions: [],
      criteria: [],
      status: 'active',
    };
    store.jobs.add(customJob);

    // Call seedIfEmpty
    seedIfEmpty();

    // Should NOT inject synthetic jobs
    expect(store.jobs.count()).toBe(1);
    expect(store.jobs.getById('custom-job-1').title).toBe('Principal Distributed Systems Architect');
    expect(globalThis.localStorage.getItem('hirepilot:seeded')).toBe('true');
  });

  it('does not re-seed if user deliberately deleted all jobs', () => {
    // First boot seeds jobs
    seedIfEmpty();
    expect(store.jobs.count()).toBeGreaterThan(0);

    // User deletes all jobs
    store.jobs.clear();
    expect(store.jobs.count()).toBe(0);
    // Marker remains
    expect(globalThis.localStorage.getItem('hirepilot:seeded')).toBe('true');

    // Next startup runs seedIfEmpty
    seedIfEmpty();

    // Storage must remain empty (respecting user deletion)
    expect(store.jobs.count()).toBe(0);
  });
});
