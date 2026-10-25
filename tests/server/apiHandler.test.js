import { describe, it, expect, beforeEach, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import { handleApiRequest, setGeminiConfig, getGeminiConfig } from '../../server/apiHandler.js';
import * as geminiModule from '../../server/gemini.js';

function createMockReq({ method = 'GET', url = '/api/health', body = null } = {}) {
  const req = new EventEmitter();
  req.method = method;
  req.url = url;
  req.headers = { host: 'localhost:3000' };
  req.pause = () => {};
  req.resume = () => {};

  process.nextTick(() => {
    if (body !== null) {
      const data = typeof body === 'string' ? body : JSON.stringify(body);
      req.emit('data', Buffer.from(data));
    }
    req.emit('end');
  });

  return req;
}

function createMockRes() {
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    setHeader(key, val) {
      this.headers[key] = val;
    },
    end(content) {
      if (content) this.body += content;
    },
  };
  return res;
}

describe('server/apiHandler.js', () => {
  beforeEach(() => {
    setGeminiConfig({ apiKey: '', model: 'gemini-1.5-flash' });
    vi.restoreAllMocks();
  });

  it('handles GET /api/health when unconfigured', async () => {
    const req = createMockReq({ method: 'GET', url: '/api/health' });
    const res = createMockRes();

    const handled = await handleApiRequest(req, res);
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.geminiConfigured).toBe(false);
    expect(json.model).toBe('gemini-1.5-flash');
  });

  it('handles GET /api/health when configured with options overrides', async () => {
    const req = createMockReq({ method: 'GET', url: '/api/health' });
    const res = createMockRes();

    const handled = await handleApiRequest(req, res, { apiKey: 'test-key', model: 'gemini-pro' });
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const json = JSON.parse(res.body);
    expect(json.geminiConfigured).toBe(true);
    expect(json.model).toBe('gemini-pro');
  });

  it('rejects Gemini endpoints with 503 when API key is missing', async () => {
    const endpoints = ['/api/reason', '/api/analysis/session', '/api/verify-evidence', '/api/parse-job'];
    for (const ep of endpoints) {
      const req = createMockReq({ method: 'POST', url: ep, body: {} });
      const res = createMockRes();
      const handled = await handleApiRequest(req, res);
      expect(handled).toBe(true);
      expect(res.statusCode).toBe(503);
      expect(JSON.parse(res.body)).toEqual({ error: 'gemini_not_configured' });
    }
  });

  it('rejects payloads exceeding 100KB with 413', async () => {
    const largeBody = 'a'.repeat(105 * 1024);
    const req = createMockReq({ method: 'POST', url: '/api/reason', body: largeBody });
    const res = createMockRes();

    const handled = await handleApiRequest(req, res, { apiKey: 'test-key' });
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(413);
  });

  it('rejects invalid JSON body with 400', async () => {
    const req = createMockReq({ method: 'POST', url: '/api/reason', body: '{invalid-json' });
    const res = createMockRes();

    const handled = await handleApiRequest(req, res, { apiKey: 'test-key' });
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(400);
  });

  it('successfully routes POST /api/reason with mocked Gemini call', async () => {
    const callGeminiSpy = vi.spyOn(geminiModule, 'callGemini').mockResolvedValue({
      action: 'ADVANCE',
      reasoning: 'Detailed response provided.',
    });

    const req = createMockReq({
      method: 'POST',
      url: '/api/reason',
      body: {
        jobTitle: 'Frontend Engineer',
        currentQuestion: 'Tell me about React',
        candidateAnswer: 'I have used React for 5 years.',
      },
    });
    const res = createMockRes();

    const handled = await handleApiRequest(req, res, { apiKey: 'fake-key' });
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(200);
    const result = JSON.parse(res.body);
    expect(result.ok).toBe(true);
    expect(result.data.action).toBe('ADVANCE');
    expect(callGeminiSpy).toHaveBeenCalledOnce();
  });

  it('returns 504 on Gemini timeout', async () => {
    const timeoutErr = new Error('Gemini request timed out after 8000ms');
    timeoutErr.code = 'GEMINI_TIMEOUT';
    vi.spyOn(geminiModule, 'callGemini').mockRejectedValue(timeoutErr);

    const req = createMockReq({
      method: 'POST',
      url: '/api/reason',
      body: { candidateAnswer: 'test' },
    });
    const res = createMockRes();

    const handled = await handleApiRequest(req, res, { apiKey: 'fake-key' });
    expect(handled).toBe(true);
    expect(res.statusCode).toBe(504);
  });
});
