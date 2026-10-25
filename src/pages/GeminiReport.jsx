import React from 'react';

const labels = { demonstrated: 'Demonstrated', partial: 'Partially demonstrated', insufficient: 'Insufficient evidence', not_assessed: 'Not assessed' };

export default function GeminiReport({ analysis, turns = [], candidateName = 'Candidate' }) {
  return <section className="report-section" data-testid="gemini-report">
    <h2>Assessment</h2><p>{analysis.summary}</p>
    {(analysis.requirements || []).map((r) => <article key={r.id || r.name} className="card">
      <h3>{r.name}</h3><p>{labels[r.status] || r.status}</p><p>{r.reasoning}</p>
      {(r.quotes || []).map((q, i) => <blockquote key={i}>{q}</blockquote>)}
      {r.missing && <p>Missing: {r.missing}</p>}{r.downgraded && <p>Evidence downgraded</p>}
      {r.status === 'not_assessed' && <p>Not covered in this interview. Not a negative finding.</p>}
    </article>)}
    {analysis.droppedQuotes?.length > 0 && <p>{analysis.droppedQuotes.length} unverifiable quote(s) removed</p>}
    <h3>Transcript</h3>{turns.flatMap((turn, index) => [
      turn.text && <p key={`${index}-interviewer`}><strong>Interviewer </strong>{turn.text}</p>,
      turn.answer?.finalText && <p key={`${index}-candidate`}><strong>{candidateName} </strong>{turn.answer.finalText}</p>,
    ])}
    <p>Answers were transcribed by speech recognition and may contain errors. This interview does not verify the identity of the speaker.</p>
    {turns.some((t) => t.answer?.inputMode === 'text') && <p>Typed answers present.</p>}
  </section>;
}
