/**
 * Voice-turn Endpointing Module.
 *
 * Detects end-of-answer by monitoring post-speech silence duration.
 * Each listening turn is identified by a monotonically increasing token; stale
 * timer callbacks from previous turns are silently discarded.
 *
 * Design principles (ADR-023, ADR-024):
 * - Zero external dependencies — uses standard setTimeout/clearTimeout.
 * - Deterministic: timeout fires exactly once per active turn.
 * - Safe: canceling a finished or already-canceled turn is a no-op.
 * - Testable: all timing functions are injectable via options.
 */

/**
 * @typedef {object} EndpointingOptions
 * @property {number}   [silenceMs=2000]     Milliseconds of silence before firing onSilenceTimeout.
 * @property {number}   [minAnswerMs=400]    Minimum ms of speech before auto-submit is allowed.
 * @property {function} [onSilenceTimeout]   Called with no arguments when silence threshold is reached.
 * @property {function} [setTimeout]        Injectable for testing (defaults to globalThis.setTimeout).
 * @property {function} [clearTimeout]      Injectable for testing (defaults to globalThis.clearTimeout).
 */

export class VoiceTurnEndpointer {
  /**
   * @param {EndpointingOptions} [options]
   */
  constructor(options = {}) {
    this._silenceMs = options.silenceMs !== undefined ? options.silenceMs : 2000;
    this._minAnswerMs = options.minAnswerMs !== undefined ? options.minAnswerMs : 400;
    this._onSilenceTimeout = options.onSilenceTimeout || null;

    // Injectable timing functions (facilitate deterministic testing)
    this._setTimeout = options.setTimeout || globalThis.setTimeout.bind(globalThis);
    this._clearTimeout = options.clearTimeout || globalThis.clearTimeout.bind(globalThis);

    // Turn token: monotonically increasing per startTurn call
    this._currentToken = 0;
    this._timerId = null;

    // Single-flight lock: prevents concurrent mic-start and synth-speak calls
    this._micActive = false;
    this._synthActive = false;

    // When current turn's speech started (first interim result received)
    this._speechStartedAt = null;
    this._isDestroyed = false;
  }

  /* ----------------------------------------------------------------
     Turn lifecycle
     ---------------------------------------------------------------- */

  /**
   * Begin a new listening turn.
   * Cancels any previous turn's pending timer and issues a fresh turn token.
   *
   * @returns {number} The new turn token. Callers may store it for validation.
   */
  startTurn() {
    if (this._isDestroyed) return 0;
    this._cancelTimer();
    this._currentToken++;
    this._speechStartedAt = null;
    this._micActive = true;
    this._synthActive = false;
    return this._currentToken;
  }

  /**
   * Cancel the current turn's pending silence timer without firing the callback.
   * Safe to call multiple times or when no turn is active.
   */
  cancelTurn() {
    this._cancelTimer();
    this._micActive = false;
    this._speechStartedAt = null;
  }

  /**
   * Notify the endpointer that a recognition result (interim or final) arrived.
   * Resets the silence countdown. Marks speech-start time on first call per turn.
   *
   * @param {object}  result
   * @param {string}  result.text      Current draft text (interim + final).
   * @param {boolean} result.isFinal   Whether this segment is finalized.
   */
  onRecognitionResult(result) {
    if (this._isDestroyed || !this._micActive) return;

    if (!this._speechStartedAt) {
      this._speechStartedAt = Date.now();
    }

    // Reset silence countdown on every result arrival
    this._cancelTimer();

    // Only arm the silence timer when there is actual text to submit
    if (result && result.text && result.text.trim()) {
      this._armTimer();
    }
  }

  /**
   * Notify the endpointer that the microphone stream ended (recognition's onend fired).
   * If draft text exists and minimum speech duration has elapsed, fire timeout immediately.
   *
   * @param {string} draftText Current answer draft accumulated so far.
   */
  onRecognitionEnd(draftText) {
    if (this._isDestroyed) return;
    this._cancelTimer();
    this._micActive = false;

    if (!draftText || !draftText.trim()) return;

    const elapsed = this._speechStartedAt ? Date.now() - this._speechStartedAt : 0;
    if (elapsed >= this._minAnswerMs) {
      // Immediately fire: recognition ended with a completed answer
      this._fireSilenceTimeout(this._currentToken);
    }
  }

  /**
   * Check whether the accumulated draft meets the minimum answer duration.
   * @returns {boolean}
   */
  hasMinimumSpeech() {
    if (!this._speechStartedAt) return false;
    return Date.now() - this._speechStartedAt >= this._minAnswerMs;
  }

  /* ----------------------------------------------------------------
     Single-flight lock helpers
     ---------------------------------------------------------------- */

  /**
   * Returns true when microphone is actively capturing for the current turn.
   * @returns {boolean}
   */
  get isMicActive() {
    return this._micActive;
  }

  /**
   * Returns true when speech synthesis is currently playing.
   * @returns {boolean}
   */
  get isSynthActive() {
    return this._synthActive;
  }

  /**
   * Mark synthesis as playing. Cancels any pending turn timer because
   * the interviewer is speaking — candidate turn has not started.
   */
  setSynthPlaying() {
    this._synthActive = true;
    this._micActive = false;
    this._cancelTimer();
  }

  /**
   * Mark synthesis as finished. Does NOT automatically start mic — that is
   * the controller's responsibility to maintain consistent state.
   */
  setSynthFinished() {
    this._synthActive = false;
  }

  /* ----------------------------------------------------------------
     Destroy
     ---------------------------------------------------------------- */

  /**
   * Release all resources. After destroy, no callbacks will fire.
   */
  destroy() {
    this._isDestroyed = true;
    this._cancelTimer();
    this._micActive = false;
    this._synthActive = false;
    this._onSilenceTimeout = null;
  }

  /* ----------------------------------------------------------------
     Private helpers
     ---------------------------------------------------------------- */

  _armTimer() {
    if (this._isDestroyed) return;
    const token = this._currentToken;
    this._timerId = this._setTimeout(() => {
      this._timerId = null;
      this._fireSilenceTimeout(token);
    }, this._silenceMs);
  }

  _cancelTimer() {
    if (this._timerId !== null) {
      this._clearTimeout(this._timerId);
      this._timerId = null;
    }
  }

  /**
   * Fire the silence timeout callback only if the token matches the current turn.
   * Stale callbacks from previous turns are silently discarded.
   *
   * @param {number} token
   */
  _fireSilenceTimeout(token) {
    if (this._isDestroyed) return;
    if (token !== this._currentToken) return; // Stale timer from a prior turn
    if (!this._onSilenceTimeout) return;
    this._onSilenceTimeout();
  }
}
