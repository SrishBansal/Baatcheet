/**
 * CHECKPOINT 2: Voice-turn endpointing tests.
 *
 * All timing is controlled via injected setTimeout/clearTimeout fakes
 * so tests run synchronously without real delays.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { VoiceTurnEndpointer } from '../../src/engine/endpointing.js';

/**
 * Minimal fake timer environment: stores pending timers and lets tests
 * fire them on demand via `tick(ms)`.
 */
function makeFakeTimers() {
  let now = 0;
  const pending = new Map();
  let nextId = 1;

  const fakeSetTimeout = (fn, delay) => {
    const id = nextId++;
    pending.set(id, { fn, fireAt: now + delay });
    return id;
  };
  const fakeClearTimeout = (id) => {
    pending.delete(id);
  };
  const tick = (ms) => {
    now += ms;
    const toFire = [...pending.entries()]
      .filter(([, t]) => t.fireAt <= now)
      .sort((a, b) => a[1].fireAt - b[1].fireAt);
    for (const [id, { fn }] of toFire) {
      pending.delete(id);
      fn();
    }
  };
  const getNow = () => now;
  const pendingCount = () => pending.size;

  return { fakeSetTimeout, fakeClearTimeout, tick, getNow, pendingCount };
}

describe('CHECKPOINT 2: VoiceTurnEndpointer', () => {
  let timers;
  let onSilenceTimeout;
  let ep;

  beforeEach(() => {
    timers = makeFakeTimers();
    onSilenceTimeout = vi.fn();
    ep = new VoiceTurnEndpointer({
      silenceMs: 2000,
      minAnswerMs: 400,
      onSilenceTimeout,
      setTimeout: timers.fakeSetTimeout,
      clearTimeout: timers.fakeClearTimeout,
    });
  });

  describe('Turn token monotonicity', () => {
    it('issues token 1 on first startTurn', () => {
      const t = ep.startTurn();
      expect(t).toBe(1);
    });

    it('increments token on each new turn', () => {
      expect(ep.startTurn()).toBe(1);
      expect(ep.startTurn()).toBe(2);
      expect(ep.startTurn()).toBe(3);
    });

    it('previous turn timer does not fire after new startTurn', () => {
      ep.startTurn(); // token=1
      ep.onRecognitionResult({ text: 'hello', isFinal: false });
      expect(timers.pendingCount()).toBe(1);

      ep.startTurn(); // token=2 — should cancel token=1's timer
      expect(timers.pendingCount()).toBe(0); // old timer cancelled

      timers.tick(2500);
      expect(onSilenceTimeout).not.toHaveBeenCalled();
    });
  });

  describe('Silence timer arms and fires', () => {
    it('fires callback after silence window when text is present', () => {
      ep.startTurn();
      ep.onRecognitionResult({ text: 'I have experience with', isFinal: false });
      timers.tick(2000);
      expect(onSilenceTimeout).toHaveBeenCalledTimes(1);
    });

    it('does NOT fire when text is empty', () => {
      ep.startTurn();
      ep.onRecognitionResult({ text: '', isFinal: false });
      timers.tick(3000);
      expect(onSilenceTimeout).not.toHaveBeenCalled();
    });

    it('does NOT fire when text is whitespace only', () => {
      ep.startTurn();
      ep.onRecognitionResult({ text: '   ', isFinal: false });
      timers.tick(3000);
      expect(onSilenceTimeout).not.toHaveBeenCalled();
    });

    it('resets silence countdown on each new result', () => {
      ep.startTurn();
      ep.onRecognitionResult({ text: 'first', isFinal: false });
      timers.tick(1500); // 1500ms < 2000ms silence threshold — should NOT fire yet

      ep.onRecognitionResult({ text: 'first second', isFinal: false }); // reset
      timers.tick(1500); // another 1500ms since reset — still < 2000ms
      expect(onSilenceTimeout).not.toHaveBeenCalled();

      timers.tick(500); // now 2000ms since last result
      expect(onSilenceTimeout).toHaveBeenCalledTimes(1);
    });

    it('fires exactly once per turn, not multiple times', () => {
      ep.startTurn();
      ep.onRecognitionResult({ text: 'answer text', isFinal: false });
      timers.tick(5000);
      expect(onSilenceTimeout).toHaveBeenCalledTimes(1);
    });
  });

  describe('cancelTurn', () => {
    it('prevents pending timer from firing', () => {
      ep.startTurn();
      ep.onRecognitionResult({ text: 'partial answer', isFinal: false });
      ep.cancelTurn();
      timers.tick(3000);
      expect(onSilenceTimeout).not.toHaveBeenCalled();
    });

    it('sets micActive to false', () => {
      ep.startTurn();
      expect(ep.isMicActive).toBe(true);
      ep.cancelTurn();
      expect(ep.isMicActive).toBe(false);
    });
  });

  describe('onRecognitionEnd auto-fire', () => {
    it('fires immediately when speech existed long enough and recognition ended', () => {
      ep.startTurn();
      // Simulate speech starting by sending a result
      ep.onRecognitionResult({ text: 'my answer', isFinal: false });
      // Advance time to simulate 500ms of speech (> minAnswerMs=400ms)
      timers.tick(500);
      // Clear the pending silence timer to simulate a result-then-recognition-end sequence
      ep.cancelTurn();
      // Manually set speech started at 500ms ago
      ep._speechStartedAt = Date.now ? Date.now() - 500 : 0;
      ep._micActive = true; // re-arm for onRecognitionEnd path

      // Call with draft text present
      ep.onRecognitionEnd('my answer');
      expect(onSilenceTimeout).toHaveBeenCalledTimes(1);
    });

    it('does NOT fire when draftText is empty', () => {
      ep.startTurn();
      ep.onRecognitionEnd('');
      expect(onSilenceTimeout).not.toHaveBeenCalled();
    });

    it('does NOT fire when draftText is whitespace only', () => {
      ep.startTurn();
      ep.onRecognitionEnd('  ');
      expect(onSilenceTimeout).not.toHaveBeenCalled();
    });
  });

  describe('Single-flight synth lock', () => {
    it('cancels pending turn timer when synth starts playing', () => {
      ep.startTurn();
      ep.onRecognitionResult({ text: 'partial', isFinal: false });
      expect(timers.pendingCount()).toBe(1);

      ep.setSynthPlaying();
      expect(timers.pendingCount()).toBe(0);
      expect(ep.isSynthActive).toBe(true);
      expect(ep.isMicActive).toBe(false);
    });

    it('setSynthFinished clears synth flag without starting mic', () => {
      ep.setSynthPlaying();
      ep.setSynthFinished();
      expect(ep.isSynthActive).toBe(false);
      expect(ep.isMicActive).toBe(false); // controller is responsible for this
    });

    it('onRecognitionResult is a no-op when micActive is false', () => {
      ep.startTurn();
      ep.setSynthPlaying(); // micActive = false now

      ep.onRecognitionResult({ text: 'hello', isFinal: false });
      timers.tick(3000);
      expect(onSilenceTimeout).not.toHaveBeenCalled();
    });
  });

  describe('hasMinimumSpeech', () => {
    it('returns false before any speech', () => {
      ep.startTurn();
      expect(ep.hasMinimumSpeech()).toBe(false);
    });

    it('returns false before minAnswerMs has elapsed', () => {
      ep.startTurn();
      ep._speechStartedAt = Date.now ? Date.now() - 100 : 0;
      expect(ep.hasMinimumSpeech()).toBe(false);
    });
  });

  describe('destroy', () => {
    it('prevents callback after destroy', () => {
      ep.startTurn();
      ep.onRecognitionResult({ text: 'partial', isFinal: false });
      ep.destroy();
      timers.tick(3000);
      expect(onSilenceTimeout).not.toHaveBeenCalled();
    });

    it('subsequent startTurn and results are no-ops after destroy', () => {
      ep.destroy();
      const token = ep.startTurn();
      expect(token).toBe(0);
      ep.onRecognitionResult({ text: 'hello', isFinal: false });
      timers.tick(3000);
      expect(onSilenceTimeout).not.toHaveBeenCalled();
    });
  });
});
