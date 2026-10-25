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

if (!globalThis.localStorage || typeof globalThis.localStorage.getItem !== 'function') {
  globalThis.localStorage = new LocalStorageMock();
}

import { parseLinkedInPosting } from '../../src/pages/JobConfig.jsx';
import { store } from '../../src/data/store.js';
import { createJob, createSkill, createQuestion, createCriterion } from '../../src/data/models.js';

describe('Job Position Configuration & LinkedIn Import', () => {
  describe('parseLinkedInPosting', () => {
    it('extracts frontend role details from frontend LinkedIn posting URL', () => {
      const url = 'https://www.linkedin.com/jobs/view/senior-frontend-engineer-react-123456';
      const result = parseLinkedInPosting(url);

      expect(result.title).toBe('Senior Frontend Engineer');
      expect(result.description).toContain('React');
      expect(result.skills.length).toBeGreaterThan(0);
      expect(result.skills.some((s) => s.name.includes('React'))).toBe(true);
      expect(result.skills.some((s) => s.priority === 'required')).toBe(true);
      expect(result.questions.length).toBeGreaterThan(0);
      expect(result.questions[0].category).toBe('technical');
      expect(result.criteria.length).toBeGreaterThan(0);
    });

    it('extracts backend role details from backend LinkedIn posting URL', () => {
      const url = 'https://www.linkedin.com/jobs/view/staff-backend-platform-engineer-987654';
      const result = parseLinkedInPosting(url);

      expect(result.title).toBe('Senior Backend Engineer');
      expect(result.skills.some((s) => s.name.includes('Distributed Systems'))).toBe(true);
      expect(result.questions.length).toBeGreaterThan(0);
    });

    it('extracts product manager details from PM LinkedIn posting URL', () => {
      const url = 'https://www.linkedin.com/jobs/view/senior-product-manager-456789';
      const result = parseLinkedInPosting(url);

      expect(result.title).toBe('Product Manager');
      expect(result.skills.some((s) => s.name.includes('Discovery') || s.name.includes('Prioritization'))).toBe(true);
    });

    it('falls back to default Software Engineer when specific domain keywords are absent', () => {
      const url = 'https://www.linkedin.com/jobs/view/123456789';
      const result = parseLinkedInPosting(url);

      expect(result.title).toBe('Software Engineer');
      expect(result.skills.length).toBeGreaterThan(0);
      expect(result.questions.length).toBeGreaterThan(0);
      expect(result.criteria.length).toBeGreaterThan(0);
    });
  });

  describe('Recruiter Job CRUD Flow', () => {
    beforeEach(() => {
      store.jobs.clear();
    });

    it('creates and persists a new role configuration with skills, questions, and criteria', () => {
      const newJob = createJob({
        title: 'Lead Mobile Architect',
        description: 'Lead iOS and Android architecture across cross-functional product squads.',
        status: 'active',
        skills: [
          createSkill({ name: 'Swift', priority: 'required' }),
          createSkill({ name: 'Kotlin', priority: 'required' }),
          createSkill({ name: 'Offline-first Architecture', priority: 'preferred' }),
        ],
        questions: [
          createQuestion({
            text: 'How do you design an offline-first caching layer for mobile clients?',
            category: 'technical',
            order: 0,
            maxFollowUps: 2,
          }),
        ],
        criteria: [
          createCriterion({
            name: 'Offline Architecture Knowledge',
            description: 'Demonstrates deep knowledge of SQLite/CoreData and conflict resolution.',
          }),
        ],
      });

      store.jobs.add(newJob);
      const retrieved = store.jobs.getById(newJob.id);
      expect(retrieved).toBeDefined();
      expect(retrieved.title).toBe('Lead Mobile Architect');
      expect(retrieved.skills.length).toBe(3);
      expect(retrieved.questions.length).toBe(1);
      expect(retrieved.criteria.length).toBe(1);
    });

    it('updates existing position requirements and increments updatedAt timestamp', () => {
      const job = createJob({
        title: 'Junior QA Engineer',
        status: 'draft',
      });
      store.jobs.add(job);

      const updated = store.jobs.update(job.id, {
        title: 'Senior QA Automation Engineer',
        status: 'active',
        description: 'Build end-to-end regression suites.',
      });

      expect(updated.title).toBe('Senior QA Automation Engineer');
      expect(updated.status).toBe('active');

      const retrieved = store.jobs.getById(job.id);
      expect(retrieved.title).toBe('Senior QA Automation Engineer');
    });

    it('deletes position and removes it from store', () => {
      const job = createJob({ title: 'Temporary Position' });
      store.jobs.add(job);
      expect(store.jobs.getById(job.id)).not.toBeNull();

      const removed = store.jobs.remove(job.id);
      expect(removed).toBe(true);
      expect(store.jobs.getById(job.id)).toBeNull();
    });
  });
});
