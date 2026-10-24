import { describe, it, expect } from 'vitest';
import {
  createSkill,
  createQuestion,
  createCriterion,
  createJob,
  JOB_SCHEMA,
  JOB_STATUSES,
  QUESTION_CATEGORIES,
  SKILL_PRIORITIES,
} from '../../src/data/models.js';

describe('models', () => {
  describe('createSkill', () => {
    it('creates a skill with default values and unique id', () => {
      const skill1 = createSkill();
      const skill2 = createSkill();

      expect(skill1.id).toBeDefined();
      expect(skill2.id).toBeDefined();
      expect(skill1.id).not.toBe(skill2.id);
      expect(skill1.name).toBe('');
      expect(skill1.priority).toBe('required');
    });

    it('applies overrides', () => {
      const skill = createSkill({ name: 'React', priority: 'preferred' });
      expect(skill.name).toBe('React');
      expect(skill.priority).toBe('preferred');
    });
  });

  describe('createQuestion', () => {
    it('creates a question with default values', () => {
      const q = createQuestion();
      expect(q.id).toBeDefined();
      expect(q.text).toBe('');
      expect(q.category).toBe('general');
      expect(q.order).toBe(0);
      expect(q.maxFollowUps).toBe(1);
      expect(q.relatedSkills).toEqual([]);
    });

    it('applies overrides', () => {
      const q = createQuestion({
        text: 'Explain closures',
        category: 'technical',
        maxFollowUps: 2,
        relatedSkills: ['skill-1'],
      });
      expect(q.text).toBe('Explain closures');
      expect(q.category).toBe('technical');
      expect(q.maxFollowUps).toBe(2);
      expect(q.relatedSkills).toEqual(['skill-1']);
    });
  });

  describe('createCriterion', () => {
    it('creates an evaluation criterion with defaults', () => {
      const c = createCriterion();
      expect(c.id).toBeDefined();
      expect(c.name).toBe('');
      expect(c.description).toBe('');
      expect(c.relatedSkills).toEqual([]);
    });

    it('applies overrides', () => {
      const c = createCriterion({
        name: 'System Design',
        description: 'Scalable service patterns',
        relatedSkills: ['s1', 's2'],
      });
      expect(c.name).toBe('System Design');
      expect(c.description).toBe('Scalable service patterns');
      expect(c.relatedSkills).toEqual(['s1', 's2']);
    });
  });

  describe('createJob', () => {
    it('creates a job with default values and timestamps', () => {
      const job = createJob();
      expect(job.id).toBeDefined();
      expect(job.title).toBe('');
      expect(job.status).toBe('draft');
      expect(job.skills).toEqual([]);
      expect(job.questions).toEqual([]);
      expect(job.criteria).toEqual([]);
      expect(job.createdAt).toBeDefined();
      expect(job.updatedAt).toBeDefined();
    });

    it('applies overrides', () => {
      const job = createJob({
        title: 'Lead Architect',
        status: 'active',
      });
      expect(job.title).toBe('Lead Architect');
      expect(job.status).toBe('active');
    });
  });

  describe('constants', () => {
    it('has expected job statuses', () => {
      expect(JOB_STATUSES).toEqual(['draft', 'active', 'archived']);
    });

    it('has expected question categories', () => {
      expect(QUESTION_CATEGORIES).toContain('technical');
      expect(QUESTION_CATEGORIES).toContain('behavioral');
      expect(QUESTION_CATEGORIES).toContain('situational');
      expect(QUESTION_CATEGORIES).toContain('general');
    });

    it('has expected skill priorities', () => {
      expect(SKILL_PRIORITIES).toEqual(['required', 'preferred']);
    });
  });
});
