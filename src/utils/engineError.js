const messages = {
  gemini_quota_exhausted: "Today's free Gemini quota is used up on every model. Try again tomorrow, or enable billing in Google AI Studio. Your answer is saved.",
  gemini_http_429: "Google's AI is rate-limited right now. Wait about a minute, then press Retry. Your answer is saved.",
  gemini_http_503: "Google's AI is busy. Press Retry in a few seconds.",
  gemini_http_401: 'The Gemini key was rejected. Check GEMINI_API_KEY in .env.local.',
  gemini_http_403: 'The Gemini key was rejected. Check GEMINI_API_KEY in .env.local.',
  gemini_model_not_found: 'No usable Gemini model was found for this key.', gemini_http_404: 'No usable Gemini model was found for this key.',
  gemini_timeout_or_network: 'Could not reach the interviewer. Check your connection and press Retry.', server_unreachable: 'Could not reach the interviewer. Check your connection and press Retry.',
  gemini_not_configured: 'Add GEMINI_API_KEY to .env.local and restart the dev server.',
};
export function engineErrorMessage(code) { return messages[code] || 'Interviewer unavailable.'; }
