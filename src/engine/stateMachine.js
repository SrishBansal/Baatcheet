/**
 * Interview Engine — Finite State Machine (FSM).
 *
 * Implements an explicit, deterministic state machine for candidate screening interviews.
 * In accordance with ADR-007, this is framework-agnostic pure JavaScript with no React or
 * external library dependency.
 *
 * The LLM NEVER drives or determines application state transitions; all transitions are
 * strictly enforced by guard conditions.
 */

export const InterviewState = Object.freeze({
  IDLE: 'IDLE',
  PRE_CHECK: 'PRE_CHECK',
  READY: 'READY',
  SPEAKING_QUESTION: 'SPEAKING_QUESTION',
  LISTENING: 'LISTENING',
  PROCESSING_RESPONSE: 'PROCESSING_RESPONSE',
  FOLLOW_UP: 'FOLLOW_UP',
  PAUSED: 'PAUSED',
  COMPLETED: 'COMPLETED',
  ABORTED: 'ABORTED',
  ERROR: 'ERROR',
});

export const InterviewEvent = Object.freeze({
  START_CHECK: 'START_CHECK',
  CHECK_PASSED: 'CHECK_PASSED',
  CHECK_FAILED: 'CHECK_FAILED',
  START_INTERVIEW: 'START_INTERVIEW',
  QUESTION_SPOKEN: 'QUESTION_SPOKEN',
  RESPONSE_RECEIVED: 'RESPONSE_RECEIVED',
  REQUEST_REPEAT: 'REQUEST_REPEAT',
  REQUEST_CLARIFY: 'REQUEST_CLARIFY',
  SILENCE_TIMEOUT: 'SILENCE_TIMEOUT',
  SKIP_QUESTION: 'SKIP_QUESTION',
  CANDIDATE_INTERRUPTED: 'CANDIDATE_INTERRUPTED',
  TRIGGER_FOLLOW_UP: 'TRIGGER_FOLLOW_UP',
  FOLLOW_UP_SPOKEN: 'FOLLOW_UP_SPOKEN',
  NEXT_QUESTION: 'NEXT_QUESTION',
  PAUSE: 'PAUSE',
  RESUME: 'RESUME',
  ABORT: 'ABORT',
  FINISH: 'FINISH',
  RECOVER: 'RECOVER',
});

/**
 * Valid state transitions mapping:
 * current_state -> { event_name -> next_state }
 */
const TRANSITION_TABLE = {
  [InterviewState.IDLE]: {
    [InterviewEvent.START_CHECK]: InterviewState.PRE_CHECK,
  },
  [InterviewState.PRE_CHECK]: {
    [InterviewEvent.CHECK_PASSED]: InterviewState.READY,
    [InterviewEvent.CHECK_FAILED]: InterviewState.ERROR,
    [InterviewEvent.ABORT]: InterviewState.ABORTED,
  },
  [InterviewState.READY]: {
    [InterviewEvent.START_INTERVIEW]: InterviewState.SPEAKING_QUESTION,
    [InterviewEvent.ABORT]: InterviewState.ABORTED,
  },
  [InterviewState.SPEAKING_QUESTION]: {
    [InterviewEvent.QUESTION_SPOKEN]: InterviewState.LISTENING,
    [InterviewEvent.CANDIDATE_INTERRUPTED]: InterviewState.LISTENING,
    [InterviewEvent.SKIP_QUESTION]: InterviewState.PROCESSING_RESPONSE,
    [InterviewEvent.PAUSE]: InterviewState.PAUSED,
    [InterviewEvent.ABORT]: InterviewState.ABORTED,
    [InterviewEvent.CHECK_FAILED]: InterviewState.ERROR,
  },
  [InterviewState.LISTENING]: {
    [InterviewEvent.RESPONSE_RECEIVED]: InterviewState.PROCESSING_RESPONSE,
    [InterviewEvent.REQUEST_REPEAT]: InterviewState.SPEAKING_QUESTION,
    [InterviewEvent.REQUEST_CLARIFY]: InterviewState.SPEAKING_QUESTION,
    [InterviewEvent.SILENCE_TIMEOUT]: InterviewState.PROCESSING_RESPONSE,
    [InterviewEvent.SKIP_QUESTION]: InterviewState.PROCESSING_RESPONSE,
    [InterviewEvent.PAUSE]: InterviewState.PAUSED,
    [InterviewEvent.ABORT]: InterviewState.ABORTED,
    [InterviewEvent.CHECK_FAILED]: InterviewState.ERROR,
  },
  [InterviewState.PROCESSING_RESPONSE]: {
    [InterviewEvent.TRIGGER_FOLLOW_UP]: InterviewState.FOLLOW_UP,
    [InterviewEvent.NEXT_QUESTION]: InterviewState.SPEAKING_QUESTION,
    [InterviewEvent.FINISH]: InterviewState.COMPLETED,
    [InterviewEvent.PAUSE]: InterviewState.PAUSED,
    [InterviewEvent.ABORT]: InterviewState.ABORTED,
    [InterviewEvent.CHECK_FAILED]: InterviewState.ERROR,
  },
  [InterviewState.FOLLOW_UP]: {
    [InterviewEvent.FOLLOW_UP_SPOKEN]: InterviewState.LISTENING,
    [InterviewEvent.CANDIDATE_INTERRUPTED]: InterviewState.LISTENING,
    [InterviewEvent.SKIP_QUESTION]: InterviewState.PROCESSING_RESPONSE,
    [InterviewEvent.PAUSE]: InterviewState.PAUSED,
    [InterviewEvent.ABORT]: InterviewState.ABORTED,
    [InterviewEvent.CHECK_FAILED]: InterviewState.ERROR,
  },
  [InterviewState.PAUSED]: {
    [InterviewEvent.RESUME]: null, // Dynamically resolved to state before pause
    [InterviewEvent.ABORT]: InterviewState.ABORTED,
  },
  [InterviewState.ERROR]: {
    [InterviewEvent.RECOVER]: InterviewState.READY,
    [InterviewEvent.ABORT]: InterviewState.ABORTED,
  },
  [InterviewState.COMPLETED]: {},
  [InterviewState.ABORTED]: {},
};

