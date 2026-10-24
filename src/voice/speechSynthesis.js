/**
 * Browser Speech Synthesis Adapter.
 *
 * Implements Requirement C.2 and ADR-009:
 * - Wraps the Web Speech Synthesis API (`window.speechSynthesis`).
 * - Exposes methods to speak and stop speech synthesis.
 * - Handles completion (`onEnd`) and error (`onError`) callbacks with handler cleanup.
 * - Supports configurable language, rate, and pitch without assuming specific installed system voices.
 * - Dependency-injectable constructor enables testing in non-browser/Vitest environments.
 */

export class BrowserSpeechSynthesizer {
  /**
   * @param {object} [options]
   * @param {object} [options.windowObj] - Window or mock window object
   * @param {object} [options.speechSynthesis] - Custom synthesis implementation for testing
   * @param {new (text: string) => any} [options.UtteranceConstructor] - Custom utterance constructor for testing
   * @param {string} [options.defaultLang='en-US'] - Default BCP-47 language tag
   * @param {number} [options.defaultRate=1.0] - Speaking rate (0.1 to 10)
   * @param {number} [options.defaultPitch=1.0] - Speaking pitch (0 to 2)
   */
  constructor(options = {}) {
    this.windowObj = options.windowObj || (typeof window !== 'undefined' ? window : {});
    this.synth = options.speechSynthesis || this.windowObj.speechSynthesis || null;
    this.UtteranceConstructor =
      options.UtteranceConstructor || this.windowObj.SpeechSynthesisUtterance || null;

    this.defaultLang = options.defaultLang || 'en-US';
    this.defaultRate = options.defaultRate !== undefined ? options.defaultRate : 1.0;
    this.defaultPitch = options.defaultPitch !== undefined ? options.defaultPitch : 1.0;

    this.isSpeaking = false;
    this.currentUtterance = null;
  }

  /**
   * Check if speech synthesis is supported in the current environment.
   * @returns {boolean}
   */
  isSupported() {
    return Boolean(this.synth && this.UtteranceConstructor);
  }

  /**
   * Speak a text prompt.
   *
   * @param {string} text - The text to be spoken
   * @param {object} [options]
   * @param {string} [options.lang] - Override language
   * @param {number} [options.rate] - Override rate
   * @param {number} [options.pitch] - Override pitch
   * @param {function(): void} [options.onStart] - Speech started callback
   * @param {function(): void} [options.onEnd] - Speech ended successfully callback
   * @param {function(object): void} [options.onError] - Speech error callback
   * @returns {boolean} True if speech was initiated, false if unsupported or invalid
   */
  speak(text, options = {}) {
    if (!text || typeof text !== 'string' || !text.trim()) {
      return false;
    }

    if (!this.isSupported()) {
      if (options.onError) {
        options.onError({
          error: 'not-supported',
          message: 'Speech synthesis is not supported in this browser.',
        });
      }
      return false;
    }

    // Cancel any ongoing speech before starting a new utterance
    this.stop();

    try {
      const Utterance = this.UtteranceConstructor;
      const utterance = new Utterance(text.trim());

      utterance.lang = options.lang || this.defaultLang;
      utterance.rate = options.rate !== undefined ? options.rate : this.defaultRate;
      utterance.pitch = options.pitch !== undefined ? options.pitch : this.defaultPitch;

      this.currentUtterance = utterance;

      utterance.onstart = () => {
        this.isSpeaking = true;
        if (options.onStart) {
          options.onStart();
        }
      };

      utterance.onend = () => {
        this.isSpeaking = false;
        this._cleanupUtterance(utterance);
        if (options.onEnd) {
          options.onEnd();
        }
      };

      utterance.onerror = (event) => {
        this.isSpeaking = false;
        this._cleanupUtterance(utterance);
        // Note: 'canceled' or 'interrupted' is normal when stop() is called explicitly
        if (options.onError) {
          options.onError({
            error: event.error || 'synthesis-error',
            message: event.error === 'canceled' ? 'Speech was canceled.' : `Speech synthesis error: ${event.error}`,
            isCanceled: event.error === 'canceled' || event.error === 'interrupted',
          });
        }
      };

      this.synth.speak(utterance);
      return true;
    } catch (err) {
      this.isSpeaking = false;
      this._cleanupUtterance(this.currentUtterance);
      if (options.onError) {
        options.onError({
          error: 'speak-failed',
          message: err.message || 'Failed to initiate speech synthesis.',
          isCanceled: false,
        });
      }
      return false;
    }
  }

  /**
   * Stop any in-progress speech immediately.
   */
  stop() {
    if (!this.synth) return;
    this.isSpeaking = false;
    try {
      this.synth.cancel();
    } catch (err) {
      // Ignore errors when canceling
    }
    if (this.currentUtterance) {
      this._cleanupUtterance(this.currentUtterance);
    }
  }

  /**
   * Release all handlers and references.
   */
  destroy() {
    this.stop();
    this.synth = null;
    this.UtteranceConstructor = null;
    this.currentUtterance = null;
  }

  _cleanupUtterance(utterance) {
    if (!utterance) return;
    utterance.onstart = null;
    utterance.onend = null;
    utterance.onerror = null;
    if (this.currentUtterance === utterance) {
      this.currentUtterance = null;
    }
  }
}
