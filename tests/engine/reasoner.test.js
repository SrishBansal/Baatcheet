import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  validateReasoningDecision,
  DeterministicReasoner,
  GeminiReasoner,
} from '../../src/analysis/reasoner.js';
import { InterviewController } from '../../src/engine/interviewController.js';
import { InterviewState } from '../../src/engine/stateMachine.js';

describe('src/analysis/reasoner.js', () => {
  describe('validateReasoningDecision', () => {
    it('validates a correct ADVANCE decision', () => {
      const decision = { action: 'ADVANCE', reasoning: 'Candidate was thorough.' };
      expect(validateReasoningDecision(decision)).toEqual({ valid: true });
    });

    it('rejects invalid action', () => {
      const decision = { action: 'JUMP_AROUND', reasoning: 'None' };
      const res = validateReasoningDecision(decision);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('Invalid action');
    });

    it('validates a valid ASK_FOLLOW_UP decision with token overlap and short ack', () => {
      const decision = {
        action: 'ASK_FOLLOW_UP',
        followUpQuestion: 'How does React fiber manage the priority queue?',
        acknowledgement: 'Got it, thank you.',
        reasoning: 'Need deeper architectural detail.',
      };
      const res = validateReasoningDecision(decision, {
        currentQuestion: 'Explain React concurrency.',
        candidateAnswer: 'React uses fiber to schedule tasks.',
      });
      expect(res.valid).toBe(true);
    });

    it('rejects followUpQuestion with more than 1 question mark', () => {
      const decision = {
        action: 'ASK_FOLLOW_UP',
        followUpQuestion: 'What is fiber? How does it work?',
        reasoning: 'Two questions.',
      };
      const res = validateReasoningDecision(decision, {
        currentQuestion: 'Explain React.',
        candidateAnswer: 'I use React.',
      });
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('max 1 allowed');
    });

    it('rejects followUpQuestion exceeding 220 chars', () => {
      const decision = {
        action: 'ASK_FOLLOW_UP',
        followUpQuestion: 'A'.repeat(221) + '?',
        reasoning: 'Too long.',
      };
      const res = validateReasoningDecision(decision);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('outside 1-220 chars');
    });

    it('rejects followUpQuestion lacking token overlap or elaboration keyword', () => {
      const decision = {
        action: 'ASK_FOLLOW_UP',
        followUpQuestion: 'Tell me about Kubernetes ingress controllers and pod security policies?',
        reasoning: 'Unrelated topic.',
      };
      const res = validateReasoningDecision(decision, {
        currentQuestion: 'Explain CSS flexbox.',
        candidateAnswer: 'Flexbox arranges items along rows and columns.',
      });
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('lacks token overlap');
    });

    it('rejects acknowledgement exceeding 10 words', () => {
      const decision = {
        action: 'ADVANCE',
        acknowledgement: 'That was an extremely fascinating and insightful answer that you provided just now thank you.',
        reasoning: 'Too wordy.',
      };
      const res = validateReasoningDecision(decision);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('exceeds 10 words');
    });

    it('rejects non-neutral acknowledgement', () => {
      const decision = {
        action: 'ADVANCE',
        acknowledgement: 'You did an amazing job!',
        reasoning: 'Biased praise.',
      };
      const res = validateReasoningDecision(decision);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('non-neutral');
    });
  });

  describe('DeterministicReasoner', () => {
    it('requests follow-up once when answer has fewer than 12 words', () => {
      const reasoner = new DeterministicReasoner();
      const decision = reasoner.reason({
        candidateAnswer: 'I know React.',
        followUpCount: 0,
      });
      expect(decision.action).toBe('ASK_FOLLOW_UP');
      expect(decision.followUpQuestion).toContain('elaborate');
      expect(decision.providerKind).toBe('deterministic');
    });

    it('advances when answer has 12 or more words', () => {
      const reasoner = new DeterministicReasoner();
      const decision = reasoner.reason({
        candidateAnswer: 'I have developed multiple enterprise single-page applications using React 18 with hooks and context.',
        followUpCount: 0,
      });
      expect(decision.action).toBe('ADVANCE');
      expect(decision.followUpQuestion).toBeNull();
    });

    it('advances on short answer if followUpCount is already 1', () => {
      const reasoner = new DeterministicReasoner();
      const decision = reasoner.reason({
        candidateAnswer: 'Yes.',
        followUpCount: 1,
      });
      expect(decision.action).toBe('ADVANCE');
    });
  });

  describe('GeminiReasoner', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('enforces follow-up cap before calling network', async () => {
      const fetchSpy = vi.fn();
      vi.stubGlobal('fetch', fetchSpy);

      const reasoner = new GeminiReasoner();
      const decision = await reasoner.reason({
        followUpCount: 1,
        candidateAnswer: 'short',
      });
      expect(decision.action).toBe('ADVANCE');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('calls /api/reason and returns valid parsed decision', async () => {
      const mockResponse = {
        ok: true,
        json: async () => ({
          ok: true,
          data: {
            action: 'ASK_FOLLOW_UP',
            followUpQuestion: 'How does React fiber handle priority scheduling?',
            acknowledgement: 'Got it.',
            reasoning: 'Need more technical depth.',
          },
        }),
      };
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));

      const reasoner = new GeminiReasoner();
      const decision = await reasoner.reason({
        currentQuestion: 'Explain React concurrency.',
        candidateAnswer: 'React fiber manages rendering work in chunks.',
        followUpCount: 0,
      });

      expect(decision.action).toBe('ASK_FOLLOW_UP');
      expect(decision.followUpQuestion).toContain('fiber');
      expect(decision.providerKind).toBe('gemini');
    });

    it('falls back to DeterministicReasoner when fetch fails', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('Network failure')));

      const reasoner = new GeminiReasoner();
      const decision = await reasoner.reason({
        currentQuestion: 'Explain React.',
        candidateAnswer: 'Too short.',
        followUpCount: 0,
      });

      expect(decision.action).toBe('ASK_FOLLOW_UP');
      expect(decision.providerKind).toBe('deterministic');
    });
  });

  describe('InterviewController with adaptive reasoner', () => {
    it('triggers follow-up question and updates session reasoning', () => {
      const job = {
        id: 'job-1',
        title: 'Engineer',
        questions: [
          { id: 'q1', text: 'Explain microservices.', allowFollowUp: true, maxFollowUps: 1 },
          { id: 'q2', text: 'Explain databases.', allowFollowUp: false, maxFollowUps: 0 },
        ],
      };

      const mockReasoner = {
        providerKind: 'deterministic',
        providerId: 'test-reasoner',
        reason: vi.fn().mockReturnValue({
          action: 'ASK_FOLLOW_UP',
          followUpQuestion: 'Could you explain service mesh in microservices?',
          acknowledgement: 'Understood.',
          reasoning: 'Need service discovery detail.',
          providerId: 'test-reasoner',
          providerKind: 'deterministic',
        }),
      };

      const controller = new InterviewController({
        job,
        reasoner: mockReasoner,
        speechRecognizer: { isSupported: () => false, destroy: () => {} },
        speechSynthesizer: { isSupported: () => false, destroy: () => {} },
      });

      controller.grantConsent();
      controller.startInterview();

      // Synthesizer unsupported -> automatically transitioned to LISTENING
      expect(controller.getState()).toBe(InterviewState.LISTENING);

      // Submit short answer
      controller.submitAnswer('Microservices are separate services.');

      // Follow-up was triggered!
      expect(controller.getState()).toBe(InterviewState.LISTENING);
      const prompt = controller.getActivePrompt();
      expect(prompt.isFollowUp).toBe(true);
      expect(prompt.text).toContain('service mesh');
      expect(controller.getSessionRecord().reasoning.providerId).toBe('test-reasoner');
    });
  });
});
