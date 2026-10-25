import { describe, it, expect, vi, beforeEach } from 'vitest';
import { toEngineJob } from '../../src/engine/engineJob.js';

describe('toEngineJob', () => {
  const skill1 = { id: 's1', name: 'React', priority: 'required' };
  const skill2 = { id: 's2', name: 'Node.js', priority: 'preferred' };

  it('maps skills to requirements with correct kind', () => {
    const job = { title: 'Dev', company: 'Acme', skills: [skill1, skill2], questions: [] };
    const out = toEngineJob(job);
    expect(out.requirements).toEqual([
      { name: 'React', kind: 'required' },
      { name: 'Node.js', kind: 'preferred' },
    ]);
  });

  it('filters empty question texts', () => {
    const job = {
      title: 'Dev', skills: [skill1],
      questions: [
        { text: 'Tell me about React', relatedSkills: ['s1'] },
        { text: '  ', relatedSkills: [] },
        { text: '', relatedSkills: [] },
      ],
    };
    const out = toEngineJob(job);
    expect(out.questions).toHaveLength(1);
    expect(out.questions[0].text).toBe('Tell me about React');
    expect(out.questions[0].requirementName).toBe('React');
  });

  it('uses empty requirementName when question has no linked skill', () => {
    const job = {
      title: 'Dev', skills: [skill1],
      questions: [{ text: 'General question', relatedSkills: [] }],
    };
    const out = toEngineJob(job);
    expect(out.questions[0].requirementName).toBe('');
  });

  it('returns empty questions array when job has none', () => {
    const job = { title: 'Dev', skills: [], questions: [] };
    const out = toEngineJob(job);
    expect(out.questions).toEqual([]);
    expect(out.requirements).toEqual([]);
  });

  it('includes title, company, summary, responsibilities', () => {
    const job = { title: 'Eng', company: 'Corp', summary: 'Great role', responsibilities: ['Ship code'], skills: [], questions: [] };
    const out = toEngineJob(job);
    expect(out.title).toBe('Eng');
    expect(out.company).toBe('Corp');
    expect(out.summary).toBe('Great role');
    expect(out.responsibilities).toEqual(['Ship code']);
  });
});

// ---- engineApi error handling ----
describe('engineApi', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('throws Error(code) on non-2xx response', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      json: async () => ({ error: 'text_too_short' }),
    }));
    const { importJob } = await import('../../src/data/engineApi.js');
    await expect(importJob({ text: 'hi' })).rejects.toThrow('text_too_short');
  });

  it('throws server_unreachable on network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')));
    // Re-import after stub (module may be cached, use dynamic reimport trick)
    vi.resetModules();
    const { importJob } = await import('../../src/data/engineApi.js');
    await expect(importJob({ url: 'http://x' })).rejects.toThrow('server_unreachable');
  });
});
