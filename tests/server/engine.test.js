import { beforeEach, describe, expect, it, vi } from 'vitest';

const call = async (url, body) => {
  let code, text = '';
  const req = Object.assign((async function* () { yield JSON.stringify(body); })(), { url, method: 'POST' });
  const res = { writeHead: (n) => { code = n; }, end: (s) => { text = s; } };
  const { handleApi } = await import('../../server/baatcheet-engine.mjs');
  await handleApi(req, res);
  return { code, body: JSON.parse(text) };
};
const answer = (obj) => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) });

describe('baatcheet engine model chain', () => {
  beforeEach(() => { vi.resetModules(); vi.unstubAllGlobals(); process.env.GEMINI_API_KEY = 'k'; process.env.GEMINI_RETRY_MS = '1'; process.env.GEMINI_MODEL = 'm1'; process.env.GEMINI_FALLBACK_MODEL = 'm2'; });
  it('uses fallback after 429', async () => {
    const models = []; vi.stubGlobal('fetch', vi.fn((url) => { models.push(url.match(/models\/([^:]+)/)[1]); return models.length === 1 ? { ok: false, status: 429 } : answer({ questions: [] }); }));
    await call('/api/questions', { job: { title: 'x', requirements: [{ name: 'r' }] } }); expect(models.slice(0, 2)).toEqual(['m1', 'm2']);
  });
  it('retries transient 503 on the same model', async () => {
    const models = []; vi.stubGlobal('fetch', vi.fn((url) => { models.push(url.match(/models\/([^:]+)/)[1]); return models.length === 1 ? { ok: false, status: 503 } : answer({ questions: [] }); }));
    await call('/api/questions', { job: { title: 'x', requirements: [{ name: 'r' }] } }); expect(models.slice(0, 2)).toEqual(['m1', 'm1']);
  });
  it('returns quota exhausted when every model is 429', async () => {
    vi.stubGlobal('fetch', vi.fn(() => ({ ok: false, status: 429 }))); const r = await call('/api/questions', { job: { requirements: [{ name: 'r' }] } }); expect(r.body).toEqual({ error: 'gemini_quota_exhausted' });
  });
  it('forces a follow-up after a short answer', async () => {
    let schema; vi.stubGlobal('fetch', vi.fn((url, opt) => { schema = JSON.parse(opt.body).generationConfig.responseSchema; return answer({ action: 'FOLLOW_UP', say: 'What happened next?', requirement: 'r', why: 'detail' }); }));
    await call('/api/turn', { job: { requirements: [{ name: 'r' }] }, transcript: [{ role: 'interviewer', action: 'INTRO', text: 'Q' }, { role: 'candidate', text: 'one two three' }] }); expect(schema.properties.action.enum).toEqual(['FOLLOW_UP']);
  });
});
