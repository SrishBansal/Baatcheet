/**
 * Browser Voice Capability Detection.
 *
 * Evaluates runtime availability of the Web Speech API (Recognition and Synthesis)
 * through feature detection (not user-agent sniffing).
 *
 * Satisfies Requirement C.4 and ADR-009:
 * - Detects SpeechRecognition / webkitSpeechRecognition availability.
 * - Detects SpeechSynthesis and SpeechSynthesisUtterance availability.
 * - Reports capability modes: 'full_voice', 'synthesis_only', 'recognition_only', 'text_fallback_only'.
 * - Guarantees that text input fallback is always available when voice recognition is absent.
 */

/**
 * @typedef {object} VoiceCapabilities
 * @property {boolean} hasSpeechRecognition - True if browser supports SpeechRecognition or webkitSpeechRecognition
 * @property {boolean} hasSpeechSynthesis - True if browser supports speechSynthesis and SpeechSynthesisUtterance
 * @property {boolean} supportsFullVoice - True if both recognition and synthesis are available
 * @property {boolean} supportsTextInputFallback - Always true (standard textarea/input input)
 * @property {'full_voice' | 'synthesis_only' | 'recognition_only' | 'text_fallback_only'} mode - High-level operational mode
 * @property {string} summary - Human-readable explanation of available capabilities
 * @property {{ recognitionApi: string | null, synthesisApi: boolean }} details - Concrete API support details
 */

/**
 * Detect runtime Web Speech capabilities.
 * Accepts an optional windowObj for testing via dependency injection.
 *
 * @param {object} [windowObj] - Window or mock window object
 * @returns {VoiceCapabilities}
 */
export function detectCapabilities(windowObj = (typeof window !== 'undefined' ? window : {})) {
  const win = windowObj || {};

  // Check Recognition
  const hasStandardRecognition = typeof win.SpeechRecognition !== 'undefined';
  const hasWebkitRecognition = typeof win.webkitSpeechRecognition !== 'undefined';
  const hasSpeechRecognition = hasStandardRecognition || hasWebkitRecognition;
  const recognitionApi = hasStandardRecognition
    ? 'SpeechRecognition'
    : hasWebkitRecognition
    ? 'webkitSpeechRecognition'
    : null;

  // Check Synthesis
  const hasSpeechSynthesis = Boolean(
    win.speechSynthesis && typeof win.SpeechSynthesisUtterance !== 'undefined'
  );

  // Derive mode
  let mode;
  let summary;

  if (hasSpeechRecognition && hasSpeechSynthesis) {
    mode = 'full_voice';
    summary = 'Full voice support: Speech recognition and speech synthesis are both available.';
  } else if (!hasSpeechRecognition && hasSpeechSynthesis) {
    mode = 'synthesis_only';
    summary = 'Partial voice support: Speech synthesis is available, but speech recognition is unsupported. Candidate responses must use text input.';
  } else if (hasSpeechRecognition && !hasSpeechSynthesis) {
    mode = 'recognition_only';
    summary = 'Partial voice support: Speech recognition is available, but speech synthesis is unsupported. Questions will be displayed as text.';
  } else {
    mode = 'text_fallback_only';
    summary = 'Voice unsupported: Neither speech recognition nor speech synthesis is available in this browser. The interview will run entirely via text.';
  }

  return {
    hasSpeechRecognition,
    hasSpeechSynthesis,
    supportsFullVoice: hasSpeechRecognition && hasSpeechSynthesis,
    supportsTextInputFallback: true,
    mode,
    summary,
    details: {
      recognitionApi,
      synthesisApi: hasSpeechSynthesis,
    },
  };
}
