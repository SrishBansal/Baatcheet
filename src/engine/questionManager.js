/**
 * Interview Question Manager.
 *
 * Coordinates question sequencing, follow-up allowances, repetition tracking,
 * and context management for the live interview session.
 */

export class QuestionManager {
  /**
   * @param {import('../data/models.js').InterviewQuestion[]} questions
   */
  constructor(questions = []) {
    // Sort questions by order property to ensure deterministic sequence
    this.questions = [...questions].sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
    this.currentIndex = 0;
    this.followUpCounts = new Map(); // questionId -> number of follow-ups asked
    this.skippedQuestionIds = new Set(); // IDs of questions explicitly skipped
    this.activeFollowUp = null; // currently active follow-up question object if any
  }

  /**
   * Get total number of configured questions.
   * @returns {number}
   */
  getTotalCount() {
    return this.questions.length;
  }

  /**
   * Current question 0-based index.
   * @returns {number}
   */
  getCurrentIndex() {
    return this.currentIndex;
  }

  /**
   * Get the currently active base question.
   * @returns {import('../data/models.js').InterviewQuestion | null}
   */
  getCurrentQuestion() {
    if (this.currentIndex >= this.questions.length) {
      return null;
    }
    return this.questions[this.currentIndex];
  }

  /**
   * Check if there are remaining questions after the current one.
   * @returns {boolean}
   */
  hasNextQuestion() {
    return this.currentIndex < this.questions.length - 1;
  }

  /**
   * Move to the next configured question.
   * @returns {import('../data/models.js').InterviewQuestion | null}
   */
  advanceQuestion() {
    if (this.hasNextQuestion()) {
      this.currentIndex += 1;
      this.activeFollowUp = null;
      return this.getCurrentQuestion();
    }
    this.currentIndex = this.questions.length;
    this.activeFollowUp = null;
    return null;
  }

  /**
   * Get the number of follow-ups already asked for the current question.
   * @returns {number}
   */
  getCurrentFollowUpCount() {
    const current = this.getCurrentQuestion();
    if (!current) return 0;
    return this.followUpCounts.get(current.id) || 0;
  }

  /**
   * Determine if an additional follow-up question is permitted by the job configuration.
   * Skipped questions NEVER allow follow-up questions.
   * @returns {boolean}
   */
  canFollowUp() {
    const current = this.getCurrentQuestion();
    if (!current) return false;
    if (this.isQuestionSkipped(current.id)) return false;
    const max = current.maxFollowUps ?? 1;
    const count = this.getCurrentFollowUpCount();
    return count < max;
  }

  /**
   * Explicitly mark the current active question as skipped.
   * Clears any active follow-up questions.
   * @returns {import('../data/models.js').InterviewQuestion | null}
   */
  skipQuestion() {
    const current = this.getCurrentQuestion();
    if (!current) return null;
    this.skippedQuestionIds.add(current.id);
    this.activeFollowUp = null;
    return current;
  }

  /**
   * Check if a specific question was marked as skipped.
   * @param {string} questionId
   * @returns {boolean}
   */
  isQuestionSkipped(questionId) {
    return this.skippedQuestionIds.has(questionId);
  }

  /**
   * Register and activate a follow-up question prompt.
   * @param {string} text - The follow-up question text
   * @returns {{ id: string, text: string, isFollowUp: true, parentQuestionId: string }}
   * @throws {Error} If follow-up limit exceeded
   */
  recordFollowUp(text) {
    if (!this.canFollowUp()) {
      const current = this.getCurrentQuestion();
      throw new Error(
        `Cannot ask follow-up: Maximum follow-ups (${current?.maxFollowUps ?? 1}) reached for question '${current?.id}'.`
      );
    }

    const current = this.getCurrentQuestion();
    const currentCount = this.getCurrentFollowUpCount();
    this.followUpCounts.set(current.id, currentCount + 1);

    const followUpObj = {
      id: `${current.id}-followup-${currentCount + 1}`,
      text: text.trim(),
      isFollowUp: true,
      parentQuestionId: current.id,
      category: current.category,
      relatedSkills: current.relatedSkills || [],
    };

    this.activeFollowUp = followUpObj;
    return followUpObj;
  }

  /**
   * Get the currently active prompt to be spoken or displayed (base question or follow-up).
   * @returns {{ text: string, isFollowUp: boolean, questionId: string } | null}
   */
  getActivePrompt() {
    if (this.activeFollowUp) {
      return {
        text: this.activeFollowUp.text,
        isFollowUp: true,
        questionId: this.activeFollowUp.id,
      };
    }
    const current = this.getCurrentQuestion();
    if (!current) return null;
    return {
      text: current.text,
      isFollowUp: false,
      questionId: current.id,
    };
  }

  /**
   * Get a snapshot summary of interview progress.
   * @returns {{ total: number, current: number, isComplete: boolean }}
   */
  getProgress() {
    const total = this.questions.length;
    const current = Math.min(this.currentIndex + 1, total);
    return {
      total,
      current,
      isComplete: this.currentIndex >= total,
    };
  }
}
