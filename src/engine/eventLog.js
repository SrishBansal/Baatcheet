/**
 * Interview Event Log & Transcript Collector.
 *
 * Implements Requirements D.1, D.2, and D.3:
 * - Records full chronological timeline of events (silence, repetition, pauses, errors).
 * - Records questions asked and candidate answers with timestamps and durations.
 * - STRICT SEPARATION: Raw recognised speech text is stored in `recognizedText` and NEVER
 *   overwritten by AI interpretation, summarisation, or inference.
 */

import { generateId } from '../utils/id.js';

export const EventType = Object.freeze({
  CANDIDATE_CONSENT_GRANTED: 'CANDIDATE_CONSENT_GRANTED',
  SESSION_STARTED: 'SESSION_STARTED',
  QUESTION_ASKED: 'QUESTION_ASKED',
  FOLLOW_UP_ASKED: 'FOLLOW_UP_ASKED',
  ANSWER_RECEIVED: 'ANSWER_RECEIVED',
  CANDIDATE_ANSWERED_AUTO: 'CANDIDATE_ANSWERED_AUTO', // silence-timeout auto-submit
  REPETITION_REQUESTED: 'REPETITION_REQUESTED',
  CLARIFICATION_REQUESTED: 'CLARIFICATION_REQUESTED',
  SILENCE_DETECTED: 'SILENCE_DETECTED',
  QUESTION_SKIPPED: 'QUESTION_SKIPPED',
  CANDIDATE_INTERRUPTED: 'CANDIDATE_INTERRUPTED',
  INTERVIEW_PAUSED: 'INTERVIEW_PAUSED',
  INTERVIEW_RESUMED: 'INTERVIEW_RESUMED',
  INTERVIEW_COMPLETED: 'INTERVIEW_COMPLETED',
  INTERVIEW_ABORTED: 'INTERVIEW_ABORTED',
  ERROR_ENCOUNTERED: 'ERROR_ENCOUNTERED',
});

export class InterviewEventLog {
  constructor(interviewId) {
    this.interviewId = interviewId || generateId();
    this.events = [];
    this.transcript = [];
  }

  /**
   * Log a general lifecycle or interaction event.
   * @param {string} type - Member of EventType
   * @param {object} [metadata={}]
   * @returns {object} The logged event
   */
  logEvent(type, metadata = {}) {
    const event = {
      id: generateId(),
      type,
      timestamp: new Date().toISOString(),
      metadata: { ...metadata },
    };
    this.events.push(event);
    return event;
  }

  /**
   * Record a question presented to the candidate.
   * @param {object} questionData
   * @param {string} questionData.questionId
   * @param {string} questionData.text
   * @param {boolean} [questionData.isFollowUp=false]
   * @param {string} [questionData.category]
   * @returns {object} The transcript turn
   */
  logQuestion({ questionId, text, isFollowUp = false, category = 'general' }) {
    const turn = {
      id: generateId(),
      role: 'interviewer',
      questionId,
      text,
      isFollowUp,
      category,
      timestamp: new Date().toISOString(),
    };

    this.transcript.push(turn);
    this.logEvent(isFollowUp ? EventType.FOLLOW_UP_ASKED : EventType.QUESTION_ASKED, {
      questionId,
      text,
      isFollowUp,
    });

    return turn;
  }

  /**
   * Record that a question was explicitly skipped.
   * A skipped question is recorded with `skipped: true` and empty `recognizedText`.
   * It is never recorded as an answered question turn.
   *
   * @param {object} skipData
   * @param {string} skipData.questionId
   * @param {boolean} [skipData.isFollowUp=false]
   * @param {string} [skipData.reason='candidate_requested']
   * @returns {object} The transcript turn
   */
  logSkip({ questionId, isFollowUp = false, reason = 'candidate_requested' }) {
    const turn = {
      id: generateId(),
      role: 'candidate',
      questionId,
      skipped: true,
      recognizedText: '', // Not an answer
      reason,
      timestamp: new Date().toISOString(),
    };

    this.transcript.push(turn);
    this.logEvent(EventType.QUESTION_SKIPPED, {
      questionId,
      isFollowUp,
      reason,
    });

    return turn;
  }

  /**
   * Record a candidate's answer with explicit separation between recognized raw speech
   * and any subsequent AI notes/interpretation.
   *
   * @param {object} answerData
   * @param {string} answerData.questionId - ID of question being answered
   * @param {string} answerData.recognizedText - Exact raw speech recognition or typed response
   * @param {number} [answerData.durationSeconds=0] - Duration of candidate answer
   * @param {number} [answerData.latencyMs=0] - Response latency (question end to answer start)
   * @param {object} [answerData.aiInterpretation=null] - Optional structured AI notes (kept separate)
   * @returns {object} The transcript turn
   */
  logAnswer({
    questionId,
    recognizedText,
    durationSeconds = 0,
    latencyMs = 0,
    aiInterpretation = null,
  }) {
    if (typeof recognizedText !== 'string') {
      throw new Error('[eventLog] Answer must include raw recognizedText string');
    }

    const turn = {
      id: generateId(),
      role: 'candidate',
      questionId,
      // Strict separation: recognizedText is raw transcript, aiInterpretation is separate
      recognizedText: recognizedText.trim(),
      aiInterpretation: aiInterpretation ? { ...aiInterpretation } : null,
      durationSeconds,
      latencyMs,
      timestamp: new Date().toISOString(),
    };

    this.transcript.push(turn);
    this.logEvent(EventType.ANSWER_RECEIVED, {
      questionId,
      charCount: turn.recognizedText.length,
      durationSeconds,
      latencyMs,
    });

    return turn;
  }

  /**
   * Get raw transcript turns in order.
   * @returns {object[]}
   */
  getTranscript() {
    return [...this.transcript];
  }

  /**
   * Get all recorded timeline events.
   * @returns {object[]}
   */
  getEvents() {
    return [...this.events];
  }

  /**
   * Export the entire session record for storage or evaluation.
   * @returns {object}
   */
  exportSession() {
    return {
      interviewId: this.interviewId,
      eventCount: this.events.length,
      transcriptTurnCount: this.transcript.length,
      events: this.getEvents(),
      transcript: this.getTranscript(),
      exportedAt: new Date().toISOString(),
    };
  }
}