export class InterviewStateMachine {
  constructor(options = {}) {
    this.state = InterviewState.IDLE;
    this.previousState = null;
    this.context = {
      errorMessage: null,
      repeatCount: 0,
      skipCount: 0,
      interruptionCount: 0,
      pauseTimestamp: null,
      lastAction: null,
      ...options.initialContext,
    };
    this.listeners = new Set();
  }

  /**
   * Current FSM state.
   * @returns {string}
   */
  getState() {
    return this.state;
  }

  /**
   * Context payload.
   * @returns {object}
   */
  getContext() {
    return { ...this.context };
  }

  /**
   * Subscribe to state transition events.
   * @param {function(string, string, object): void} callback
   * @returns {function(): void} Unsubscribe function
   */
  subscribe(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Check if an event can be dispatched from the current state.
   * @param {string} event
   * @returns {boolean}
   */
  can(event) {
    const availableTransitions = TRANSITION_TABLE[this.state];
    return Boolean(availableTransitions && event in availableTransitions);
  }

  /**
   * Dispatch an event to transition the state machine.
   * @param {string} event
   * @param {object} [payload={}]
   * @throws {Error} If transition is invalid
   */
  transition(event, payload = {}) {
    if (!this.can(event)) {
      throw new Error(
        `Invalid state transition: Cannot dispatch event '${event}' from state '${this.state}'.`
      );
    }

    let nextState;

    if (event === InterviewEvent.RESUME) {
      // Resume restores the state prior to pausing (defaults to LISTENING if none)
      nextState = this.previousState || InterviewState.LISTENING;
    } else {
      nextState = TRANSITION_TABLE[this.state][event];
    }

    const prevState = this.state;

    // Track previous state for pause/resume or error recovery
    if (this.state !== InterviewState.PAUSED) {
      this.previousState = this.state;
    }

    // Apply state updates
    this.state = nextState;

    // Update context based on transition
    if (event === InterviewEvent.CHECK_FAILED) {
      this.context.errorMessage = payload.error || 'System or audio check failed';
      this.context.lastAction = 'error';
    } else if (event === InterviewEvent.REQUEST_REPEAT) {
      this.context.repeatCount += 1;
      this.context.lastAction = 'repeat';
    } else if (event === InterviewEvent.SKIP_QUESTION) {
      this.context.skipCount += 1;
      this.context.lastAction = 'skip';
    } else if (event === InterviewEvent.CANDIDATE_INTERRUPTED) {
      this.context.interruptionCount += 1;
      this.context.lastAction = 'interrupted';
    } else if (event === InterviewEvent.PAUSE) {
      this.context.pauseTimestamp = Date.now();
      this.context.lastAction = 'pause';
    } else if (event === InterviewEvent.RESUME) {
      this.context.pauseTimestamp = null;
      this.context.lastAction = 'resume';
    } else if (event === InterviewEvent.RECOVER) {
      this.context.errorMessage = null;
      this.context.lastAction = 'recover';
    }

    // Notify listeners
    for (const listener of this.listeners) {
      try {
        listener(this.state, prevState, this.context);
      } catch (err) {
        console.error('[stateMachine] Error in subscriber listener:', err);
      }
    }

    return this.state;
  }
}
