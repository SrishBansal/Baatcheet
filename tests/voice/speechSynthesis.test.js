import { describe, it, expect, vi } from 'vitest';
import { BrowserSpeechSynthesizer } from '../../src/voice/speechSynthesis.js';

class MockSpeechSynthesisUtterance {
  constructor(text) {
    this.text = text;
    this.lang = 'en-US';
    this.rate = 1.0;
    this.pitch = 1.0;
    this.onstart = null;
    this.onend = null;
    this.onerror = null;
  }
}

class MockSpeechSynthesis {
  constructor() {
    this.spokenUtterances = [];
    this.cancelCalled = false;
  }

  speak(utterance) {
    this.spokenUtterances.push(utterance);
    // Simulate start callback
    if (utterance.onstart) utterance.onstart();
  }

  cancel() {
    this.cancelCalled = true;
  }
}

describe('BrowserSpeechSynthesizer', () => {
  it('detects isSupported correctly', () => {
    const supported = new BrowserSpeechSynthesizer({
      speechSynthesis: new MockSpeechSynthesis(),
      UtteranceConstructor: MockSpeechSynthesisUtterance,
    });
    expect(supported.isSupported()).toBe(true);

    const unsupported = new BrowserSpeechSynthesizer({
      windowObj: {},
    });
    expect(unsupported.isSupported()).toBe(false);
  });

  it('rejects empty or whitespace text gracefully', () => {
    const synth = new MockSpeechSynthesis();
    const synthesizer = new BrowserSpeechSynthesizer({
      speechSynthesis: synth,
      UtteranceConstructor: MockSpeechSynthesisUtterance,
    });

    expect(synthesizer.speak('')).toBe(false);
    expect(synthesizer.speak('   ')).toBe(false);
    expect(synthesizer.speak(null)).toBe(false);
    expect(synth.spokenUtterances.length).toBe(0);
  });

  it('handles unsupported browser speak attempt without throwing', () => {
    const onError = vi.fn();
    const synthesizer = new BrowserSpeechSynthesizer({
      windowObj: {},
    });

    const result = synthesizer.speak('Hello', { onError });
    expect(result).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'not-supported',
      })
    );
  });

  it('initiates speech with options and invokes onStart and onEnd', () => {
    const synth = new MockSpeechSynthesis();
    const synthesizer = new BrowserSpeechSynthesizer({
      speechSynthesis: synth,
      UtteranceConstructor: MockSpeechSynthesisUtterance,
    });

    const onStart = vi.fn();
    const onEnd = vi.fn();

    const success = synthesizer.speak('What is React reconciliation?', {
      lang: 'en-GB',
      rate: 1.1,
      pitch: 1.0,
      onStart,
      onEnd,
    });

    expect(success).toBe(true);
    expect(synth.spokenUtterances.length).toBe(1);
    const utterance = synth.spokenUtterances[0];
    expect(utterance.text).toBe('What is React reconciliation?');
    expect(utterance.lang).toBe('en-GB');
    expect(utterance.rate).toBe(1.1);
    expect(onStart).toHaveBeenCalledTimes(1);

    // Simulate completion
    utterance.onend();
    expect(onEnd).toHaveBeenCalledTimes(1);
    expect(synthesizer.isSpeaking).toBe(false);
  });

  it('cancels ongoing speech when a new speak request arrives', () => {
    const synth = new MockSpeechSynthesis();
    const synthesizer = new BrowserSpeechSynthesizer({
      speechSynthesis: synth,
      UtteranceConstructor: MockSpeechSynthesisUtterance,
    });

    synthesizer.speak('First question prompt');
    expect(synth.spokenUtterances.length).toBe(1);

    // Speak second question while first is in progress
    synthesizer.speak('Second question prompt');
    expect(synth.cancelCalled).toBe(true);
    expect(synth.spokenUtterances.length).toBe(2);
    expect(synth.spokenUtterances[1].text).toBe('Second question prompt');
  });

  it('handles speech errors and classifies cancellation', () => {
    const synth = new MockSpeechSynthesis();
    const synthesizer = new BrowserSpeechSynthesizer({
      speechSynthesis: synth,
      UtteranceConstructor: MockSpeechSynthesisUtterance,
    });

    const onError = vi.fn();
    synthesizer.speak('Sample text', { onError });

    const utterance = synth.spokenUtterances[0];
    utterance.onerror({ error: 'canceled' });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'canceled',
        isCanceled: true,
      })
    );
    expect(synthesizer.isSpeaking).toBe(false);
  });

  it('stops speech and cleans up on destroy()', () => {
    const synth = new MockSpeechSynthesis();
    const synthesizer = new BrowserSpeechSynthesizer({
      speechSynthesis: synth,
      UtteranceConstructor: MockSpeechSynthesisUtterance,
    });

    synthesizer.speak('Stopping soon');
    expect(synthesizer.isSpeaking).toBe(true);

    synthesizer.stop();
    expect(synth.cancelCalled).toBe(true);
    expect(synthesizer.isSpeaking).toBe(false);

    synthesizer.destroy();
    expect(synthesizer.synth).toBeNull();
  });
});
