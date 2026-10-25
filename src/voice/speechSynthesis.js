/**
 * Browser Speech Synthesis Adapter.
 *
 * Implements Requirement C.2, Objective 1, and ADR-009/ADR-024:
 * - Wraps the Web Speech Synthesis API (`window.speechSynthesis`).
 * - Handles asynchronous voice loading via `getVoices()` and `voiceschanged`.
 * - Employs a natural-sounding voice selection algorithm prioritizing human-clarity
 *   voices and avoiding distorted/robotic legacy novelty voices.
 * - Uses a moderate, articulate speaking rate (0.92) and sensible default pitch (1.0).
 * - Tracks utterance sequence IDs to eliminate overlapping playback and prevent stale
 *   cancellation callbacks from triggering unintended state transitions.
 * - Differentiates intentional cancellation from genuine synthesis errors.
 * - Cleans up event listeners and references on destroy.
 */

// Legacy novelty/robotic voices to avoid when natural alternatives are present
const ROBOTIC_VOICE_BLACKLIST = new Set([
  'albert',
  'bad news',
  'bahh',
  'bells',
  'boing',
  'bubbles',
  'cellos',
  'deranged',
  'good news',
  'hysterical',
  'junior',
  'kathy',
  'organ',
  'princess',
  'ralph',
  'trinoids',
  'whisper',
  'zarvox',
  'fred',
]);

export class BrowserSpeechSynthesizer {
  /**
   * @param {object} [options]
   * @param {object} [options.windowObj] - Window or mock window object
   * @param {object} [options.speechSynthesis] - Custom synthesis implementation for testing
   * @param {new (text: string) => any} [options.UtteranceConstructor] - Custom utterance constructor for testing
   * @param {string} [options.defaultLang='en-US'] - Default BCP-47 language tag
   * @param {number} [options.defaultRate=0.92] - Moderate speaking rate (0.1 to 10)
   * @param {number} [options.defaultPitch=1.0] - Speaking pitch (0 to 2)
   */
  constructor(options = {}) {
    this.windowObj = options.windowObj || (typeof window !== 'undefined' ? window : {});
    this.synth = options.speechSynthesis || this.windowObj.speechSynthesis || null;
    this.UtteranceConstructor =
      options.UtteranceConstructor || this.windowObj.SpeechSynthesisUtterance || null;

    this.defaultLang = options.defaultLang || 'en-US';
    // Moderate speaking rate (0.92) produces clearer, less rushed question delivery
    this.defaultRate = options.defaultRate !== undefined ? options.defaultRate : 0.92;
    this.defaultPitch = options.defaultPitch !== undefined ? options.defaultPitch : 1.0;

    this.isSpeaking = false;
    this.currentUtterance = null;
    this._currentUtteranceId = 0;
    this.voices = [];

    // Initialize voice list and subscribe to browser's asynchronous voiceschanged event
    this._handleVoicesChanged = this._loadVoices.bind(this);
    if (this.synth) {
      this._loadVoices();
      if (typeof this.synth.addEventListener === 'function') {
        this.synth.addEventListener('voiceschanged', this._handleVoicesChanged);
      } else if ('onvoiceschanged' in this.synth) {
        this.synth.onvoiceschanged = this._handleVoicesChanged;
      }
    }
  }

  /**
   * Refresh available browser voices from synthesis engine.
   * @private
   */
  _loadVoices() {
    if (!this.synth || typeof this.synth.getVoices !== 'function') {
      return;
    }
    try {
      const loaded = this.synth.getVoices() || [];
      if (Array.isArray(loaded) && loaded.length > 0) {
        this.voices = loaded;
      }
    } catch (err) {
      // Ignore errors when querying voices
    }
  }

  /**
   * Check if speech synthesis is supported in the current environment.
   * @returns {boolean}
   */
  isSupported() {
    return Boolean(this.synth && this.UtteranceConstructor);
  }

  /**
   * Retrieve list of currently available browser voices.
   * @returns {SpeechSynthesisVoice[]}
   */
  getAvailableVoices() {
    if (this.voices.length === 0) {
      this._loadVoices();
    }
    return this.voices;
  }

