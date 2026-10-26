import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import Positions from '../../src/pages/Positions.jsx';
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

describe('Positions Page Rendering (Checkpoint 6)', () => {
  beforeEach(() => {
    store.jobs.clear();
    store.sessions.clear();
  });

  function renderPositions() {
    return renderToString(
      <MemoryRouter initialEntries={['/positions']}>
        <Routes>
          <Route path="/positions" element={<Positions />} />
        </Routes>
      </MemoryRouter>
    );
  }

  it('renders clean empty state when no positions exist', () => {
    const html = renderPositions();

    expect(html).toContain('Positions');
    expect(html).toContain('No positions created yet');
    expect(html).toContain('Create Position');
  });

  it('renders one position card per position with status, questions, sessions, and actions', () => {
    store.jobs.add({
      id: 'job-sec-eng',
      title: 'Cloud Security Architect',
      department: 'Security',
      status: 'active',
      questions: [{ id: 'q1', text: 'IAM zero trust' }, { id: 'q2', text: 'Threat modeling' }],
      requirements: [{ id: 'r1', name: 'Zero Trust' }],
      createdAt: '2026-10-25T07:00:00Z',
    });

    store.jobs.add({
      id: 'job-draft-pm',
      title: 'Growth Product Manager',
      department: 'Product',
      status: 'draft',
      questions: [],
      requirements: [],
      createdAt: '2026-10-25T07:30:00Z',
    });

    // Save session for Cloud Security Architect
    store.sessions.save({
      id: 'sess-sec-1',
      jobId: 'job-sec-eng',
      status: 'completed',
      startedAt: '2026-10-25T08:00:00Z',
      endedAt: '2026-10-25T08:15:00Z',
      jobSnapshot: { title: 'Cloud Security Architect' },
      turns: [{ id: 't1', answer: { finalText: 'Zero trust architecture' } }],
    });

    const html = renderPositions();

    expect((html.match(/position-card/g) || []).length).toBeGreaterThanOrEqual(2);

    // Job rows
    expect(html).toContain('Cloud Security Architect');
    expect(html).toContain('Active');
    expect(html).toMatch(/2.*question/);
    expect(html).toContain('1<!-- --> completed');
    expect(html).toContain('Start interview'); // Active-position card action label

    expect(html).toContain('Growth Product Manager');
    expect(html).toContain('Draft');
    expect(html).toContain('Configure');
    expect(html).toContain('--department-color:var(--dept-product)');
    expect(html).toContain('--department-color:var(--dept-general)');
  });
});
