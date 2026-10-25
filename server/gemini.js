/**
 * Gemini REST Client (server-side only).
 * Uses Node 18+ built-in global fetch and AbortController.
 * Zero external SDK dependencies.
 * Never logs or exposes API keys or untrusted candidate transcripts in errors.
 */

export async function callGemini({
  apiKey,
  model = 'gemini-1.5-flash',
  systemInstruction,
  userText,
  responseSchema,
  maxOutputTokens = 1024,
  timeoutMs = 15000,
}) {
  if (!apiKey) {
    const err = new Error('Gemini API key is not configured');
    err.code = 'GEMINI_NOT_CONFIGURED';
    throw err;
  }

  const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
    model
  )}:generateContent?key=${encodeURIComponent(apiKey)}`;

  const bodyPayload = {
    contents: [
      {
        role: 'user',
        parts: [{ text: userText || '' }],
      },
    ],
    generationConfig: {
      temperature: 0.1,
      maxOutputTokens,
      ...(responseSchema
        ? {
            responseMimeType: 'application/json',
            responseSchema,
          }
        : {}),
    },
  };

  if (systemInstruction) {
    bodyPayload.systemInstruction = {
      parts: [{ text: systemInstruction }],
    };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  let response;
  try {
    response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(bodyPayload),
      signal: controller.signal,
    });
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') {
      const timeoutErr = new Error(`Gemini request timed out after ${timeoutMs}ms`);
      timeoutErr.code = 'GEMINI_TIMEOUT';
      throw timeoutErr;
    }
    const networkErr = new Error(`Gemini network error: ${err.message || 'connection failed'}`);
    networkErr.code = 'GEMINI_NETWORK_ERROR';
    throw networkErr;
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    let sanitizedError = `HTTP ${response.status}`;
    try {
      const errJson = await response.json();
      if (errJson?.error?.message) {
        // Strip any potential key or query params from error message
        sanitizedError = String(errJson.error.message).replace(/key=[^&\s]+/gi, 'key=REDACTED');
      }
    } catch {
      // Ignore JSON parse error on error response
    }
    const apiErr = new Error(`Gemini API error: ${sanitizedError}`);
    apiErr.statusCode = response.status;
    throw apiErr;
  }

  let data;
  try {
    data = await response.json();
  } catch (err) {
    throw new Error('Failed to parse Gemini response as JSON');
  }

  const candidatePart = data?.candidates?.[0]?.content?.parts?.[0];
  const candidateText = candidatePart?.text;

  if (candidateText === undefined || candidateText === null) {
    throw new Error('Gemini returned an empty candidate text response');
  }

  if (responseSchema) {
    try {
      return JSON.parse(candidateText.trim());
    } catch (parseErr) {
      throw new Error(`Failed to parse structured response from Gemini: ${parseErr.message}`);
    }
  }

  return candidateText;
}