  /**
   * Select the most natural-sounding voice compatible with the specified language.
   * Prioritizes neural/natural/enhanced voices and avoids legacy robotic synthesizers.
   *
   * @param {string} [targetLang='en-US'] - BCP-47 language tag
   * @returns {SpeechSynthesisVoice|null}
   */
  selectBestVoice(targetLang = this.defaultLang) {
    const voices = this.getAvailableVoices();
    if (!voices || voices.length === 0) {
      return null;
    }

    const normLang = (targetLang || 'en-US').toLowerCase().replace('_', '-');
    const langPrefix = normLang.split('-')[0];

    // Score voice candidates based on clarity, naturalness, and language compatibility
    const scoredVoices = voices.map((v) => {
      const vName = (v.name || '').toLowerCase();
      const vLang = (v.lang || '').toLowerCase().replace('_', '-');
      let score = 0;

      // Penalize legacy novelty/robotic voices
      const isBlacklisted = ROBOTIC_VOICE_BLACKLIST.has(vName);
      if (isBlacklisted) {
        score -= 100;
      }

      // Language match scoring
      if (vLang === normLang) {
        score += 50; // Exact locale match (e.g. en-US)
      } else if (vLang.startsWith(langPrefix)) {
        score += 25; // Family match (e.g. en-GB, en-AU for en-US)
      } else {
        // Different language entirely
        return { voice: v, score: -1000 };
      }

      // Natural / Neural indicators (highest priority)
      if (vName.includes('natural') || vName.includes('neural')) {
        score += 100;
      }
      // Google high-quality synthesis voices (Chrome)
      if (vName.includes('google')) {
        score += 80;
      }
      // Apple / Premium natural voices (macOS / iOS / Safari)
      if (vName.includes('enhanced') || vName.includes('premium')) {
        score += 70;
      }
      // Known high-clarity human-modeled voices
      const naturalNames = [
        'samantha',
        'ava',
        'karen',
        'daniel',
        'victoria',
        'moira',
        'tessa',
        'serena',
        'allison',
        'tom',
        'oliver',
      ];
      if (naturalNames.some((name) => vName.includes(name))) {
        score += 50;
      }

      // Browser default voice preference
      if (v.default) {
        score += 15;
      }

      // Local service preference over low-bandwidth cloud
      if (v.localService) {
        score += 5;
      }

      return { voice: v, score };
    });

    // Filter out candidates with negative total scores if acceptable voices exist
    const viable = scoredVoices.filter((item) => item.score > 0);
    const pool = viable.length > 0 ? viable : scoredVoices.filter((item) => item.score > -500);

    if (pool.length === 0) {
      return voices[0] || null;
    }

    pool.sort((a, b) => b.score - a.score);
    return pool[0].voice;
  }

  /**
   * Speak a text prompt.
   *
   * @param {string} text - The text to be spoken
   * @param {object} [options]
   * @param {string} [options.lang] - Override language
   * @param {number} [options.rate] - Override rate
   * @param {number} [options.pitch] - Override pitch
   * @param {SpeechSynthesisVoice} [options.voice] - Explicit voice override
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
          isCanceled: false,
        });
      }
      return false;
    }

    // Cancel any ongoing speech and increment utterance ID to isolate callbacks
    this.stop();
    const utteranceId = ++this._currentUtteranceId;

    try {
      const Utterance = this.UtteranceConstructor;
      const utterance = new Utterance(text.trim());

      const lang = options.lang || this.defaultLang;
      utterance.lang = lang;
      utterance.rate = options.rate !== undefined ? options.rate : this.defaultRate;
      utterance.pitch = options.pitch !== undefined ? options.pitch : this.defaultPitch;

      // Select and assign the best available natural voice
      const selectedVoice = options.voice || this.selectBestVoice(lang);
      if (selectedVoice) {
        utterance.voice = selectedVoice;
      }

      this.currentUtterance = utterance;

      utterance.onstart = () => {
        // Discard if superseded by a newer speak or stop call
        if (this._currentUtteranceId !== utteranceId) return;
        this.isSpeaking = true;
        if (options.onStart) {
          options.onStart();
        }
      };

      utterance.onend = () => {
        if (this._currentUtteranceId !== utteranceId) return;
        this.isSpeaking = false;
        this._cleanupUtterance(utterance);
        if (options.onEnd) {
          options.onEnd();
        }
      };

      utterance.onerror = (event) => {
        if (this._currentUtteranceId !== utteranceId) return;
        this.isSpeaking = false;
        this._cleanupUtterance(utterance);
        const errType = event?.error || 'synthesis-error';
        const isCanceled = errType === 'canceled' || errType === 'interrupted';
        if (options.onError) {
          options.onError({
            error: errType,
            message: isCanceled ? 'Speech was canceled.' : `Speech synthesis error: ${errType}`,
            isCanceled,
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
    // Invalidate any in-flight utterance token so late callbacks are ignored
    this._currentUtteranceId++;
    this.isSpeaking = false;
    if (this.currentUtterance) {
      this._cleanupUtterance(this.currentUtterance);
    }
    if (this.synth) {
      try {
        this.synth.cancel();
      } catch (err) {
        // Ignore errors when canceling
      }
    }
  }

  /**
   * Release all handlers and references.
   */
  destroy() {
    this.stop();
    if (this.synth && this._handleVoicesChanged) {
      if (typeof this.synth.removeEventListener === 'function') {
        this.synth.removeEventListener('voiceschanged', this._handleVoicesChanged);
      } else if (this.synth.onvoiceschanged === this._handleVoicesChanged) {
        this.synth.onvoiceschanged = null;
      }
    }
    this.synth = null;
    this.UtteranceConstructor = null;
    this.currentUtterance = null;
    this.voices = [];
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

