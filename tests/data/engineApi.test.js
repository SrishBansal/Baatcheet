import { describe, expect, it } from 'vitest';
import { healthLabel } from '../../src/data/engineApi.js';

describe('healthLabel', () => {
  it('matches the shared health status states used by the shell and interview room', () => {
    expect(healthLabel({ geminiConfigured: true, model: 'gemini-2.5-flash' })).toBe('AI: Gemini connected (gemini-2.5-flash)');
    expect(healthLabel({ geminiConfigured: false })).toBe('AI: NOT configured');
    expect(healthLabel({ error: true })).toBe('Server not reachable');
  });
});
