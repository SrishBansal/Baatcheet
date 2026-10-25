import { beforeEach, describe, expect, it, vi } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { store } from '../../src/data/store.js';

if (!globalThis.localStorage) {
  const values = {};
  globalThis.localStorage = { getItem: (key) => values[key] || null, setItem: (key, value) => { values[key] = String(value); }, removeItem: (key) => { delete values[key]; } };
}

let mockSession;
vi.mock('../../src/hooks/useInterviewSession.js', () => ({ useInterviewSession: () => mockSession }));
vi.mock('../../src/data/engineApi.js', () => ({ health: vi.fn(), healthLabel: () => 'AI: NOT configured' }));
const { default: InterviewSession } = await import('../../src/pages/InterviewSession.jsx');

describe('InterviewSession room layout', () => {
  beforeEach(() => {
    store.jobs.clear();
    store.jobs.add({ id: 'room-job', title: 'Long question role', status: 'active', settings: { allowTyping: true }, questions: [{ id: 'q1', text: 'x' }] });
    mockSession = {
      state: 'LISTENING', progress: { current: 1, total: 1 }, transcript: [], interimSpeech: '', speechError: null,
      hasConsented: true,
      engineError: null, inputMode: 'voice', capabilities: { hasSpeechRecognition: true }, reasoning: {}, sessionRecord: { candidate: { name: 'Candidate' } },
      activePrompt: { text: 'A'.repeat(240), isFollowUp: false }, grantConsent: vi.fn(), setCandidate: vi.fn(), startInterview: vi.fn(),
      submitAnswer: vi.fn(), doneAnswer: vi.fn(), repeatQuestion: vi.fn(), startOverAnswer: vi.fn(), pause: vi.fn(), endEarly: vi.fn(), retryTurn: vi.fn(), restartMicrophone: vi.fn(), resetStep: vi.fn(), microphoneStalled: false,
    };
  });

  it('renders a long question in the flex-stacked caption and question-card siblings', () => {
    const html = renderToString(<MemoryRouter initialEntries={['/interview/room-job']}><Routes><Route path="/interview/:jobId" element={<InterviewSession />} /></Routes></MemoryRouter>);
    expect(html).toContain('A'.repeat(240));
    expect(html).toMatch(/live-caption-box[\s\S]*active-question-card/);
  });
});
