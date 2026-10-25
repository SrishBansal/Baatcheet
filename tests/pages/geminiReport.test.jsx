import { describe, it, expect } from 'vitest';
import React from 'react';
import { renderToString } from 'react-dom/server';
import GeminiReport from '../../src/pages/GeminiReport.jsx';

describe('GeminiReport', () => {
  it('renders every assessment status and the mandatory limitations', () => {
    const html = renderToString(<GeminiReport analysis={{ summary: 'Summary', droppedQuotes: ['x'], requirements: [
      { name: 'A', status: 'demonstrated', reasoning: 'r', quotes: ['quote'] },
      { name: 'B', status: 'partial', reasoning: 'r' },
      { name: 'C', status: 'insufficient', reasoning: 'r', missing: 'detail' },
      { name: 'D', status: 'not_assessed', reasoning: 'r' },
    ] }} turns={[{ role: 'candidate', answer: { finalText: 'answer', inputMode: 'text' } }]} />);
    expect(html).toContain('Demonstrated');
    expect(html).toContain('Partially demonstrated');
    expect(html).toContain('Insufficient evidence');
    expect(html).toContain('Not assessed');
    expect(html).toContain('Not covered in this interview. Not a negative finding.');
    expect(html).toMatch(/1<!-- --> unverifiable quote\(s\) removed/);
    expect(html).toContain('Answers were transcribed by speech recognition and may contain errors.');
    expect(html).toContain('Typed answers present.');
  });
});
