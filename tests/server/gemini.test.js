import { describe, it, expect, vi, beforeEach } from 'vitest';
import { callGemini } from '../../server/gemini.js';

describe('server/gemini.js', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws GEMINI_NOT_CONFIGURED when apiKey is missing', async () => {
    await expect(callGemini({ apiKey: '' })).rejects.toThrow('Gemini API key is not configured');
  });

  it('parses JSON response correctly when responseSchema is provided', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        candidates: [
          {
            content: {
              parts: [{ text: JSON.stringify({ action: 'ADVANCE', reasoning: 'Good answer' }) }],
            },
          },
        ],
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    const result = await callGemini({
      apiKey: 'test-api-key',
      userText: 'Evaluate answer',
      responseSchema: { type: 'OBJECT' },
    });

    expect(result).toEqual({ action: 'ADVANCE', reasoning: 'Good answer' });
  });

  it('sanitizes API keys in upstream error messages', async () => {
    const mockResponse = {
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: 'API key not valid. Please pass a valid API key?key=AIzaSySecretKey123',
        },
      }),
    };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

    await expect(
      callGemini({
        apiKey: 'test-api-key',
        userText: 'Hello',
      })
    ).rejects.toThrow(/key=REDACTED/);
  });
});
