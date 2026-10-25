import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  canonicalizeLinkedInUrl,
  parseJobPostingHtml,
  parsePastedJobText,
  stripHtml,
  computeContentOverlap,
} from '../../src/utils/jobImport.js';
import { store } from '../../src/data/store.js';
import { createJob, createSkill, createQuestion, createCriterion } from '../../src/data/models.js';

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

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const fixturesDir = path.resolve(__dirname, '../fixtures');

describe('CHECKPOINT 1: Job Import Integrity & Provenance', () => {
  beforeEach(() => {
    store.jobs.clear();
  });

  describe('URL Canonicalization and Validation', () => {
    it('canonicalizes linkedin.com/jobs/view/<id> URLs', () => {
      const url1 = 'https://www.linkedin.com/jobs/view/4134760893?refId=abc&trackingId=xyz';
      const { canonicalUrl, jobId } = canonicalizeLinkedInUrl(url1);
      expect(canonicalUrl).toBe('https://www.linkedin.com/jobs/view/4134760893/');
      expect(jobId).toBe('4134760893');

      const url2 = 'https://linkedin.com/jobs/view/987654321/';
      expect(canonicalizeLinkedInUrl(url2).canonicalUrl).toBe(
        'https://www.linkedin.com/jobs/view/987654321/'
      );
    });

    it('canonicalizes currentJobId=<id> URLs', () => {
      const url = 'https://www.linkedin.com/jobs/search/?currentJobId=555666777&keywords=engineer';
      const { canonicalUrl, jobId } = canonicalizeLinkedInUrl(url);
      expect(canonicalUrl).toBe('https://www.linkedin.com/jobs/view/555666777/');
      expect(jobId).toBe('555666777');
    });

    it('rejects unsupported or malformed URLs with a specific descriptive error', () => {
      expect(() => canonicalizeLinkedInUrl('')).toThrow(/Please enter a LinkedIn job posting URL/);
      expect(() => canonicalizeLinkedInUrl('https://example.com/jobs/123')).toThrow(
        /Only public linkedin\.com job URLs are supported/
      );
      expect(() => canonicalizeLinkedInUrl('https://www.linkedin.com/in/some-profile')).toThrow(
        /Unsupported LinkedIn URL format/
      );
      expect(() => canonicalizeLinkedInUrl('not-a-url')).toThrow(/Only public linkedin\.com job URLs are supported/);
    });
  });

  describe('Distinct HTML Fixture Parsing', () => {
    it('GATE: parses two DISTINCT recorded HTML fixtures into different jobs traceable to each', () => {
      const html1 = fs.readFileSync(path.join(fixturesDir, 'linkedin_job_1.html'), 'utf-8');
      const html2 = fs.readFileSync(path.join(fixturesDir, 'linkedin_job_2.html'), 'utf-8');

      const job1 = parseJobPostingHtml(html1, 'https://www.linkedin.com/jobs/view/1001/');
      const job2 = parseJobPostingHtml(html2, 'https://www.linkedin.com/jobs/view/2002/');

      // Verification that jobs are distinct and not from a shared hardcoded template
      expect(job1.title).toBe('Site Reliability Engineer');
      expect(job1.company).toBe('Acme Systems');
      expect(job1.description).toContain('Kubernetes clusters');
      expect(job1.skills.some((s) => s.name.includes('Kubernetes'))).toBe(true);
      expect(job1.source.type).toBe('linkedin');
      expect(job1.source.canonicalUrl).toBe('https://www.linkedin.com/jobs/view/1001/');

      expect(job2.title).toBe('Staff Mobile Engineer');
      expect(job2.company).toBe('Beta Health');
      expect(job2.description).toContain('HIPAA');
      expect(job2.skills.some((s) => s.name.includes('Swift'))).toBe(true);
      expect(job2.source.type).toBe('linkedin');
      expect(job2.source.canonicalUrl).toBe('https://www.linkedin.com/jobs/view/2002/');

      // Critical Principle: Questions are NEVER hallucinated from job postings
      expect(job1.questions).toEqual([]);
      expect(job2.questions).toEqual([]);
      expect(job1.fieldProvenance.questions).toBe('missing');
      expect(job2.fieldProvenance.questions).toBe('missing');

      // Provenance matches extracted fields
      expect(job1.fieldProvenance.title).toBe('extracted');
      expect(job1.fieldProvenance.company).toBe('extracted');
      expect(job1.fieldProvenance.requirements).toBe('extracted');
    });

    it('GATE: authwall HTML returns honest error and saves no job', () => {
      const authwallHtml = fs.readFileSync(path.join(fixturesDir, 'linkedin_authwall.html'), 'utf-8');
      expect(() =>
        parseJobPostingHtml(authwallHtml, 'https://www.linkedin.com/jobs/view/3003/')
      ).toThrow(/LinkedIn authwall detected/);

      // Verify no job was saved to store
      expect(store.jobs.count()).toBe(0);
    });

    it('GATE: expired/search redirect HTML without JobPosting returns honest error and saves no job', () => {
      const expiredHtml = fs.readFileSync(
        path.join(fixturesDir, 'linkedin_expired_search.html'),
        'utf-8'
      );
      expect(() =>
        parseJobPostingHtml(expiredHtml, 'https://www.linkedin.com/jobs/view/4004/')
      ).toThrow(/Could not find a structured JobPosting/);

      expect(store.jobs.count()).toBe(0);
    });

    it('handles empty or malformed bodies with honest errors', () => {
      expect(() => parseJobPostingHtml('', 'https://www.linkedin.com/jobs/view/5005/')).toThrow(
        /response body was empty or unparseable/
      );
      expect(() => parseJobPostingHtml('   ', 'https://www.linkedin.com/jobs/view/5005/')).toThrow(
        /response body was empty or unparseable/
      );
    });
  });

  describe('Pasted Text First-Class Flow', () => {
    it('GATE: segments pasted job text into title, company, description, and requirements with provenance pasted', () => {
      const rawPastedText = `Role: Principal Cloud Architect
Company: Nexus Infrastructure

About the team:
We build multi-cloud infrastructure automation for enterprise clients.

Requirements:
• 10+ years designing enterprise AWS and Azure architectures.
• Deep expertise in Terraform, Kubernetes, and Istio service mesh.
• Experience managing $5M+ annual cloud infrastructure budgets.

Responsibilities:
• Lead technical design reviews across engineering teams.
• Define cloud security and disaster recovery baselines.`;

      const parsed = parsePastedJobText(rawPastedText);

      expect(parsed.title).toBe('Principal Cloud Architect');
      expect(parsed.company).toBe('Nexus Infrastructure');
      expect(parsed.skills.length).toBe(3);
      expect(parsed.skills[0].name).toContain('AWS and Azure');
      expect(parsed.description).toContain('multi-cloud infrastructure');

      // Provenance assertions
      expect(parsed.source.type).toBe('pasted');
      expect(parsed.fieldProvenance.title).toBe('pasted');
      expect(parsed.fieldProvenance.company).toBe('pasted');
      expect(parsed.fieldProvenance.requirements).toBe('pasted');
      expect(parsed.fieldProvenance.questions).toBe('missing');
      expect(parsed.questions).toEqual([]);
    });

    it('leaves unidentifiable fields as missing and editable', () => {
      const bareText = `Staff Database Engineer

We are seeking a PostgreSQL tuning specialist to optimize query performance and high-throughput replication.`;

      const parsed = parsePastedJobText(bareText);
      expect(parsed.title).toBe('Staff Database Engineer');
      expect(parsed.company).toBe('');
      expect(parsed.fieldProvenance.company).toBe('missing');
      expect(parsed.fieldProvenance.requirements).toBe('missing');
      expect(parsed.skills).toEqual([]);
    });
  });

  describe('Manual Job Creation Unchanged', () => {
    it('GATE: manual creation remains fully functional with models and store', () => {
      const manualJob = createJob({
        title: 'Manual Dev Role',
        skills: [createSkill({ name: 'Docker', priority: 'required' })],
        questions: [
          createQuestion({
            text: 'How do you structure Dockerfiles?',
            order: 0,
            requirementIds: [],
          }),
        ],
        criteria: [createCriterion({ name: 'Containerization' })],
      });

      store.jobs.add(manualJob);
      const retrieved = store.jobs.getById(manualJob.id);
      expect(retrieved).not.toBeNull();
      expect(retrieved.title).toBe('Manual Dev Role');
      expect(retrieved.skills.length).toBe(1);
      expect(retrieved.questions.length).toBe(1);
      expect(retrieved.criteria.length).toBe(1);
    });
  });

  describe('computeContentOverlap', () => {
    it('verifies content when extracted text overlaps >= 70% with source', () => {
      const source = 'We are hiring a Senior Frontend Engineer proficient in React, TypeScript, Redux, and Jest testing.';
      const extracted = 'Senior Frontend Engineer React TypeScript Jest';
      const result = computeContentOverlap(extracted, source);
      expect(result.verified).toBe(true);
      expect(result.ratio).toBeGreaterThanOrEqual(0.7);
    });

    it('flags warning when extracted text has low overlap with source', () => {
      const source = 'We are hiring a Senior Frontend Engineer proficient in React.';
      const extracted = 'Kubernetes Cloud Architect Golang Terraform Python';
      const result = computeContentOverlap(extracted, source);
      expect(result.verified).toBe(false);
      expect(result.ratio).toBeLessThan(0.7);
    });
  });
});

