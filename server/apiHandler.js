/**
 * Minimal Server API Handler.
 * Shared by Vite dev middleware and standalone Node server.
 * Uses built-in node:http and fetch. Zero third-party backend frameworks.
 */

import { fetchLinkedInJobHtml } from './linkedinFetcher.js';
import { canonicalizeLinkedInUrl, parseJobPostingHtml } from '../src/utils/jobImport.js';
import { callGemini } from './gemini.js';
import {
  SYSTEM_INSTRUCTION_BASE,
  REASONING_SCHEMA,
  buildReasoningPrompt,
  ANALYSIS_SCHEMA,
  buildAnalysisPrompt,
  VERIFY_EVIDENCE_SCHEMA,
  buildVerifyEvidencePrompt,
  PARSE_JOB_SCHEMA,
  buildParseJobPrompt,
} from './prompts.js';

let _geminiConfig = {
  apiKey: process.env.GEMINI_API_KEY || '',
  model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
};

export function setGeminiConfig(cfg = {}) {
  _geminiConfig = {
    apiKey: cfg.apiKey !== undefined ? cfg.apiKey : _geminiConfig.apiKey,
    model: cfg.model !== undefined ? cfg.model : _geminiConfig.model,
  };
}

export function getGeminiConfig(overrides = {}) {
  return {
    apiKey: overrides?.apiKey || _geminiConfig.apiKey || process.env.GEMINI_API_KEY || '',
    model: overrides?.model || _geminiConfig.model || process.env.GEMINI_MODEL || 'gemini-1.5-flash',
  };
}

function readJsonBody(req, maxBytes = 100 * 1024) {
  return new Promise((resolve, reject) => {
    let bytesReceived = 0;
    const chunks = [];

    const onData = (chunk) => {
      bytesReceived += chunk.length;
      if (bytesReceived > maxBytes) {
        req.removeListener('data', onData);
        if (typeof req.pause === 'function') {
          req.pause();
        }
        const err = new Error('Payload Too Large: body exceeds 100KB limit');
        err.statusCode = 413;
        reject(err);
        return;
      }
      chunks.push(chunk);
    };

    req.on('data', onData);

    req.once('end', () => {
      const raw = Buffer.concat(chunks).toString('utf8');
      if (!raw || !raw.trim()) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        resolve(parsed);
      } catch (err) {
        const parseErr = new Error('Invalid JSON body');
        parseErr.statusCode = 400;
        reject(parseErr);
      }
    });

    req.once('error', (err) => {
      reject(err);
    });
  });
}

function sendJson(res, statusCode, data) {
  res.statusCode = statusCode;
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(data));
}

