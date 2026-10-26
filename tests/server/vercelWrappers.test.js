/**
 * Tests for Vercel serverless API wrappers (api/*.js).
 * Each wrapper simply delegates the req/res to handleApi from baatcheet-engine.mjs.
 */
import { describe, it, expect, vi } from 'vitest';

// Mock the engine module so tests run without a live Gemini key
vi.mock('../../server/baatcheet-engine.mjs', () => ({
  handleApi: vi.fn(async (_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  }),
}));

function makeReqRes(pathname = '/api/health') {
  const res = {
    _status: null,
    _body: '',
    _headers: {},
    writeHead(code, headers = {}) { this._status = code; this._headers = headers; },
    end(body) { this._body = body; },
  };
  const req = { url: pathname, method: 'GET' };
  return { req, res };
}

const wrappers = [
  { name: 'health', file: '../../api/health.js', path: '/api/health' },
  { name: 'job',    file: '../../api/job.js',    path: '/api/job' },
  { name: 'turn',   file: '../../api/turn.js',   path: '/api/turn' },
  { name: 'report', file: '../../api/report.js', path: '/api/report' },
  { name: 'questions', file: '../../api/questions.js', path: '/api/questions' },
];


describe('Vercel API wrappers', () => {
  for (const w of wrappers) {
    it(`${w.name}.js calls handleApi and gets a response`, async () => {
      const { default: handler } = await import(w.file);
      const { req, res } = makeReqRes(w.path);
      await handler(req, res);
      expect(res._status).toBe(200);
      const body = JSON.parse(res._body);
      expect(body).toMatchObject({ ok: true });
    });
  }
});
