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
  it('uses fallback after 404', async () => {
    const models = []; vi.stubGlobal('fetch', vi.fn((url) => { models.push(url.match(/models\/([^:]+)/)[1]); return models.length === 1 ? { ok: false, status: 404 } : answer({ questions: [] }); }));
    await call('/api/questions', { job: { requirements: [{ name: 'r' }] } }); expect(models.slice(0, 2)).toEqual(['m1', 'm2']);
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
  it('skips cooled-down models on the next request', async () => {
    const models = []; vi.stubGlobal('fetch', vi.fn((url) => { models.push(url.match(/models\/([^:]+)/)[1]); return models.length === 1 ? { ok: false, status: 429 } : answer({ questions: [] }); }));
    const body = { job: { requirements: [{ name: 'r' }] } };
    await call('/api/questions', body); await call('/api/questions', body); expect(models[2]).toBe('m2');
  });
  it('allows next question after a long answer and wraps after two follow-ups', async () => {
    const schemas = []; vi.stubGlobal('fetch', vi.fn((url, opt) => { const schema = JSON.parse(opt.body).generationConfig.responseSchema; schemas.push(schema); const action = schema.properties.action.enum[0]; return answer({ action, say: action === 'WRAP_UP' ? 'Thank you.' : 'Follow up?', requirement: 'r', why: 'test' }); }));
    const long = Array(70).fill('word').join(' ');
    await call('/api/turn', { job: { requirements: [{ name: 'r' }] }, transcript: [{ role: 'interviewer', action: 'INTRO', text: 'Q' }, { role: 'candidate', text: long }] });
    await call('/api/turn', { job: { requirements: [{ name: 'r' }] }, transcript: [...Array.from({ length: 6 }, (_, i) => ({ role: 'interviewer', action: i ? 'NEXT_QUESTION' : 'INTRO', text: `Q${i}` })), { role: 'candidate', text: 'answer' }, { role: 'interviewer', action: 'FOLLOW_UP', text: 'F1' }, { role: 'candidate', text: 'answer' }, { role: 'interviewer', action: 'FOLLOW_UP', text: 'F2' }, { role: 'candidate', text: 'answer' }] });
    expect(schemas[0].properties.action.enum).toContain('NEXT_QUESTION');
    expect(schemas[1].properties.action.enum).toEqual(['WRAP_UP']);
  });
  it('reports configured health with a model', async () => {
    let text = ''; const req = { url: '/api/health', method: 'GET' }; const res = { writeHead: () => {}, end: (s) => { text = s; } };
    const { handleApi } = await import('../../server/baatcheet-engine.mjs'); await handleApi(req, res);
    expect(JSON.parse(text)).toEqual({ geminiConfigured: true, model: expect.any(String) });
  });
});
