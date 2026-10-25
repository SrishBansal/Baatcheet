/**
 * Minimal Server API Handler.
 * Shared by Vite dev middleware and standalone Node server.
 * Uses built-in node:http and fetch. Zero third-party backend frameworks.
 */

import { fetchLinkedInJobHtml } from './linkedinFetcher.js';
import { canonicalizeLinkedInUrl, parseJobPostingHtml } from '../src/utils/jobImport.js';

export async function handleApiRequest(req, res) {
  const urlObj = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = urlObj.pathname;

  // Endpoint: GET /api/fetch-linkedin?url=...
  if (pathname === '/api/fetch-linkedin') {
    if (req.method !== 'GET') {
      res.statusCode = 405;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Method not allowed. Use GET.' }));
      return true;
    }

    const targetUrl = urlObj.searchParams.get('url');
    if (!targetUrl) {
      res.statusCode = 400;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ error: 'Missing "url" query parameter.' }));
      return true;
    }

    try {
      const { canonicalUrl } = canonicalizeLinkedInUrl(targetUrl);
      const { httpStatus, finalUrl, html } = await fetchLinkedInJobHtml(canonicalUrl);
      const parsedJob = parseJobPostingHtml(html, finalUrl, httpStatus);

      res.statusCode = 200;
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ ok: true, data: parsedJob }));
      return true;
    } catch (err) {
      res.statusCode = 422;
      res.setHeader('Content-Type', 'application/json');
      res.end(
        JSON.stringify({
          ok: false,
          error: err.message || 'Failed to fetch or parse LinkedIn posting.',
        })
      );
      return true;
    }
  }

  return false;
}
