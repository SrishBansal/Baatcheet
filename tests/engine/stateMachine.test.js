import { describe, it, expect, vi } from 'vitest';
import {
  InterviewStateMachine,
  InterviewState,
  InterviewEvent,
} from '../../src/engine/stateMachine.js';

describe('InterviewStateMachine', () => {
  it('initializes in IDLE state', () => {
    const sm = new InterviewStateMachine();
    expect(sm.getState()).toBe(InterviewState.IDLE);
  });

  it('follows the standard linear interview flow', () => {
    const sm = new InterviewStateMachine();

    // IDLE -> PRE_CHECK
    sm.transition(InterviewEvent.START_CHECK);
    expect(sm.getState()).toBe(InterviewState.PRE_CHECK);

    // PRE_CHECK -> READY
    sm.transition(InterviewEvent.CHECK_PASSED);
    expect(sm.getState()).toBe(InterviewState.READY);

    // READY -> SPEAKING_QUESTION
    sm.transition(InterviewEvent.START_INTERVIEW);
    expect(sm.getState()).toBe(InterviewState.SPEAKING_QUESTION);

    // SPEAKING_QUESTION -> LISTENING
    sm.transition(InterviewEvent.QUESTION_SPOKEN);
    expect(sm.getState()).toBe(InterviewState.LISTENING);

    // LISTENING -> PROCESSING_RESPONSE
    sm.transition(InterviewEvent.RESPONSE_RECEIVED);
    expect(sm.getState()).toBe(InterviewState.PROCESSING_RESPONSE);

    // PROCESSING_RESPONSE -> NEXT_QUESTION
    sm.transition(InterviewEvent.NEXT_QUESTION);
    expect(sm.getState()).toBe(InterviewState.SPEAKING_QUESTION);

    // Next question: SPEAKING -> LISTENING -> PROCESSING -> FINISH
    sm.transition(InterviewEvent.QUESTION_SPOKEN);
    sm.transition(InterviewEvent.RESPONSE_RECEIVED);
    sm.transition(InterviewEvent.FINISH);
    expect(sm.getState()).toBe(InterviewState.COMPLETED);
  });

  it('handles follow-up questions correctly', () => {
    const sm = new InterviewStateMachine();
    sm.transition(InterviewEvent.START_CHECK);
    sm.transition(InterviewEvent.CHECK_PASSED);
    sm.transition(InterviewEvent.START_INTERVIEW);
    sm.transition(InterviewEvent.QUESTION_SPOKEN);
    sm.transition(InterviewEvent.RESPONSE_RECEIVED);

    // Trigger follow up
    sm.transition(InterviewEvent.TRIGGER_FOLLOW_UP);
    expect(sm.getState()).toBe(InterviewState.FOLLOW_UP);

    // Follow-up spoken -> LISTENING
    sm.transition(InterviewEvent.FOLLOW_UP_SPOKEN);
    expect(sm.getState()).toBe(InterviewState.LISTENING);
  });

  it('handles repetition and clarification requests', () => {
    const sm = new InterviewStateMachine();
    sm.transition(InterviewEvent.START_CHECK);
    sm.transition(InterviewEvent.CHECK_PASSED);
    sm.transition(InterviewEvent.START_INTERVIEW);
    sm.transition(InterviewEvent.QUESTION_SPOKEN);

    // While LISTENING, candidate asks for repetition
    sm.transition(InterviewEvent.REQUEST_REPEAT);
    expect(sm.getState()).toBe(InterviewState.SPEAKING_QUESTION);
    expect(sm.getContext().repeatCount).toBe(1);

    // Back to listening
    sm.transition(InterviewEvent.QUESTION_SPOKEN);
    expect(sm.getState()).toBe(InterviewState.LISTENING);

    // While LISTENING, candidate asks for clarification
    sm.transition(InterviewEvent.REQUEST_CLARIFY);
    expect(sm.getState()).toBe(InterviewState.SPEAKING_QUESTION);
  });

  it('handles pause and resume cleanly', () => {
    const sm = new InterviewStateMachine();
    sm.transition(InterviewEvent.START_CHECK);
    sm.transition(InterviewEvent.CHECK_PASSED);
    sm.transition(InterviewEvent.START_INTERVIEW);
    sm.transition(InterviewEvent.QUESTION_SPOKEN); // LISTENING

    // Pause while LISTENING
    sm.transition(InterviewEvent.PAUSE);
    expect(sm.getState()).toBe(InterviewState.PAUSED);
    expect(sm.getContext().pauseTimestamp).toBeTypeOf('number');

    // Resume restores previous state
    sm.transition(InterviewEvent.RESUME);
    expect(sm.getState()).toBe(InterviewState.LISTENING);
    expect(sm.getContext().pauseTimestamp).toBeNull();
  });

  it('guards against illegal transitions and throws informative error', () => {
    const sm = new InterviewStateMachine();

    expect(() => {
      // Cannot jump from IDLE directly to LISTENING
      sm.transition(InterviewEvent.QUESTION_SPOKEN);
    }).toThrow(/Invalid state transition: Cannot dispatch event 'QUESTION_SPOKEN' from state 'IDLE'/);
  });

  it('notifies subscribers on each transition', () => {
    const sm = new InterviewStateMachine();
    const listener = vi.fn();
    const unsubscribe = sm.subscribe(listener);

    sm.transition(InterviewEvent.START_CHECK);
    expect(listener).toHaveBeenCalledWith(
      InterviewState.PRE_CHECK,
      InterviewState.IDLE,
      expect.any(Object)
    );

    unsubscribe();
    sm.transition(InterviewEvent.CHECK_PASSED);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  describe('explicit question skipping (SKIP_QUESTION)', () => {
    it('allows skipping while in LISTENING state', () => {
      const sm = new InterviewStateMachine();
      sm.transition(InterviewEvent.START_CHECK);
      sm.transition(InterviewEvent.CHECK_PASSED);
      sm.transition(InterviewEvent.START_INTERVIEW);
      sm.transition(InterviewEvent.QUESTION_SPOKEN); // LISTENING

      expect(sm.can(InterviewEvent.SKIP_QUESTION)).toBe(true);
      sm.transition(InterviewEvent.SKIP_QUESTION);
      expect(sm.getState()).toBe(InterviewState.PROCESSING_RESPONSE);
      expect(sm.getContext().skipCount).toBe(1);
      expect(sm.getContext().lastAction).toBe('skip');
    });

    it('allows skipping while in SPEAKING_QUESTION state', () => {
      const sm = new InterviewStateMachine();
      sm.transition(InterviewEvent.START_CHECK);
      sm.transition(InterviewEvent.CHECK_PASSED);
      sm.transition(InterviewEvent.START_INTERVIEW); // SPEAKING_QUESTION

      expect(sm.can(InterviewEvent.SKIP_QUESTION)).toBe(true);
      sm.transition(InterviewEvent.SKIP_QUESTION);
      expect(sm.getState()).toBe(InterviewState.PROCESSING_RESPONSE);
      expect(sm.getContext().skipCount).toBe(1);
    });

    it('allows skipping while in FOLLOW_UP state', () => {
      const sm = new InterviewStateMachine();
      sm.transition(InterviewEvent.START_CHECK);
      sm.transition(InterviewEvent.CHECK_PASSED);
      sm.transition(InterviewEvent.START_INTERVIEW);
      sm.transition(InterviewEvent.QUESTION_SPOKEN);
      sm.transition(InterviewEvent.RESPONSE_RECEIVED);
      sm.transition(InterviewEvent.TRIGGER_FOLLOW_UP); // FOLLOW_UP

      expect(sm.can(InterviewEvent.SKIP_QUESTION)).toBe(true);
      sm.transition(InterviewEvent.SKIP_QUESTION);
      expect(sm.getState()).toBe(InterviewState.PROCESSING_RESPONSE);
    });

    it('rejects skipping from invalid states with informative error', () => {
      const sm = new InterviewStateMachine(); // IDLE
      expect(sm.can(InterviewEvent.SKIP_QUESTION)).toBe(false);
      expect(() => {
        sm.transition(InterviewEvent.SKIP_QUESTION);
      }).toThrow(/Invalid state transition: Cannot dispatch event 'SKIP_QUESTION' from state 'IDLE'/);
    });
  });

  describe('interruption handling (CANDIDATE_INTERRUPTED)', () => {
    it('transitions from SPEAKING_QUESTION to LISTENING on interruption', () => {
      const sm = new InterviewStateMachine();
      sm.transition(InterviewEvent.START_CHECK);
      sm.transition(InterviewEvent.CHECK_PASSED);
      sm.transition(InterviewEvent.START_INTERVIEW); // SPEAKING_QUESTION

      expect(sm.can(InterviewEvent.CANDIDATE_INTERRUPTED)).toBe(true);
      sm.transition(InterviewEvent.CANDIDATE_INTERRUPTED);

      expect(sm.getState()).toBe(InterviewState.LISTENING);
      expect(sm.getContext().interruptionCount).toBe(1);
      expect(sm.getContext().lastAction).toBe('interrupted');
    });

    it('transitions from FOLLOW_UP to LISTENING on interruption', () => {
      const sm = new InterviewStateMachine();
      sm.transition(InterviewEvent.START_CHECK);
      sm.transition(InterviewEvent.CHECK_PASSED);
      sm.transition(InterviewEvent.START_INTERVIEW);
      sm.transition(InterviewEvent.QUESTION_SPOKEN);
      sm.transition(InterviewEvent.RESPONSE_RECEIVED);
      sm.transition(InterviewEvent.TRIGGER_FOLLOW_UP); // FOLLOW_UP

      expect(sm.can(InterviewEvent.CANDIDATE_INTERRUPTED)).toBe(true);
      sm.transition(InterviewEvent.CANDIDATE_INTERRUPTED);
      expect(sm.getState()).toBe(InterviewState.LISTENING);
      expect(sm.getContext().interruptionCount).toBe(1);
    });

    it('rejects interruption from states where system is not speaking', () => {
      const sm = new InterviewStateMachine();
      sm.transition(InterviewEvent.START_CHECK);
      sm.transition(InterviewEvent.CHECK_PASSED);
      sm.transition(InterviewEvent.START_INTERVIEW);
      sm.transition(InterviewEvent.QUESTION_SPOKEN); // LISTENING

      expect(sm.can(InterviewEvent.CANDIDATE_INTERRUPTED)).toBe(false);
      expect(() => {
        sm.transition(InterviewEvent.CANDIDATE_INTERRUPTED);
      }).toThrow(/Invalid state transition: Cannot dispatch event 'CANDIDATE_INTERRUPTED' from state 'LISTENING'/);
    });

    it('supports recovery flows after interruption', () => {
      const sm = new InterviewStateMachine();
      sm.transition(InterviewEvent.START_CHECK);
      sm.transition(InterviewEvent.CHECK_PASSED);
      sm.transition(InterviewEvent.START_INTERVIEW); // SPEAKING_QUESTION
      sm.transition(InterviewEvent.CANDIDATE_INTERRUPTED); // now LISTENING

      // Candidate asks to repeat after interrupting
      sm.transition(InterviewEvent.REQUEST_REPEAT);
      expect(sm.getState()).toBe(InterviewState.SPEAKING_QUESTION);

      // Question finishes speaking
      sm.transition(InterviewEvent.QUESTION_SPOKEN);
      expect(sm.getState()).toBe(InterviewState.LISTENING);

      // Candidate answers
      sm.transition(InterviewEvent.RESPONSE_RECEIVED);
      expect(sm.getState()).toBe(InterviewState.PROCESSING_RESPONSE);
    });
  });
});
