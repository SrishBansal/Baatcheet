import { describe, it, expect, vi, beforeEach } from 'vitest';
import { fetchLinkedInJobHtml, MAX_BODY_BYTES } from '../../server/linkedinFetcher.js';

describe('Server-side LinkedIn Fetcher', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('detects HTTP 999 anti-bot rate limiting', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 999,
      url: 'https://www.linkedin.com/jobs/view/123/',
    });

    await expect(fetchLinkedInJobHtml('https://www.linkedin.com/jobs/view/123/')).rejects.toThrow(
      /HTTP 999 \(Anti-bot rate limiting/
    );
  });

  it('detects HTTP 429 rate limit exceeded', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 429,
      url: 'https://www.linkedin.com/jobs/view/123/',
    });

    await expect(fetchLinkedInJobHtml('https://www.linkedin.com/jobs/view/123/')).rejects.toThrow(
      /rate limit exceeded \(HTTP 429\)/
    );
  });

  it('detects HTTP 401/403 access denied', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 403,
      url: 'https://www.linkedin.com/jobs/view/123/',
    });

    await expect(fetchLinkedInJobHtml('https://www.linkedin.com/jobs/view/123/')).rejects.toThrow(
      /access denied \(HTTP 403\)/
    );
  });

  it('detects redirect to authwall URL', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      url: 'https://www.linkedin.com/authwall?trk=bf&trkInfo=123',
    });

    await expect(fetchLinkedInJobHtml('https://www.linkedin.com/jobs/view/123/')).rejects.toThrow(
      /LinkedIn authwall detected/
    );
  });

  it('enforces size cap on response body', async () => {
    // Generate large text exceeding MAX_BODY_BYTES
    const oversizedText = 'A'.repeat(MAX_BODY_BYTES + 5000);
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 200,
      url: 'https://www.linkedin.com/jobs/view/123/',
      text: async () => oversizedText,
    });

    const result = await fetchLinkedInJobHtml('https://www.linkedin.com/jobs/view/123/');
    expect(result.html.length).toBeLessThanOrEqual(MAX_BODY_BYTES);
    expect(result.httpStatus).toBe(200);
  });

  it('handles fetch timeout cleanly', async () => {
    globalThis.fetch = vi.fn().mockRejectedValue({
      name: 'TimeoutError',
      message: 'The operation timed out',
    });

    await expect(fetchLinkedInJobHtml('https://www.linkedin.com/jobs/view/123/')).rejects.toThrow(
      /timed out after/
    );
  });

  it('P0.2: HTTP 404 throws without returning job data', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 404,
      url: 'https://www.linkedin.com/jobs/view/999/',
    });

    await expect(
      fetchLinkedInJobHtml('https://www.linkedin.com/jobs/view/999/')
    ).rejects.toThrow(/HTTP 404/);
  });

  it('P0.2: any non-2xx (e.g. 500) throws without returning job data', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      status: 500,
      url: 'https://www.linkedin.com/jobs/view/123/',
    });

    await expect(
      fetchLinkedInJobHtml('https://www.linkedin.com/jobs/view/123/')
    ).rejects.toThrow(/HTTP 500/);
  });
});
