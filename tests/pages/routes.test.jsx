import { describe, it, expect, beforeEach } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import Dashboard from '../../src/pages/Dashboard.jsx';
import Positions from '../../src/pages/Positions.jsx';
import JobConfig from '../../src/pages/JobConfig.jsx';
import AppShell from '../../src/components/layout/AppShell.jsx';
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

function RedirectJobId() {
  const { id } = useParams();
  return <Navigate to={`/positions/${id}`} replace />;
}

describe('Route Navigation & Backward Compatibility (Checkpoint 6)', () => {
  beforeEach(() => {
    store.jobs.clear();
    store.sessions.clear();
  });

  function renderAppAt(path) {
    return renderToString(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/" element={<AppShell />}>
            <Route index element={<Dashboard />} />
            <Route path="positions" element={<Positions />} />
            <Route path="positions/new" element={<JobConfig />} />
            <Route path="positions/:id" element={<JobConfig />} />

            {/* Backward compatibility redirects */}
            <Route path="jobs" element={<Navigate to="/positions" replace />} />
            <Route path="jobs/new" element={<Navigate to="/positions/new" replace />} />
            <Route path="jobs/:id/edit" element={<RedirectJobId />} />
            <Route path="jobs/:id" element={<RedirectJobId />} />
          </Route>
        </Routes>
      </MemoryRouter>
    );
  }

  it('renders Dashboard at root path /', () => {
    const html = renderAppAt('/');
    expect(html).toContain('Operational Overview');
  });

  it('renders Positions directory at /positions', () => {
    store.jobs.add({
      id: 'job-sample',
      title: 'DevOps Engineer',
      status: 'active',
      createdAt: '2026-10-25T10:00:00Z',
    });
    const html = renderAppAt('/positions');
    expect(html).toContain('Positions');
    expect(html).toContain('positions-grid');
    expect(html).toContain('DevOps Engineer');
  });

  it('renders AppShell with navigation links to / and /positions and /interviews', () => {
    const html = renderAppAt('/');
    expect(html).toContain('href="/"');
    expect(html).toContain('href="/positions"');
    expect(html).toContain('href="/interviews"');
  });
});
