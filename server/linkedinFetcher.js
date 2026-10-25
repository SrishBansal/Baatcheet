/**
 * Server-side LinkedIn Job Posting Fetcher.
 *
 * Implements the minimal server-side boundary required to fetch public job postings
 * while handling LinkedIn anti-bot protection, authwalls, and HTTP redirects explicitly.
 */

export const MAX_BODY_BYTES = 512 * 1024; // 512 KB size cap
export const FETCH_TIMEOUT_MS = 8000; // 8s timeout

/**
 * Fetches public HTML from a target LinkedIn URL with timeout and size cap.
 *
 * @param {string} targetUrl
 * @returns {Promise<{ httpStatus: number, finalUrl: string, html: string }>}
 */
export async function fetchLinkedInJobHtml(targetUrl) {
  if (!targetUrl || typeof targetUrl !== 'string') {
    throw new Error('Target URL is required.');
  }

  const userAgent =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

  let response;
  try {
    response = await fetch(targetUrl, {
      method: 'GET',
      headers: {
        'User-Agent': userAgent,
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'en-US,en;q=0.9',
        'Cache-Control': 'no-cache',
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      redirect: 'follow',
    });
  } catch (err) {
    if (err.name === 'TimeoutError' || err.message?.includes('timeout')) {
      throw new Error(`LinkedIn fetch timed out after ${FETCH_TIMEOUT_MS / 1000}s.`);
    }
    throw new Error(`Failed to connect to LinkedIn: ${err.message}`);
  }

  const httpStatus = response.status;
  const finalUrl = response.url || targetUrl;

  // Handle distinct HTTP error statuses honestly
  if (httpStatus === 999) {
    throw new Error('LinkedIn returned HTTP 999 (Anti-bot rate limiting / request blocked).');
  }
  if (httpStatus === 429) {
    throw new Error('LinkedIn rate limit exceeded (HTTP 429). Please try again later.');
  }
  if (httpStatus === 401 || httpStatus === 403) {
    throw new Error(`LinkedIn access denied (HTTP ${httpStatus}). Authentication required.`);
  }

  // Check if final URL redirected to an authwall or login page
  if (
    finalUrl.includes('linkedin.com/authwall') ||
    finalUrl.includes('linkedin.com/login') ||
    finalUrl.includes('checkpoint')
  ) {
    throw new Error(
      'LinkedIn authwall detected. Public scraping is restricted by LinkedIn authentication.'
    );
  }

  // Stream reader with size cap
  const reader = response.body?.getReader();
  if (!reader) {
    const text = await response.text();
    return { httpStatus, finalUrl, html: text.slice(0, MAX_BODY_BYTES) };
  }

  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      totalBytes += value.length;
      chunks.push(value);
      if (totalBytes > MAX_BODY_BYTES) {
        await reader.cancel();
        break;
      }
    }
  }

  const concatenated = new Uint8Array(Math.min(totalBytes, MAX_BODY_BYTES));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset + chunk.length > MAX_BODY_BYTES) {
      concatenated.set(chunk.slice(0, MAX_BODY_BYTES - offset), offset);
      break;
    }
    concatenated.set(chunk, offset);
    offset += chunk.length;
  }

  const decoder = new TextDecoder('utf-8');
  const html = decoder.decode(concatenated);

  return { httpStatus, finalUrl, html };
}
