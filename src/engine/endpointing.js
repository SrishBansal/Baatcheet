/**
 * Voice-turn Endpointing Module.
 *
 * Detects end-of-answer by monitoring post-speech silence duration.
 * Each listening turn is identified by a monotonically increasing token; stale
 * timer callbacks from previous turns are silently discarded.
 *
 * Constants (P0):
 * - BASE_SILENCE_MS = 2500
 * - EXTENDED_SILENCE_MS = 4500 (answers <8 words or ending in and/so/but/because/um/uh/comma)
 * - MAX_WAIT_MS = 8000
 * - NO_SPEECH_REPROMPT_MS = 10000 (re-prompt once, then offer text input)
 */

export const BASE_SILENCE_MS = 2500;
export const EXTENDED_SILENCE_MS = 4500;
export const MAX_WAIT_MS = 8000;
export const NO_SPEECH_REPROMPT_MS = 10000;

const TRAILING_CONNECTOR_REGEX = /^(and|so|but|because|um|uh)$/i;

/**
 * Determine dynamic silence duration based on answer length and completion syntax.
 * @param {string} text
 * @param {number} [baseMs=BASE_SILENCE_MS]
 * @param {number} [extendedMs=EXTENDED_SILENCE_MS]
 * @returns {number}
 */
export function computeSilenceMs(text, baseMs = BASE_SILENCE_MS, extendedMs = EXTENDED_SILENCE_MS) {
  if (!text || typeof text !== 'string') return baseMs;
  const trimmed = text.trim();
  if (!trimmed) return baseMs;

  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length < 8) {
    return extendedMs;
  }

  const lastWord = words[words.length - 1].replace(/[.,?!]+$/, '').toLowerCase();
  if (TRAILING_CONNECTOR_REGEX.test(lastWord) || trimmed.endsWith(',')) {
    return extendedMs;
  }

  return baseMs;
}

/**
 * @typedef {object} EndpointingOptions
 * @property {number}   [baseSilenceMs=BASE_SILENCE_MS]
 * @property {number}   [extendedSilenceMs=EXTENDED_SILENCE_MS]
 * @property {number}   [maxWaitMs=MAX_WAIT_MS]
 * @property {number}   [noSpeechRepromptMs=NO_SPEECH_REPROMPT_MS]
 * @property {number}   [silenceMs]          Legacy fallback for baseSilenceMs
 * @property {number}   [minAnswerMs=400]    Minimum ms of speech before auto-submit is allowed.
 * @property {function} [onSilenceTimeout]   Called when silence threshold is reached.
 * @property {function} [onNoSpeechReprompt] Called when no speech detected within reprompt window.
 * @property {function} [setTimeout]        Injectable for testing.
 * @property {function} [clearTimeout]      Injectable for testing.
 */

export class VoiceTurnEndpointer {
  /**
   * @param {EndpointingOptions} [options]
   */
  constructor(options = {}) {
    this._baseSilenceMs = options.baseSilenceMs !== undefined
      ? options.baseSilenceMs
      : (options.silenceMs !== undefined ? options.silenceMs : BASE_SILENCE_MS);
    this._extendedSilenceMs = options.extendedSilenceMs !== undefined
      ? options.extendedSilenceMs
      : (options.silenceMs !== undefined ? options.silenceMs : EXTENDED_SILENCE_MS);
    this._maxWaitMs = options.maxWaitMs !== undefined ? options.maxWaitMs : MAX_WAIT_MS;
    this._noSpeechRepromptMs = options.noSpeechRepromptMs !== undefined
      ? options.noSpeechRepromptMs
      : NO_SPEECH_REPROMPT_MS;

    this._minAnswerMs = options.minAnswerMs !== undefined ? options.minAnswerMs : 400;
    this._onSilenceTimeout = options.onSilenceTimeout || null;
    this._onNoSpeechReprompt = options.onNoSpeechReprompt || null;

    this._setTimeout = options.setTimeout || globalThis.setTimeout.bind(globalThis);
    this._clearTimeout = options.clearTimeout || globalThis.clearTimeout.bind(globalThis);

    this._currentToken = 0;
    this._timerId = null;
    this._noSpeechTimerId = null;
    this._repromptCount = 0;

    this._micActive = false;
    this._synthActive = false;
    this._speechStartedAt = null;
    this._isDestroyed = false;
  }

