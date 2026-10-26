import React from 'react';
import Badge from '../components/ui/Badge.jsx';
import { statusVisual } from '../utils/statusVisual.js';

const labels = { demonstrated: 'Demonstrated', partial: 'Partially demonstrated', insufficient: 'Insufficient evidence', not_assessed: 'Not assessed' };

export default function GeminiReport({ analysis, turns = [], candidateName = 'Candidate' }) {
  const modelName = analysis.model || 'Gemini';
  const generatedTime = analysis.generatedAt ? new Date(analysis.generatedAt).toLocaleString() : 'Recently';

  return <section className="report-section" data-testid="gemini-report">
    {/* Section 1: Assessment Overview */}
    <section className="report-analysis" data-testid="report-analysis" aria-labelledby="analysis-title">
      <p className="report-section__eyebrow">Analysis</p>
      <article className="card skills-overview" aria-labelledby="skills-overview-title">
        <h2 id="skills-overview-title">Skills Overview</h2>
        <div className="skills-overview__rows">
          {(analysis.requirements || []).map((requirement) => {
            const label = labels[requirement.status] || requirement.status;
            const { widthPercent, tone } = statusVisual(label);
            return <div className="skills-overview__row" key={requirement.id || requirement.name}>
              <span className="skills-overview__name">{requirement.name}</span>
              <span className="skills-overview__track" aria-hidden="true"><span className={`skills-overview__bar skills-overview__bar--${tone}`} style={{ width: `${widthPercent}%` }} /></span>
              <Badge variant={tone} size="sm">{label}</Badge>
            </div>;
          })}
        </div>
        <p className="skills-overview__caption">This shows which requirements were discussed and how clearly, not a numeric skill score. 'Not assessed' means the topic wasn't covered — not a weakness.</p>
      </article>

      <section className="report-assessment-overview" data-testid="report-assessment-overview" aria-labelledby="analysis-title">
        <h2 id="analysis-title">Assessment Overview</h2>
        <p>{analysis.summary}</p>
      </section>

      {/* Section 2: Requirement Analysis with supporting evidence */}
      <section className="report-requirement-analysis" data-testid="report-requirement-analysis" aria-labelledby="requirements-analysis-title">
        <h2 id="requirements-analysis-title">Requirement Analysis</h2>
        <div className="report-analysis__details">
          {(analysis.requirements || []).map((r) => <article key={r.id || r.name} className="card">
            <h3>{r.name}</h3><p>{labels[r.status] || r.status}</p><p>{r.reasoning}</p>
            {(r.quotes || r.evidence || []).map((q, i) => <blockquote key={i}>{q}</blockquote>)}
            {r.missing && <p>Missing: {r.missing}</p>}{r.downgraded && <p>Evidence downgraded</p>}
            {r.status === 'not_assessed' && <p>Not covered in this interview. Not a negative finding.</p>}
          </article>)}
        </div>
        {analysis.droppedQuotes?.length > 0 && <p>{analysis.droppedQuotes.length} unverifiable quote(s) removed</p>}
      </section>
    </section>

    {/* Section 3: Full Interview Transcript */}
    <section className="report-transcript" data-testid="report-transcript" aria-labelledby="transcript-title">
      <p className="report-section__eyebrow">Transcript</p>
      <h2 id="transcript-title">Full Interview Transcript</h2>
      <p className="report-transcript__sub">Chronological interview record</p>
      {turns.flatMap((turn, index) => [
        turn.text && <p key={`${index}-interviewer`}><strong>Interviewer </strong>{turn.text}</p>,
        turn.answer?.finalText && <p key={`${index}-candidate`}><strong>{candidateName} </strong>{turn.answer.finalText}</p>,
      ])}
      <p>Answers were transcribed by speech recognition and may contain errors. This interview does not verify the identity of the speaker.</p>
      {turns.some((t) => t.answer?.inputMode === 'text') && <p>Typed answers present.</p>}
    </section>

    {/* Section 4: Analysis Status */}
    <section className="report-analysis-status" data-testid="report-analysis-status" aria-labelledby="status-title">
      <p className="report-section__eyebrow">Status</p>
      <h2 id="status-title">Analysis Status</h2>
      <div className="card report-status-card" style={{ padding: 'var(--space-4)', display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
        <Badge variant="success" size="sm">Analysis Complete</Badge>
        <span style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
          Provider: Semantic Analysis ({modelName}) · Generated: {generatedTime}
        </span>
      </div>
    </section>
  </section>;
}
