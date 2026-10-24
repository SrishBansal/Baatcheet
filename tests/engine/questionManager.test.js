import { describe, it, expect } from 'vitest';
import { QuestionManager } from '../../src/engine/questionManager.js';

describe('QuestionManager', () => {
  const sampleQuestions = [
    { id: 'q2', text: 'Second Question', order: 1, maxFollowUps: 2 },
    { id: 'q1', text: 'First Question', order: 0, maxFollowUps: 1 },
    { id: 'q3', text: 'Third Question', order: 2, maxFollowUps: 0 },
  ];

  it('sorts questions deterministically by order', () => {
    const qm = new QuestionManager(sampleQuestions);
    expect(qm.getCurrentQuestion().id).toBe('q1');
    expect(qm.getTotalCount()).toBe(3);
  });

  it('advances through questions sequentially', () => {
    const qm = new QuestionManager(sampleQuestions);

    expect(qm.hasNextQuestion()).toBe(true);
    expect(qm.getCurrentQuestion().id).toBe('q1');

    const next1 = qm.advanceQuestion();
    expect(next1.id).toBe('q2');
    expect(qm.hasNextQuestion()).toBe(true);

    const next2 = qm.advanceQuestion();
    expect(next2.id).toBe('q3');
    expect(qm.hasNextQuestion()).toBe(false);

    const finish = qm.advanceQuestion();
    expect(finish).toBeNull();
    expect(qm.getProgress().isComplete).toBe(true);
  });

  it('enforces maxFollowUps bound', () => {
    const qm = new QuestionManager(sampleQuestions); // q1 has maxFollowUps: 1

    expect(qm.canFollowUp()).toBe(true);
    const fu1 = qm.recordFollowUp('Can you elaborate on that?');
    expect(fu1.isFollowUp).toBe(true);
    expect(fu1.parentQuestionId).toBe('q1');

    // Limit reached
    expect(qm.canFollowUp()).toBe(false);
    expect(() => {
      qm.recordFollowUp('Another follow-up');
    }).toThrow(/Maximum follow-ups \(1\) reached/);
  });

  it('resets follow-up context when advancing to the next question', () => {
    const qm = new QuestionManager(sampleQuestions);
    qm.recordFollowUp('Follow-up on q1');
    expect(qm.getActivePrompt().isFollowUp).toBe(true);

    qm.advanceQuestion();
    expect(qm.getCurrentQuestion().id).toBe('q2');
    expect(qm.getCurrentFollowUpCount()).toBe(0);
    expect(qm.getActivePrompt().isFollowUp).toBe(false);
    expect(qm.getActivePrompt().text).toBe('Second Question');
  });

  describe('skipQuestion', () => {
    it('marks current question as skipped and disallows follow-ups', () => {
      const qm = new QuestionManager(sampleQuestions);
      expect(qm.canFollowUp()).toBe(true);

      const skipped = qm.skipQuestion();
      expect(skipped.id).toBe('q1');
      expect(qm.isQuestionSkipped('q1')).toBe(true);
      // Follow-up must be strictly disallowed for skipped question
      expect(qm.canFollowUp()).toBe(false);
      expect(() => qm.recordFollowUp('Not allowed')).toThrow(/Cannot ask follow-up/);
    });

    it('clears active follow-up and advances cleanly after skip', () => {
      const qm = new QuestionManager(sampleQuestions);
      qm.recordFollowUp('First follow-up');
      expect(qm.getActivePrompt().isFollowUp).toBe(true);

      // Skip current question while follow-up is active
      qm.skipQuestion();
      expect(qm.getActivePrompt().isFollowUp).toBe(false);

      // Advance to next question in sequence
      const next = qm.advanceQuestion();
      expect(next.id).toBe('q2');
      expect(qm.isQuestionSkipped('q2')).toBe(false);
      expect(qm.canFollowUp()).toBe(true);
    });
  });
});