  startTurn() {
    if (this._isDestroyed) return 0;
    this._cancelTimer();
    this._cancelNoSpeechTimer();
    this._currentToken++;
    this._speechStartedAt = null;
    this._repromptCount = 0;
    this._micActive = true;
    this._synthActive = false;
    this._armNoSpeechTimer();
    return this._currentToken;
  }

  cancelTurn() {
    this._cancelTimer();
    this._cancelNoSpeechTimer();
    this._micActive = false;
    this._speechStartedAt = null;
  }

  onRecognitionResult(result) {
    if (this._isDestroyed || !this._micActive) return;

    if (!this._speechStartedAt) {
      this._speechStartedAt = Date.now();
      this._cancelNoSpeechTimer();
    }

    this._cancelTimer();

    if (result && result.text && result.text.trim()) {
      const calculatedMs = computeSilenceMs(result.text, this._baseSilenceMs, this._extendedSilenceMs);
      const effectiveMs = Math.min(calculatedMs, this._maxWaitMs);
      this._armTimer(effectiveMs);
    }
  }

  onRecognitionEnd(draftText) {
    if (this._isDestroyed) return;
    this._cancelTimer();
    this._cancelNoSpeechTimer();
    this._micActive = false;

    if (!draftText || !draftText.trim()) return;

    const elapsed = this._speechStartedAt ? Date.now() - this._speechStartedAt : 0;
    if (elapsed >= this._minAnswerMs) {
      this._fireSilenceTimeout(this._currentToken);
    }
  }

  hasMinimumSpeech() {
    if (!this._speechStartedAt) return false;
    return Date.now() - this._speechStartedAt >= this._minAnswerMs;
  }

  get isMicActive() {
    return this._micActive;
  }

  get isSynthActive() {
    return this._synthActive;
  }

  setSynthPlaying() {
    this._synthActive = true;
    this._micActive = false;
    this._cancelTimer();
    this._cancelNoSpeechTimer();
  }

  setSynthFinished() {
    this._synthActive = false;
  }

  destroy() {
    this._isDestroyed = true;
    this._cancelTimer();
    this._cancelNoSpeechTimer();
    this._micActive = false;
    this._synthActive = false;
    this._onSilenceTimeout = null;
    this._onNoSpeechReprompt = null;
  }

  _armTimer(delayMs) {
    if (this._isDestroyed) return;
    const token = this._currentToken;
    const ms = typeof delayMs === 'number' ? delayMs : this._baseSilenceMs;
    this._timerId = this._setTimeout(() => {
      this._timerId = null;
      this._fireSilenceTimeout(token);
    }, ms);
  }

  _cancelTimer() {
    if (this._timerId !== null) {
      this._clearTimeout(this._timerId);
      this._timerId = null;
    }
  }

  _armNoSpeechTimer() {
    if (this._isDestroyed || !this._onNoSpeechReprompt || this._noSpeechRepromptMs <= 0) return;
    const token = this._currentToken;
    this._noSpeechTimerId = this._setTimeout(() => {
      this._noSpeechTimerId = null;
      if (this._isDestroyed || token !== this._currentToken || this._speechStartedAt) return;
      this._repromptCount++;
      if (this._onNoSpeechReprompt) {
        this._onNoSpeechReprompt({
          repromptCount: this._repromptCount,
          offerTextInput: this._repromptCount >= 1,
        });
      }
    }, this._noSpeechRepromptMs);
  }

  _cancelNoSpeechTimer() {
    if (this._noSpeechTimerId !== null) {
      this._clearTimeout(this._noSpeechTimerId);
      this._noSpeechTimerId = null;
    }
  }

  _fireSilenceTimeout(token) {
    if (this._isDestroyed) return;
    if (token !== this._currentToken) return;
    if (!this._onSilenceTimeout) return;
    this._onSilenceTimeout();
  }
}
