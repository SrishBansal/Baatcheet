/**
 * Data models for HirePilot AI.
 *
 * These are plain-object factory functions (not classes) to keep
 * serialisation to/from localStorage straightforward.
 *
 * Each factory returns a fresh object with all required fields
 * initialised to sensible defaults.
 */

import { generateId } from '../utils/id.js';
import { now } from '../utils/time.js';

/* ----------------------------------------------------------------
   Skill
   ---------------------------------------------------------------- */

/**
 * @typedef {object} Skill
 * @property {string} id
 * @property {string} name
 * @property {'required' | 'preferred'} priority
 */

/**
 * Create a new Skill object.
 * @param {Partial<Skill>} overrides
 * @returns {Skill}
 */
export function createSkill(overrides = {}) {
  return {
    id: generateId(),
    name: '',
    priority: 'required',
    ...overrides,
  };
}

/* ----------------------------------------------------------------
   InterviewQuestion
   ---------------------------------------------------------------- */

/**
 * @typedef {object} InterviewQuestion
 * @property {string} id
 * @property {string} text - The question text
 * @property {'technical' | 'behavioral' | 'situational' | 'general'} category
 * @property {number} order - Display/ask order (0-based)
 * @property {number} maxFollowUps - Max follow-up questions allowed (0 = none)
 * @property {string[]} relatedSkills - IDs of skills this question assesses
 * @property {string[]} [requirementIds] - IDs of job requirements assessed (defaults to relatedSkills)
 */

/**
 * Create a new InterviewQuestion object.
 * @param {Partial<InterviewQuestion>} overrides
 * @returns {InterviewQuestion}
 */
export function createQuestion(overrides = {}) {
  const relatedSkills = overrides.relatedSkills || [];
  const requirementIds = overrides.requirementIds || relatedSkills;

  return {
    id: generateId(),
    text: '',
    category: 'general',
    order: 0,
    maxFollowUps: 1,
    relatedSkills,
    requirementIds,
    ...overrides,
  };
}

/* ----------------------------------------------------------------
   EvaluationCriterion
   ---------------------------------------------------------------- */

/**
 * @typedef {object} EvaluationCriterion
 * @property {string} id
 * @property {string} name - What is being evaluated (e.g., "Problem decomposition")
 * @property {string} description - Detailed description of what to look for
 * @property {string[]} relatedSkills - IDs of skills this criterion maps to
 */

/**
 * Create a new EvaluationCriterion object.
 * @param {Partial<EvaluationCriterion>} overrides
 * @returns {EvaluationCriterion}
 */
export function createCriterion(overrides = {}) {
  return {
    id: generateId(),
    name: '',
    description: '',
    relatedSkills: [],
    ...overrides,
  };
}

/* ----------------------------------------------------------------
   Job
   ---------------------------------------------------------------- */

/**
 * @typedef {object} Job
 * @property {string} id
 * @property {string} title
 * @property {string} description
 * @property {Skill[]} skills
 * @property {InterviewQuestion[]} questions
 * @property {EvaluationCriterion[]} criteria
 * @property {'draft' | 'active' | 'archived'} status
 * @property {string} createdAt - ISO 8601
 * @property {string} updatedAt - ISO 8601
 */

/**
 * Validation schema for Job objects.
 */
export const JOB_SCHEMA = {
  title: { type: 'string', required: true, minLength: 1, maxLength: 200 },
  description: { type: 'string', required: false, maxLength: 2000 },
  skills: { type: 'array', required: false },
  questions: { type: 'array', required: false },
  criteria: { type: 'array', required: false },
  status: { type: 'string', required: true },
};

/**
 * Create a new Job object.
 * @param {Partial<Job>} overrides
 * @returns {Job}
 */
export function createJob(overrides = {}) {
  const timestamp = now();
  const settings = {
    allowTyping: false,
    ...(overrides.settings || {}),
  };
  return {
    id: generateId(),
    title: '',
    description: '',
    skills: [],
    questions: [],
    criteria: [],
    status: 'draft',
    settings,
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
    settings,
  };
}

/**
 * Valid job statuses.
 */
export const JOB_STATUSES = ['draft', 'active', 'archived'];

/**
 * Question categories.
 */
export const QUESTION_CATEGORIES = ['technical', 'behavioral', 'situational', 'general'];

/**
 * Skill priorities.
 */
export const SKILL_PRIORITIES = ['required', 'preferred'];

/**
 * Validate a Job object against JOB_SCHEMA.
 * Returns structured errors rather than throwing so UI can display field-level feedback.
 *
 * @param {object} job
 * @returns {{ valid: boolean, errors: Record<string, string> }}
 */
export function validateJob(job) {
  const errors = {};
  if (!job || typeof job !== 'object') {
    return { valid: false, errors: { _base: 'Job must be an object.' } };
  }

  for (const [field, rules] of Object.entries(JOB_SCHEMA)) {
    const value = job[field];

    if (rules.required && (value === undefined || value === null || value === '')) {
      errors[field] = `${field} is required.`;
      continue;
    }

    if (value !== undefined && value !== null && value !== '') {
      if (rules.type === 'string' && typeof value !== 'string') {
        errors[field] = `${field} must be a string.`;
        continue;
      }
      if (rules.type === 'array' && !Array.isArray(value)) {
        errors[field] = `${field} must be an array.`;
        continue;
      }
      if (rules.minLength !== undefined && typeof value === 'string' && value.length < rules.minLength) {
        errors[field] = `${field} must be at least ${rules.minLength} character(s).`;
        continue;
      }
      if (rules.maxLength !== undefined && typeof value === 'string' && value.length > rules.maxLength) {
        errors[field] = `${field} must be at most ${rules.maxLength} characters.`;
      }
    }
  }

  return { valid: Object.keys(errors).length === 0, errors };
}
