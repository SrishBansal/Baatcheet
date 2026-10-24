/**
 * Browser Speech Recognition Adapter.
 *
 * Implements Requirement C.1 and ADR-009:
 * - Wraps the Web Speech Recognition API with runtime feature detection.
 * - Handles interim vs. final transcription without duplicate final text accumulation.
 * - Translates low-level browser events and errors into clean, structured notifications.
 * - Avoids auto-restart loops and never pretends to be working when unsupported.
 * - Dependency-injectable constructor enables testing in non-browser/Vitest environments.
 */

/**
 * Human-readable explanations for standard Web Speech recognition error codes.
 */
const ERROR_MESSAGES = {
  'not-allowed': 'Microphone access was denied. Please allow microphone permissions in your browser settings.',
  'service-not-allowed': 'Speech recognition service was denied by the browser or system policy.',
  'no-speech': 'No speech was detected within the silence window.',
  'audio-capture': 'No microphone was found or microphone hardware capture failed.',
  'network': 'Speech recognition network connection failed. Check your internet connectivity.',
  'aborted': 'Speech recognition was aborted.',
  'not-supported': 'Speech recognition is not supported in this browser.',
};

export class BrowserSpeechRecognizer {
  /**
   * @param {object} [options]
   * @param {object} [options.windowObj] - Window or mock window object
   * @param {new () => any} [options.RecognitionConstructor] - Optional custom constructor for testing
   * @param {string} [options.lang='en-US'] - Recognition language
   * @param {boolean} [options.continuous=true] - Continuous recognition
   * @param {boolean} [options.interimResults=true] - Return partial results before final
   * @param {function(object): void} [options.onResult] - Result handler ({ text, isFinal, interimText })
   * @param {function(object): void} [options.onError] - Error handler ({ error, message, isPermissionDenied, isNoSpeech })
   * @param {function(): void} [options.onStart] - Recognition started handler
   * @param {function(): void} [options.onEnd] - Recognition ended handler
   * @param {function(): void} [options.onSpeechStart] - Candidate speech detection started (for barge-in/interruption)
   */
  constructor(options = {}) {
    this.windowObj = options.windowObj || (typeof window !== 'undefined' ? window : {});
    this.RecognitionConstructor =
      options.RecognitionConstructor ||
      this.windowObj.SpeechRecognition ||
      this.windowObj.webkitSpeechRecognition ||
      null;

    this.lang = options.lang || 'en-US';
    this.continuous = options.continuous !== undefined ? options.continuous : true;
    this.interimResults = options.interimResults !== undefined ? options.interimResults : true;

    // Callbacks
    this.onResult = options.onResult || null;
    this.onError = options.onError || null;
    this.onStart = options.onStart || null;
    this.onEnd = options.onEnd || null;
    this.onSpeechStart = options.onSpeechStart || null;

    // State
    this.recognition = null;
    this.isListening = false;
    this.committedText = '';
    this.lastProcessedIndex = 0;
  }

  /**
   * Check if speech recognition is supported in the current environment.
   * @returns {boolean}
   */
  isSupported() {
    return Boolean(this.RecognitionConstructor);
  }

  /**
   * Start speech recognition.
   * @returns {boolean} True if recognition was initiated, false if unsupported or error
   */
  start() {
    if (!this.isSupported()) {
      if (this.onError) {
        this.onError({
          error: 'not-supported',
          message: ERROR_MESSAGES['not-supported'],
          isPermissionDenied: false,
          isNoSpeech: false,
        });
      }
      return false;
    }

    if (this.isListening) {
      // Idempotent: already running
      return true;
    }

    this.committedText = '';
    this.lastProcessedIndex = 0;

    try {
      const Recon = this.RecognitionConstructor;
      this.recognition = new Recon();
      this.recognition.lang = this.lang;
      this.recognition.continuous = this.continuous;
      this.recognition.interimResults = this.interimResults;

      // Bind handlers
      this.recognition.onstart = this._handleStart.bind(this);
      this.recognition.onresult = this._handleResult.bind(this);
      this.recognition.onerror = this._handleError.bind(this);
      this.recognition.onend = this._handleEnd.bind(this);

      if (typeof this.recognition.onspeechstart !== 'undefined') {
        this.recognition.onspeechstart = this._handleSpeechStart.bind(this);
      }

      this.recognition.start();
      return true;
    } catch (err) {
      this.isListening = false;
      if (this.onError) {
        this.onError({
          error: 'start-failed',
          message: err.message || 'Failed to start speech recognition.',
          isPermissionDenied: false,
          isNoSpeech: false,
        });
      }
      return false;
    }
  }

  /**
   * Stop speech recognition gracefully (completing in-flight speech).
   */
  stop() {
    if (!this.recognition || !this.isListening) {
      return;
    }
    this.isListening = false;
    try {
      this.recognition.stop();
    } catch (err) {
      // Ignore InvalidStateError if already stopped
    }
  }

  /**
   * Abort recognition immediately, discarding in-flight audio.
   */
  abort() {
    if (!this.recognition) {
      return;
    }
    this.isListening = false;
    try {
      this.recognition.abort();
    } catch (err) {
      // Ignore errors when aborting
    }
  }

  /**
   * Detach all event listeners and release recognition instance.
   */
  destroy() {
    this.abort();
    if (this.recognition) {
      this.recognition.onstart = null;
      this.recognition.onresult = null;
      this.recognition.onerror = null;
      this.recognition.onend = null;
      this.recognition.onspeechstart = null;
      this.recognition = null;
    }
    this.isListening = false;
  }

  /* ----------------------------------------------------------------
     Internal Event Handlers
     ---------------------------------------------------------------- */

  _handleStart() {
    this.isListening = true;
    if (this.onStart) {
      this.onStart();
    }
  }

  _handleSpeechStart() {
    if (this.onSpeechStart) {
      this.onSpeechStart();
    }
  }

  _handleResult(event) {
    if (!event || !event.results) return;

    let interimText = '';
    let newFinalText = '';

    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i];
      if (!result || !result[0]) continue;

      const transcriptPiece = result[0].transcript || '';

      if (result.isFinal) {
        // Prevent duplicate final segments by ensuring index is monotonic
        if (i >= this.lastProcessedIndex) {
          newFinalText += (newFinalText ? ' ' : '') + transcriptPiece.trim();
          this.lastProcessedIndex = i + 1;
        }
      } else {
        interimText += (interimText ? ' ' : '') + transcriptPiece.trim();
      }
    }

    if (newFinalText) {
      this.committedText = (this.committedText ? this.committedText + ' ' : '') + newFinalText;
    }

    const currentFullText = (this.committedText ? this.committedText + ' ' : '') + interimText;

    if (this.onResult) {
      this.onResult({
        text: currentFullText.trim(),
        isFinal: Boolean(newFinalText && !interimText),
        interimText: interimText.trim(),
        finalText: this.committedText.trim(),
      });
    }
  }

  _handleError(event) {
    const errorCode = event.error || 'unknown';
    const isPermissionDenied =
      errorCode === 'not-allowed' || errorCode === 'service-not-allowed';
    const isNoSpeech = errorCode === 'no-speech';
    const isAudioCaptureError = errorCode === 'audio-capture';

    const payload = {
      error: errorCode,
      message: ERROR_MESSAGES[errorCode] || `Speech recognition error: ${errorCode}`,
      isPermissionDenied,
      isNoSpeech,
      isAudioCaptureError,
    };

    if (this.onError) {
      this.onError(payload);
    }
  }

  _handleEnd() {
    this.isListening = false;
    if (this.onEnd) {
      this.onEnd();
    }
  }
}
