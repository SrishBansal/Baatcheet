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

  describe('voice selection and asynchronous loading', () => {
    it('returns null when no voices are available', () => {
      const synth = new MockSpeechSynthesis();
      synth.getVoices = () => [];
      const synthesizer = new BrowserSpeechSynthesizer({
        speechSynthesis: synth,
        UtteranceConstructor: MockSpeechSynthesisUtterance,
      });

      expect(synthesizer.selectBestVoice('en-US')).toBeNull();
    });

    it('prefers natural/enhanced human voices over robotic legacy novelty voices', () => {
      const voices = [
        { name: 'Fred', lang: 'en-US', default: true },
        { name: 'Albert', lang: 'en-US', default: false },
        { name: 'Samantha (Enhanced)', lang: 'en-US', default: false },
        { name: 'Google US English', lang: 'en-US', default: false },
      ];
      const synth = new MockSpeechSynthesis();
      synth.getVoices = () => voices;
      const synthesizer = new BrowserSpeechSynthesizer({
        speechSynthesis: synth,
        UtteranceConstructor: MockSpeechSynthesisUtterance,
      });

      const selected = synthesizer.selectBestVoice('en-US');
      expect(selected).toBeDefined();
      // Samantha (Enhanced) or Google US English must beat Fred/Albert despite Fred having default: true
      expect(['Samantha (Enhanced)', 'Google US English']).toContain(selected.name);
    });

    it('prefers language exact match and ignores incompatible languages', () => {
      const voices = [
        { name: 'Amelie', lang: 'fr-FR', default: true },
        { name: 'Anna', lang: 'de-DE', default: false },
        { name: 'Daniel', lang: 'en-GB', default: false },
      ];
      const synth = new MockSpeechSynthesis();
      synth.getVoices = () => voices;
      const synthesizer = new BrowserSpeechSynthesizer({
        speechSynthesis: synth,
        UtteranceConstructor: MockSpeechSynthesisUtterance,
      });

      const selected = synthesizer.selectBestVoice('en-US');
      expect(selected.name).toBe('Daniel');
    });

    it('subscribes to voiceschanged event and updates cached voices', () => {
      const listeners = {};
      const synth = new MockSpeechSynthesis();
      synth.addEventListener = (event, handler) => {
        listeners[event] = handler;
      };
      synth.getVoices = () => [];

      const synthesizer = new BrowserSpeechSynthesizer({
        speechSynthesis: synth,
        UtteranceConstructor: MockSpeechSynthesisUtterance,
      });

      expect(synthesizer.getAvailableVoices().length).toBe(0);

      // Simulate voices asynchronously loaded by browser
      synth.getVoices = () => [{ name: 'Samantha', lang: 'en-US' }];
      if (listeners['voiceschanged']) {
        listeners['voiceschanged']();
      }

      expect(synthesizer.getAvailableVoices().length).toBe(1);
      expect(synthesizer.selectBestVoice('en-US').name).toBe('Samantha');
    });

    it('assigns selected natural voice and moderate default rate (0.92) to utterance', () => {
      const synth = new MockSpeechSynthesis();
      synth.getVoices = () => [
        { name: 'Google US English', lang: 'en-US', default: true },
      ];
      const synthesizer = new BrowserSpeechSynthesizer({
        speechSynthesis: synth,
        UtteranceConstructor: MockSpeechSynthesisUtterance,
      });

      synthesizer.speak('Interview question text');
      expect(synth.spokenUtterances.length).toBe(1);
      const utt = synth.spokenUtterances[0];
      expect(utt.voice.name).toBe('Google US English');
      expect(utt.rate).toBe(0.92);
      expect(utt.pitch).toBe(1.0);
    });

    it('ignores stale callbacks from superseded utterances via monotonic sequence ID', () => {
      const synth = new MockSpeechSynthesis();
      synth.speak = vi.fn(); // do not invoke onstart immediately
      const synthesizer = new BrowserSpeechSynthesizer({
        speechSynthesis: synth,
        UtteranceConstructor: MockSpeechSynthesisUtterance,
      });

      const onEnd1 = vi.fn();
      const onEnd2 = vi.fn();

      synthesizer.speak('First question', { onEnd: onEnd1 });
      const utt1 = synthesizer.currentUtterance;
      const oldOnEnd = utt1.onend;

      // Start second utterance before first finishes
      synthesizer.speak('Second question', { onEnd: onEnd2 });
      const utt2 = synthesizer.currentUtterance;

      // Delayed callback from first utterance must be completely ignored
      if (oldOnEnd) oldOnEnd();
      expect(onEnd1).not.toHaveBeenCalled();

      // Callback from current active utterance should be processed
      utt2.onend();
      expect(onEnd2).toHaveBeenCalledTimes(1);
    });
  });
});
