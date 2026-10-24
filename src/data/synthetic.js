/**
 * Synthetic seed data for development and testing.
 *
 * This data is clearly synthetic — names, descriptions, and details
 * are fabricated for development purposes only. No real candidate
 * information is included.
 */

import { createJob, createSkill, createQuestion, createCriterion } from './models.js';
import { store } from './store.js';

const SEED_MARKER_KEY = 'hirepilot:seeded';

/**
 * Seed the store with synthetic job data if it hasn't been seeded yet.
 * Idempotent — only seeds once per browser.
 */
export function seedIfEmpty() {
  if (typeof localStorage === 'undefined') return;
  if (localStorage.getItem(SEED_MARKER_KEY)) return;
  if (store.jobs.count() > 0) {
    localStorage.setItem(SEED_MARKER_KEY, 'true');
    return;
  }

  const jobs = createSyntheticJobs();
  for (const job of jobs) {
    store.jobs.add(job);
  }

  localStorage.setItem(SEED_MARKER_KEY, 'true');
}

/**
 * Create an array of synthetic Job objects.
 * @returns {import('./models.js').Job[]}
 */
function createSyntheticJobs() {
  /* ---- Job 1: Senior Frontend Engineer ---- */
  const frontendSkills = [
    createSkill({ name: 'React', priority: 'required' }),
    createSkill({ name: 'TypeScript', priority: 'required' }),
    createSkill({ name: 'CSS Architecture', priority: 'required' }),
    createSkill({ name: 'Web Accessibility (WCAG)', priority: 'preferred' }),
    createSkill({ name: 'Performance Optimization', priority: 'preferred' }),
  ];

  const frontendQuestions = [
    createQuestion({
      text: 'Describe a complex UI component you built recently. What made it challenging, and how did you approach the architecture?',
      category: 'technical',
      order: 0,
      maxFollowUps: 2,
      relatedSkills: [frontendSkills[0].id, frontendSkills[2].id],
    }),
    createQuestion({
      text: 'How do you approach state management in a large React application? Walk me through your decision-making process.',
      category: 'technical',
      order: 1,
      maxFollowUps: 1,
      relatedSkills: [frontendSkills[0].id],
    }),
    createQuestion({
      text: 'Tell me about a time when you had to balance shipping quickly with maintaining code quality. How did you handle it?',
      category: 'behavioral',
      order: 2,
      maxFollowUps: 1,
    }),
    createQuestion({
      text: 'How would you improve the accessibility of a complex data table that supports sorting, filtering, and pagination?',
      category: 'situational',
      order: 3,
      maxFollowUps: 1,
      relatedSkills: [frontendSkills[3].id],
    }),
  ];

  const frontendCriteria = [
    createCriterion({
      name: 'Component Architecture',
      description: 'Ability to decompose complex UIs into well-structured, reusable components with clear boundaries.',
      relatedSkills: [frontendSkills[0].id, frontendSkills[2].id],
    }),
    createCriterion({
      name: 'State Management',
      description: 'Understanding of state management patterns, trade-offs between local and global state, and ability to justify architectural decisions.',
      relatedSkills: [frontendSkills[0].id, frontendSkills[1].id],
    }),
    createCriterion({
      name: 'Accessibility Awareness',
      description: 'Knowledge of WCAG guidelines, ARIA attributes, and semantic HTML for building inclusive interfaces.',
      relatedSkills: [frontendSkills[3].id],
    }),
    createCriterion({
      name: 'Technical Communication',
      description: 'Ability to explain technical concepts clearly, discuss trade-offs, and articulate reasoning.',
    }),
  ];

  const frontendJob = createJob({
    title: 'Senior Frontend Engineer',
    description: 'We are looking for an experienced frontend engineer to join our product team. You will work on building and maintaining our core web application, collaborating with designers and backend engineers to deliver polished user experiences.',
    skills: frontendSkills,
    questions: frontendQuestions,
    criteria: frontendCriteria,
    status: 'active',
  });

  /* ---- Job 2: Backend Engineer (Draft) ---- */
  const backendSkills = [
    createSkill({ name: 'Python', priority: 'required' }),
    createSkill({ name: 'API Design (REST/GraphQL)', priority: 'required' }),
    createSkill({ name: 'PostgreSQL', priority: 'required' }),
    createSkill({ name: 'System Design', priority: 'preferred' }),
    createSkill({ name: 'Docker / Containers', priority: 'preferred' }),
  ];

  const backendQuestions = [
    createQuestion({
      text: 'Walk me through how you would design an API for a resource that has complex relationships and requires pagination.',
      category: 'technical',
      order: 0,
      maxFollowUps: 2,
      relatedSkills: [backendSkills[1].id],
    }),
    createQuestion({
      text: 'Describe a production incident you helped resolve. What was your debugging process?',
      category: 'behavioral',
      order: 1,
      maxFollowUps: 1,
    }),
  ];

  const backendCriteria = [
    createCriterion({
      name: 'API Design',
      description: 'Ability to design clean, consistent, and well-documented APIs.',
      relatedSkills: [backendSkills[1].id],
    }),
    createCriterion({
      name: 'Problem Solving Under Pressure',
      description: 'Demonstrates structured debugging and incident response skills.',
    }),
  ];

  const backendJob = createJob({
    title: 'Backend Engineer',
    description: 'Join our infrastructure team to build and scale our backend services. You will own key APIs and work on improving system reliability.',
    skills: backendSkills,
    questions: backendQuestions,
    criteria: backendCriteria,
    status: 'draft',
  });

  /* ---- Job 3: Product Designer (Archived) ---- */
  const designJob = createJob({
    title: 'Product Designer',
    description: 'We are seeking a product designer to lead the design of our core user workflows. This role focuses on research-driven design, prototyping, and close collaboration with engineering.',
    skills: [
      createSkill({ name: 'Figma', priority: 'required' }),
      createSkill({ name: 'User Research', priority: 'required' }),
      createSkill({ name: 'Design Systems', priority: 'preferred' }),
    ],
    questions: [],
    criteria: [],
    status: 'archived',
  });

  return [frontendJob, backendJob, designJob];
}
