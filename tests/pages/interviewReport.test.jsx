import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import InterviewReport from '../../src/pages/InterviewReport.jsx';
import { store } from '../../src/data/store.js';
import { makeReport } from '../../src/data/engineApi.js';

vi.mock('../../src/data/engineApi.js', () => ({ makeReport: vi.fn(), health: vi.fn() }));

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

describe('InterviewReport Page Rendering', () => {
  beforeEach(() => {
    store.sessions.clear();
  });

  function renderReport(sessionId) {
    return renderToString(
      <MemoryRouter initialEntries={[`/interviews/${sessionId}`]}>
        <Routes>
          <Route path="/interviews/:sessionId" element={<InterviewReport />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('renders completed interview report with executive summary facts and requirement coverage', () => {
    const session = {
      id: 'session-completed-1',
      jobId: 'job-1',
      schemaVersion: 1,
      status: 'completed',
      startedAt: '2026-10-25T09:00:00.000Z',
      endedAt: '2026-10-25T09:15:00.000Z',
      jobSnapshot: {
        title: 'Staff Platform Engineer',
        requirements: [
          { id: 'req-k8s', name: 'Kubernetes Orchestration', priority: 'required' },
          { id: 'req-sec', name: 'Cloud Security', priority: 'preferred' },
        ],
        questions: [
          { id: 'q1', text: 'How do you design multi-tenant k8s clusters?', requirementIds: ['req-k8s'] },
        ],
      },
      turns: [
        {
          id: 'turn-1',
          questionId: 'q1',
          kind: 'question',
          text: 'How do you design multi-tenant k8s clusters?',
          askedAt: '2026-10-25T09:01:00.000Z',
          skipped: false,
          answer: {
            finalText: 'I use network policies, namespaces, and OPA Gatekeeper constraints.',
            answeredAt: '2026-10-25T09:03:00.000Z',
            inputMode: 'voice',
          },
        },
      ],
      analysis: {
        status: 'complete',
        providerId: 'deterministic-transcript-v1',
        providerKind: 'deterministic',
        requirements: [
          {
            requirementId: 'req-k8s',
            requirementName: 'Kubernetes Orchestration',
            priority: 'required',
            status: 'Awaiting analysis',
            quotes: ['I use network policies, namespaces, and OPA Gatekeeper constraints.'],
          },
          {
            requirementId: 'req-sec',
            requirementName: 'Cloud Security',
            priority: 'preferred',
            status: 'Not assessed',
            quotes: [],
          },
        ],
      },
    };

    store.sessions.save(session);
    const html = renderReport('session-completed-1');

    // Header & timestamps
    expect(html).toContain('Staff Platform Engineer');
    expect(html).toContain('session-completed-1');
    expect(html).toContain('COMPLETED');
    expect(html).toContain('15m 0s');

    // Banner stating deterministic transcript-only provider honestly
    expect(html).toContain('Transcript-only assessment: no AI evaluation performed');

    // Executive summary computed facts only
    expect(html).toContain('Questions Asked');
    expect(html).toContain('Questions Answered');
    expect(html).toContain('Questions Skipped');

    // Requirement coverage & verbatim quotes
    expect(html).toContain('Kubernetes Orchestration');
    expect(html).toContain('Awaiting analysis');
    expect(html).toContain('I use network policies, namespaces, and OPA Gatekeeper constraints.');

    // Requirements not assessed section
    expect(html).toContain('Requirements Not Assessed');
    expect(html).toContain('Cloud Security');
    expect(html).toContain('Not assessed');

    // Transcript turn and input mode
    expect(html).toContain('Mode:');
    expect(html).toContain('voice');
  });

  it('renders zero-answer aborted interview with no analysis call', () => {
    const session = {
      id: 'session-aborted-1',
      jobId: 'job-2',
      schemaVersion: 1,
      status: 'aborted',
      startedAt: '2026-10-25T10:00:00.000Z',
      endedAt: '2026-10-25T10:04:00.000Z',
      jobSnapshot: {
        title: 'Backend Engineer',
        requirements: [{ id: 'req-sql', name: 'PostgreSQL', priority: 'required' }],
        questions: [{ id: 'q1', text: 'Explain query indexing.', requirementIds: ['req-sql'] }],
      },
      turns: [
        {
          id: 'turn-1',
          questionId: 'q1',
          kind: 'question',
          text: 'Explain query indexing.',
          askedAt: '2026-10-25T10:01:00.000Z',
          skipped: true, // Candidate skipped first question then aborted
        },
      ],
      analysis: {
        status: 'complete',
        providerKind: 'deterministic',
        requirements: [
          {
            requirementId: 'req-sql',
            status: 'Not assessed',
            quotes: [],
          },
        ],
      },
    };

    store.sessions.save(session);
    const html = renderReport('session-aborted-1');

    expect(html).toContain('No answers were recorded; nothing to analyze.');
    expect(makeReport).not.toHaveBeenCalled();
  });

  it('renders failed-analysis report banner with error message while keeping full transcript intact', () => {
    const session = {
      id: 'session-failed-1',
      jobId: 'job-3',
      schemaVersion: 1,
      status: 'completed',
      startedAt: '2026-10-25T11:00:00.000Z',
      endedAt: '2026-10-25T11:10:00.000Z',
      jobSnapshot: {
        title: 'Security Analyst',
        requirements: [{ id: 'req-siem', name: 'SIEM Triage', priority: 'required' }],
      },
      turns: [
        {
          id: 'turn-1',
          questionId: 'q1',
          kind: 'question',
          text: 'How do you triage brute-force SSH attempts?',
          askedAt: '2026-10-25T11:01:00.000Z',
          answer: {
            finalText: 'I correlate auth logs with firewall rate limits.',
            inputMode: 'text',
          },
        },
      ],
      analysis: {
        status: 'failed',
        error: 'Analysis engine timeout during calculation.',
        providerId: 'deterministic-transcript-v1',
        providerKind: 'deterministic',
        requirements: [],
      },
    };

    store.sessions.save(session);
    const html = renderReport('session-failed-1');

    // Error banner is prominent and provides retry capability
    expect(html).toContain('Analysis Status: Failed');
    expect(html).toContain('Analysis engine timeout during calculation.');
    expect(html).toContain('Retry Analysis');

    // System assessment limitations notice is present
    expect(html).toContain('System Assessment Limitations');

    // Full transcript remains completely intact
    expect(html).toContain('How do you triage brute-force SSH attempts?');
    expect(html).toContain('I correlate auth logs with firewall rate limits.');
  });

  it('renders empty-requirements job cleanly without crashing', () => {
    const session = {
      id: 'session-empty-reqs-1',
      jobId: 'job-4',
      schemaVersion: 1,
      status: 'completed',
      startedAt: '2026-10-25T12:00:00.000Z',
      endedAt: '2026-10-25T12:05:00.000Z',
      jobSnapshot: {
        title: 'General Inquiries Role',
        requirements: [], // Empty requirements
        questions: [{ id: 'q1', text: 'Tell me about yourself.', requirementIds: [] }],
      },
      turns: [
        {
          id: 'turn-1',
          questionId: 'q1',
          kind: 'question',
          text: 'Tell me about yourself.',
          answer: {
            finalText: 'I have 8 years of engineering experience.',
            inputMode: 'text',
          },
        },
      ],
      analysis: {
        status: 'complete',
        providerKind: 'deterministic',
        requirements: [],
      },
    };

    store.sessions.save(session);
    const html = renderReport('session-empty-reqs-1');

    expect(html).toContain('General Inquiries Role');
    expect(html).toContain('No specific requirements were snapshot for this position');
    expect(html).toContain('Unmapped Questions');
    expect(html).toContain('I have 8 years of engineering experience.');
  });
});
