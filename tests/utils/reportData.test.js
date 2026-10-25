import { describe, it, expect } from 'vitest';
import { computeReportData, computeSessionDuration } from '../../src/utils/reportData.js';

describe('reportData Utility (Checkpoint 5)', () => {
  describe('computeSessionDuration()', () => {
    it('formats minutes and seconds accurately for valid timestamps', () => {
      const start = '2026-10-25T10:00:00.000Z';
      const end = '2026-10-25T10:14:35.000Z';
      expect(computeSessionDuration(start, end)).toBe('14m 35s');
    });

    it('returns N/A when startedAt or endedAt is missing', () => {
      expect(computeSessionDuration(null, '2026-10-25T10:00:00.000Z')).toBe('N/A');
      expect(computeSessionDuration('2026-10-25T10:00:00.000Z', undefined)).toBe('N/A');
      expect(computeSessionDuration('', '')).toBe('N/A');
    });

    it('returns N/A when timestamps are invalid or end is before start', () => {
      expect(computeSessionDuration('not-a-date', '2026-10-25T10:00:00.000Z')).toBe('N/A');
      expect(computeSessionDuration('2026-10-25T10:05:00.000Z', '2026-10-25T10:02:00.000Z')).toBe('N/A');
      expect(computeSessionDuration('2026-10-25T10:00:00.000Z', '2026-10-25T10:00:00.000Z')).toBe('N/A');
    });
  });

  describe('computeReportData() validation & edge cases', () => {
    it('throws when session is null, undefined, or not an object', () => {
      expect(() => computeReportData(null)).toThrow('[computeReportData]');
      expect(() => computeReportData(undefined)).toThrow('[computeReportData]');
      expect(() => computeReportData('not-an-object')).toThrow('[computeReportData]');
      expect(() => computeReportData(42)).toThrow('[computeReportData]');
    });

    it('handles minimal/empty session safely without throwing', () => {
      const minimalSession = {
        id: 's-empty',
        jobId: 'j-empty',
      };
      const result = computeReportData(minimalSession);

      expect(result.sessionId).toBe('s-empty');
      expect(result.jobId).toBe('j-empty');
      expect(result.jobTitle).toBe('Untitled Role');
      expect(result.sessionStatus).toBe('unknown');
      expect(result.durationText).toBe('N/A');
      expect(result.questionsAskedCount).toBe(0);
      expect(result.questionsAnsweredCount).toBe(0);
      expect(result.questionsSkippedCount).toBe(0);
      expect(result.requirementsTotal).toBe(0);
      expect(result.requirementsCoveredCount).toBe(0);
      expect(result.requirementReports).toEqual([]);
      expect(result.transcriptTurns).toEqual([]);
      expect(result.notAssessedRequirements).toEqual([]);
      expect(result.unmappedTurns).toEqual([]);
      expect(result.analysisStatus).toBe('not_requested');
      expect(result.analysisProviderKind).toBe('unknown');
    });
  });

  describe('computeReportData() factual derivation and requirements mapping', () => {
    const mockSession = {
      id: 'session-full-1',
      jobId: 'job-101',
      schemaVersion: 1,
      status: 'completed',
      startedAt: '2026-10-25T14:00:00.000Z',
      endedAt: '2026-10-25T14:12:45.000Z',
      jobSnapshot: {
        title: 'Senior Frontend Architect',
        requirements: [
          { id: 'req-arch', name: 'Frontend Architecture', priority: 'required' },
          { id: 'req-perf', name: 'Web Performance', priority: 'preferred' },
          { id: 'req-test', name: 'Testing Strategy', priority: 'required' },
        ],
        questions: [
          { id: 'q1', text: 'How do you design state boundaries?', requirementIds: ['req-arch'] },
          { id: 'q2', text: 'How do you profile LCP and INP?', requirementIds: ['req-perf'] },
          { id: 'q3', text: 'Tell me about yourself.', requirementIds: [] }, // unmapped question
        ],
      },
      turns: [
        {
          id: 'turn-1',
          questionId: 'q1',
          kind: 'question',
          text: 'How do you design state boundaries?',
          askedAt: '2026-10-25T14:01:00.000Z',
          skipped: false,
          answer: {
            finalText: 'I separate local UI state from domain entity stores using unidirectional data flow.',
            answeredAt: '2026-10-25T14:03:00.000Z',
            inputMode: 'voice',
          },
        },
        {
          id: 'turn-2',
          questionId: 'q2',
          kind: 'question',
          text: 'How do you profile LCP and INP?',
          askedAt: '2026-10-25T14:04:00.000Z',
          skipped: true, // skipped by candidate
        },
        {
          id: 'turn-3',
          questionId: 'q3',
          kind: 'question',
          text: 'Tell me about yourself.',
          askedAt: '2026-10-25T14:06:00.000Z',
          skipped: false,
          answer: {
            finalText: 'I have led design systems and performance work for 7 years.',
            answeredAt: '2026-10-25T14:08:00.000Z',
            inputMode: 'text',
          },
        },
      ],
      analysis: {
        status: 'complete',
        providerId: 'deterministic-transcript-v1',
        providerKind: 'deterministic',
        rejectedEvidenceCount: 0,
        requirements: [
          {
            requirementId: 'req-arch',
            status: 'Awaiting analysis',
            quotes: ['I separate local UI state from domain entity stores using unidirectional data flow.'],
            notes: 'Verbatim answer captured via voice input.',
          },
          {
            requirementId: 'req-perf',
            status: 'Not assessed',
            quotes: [],
          },
          {
            requirementId: 'req-test',
            status: 'Not assessed',
            quotes: [],
          },
        ],
      },
    };

    it('computes top-level session header and metrics accurately', () => {
      const data = computeReportData(mockSession);

      expect(data.sessionId).toBe('session-full-1');
      expect(data.jobId).toBe('job-101');
      expect(data.jobTitle).toBe('Senior Frontend Architect');
      expect(data.sessionStatus).toBe('completed');
      expect(data.durationText).toBe('12m 45s');

      // Turn counts
      expect(data.questionsAskedCount).toBe(3);
      expect(data.questionsAnsweredCount).toBe(2);
      expect(data.questionsSkippedCount).toBe(1);

      // Requirements summary
      expect(data.requirementsTotal).toBe(3);
      expect(data.requirementsCoveredCount).toBe(1);
    });

    it('builds requirement reports with exact verbatim quotes and flags not-assessed', () => {
      const data = computeReportData(mockSession);

      expect(data.requirementReports).toHaveLength(3);

      const archReport = data.requirementReports.find((r) => r.id === 'req-arch');
      expect(archReport).toBeDefined();
      expect(archReport.name).toBe('Frontend Architecture');
      expect(archReport.status).toBe('Awaiting analysis');
      expect(archReport.isAssessed).toBe(true);
      expect(archReport.quotes).toEqual([
        'I separate local UI state from domain entity stores using unidirectional data flow.',
      ]);
      expect(archReport.notes).toBe('Verbatim answer captured via voice input.');

      // notAssessedRequirements: coverage gaps only, never candidate deficiencies
      expect(data.notAssessedRequirements).toHaveLength(2);
      expect(data.notAssessedRequirements.map((r) => r.id)).toEqual(['req-perf', 'req-test']);
      expect(data.notAssessedRequirements.every((r) => !r.isAssessed)).toBe(true);
    });

    it('builds transcript turns with 1-based indexing, answers, and mapping state', () => {
      const data = computeReportData(mockSession);

      expect(data.transcriptTurns).toHaveLength(3);

      // Turn 1: answered via voice, mapped to req-arch
      const turn1 = data.transcriptTurns[0];
      expect(turn1.index).toBe(1);
      expect(turn1.questionId).toBe('q1');
      expect(turn1.hasAnswer).toBe(true);
      expect(turn1.isSkipped).toBe(false);
      expect(turn1.inputMode).toBe('voice');
      expect(turn1.isMapped).toBe(true);

      // Turn 2: skipped
      const turn2 = data.transcriptTurns[1];
      expect(turn2.index).toBe(2);
      expect(turn2.questionId).toBe('q2');
      expect(turn2.hasAnswer).toBe(false);
      expect(turn2.isSkipped).toBe(true);
      expect(turn2.isMapped).toBe(true);

      // Turn 3: answered via text, unmapped question
      const turn3 = data.transcriptTurns[2];
      expect(turn3.index).toBe(3);
      expect(turn3.questionId).toBe('q3');
      expect(turn3.hasAnswer).toBe(true);
      expect(turn3.isSkipped).toBe(false);
      expect(turn3.inputMode).toBe('text');
      expect(turn3.isMapped).toBe(false);

      // unmappedTurns verification
      expect(data.unmappedTurns).toHaveLength(1);
      expect(data.unmappedTurns[0].id).toBe('turn-3');
    });

    it('surfaces analysis metadata and structured errors if analysis failed', () => {
      const failedSession = {
        ...mockSession,
        analysis: {
          status: 'failed',
          error: 'Remote timeout while processing semantics.',
          providerId: 'semantic-v1',
          providerKind: 'semantic',
          rejectedEvidenceCount: 2,
        },
      };

      const data = computeReportData(failedSession);
      expect(data.analysisStatus).toBe('failed');
      expect(data.analysisError).toBe('Remote timeout while processing semantics.');
      expect(data.analysisProviderKind).toBe('semantic');
      expect(data.analysisProviderId).toBe('semantic-v1');
      expect(data.rejectedEvidenceCount).toBe(2);
    });
  });
});
