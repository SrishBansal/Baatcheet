import { describe, it, expect } from 'vitest';
import { InterviewEventLog, EventType } from '../../src/engine/eventLog.js';

describe('InterviewEventLog', () => {
  it('logs events chronologically', () => {
    const logger = new InterviewEventLog('test-interview-123');

    logger.logEvent(EventType.SESSION_STARTED);
    logger.logEvent(EventType.INTERVIEW_PAUSED);
    logger.logEvent(EventType.INTERVIEW_RESUMED);

    const events = logger.getEvents();
    expect(events.length).toBe(3);
    expect(events[0].type).toBe(EventType.SESSION_STARTED);
    expect(events[1].type).toBe(EventType.INTERVIEW_PAUSED);
    expect(events[2].type).toBe(EventType.INTERVIEW_RESUMED);
    expect(events[0].timestamp).toBeDefined();
  });

  it('records interviewer questions in the transcript', () => {
    const logger = new InterviewEventLog('test-interview-123');

    const turn = logger.logQuestion({
      questionId: 'q-101',
      text: 'Tell me about microservices',
      category: 'technical',
    });

    expect(turn.role).toBe('interviewer');
    expect(turn.questionId).toBe('q-101');
    expect(turn.text).toBe('Tell me about microservices');

    const transcript = logger.getTranscript();
    expect(transcript.length).toBe(1);
    expect(transcript[0].questionId).toBe('q-101');
  });

  it('records candidate answers with strict separation of raw text vs AI interpretation', () => {
    const logger = new InterviewEventLog('test-interview-123');

    const rawSpeech = 'I built services using gRPC and Kafka.';
    const aiNotes = { summary: 'Candidate mentioned gRPC and Kafka for messaging.' };

    const turn = logger.logAnswer({
      questionId: 'q-101',
      recognizedText: rawSpeech,
      durationSeconds: 15.2,
      latencyMs: 1400,
      aiInterpretation: aiNotes,
    });

    expect(turn.role).toBe('candidate');
    expect(turn.recognizedText).toBe(rawSpeech);
    expect(turn.aiInterpretation).toEqual(aiNotes);
    // Verify aiInterpretation did NOT overwrite recognizedText
    expect(turn.recognizedText).not.toContain('Candidate mentioned');

    const exported = logger.exportSession();
    expect(exported.transcriptTurnCount).toBe(1);
    expect(exported.interviewId).toBe('test-interview-123');
  });

  it('throws error if answer is logged without recognizedText', () => {
    const logger = new InterviewEventLog();
    expect(() => {
      logger.logAnswer({ questionId: 'q-1' });
    }).toThrow(/Answer must include raw recognizedText string/);
  });

  it('records skipped questions with skipped:true and empty recognizedText', () => {
    const logger = new InterviewEventLog('test-interview-123');

    const turn = logger.logSkip({
      questionId: 'q-202',
      isFollowUp: false,
      reason: 'candidate_skipped',
    });

    expect(turn.role).toBe('candidate');
    expect(turn.questionId).toBe('q-202');
    expect(turn.skipped).toBe(true);
    expect(turn.recognizedText).toBe(''); // Must NOT be an answered turn

    const events = logger.getEvents();
    const skipEvent = events.find((e) => e.type === EventType.QUESTION_SKIPPED);
    expect(skipEvent).toBeDefined();
    expect(skipEvent.metadata.questionId).toBe('q-202');
  });

  it('records interruption events cleanly in timeline', () => {
    const logger = new InterviewEventLog('test-interview-123');
    logger.logEvent(EventType.CANDIDATE_INTERRUPTED, {
      questionId: 'q-303',
      interruptedAtState: 'SPEAKING_QUESTION',
    });

    const events = logger.getEvents();
    expect(events.length).toBe(1);
    expect(events[0].type).toBe(EventType.CANDIDATE_INTERRUPTED);
    expect(events[0].metadata.questionId).toBe('q-303');
  });
});
