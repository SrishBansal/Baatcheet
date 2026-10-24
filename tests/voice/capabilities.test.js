import { describe, it, expect } from 'vitest';
import { detectCapabilities } from '../../src/voice/capabilities.js';

describe('detectCapabilities', () => {
  it('detects full_voice when both SpeechRecognition and speechSynthesis are supported', () => {
    class MockSpeechRecognition {}
    const mockWindow = {
      SpeechRecognition: MockSpeechRecognition,
      speechSynthesis: { speak: () => {}, cancel: () => {} },
      SpeechSynthesisUtterance: class {},
    };

    const caps = detectCapabilities(mockWindow);

    expect(caps.hasSpeechRecognition).toBe(true);
    expect(caps.hasSpeechSynthesis).toBe(true);
    expect(caps.supportsFullVoice).toBe(true);
    expect(caps.supportsTextInputFallback).toBe(true);
    expect(caps.mode).toBe('full_voice');
    expect(caps.details.recognitionApi).toBe('SpeechRecognition');
    expect(caps.details.synthesisApi).toBe(true);
    expect(caps.summary).toContain('Full voice support');
  });

  it('detects webkitSpeechRecognition as valid recognition API', () => {
    class MockWebkitSpeechRecognition {}
    const mockWindow = {
      webkitSpeechRecognition: MockWebkitSpeechRecognition,
      speechSynthesis: { speak: () => {}, cancel: () => {} },
      SpeechSynthesisUtterance: class {},
    };

    const caps = detectCapabilities(mockWindow);

    expect(caps.hasSpeechRecognition).toBe(true);
    expect(caps.details.recognitionApi).toBe('webkitSpeechRecognition');
    expect(caps.mode).toBe('full_voice');
  });

  it('detects synthesis_only mode (Safari profile: synthesis supported, recognition unsupported)', () => {
    const mockSafariWindow = {
      speechSynthesis: { speak: () => {}, cancel: () => {} },
      SpeechSynthesisUtterance: class {},
    };

    const caps = detectCapabilities(mockSafariWindow);

    expect(caps.hasSpeechRecognition).toBe(false);
    expect(caps.hasSpeechSynthesis).toBe(true);
    expect(caps.supportsFullVoice).toBe(false);
    expect(caps.supportsTextInputFallback).toBe(true);
    expect(caps.mode).toBe('synthesis_only');
    expect(caps.details.recognitionApi).toBeNull();
    expect(caps.details.synthesisApi).toBe(true);
    expect(caps.summary).toContain('speech recognition is unsupported');
  });

  it('detects recognition_only mode (recognition supported, synthesis unsupported)', () => {
    class MockSpeechRecognition {}
    const mockWindow = {
      SpeechRecognition: MockSpeechRecognition,
    };

    const caps = detectCapabilities(mockWindow);

    expect(caps.hasSpeechRecognition).toBe(true);
    expect(caps.hasSpeechSynthesis).toBe(false);
    expect(caps.supportsFullVoice).toBe(false);
    expect(caps.mode).toBe('recognition_only');
    expect(caps.summary).toContain('speech synthesis is unsupported');
  });

  it('detects text_fallback_only when neither recognition nor synthesis is supported', () => {
    const mockEmptyWindow = {};

    const caps = detectCapabilities(mockEmptyWindow);

    expect(caps.hasSpeechRecognition).toBe(false);
    expect(caps.hasSpeechSynthesis).toBe(false);
    expect(caps.supportsFullVoice).toBe(false);
    expect(caps.supportsTextInputFallback).toBe(true);
    expect(caps.mode).toBe('text_fallback_only');
    expect(caps.summary).toContain('Voice unsupported');
  });

  it('handles null/undefined window parameter gracefully', () => {
    const caps = detectCapabilities(null);
    expect(caps.supportsTextInputFallback).toBe(true);
    expect(typeof caps.mode).toBe('string');
  });
});
