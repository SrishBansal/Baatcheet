import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Dashboard from '../../src/pages/Dashboard.jsx';
import { store } from '../../src/data/store.js';

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

describe('Dashboard Page Rendering (Checkpoint 6)', () => {
  beforeEach(() => {
    store.jobs.clear();
    store.sessions.clear();
  });

  function renderDashboard() {
    return renderToString(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('renders honest empty state when store has zero jobs and sessions', () => {
    const html = renderDashboard();

    expect(html).toContain('Overview');
    expect(html).toContain('No recruitment activity recorded yet');
    expect(html).toContain('Create First Position');
    // Ensure no job editing form is present on dashboard
    expect(html).not.toContain('<form');
  });

  it('renders operational stats accurately matching store data in populated state', () => {
    // 2 active jobs (1 with questions, 1 incomplete), 1 draft job
    store.jobs.add({
      id: 'job-prod-eng',
      title: 'Production Engineer',
      department: 'Infrastructure',
      status: 'active',
      questions: [{ id: 'q1', text: 'Incident triage' }],
      requirements: [{ id: 'req-1', name: 'Linux' }],
      createdAt: '2026-10-25T08:00:00Z',
    });

    store.jobs.add({
      id: 'job-incomplete',
      title: 'Data Analyst',
      department: 'Analytics',
      status: 'active',
      questions: [], // Incomplete! Needing attention
      requirements: [],
      createdAt: '2026-10-25T08:30:00Z',
    });

    store.jobs.add({
      id: 'job-draft',
      title: 'Product Designer',
      department: 'Design',
      status: 'draft',
      questions: [{ id: 'q1', text: 'Design systems' }],
      requirements: [{ id: 'req-des', name: 'Figma' }],
      createdAt: '2026-10-25T09:00:00Z',
    });

    // Sessions: 1 in_progress, 1 completed, 1 completed with failed analysis
    store.sessions.save({
      id: 'sess-prog',
      jobId: 'job-prod-eng',
      status: 'in_progress',
      startedAt: '2026-10-25T09:10:00Z',
      jobSnapshot: { title: 'Production Engineer' },
      turns: [],
    });

    store.sessions.save({
      id: 'sess-comp-1',
      jobId: 'job-prod-eng',
      status: 'completed',
      startedAt: '2026-10-25T09:20:00Z',
      endedAt: '2026-10-25T09:35:00Z',
      jobSnapshot: { title: 'Production Engineer' },
      turns: [{ id: 't1', answer: { finalText: 'Linux kernel trace' } }],
      analysis: { status: 'complete', providerKind: 'deterministic' },
    });

    store.sessions.save({
      id: 'sess-failed',
      jobId: 'job-prod-eng',
      status: 'completed',
      startedAt: '2026-10-25T09:40:00Z',
      endedAt: '2026-10-25T09:50:00Z',
      jobSnapshot: { title: 'Production Engineer' },
      turns: [],
      analysis: { status: 'failed', error: 'Upstream gateway timeout' },
    });

    const html = renderDashboard();

    // Title and quick actions
    expect(html).toContain('Overview');
    expect(html).toContain('New position');

    // Key Operational Stat Cards matching store counts
    expect(html).toContain('Open Positions');
    expect(html).toContain('2'); // 2 active

    expect(html).toContain('Interviews In Progress');
    expect(html).toContain('1'); // 1 in_progress

    expect(html).toContain('Awaiting Review');
    expect(html).toContain('2'); // 2 completed

    expect(html).toContain('Total Candidates Screened');
    expect(html).toContain('3'); // 3 total sessions

    // Positions Needing Attention section
    expect(html).toContain('Positions Needing Attention');
    expect(html).toContain('Data Analyst');
    expect(html).toContain('Missing interview questions');
    expect(html).toContain('Analysis Failed');

    // Recent activity timeline
    expect(html).toContain('Recent Activity');
    expect(html).toContain('Production Engineer');
  });
});