export async function handleApiRequest(req, res, options = {}) {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;
  const config = getGeminiConfig(options);

  // Endpoint: GET /api/health
  if (pathname === '/api/health') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed. Use GET.' });
      return true;
    }
    sendJson(res, 200, {
      geminiConfigured: Boolean(config.apiKey),
      model: config.model,
    });
    return true;
  }

  // Endpoint: GET /api/fetch-linkedin?url=...
  if (pathname === '/api/fetch-linkedin') {
    if (req.method !== 'GET') {
      sendJson(res, 405, { error: 'Method not allowed. Use GET.' });
      return true;
    }

    const targetUrl = urlObj.searchParams.get('url');
    if (!targetUrl) {
      sendJson(res, 400, { error: 'Missing "url" query parameter.' });
      return true;
    }

    try {
      const { canonicalUrl } = canonicalizeLinkedInUrl(targetUrl);
      const { httpStatus, finalUrl, html } = await fetchLinkedInJobHtml(canonicalUrl);
      const parsedJob = parseJobPostingHtml(html, finalUrl, httpStatus);
      sendJson(res, 200, { ok: true, data: parsedJob });
      return true;
    } catch (err) {
      sendJson(res, 422, {
        ok: false,
        error: err.message || 'Failed to fetch or parse LinkedIn posting.',
      });
      return true;
    }
  }

  // Gemini-backed endpoints below require configured key
  const geminiEndpoints = [
    '/api/reason',
    '/api/analysis/session',
    '/api/verify-evidence',
    '/api/parse-job',
  ];

  if (geminiEndpoints.includes(pathname)) {
    if (req.method !== 'POST') {
      sendJson(res, 405, { error: 'Method not allowed. Use POST.' });
      return true;
    }

    if (!config.apiKey) {
      sendJson(res, 503, { error: 'gemini_not_configured' });
      return true;
    }

    let body;
    try {
      body = await readJsonBody(req);
    } catch (bodyErr) {
      sendJson(res, bodyErr.statusCode || 400, { error: bodyErr.message || 'Invalid request body' });
      return true;
    }

    try {
      if (pathname === '/api/reason') {
        const jobTitle = body.jobTitle || body.job?.title;
        const requirements = body.requirements || body.job?.requirements || [];
        const currentQuestion = body.currentQuestion || body.currentTurn?.question || body.question || '';
        const candidateAnswer =
          body.candidateAnswer || body.currentTurn?.candidateAnswer || body.currentTurn?.answer || body.answer || '';
        const history = body.history || body.turns || [];

        const userPrompt = buildReasoningPrompt({
          jobTitle,
          requirements,
          currentQuestion,
          candidateAnswer,
          history,
        });

        const result = await callGemini({
          apiKey: config.apiKey,
          model: config.model,
          systemInstruction: SYSTEM_INSTRUCTION_BASE,
          userText: userPrompt,
          responseSchema: REASONING_SCHEMA,
          timeoutMs: 8000,
        });

        sendJson(res, 200, { ok: true, data: result });
        return true;
      }

      if (pathname === '/api/analysis/session') {
        const jobTitle = body.jobTitle || body.job?.title;
        const requirements = body.requirements || body.job?.requirements || [];
        const turns = body.turns || body.session?.turns || [];

        const userPrompt = buildAnalysisPrompt({ jobTitle, requirements, turns });

        const result = await callGemini({
          apiKey: config.apiKey,
          model: config.model,
          systemInstruction: SYSTEM_INSTRUCTION_BASE,
          userText: userPrompt,
          responseSchema: ANALYSIS_SCHEMA,
          timeoutMs: 30000,
        });

        sendJson(res, 200, { ok: true, data: result });
        return true;
      }

      if (pathname === '/api/verify-evidence') {
        const quotes = body.quotes || [];
        const transcriptText =
          body.transcriptText ||
          (Array.isArray(body.transcript)
            ? body.transcript.map((t) => t.candidateAnswer || t.answer || '').join('\n')
            : String(body.transcript || ''));

        const userPrompt = buildVerifyEvidencePrompt({ quotes, transcriptText });

        const result = await callGemini({
          apiKey: config.apiKey,
          model: config.model,
          systemInstruction: SYSTEM_INSTRUCTION_BASE,
          userText: userPrompt,
          responseSchema: VERIFY_EVIDENCE_SCHEMA,
          timeoutMs: 20000,
        });

        sendJson(res, 200, { ok: true, data: result });
        return true;
      }

      if (pathname === '/api/parse-job') {
        const text = body.text || body.jobPostingText || '';
        if (!text.trim()) {
          sendJson(res, 400, { error: 'Missing job posting text in body' });
          return true;
        }

        const userPrompt = buildParseJobPrompt(text);

        const result = await callGemini({
          apiKey: config.apiKey,
          model: config.model,
          systemInstruction: SYSTEM_INSTRUCTION_BASE,
          userText: userPrompt,
          responseSchema: PARSE_JOB_SCHEMA,
          timeoutMs: 15000,
        });

        sendJson(res, 200, { ok: true, data: result });
        return true;
      }
    } catch (apiErr) {
      const statusCode = apiErr.code === 'GEMINI_TIMEOUT' ? 504 : 500;
      sendJson(res, statusCode, {
        ok: false,
        error: apiErr.message || 'Gemini processing failed',
      });
      return true;
    }
  }

  return false;
}
