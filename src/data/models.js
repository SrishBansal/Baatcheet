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
 */

/**
 * Create a new InterviewQuestion object.
 * @param {Partial<InterviewQuestion>} overrides
 * @returns {InterviewQuestion}
 */
export function createQuestion(overrides = {}) {
  return {
    id: generateId(),
    text: '',
    category: 'general',
    order: 0,
    maxFollowUps: 1,
    relatedSkills: [],
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
  return {
    id: generateId(),
    title: '',
    description: '',
    skills: [],
    questions: [],
    criteria: [],
    status: 'draft',
    createdAt: timestamp,
    updatedAt: timestamp,
    ...overrides,
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
