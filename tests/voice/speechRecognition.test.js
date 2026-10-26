import { describe, it, expect, vi } from 'vitest';
import { BrowserSpeechRecognizer } from '../../src/voice/speechRecognition.js';

class MockSpeechRecognition {
  constructor() {
    this.lang = 'en-US';
    this.continuous = true;
    this.interimResults = true;
    this.onstart = null;
    this.onresult = null;
    this.onerror = null;
    this.onend = null;
    this.onspeechstart = null;
    this.startCalled = false;
    this.stopCalled = false;
    this.abortCalled = false;
  }

  start() {
    this.startCalled = true;
    if (this.onstart) this.onstart();
  }

  stop() {
    this.stopCalled = true;
    if (this.onend) this.onend();
  }

  abort() {
    this.abortCalled = true;
    if (this.onend) this.onend();
  }
}

describe('BrowserSpeechRecognizer', () => {
  it('reports isSupported correctly based on availability', () => {
    const supported = new BrowserSpeechRecognizer({
      RecognitionConstructor: MockSpeechRecognition,
    });
    expect(supported.isSupported()).toBe(true);

    const unsupported = new BrowserSpeechRecognizer({
      RecognitionConstructor: null,
      windowObj: {},
    });
    expect(unsupported.isSupported()).toBe(false);
  });

  it('handles unsupported browser start attempt without throwing', () => {
    const onError = vi.fn();
    const recognizer = new BrowserSpeechRecognizer({
      RecognitionConstructor: null,
      windowObj: {},
      onError,
    });

    const result = recognizer.start();
    expect(result).toBe(false);
    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'not-supported',
        isPermissionDenied: false,
      })
    );
  });

  it('starts recognition, tracks listening state, and invokes onStart', () => {
    const onStart = vi.fn();
    const recognizer = new BrowserSpeechRecognizer({
      RecognitionConstructor: MockSpeechRecognition,
      onStart,
    });

    expect(recognizer.isListening).toBe(false);
    const started = recognizer.start();

    expect(started).toBe(true);
    expect(recognizer.isListening).toBe(true);
    expect(onStart).toHaveBeenCalledTimes(1);
    expect(recognizer.recognition.startCalled).toBe(true);
  });

  it('is idempotent when start() is called while already listening', () => {
    const recognizer = new BrowserSpeechRecognizer({
      RecognitionConstructor: MockSpeechRecognition,
    });

    recognizer.start();
    expect(recognizer.isListening).toBe(true);

    // Call start again
    const secondStart = recognizer.start();
    expect(secondStart).toBe(true);
  });

  it('stops and aborts recognition cleanly', () => {
    const onEnd = vi.fn();
    const recognizer = new BrowserSpeechRecognizer({
      RecognitionConstructor: MockSpeechRecognition,
      onEnd,
    });

    recognizer.start();
    recognizer.stop();

    expect(recognizer.recognition.stopCalled).toBe(true);
    expect(recognizer.isListening).toBe(false);
    expect(onEnd).toHaveBeenCalledTimes(1);

    // Test abort
    recognizer.start();
    recognizer.abort();
    expect(recognizer.recognition.abortCalled).toBe(true);
    expect(recognizer.isListening).toBe(false);
  });

  it('handles interim and final result events cleanly', () => {
    const onResult = vi.fn();
    const recognizer = new BrowserSpeechRecognizer({
      RecognitionConstructor: MockSpeechRecognition,
      onResult,
    });

    recognizer.start();

    // 1. Simulate interim result event
    recognizer.recognition.onresult({
      resultIndex: 0,
      results: [
        {
          0: { transcript: 'I have experience' },
          isFinal: false,
        },
      ],
    });

    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({
      text: 'I have experience', displayText: 'I have experience', isFinal: false,
      interimText: 'I have experience', finalText: '', newFinalText: '',
    }));

    // 2. Simulate final result event
    recognizer.recognition.onresult({
      resultIndex: 0,
      results: [
        {
          0: { transcript: 'I have experience with React.' },
          isFinal: true,
        },
      ],
    });

    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({
      text: 'I have experience with React.', displayText: 'I have experience with React.', isFinal: true,
      interimText: '', finalText: 'I have experience with React.', newFinalText: 'I have experience with React.',
    }));
  });

  it('prevents duplicate final text accumulation when results stream in continuously', () => {
    const onResult = vi.fn();
    const recognizer = new BrowserSpeechRecognizer({
      RecognitionConstructor: MockSpeechRecognition,
      onResult,
    });

    recognizer.start();

    // Result chunk 0 (final)
    recognizer.recognition.onresult({
      resultIndex: 0,
      results: [
        { 0: { transcript: 'First sentence.' }, isFinal: true },
      ],
    });

    expect(onResult).toHaveBeenLastCalledWith(
      expect.objectContaining({
        finalText: 'First sentence.',
      })
    );

    // Result chunk 1 arrives while 0 is still in results array
    recognizer.recognition.onresult({
      resultIndex: 1,
      results: [
        { 0: { transcript: 'First sentence.' }, isFinal: true },
        { 0: { transcript: 'Second sentence.' }, isFinal: true },
      ],
    });

    expect(onResult).toHaveBeenLastCalledWith(
      expect.objectContaining({
        finalText: 'First sentence. Second sentence.',
      })
    );
  });

  it('replaces interim hypotheses and exposes only new final segments', () => {
    const onResult = vi.fn();
    const recognizer = new BrowserSpeechRecognizer({ RecognitionConstructor: MockSpeechRecognition, onResult });
    recognizer.start();
    recognizer.recognition.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'I led the' }, isFinal: false }] });
    recognizer.recognition.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'I led the migration' }, isFinal: false }] });
    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ finalText: '', interimText: 'I led the migration', displayText: 'I led the migration' }));
    recognizer.recognition.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'I led the migration.' }, isFinal: true }] });
    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ finalText: 'I led the migration.', interimText: '', newFinalText: 'I led the migration.' }));
  });

  it('ignores a late result from a prior recognition session', () => {
    const onResult = vi.fn();
    const recognizer = new BrowserSpeechRecognizer({ RecognitionConstructor: MockSpeechRecognition, onResult });
    recognizer.start();
    const oldSession = recognizer.recognition;
    recognizer.stop();
    recognizer.start();
    oldSession.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'stale words' }, isFinal: true }] });
    expect(onResult).not.toHaveBeenCalledWith(expect.objectContaining({ text: 'stale words' }));
    recognizer.recognition.onresult({ resultIndex: 0, results: [{ 0: { transcript: 'fresh words' }, isFinal: true }] });
    expect(onResult).toHaveBeenLastCalledWith(expect.objectContaining({ finalText: 'fresh words' }));
  });

  it('classifies permission denial errors (not-allowed)', () => {
    const onError = vi.fn();
    const recognizer = new BrowserSpeechRecognizer({
      RecognitionConstructor: MockSpeechRecognition,
      onError,
    });

    recognizer.start();
    recognizer.recognition.onerror({ error: 'not-allowed' });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'not-allowed',
        isPermissionDenied: true,
        isNoSpeech: false,
      })
    );
  });

  it('classifies no-speech silence errors', () => {
    const onError = vi.fn();
    const recognizer = new BrowserSpeechRecognizer({
      RecognitionConstructor: MockSpeechRecognition,
      onError,
    });

    recognizer.start();
    recognizer.recognition.onerror({ error: 'no-speech' });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'no-speech',
        isPermissionDenied: false,
        isNoSpeech: true,
      })
    );
  });

  it('classifies audio-capture hardware errors', () => {
    const onError = vi.fn();
    const recognizer = new BrowserSpeechRecognizer({
      RecognitionConstructor: MockSpeechRecognition,
      onError,
    });

    recognizer.start();
    recognizer.recognition.onerror({ error: 'audio-capture' });

    expect(onError).toHaveBeenCalledWith(
      expect.objectContaining({
        error: 'audio-capture',
        isAudioCaptureError: true,
      })
    );
  });

  it('supports onSpeechStart callback for candidate interruption detection', () => {
    const onSpeechStart = vi.fn();
    const recognizer = new BrowserSpeechRecognizer({
      RecognitionConstructor: MockSpeechRecognition,
      onSpeechStart,
    });

    recognizer.start();
    recognizer.recognition.onspeechstart();

    expect(onSpeechStart).toHaveBeenCalledTimes(1);
  });

  it('destroys instance and detaches all event listeners', () => {
    const recognizer = new BrowserSpeechRecognizer({
      RecognitionConstructor: MockSpeechRecognition,
    });

    recognizer.start();
    const recInstance = recognizer.recognition;

    recognizer.destroy();

    expect(recognizer.isListening).toBe(false);
    expect(recognizer.recognition).toBeNull();
    expect(recInstance.onresult).toBeNull();
    expect(recInstance.onerror).toBeNull();
    expect(recInstance.onstart).toBeNull();
    expect(recInstance.onend).toBeNull();
  });
});
