/**
 * Client-side fetch wrappers for the baatcheet-engine API routes.
 * Each function throws Error(code) on non-2xx (using response.error field),
 * or Error('server_unreachable') on network failure.
 */

async function call(path, body) {
  let res;
  try {
    res = await fetch(path, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error('server_unreachable');
  }
  if (!res.ok) {
    let code = 'server_error';
    try { code = (await res.json()).error || code; } catch {}
    throw new Error(code);
  }
  return res.json();
}

/** GET /api/health */
export async function health() {
  let res;
  try { res = await fetch('/api/health'); } catch { throw new Error('server_unreachable'); }
  if (!res.ok) throw new Error('server_error');
  return res.json();
}

/** POST /api/job */
export function importJob(body) {
  return call('/api/job', body);
}

/** POST /api/turn */
export function nextTurn(body) {
  return call('/api/turn', body);
}

/** POST /api/questions */
export function suggestQuestions(body) {
  return call('/api/questions', body);
}

/** POST /api/report */
export function makeReport(body) {
  return call('/api/report', body);
}
