import React, { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { store } from '../data/store.js';
import Button from '../components/ui/Button.jsx';
import PageHeader from '../components/ui/PageHeader.jsx';
import Banner from '../components/ui/Banner.jsx';
import { health, makeReport } from '../data/engineApi.js';
import { toEngineJob } from '../engine/engineJob.js';
import GeminiReport from './GeminiReport.jsx';
import { engineErrorMessage } from '../utils/engineError.js';
import './InterviewReport.css';

export const transcriptFor = (turns) => turns.flatMap((turn) => {
  const interviewer = turn.text ? [{ role: 'interviewer', text: turn.text, action: turn.action }] : [];
  return turn.answer?.finalText ? [...interviewer, { role: 'candidate', text: turn.answer.finalText }] : interviewer;
});

export default function InterviewReport() {
  const { sessionId } = useParams();
  const navigate = useNavigate();
  const started = useRef(false);
  const [session, setSession] = useState(() => store.sessions.getById(sessionId));
  const [configured, setConfigured] = useState(null);
  const [running, setRunning] = useState(false);
  useEffect(() => { setSession(store.sessions.getById(sessionId)); started.current = false; }, [sessionId]);
  const save = (next) => { store.sessions.save(next); setSession(next); };
  const run = async () => {
    if (!session || running) return;
    setRunning(true);
    try {
      const result = await makeReport({ job: toEngineJob(session.jobSnapshot), transcript: transcriptFor(session.turns || []) });
      save({ ...session, analysis: { status: 'complete', providerId: 'gemini', providerKind: 'semantic', generatedAt: new Date().toISOString(), ...result } });
    } catch (err) {
      save({ ...session, analysis: { status: 'failed', providerId: 'gemini', providerKind: 'semantic', error: err.message || 'server_error' } });
    } finally { setRunning(false); }
  };
  useEffect(() => {
    if (!session || started.current) return;
    const answers = (session.turns || []).filter((turn) => turn.answer?.finalText?.trim());
    const requirements = toEngineJob(session.jobSnapshot).requirements || [];
    const analysis = session.analysis || {};
    if (!answers.length || !requirements.length || (analysis.providerId === 'gemini' && ['complete', 'failed'].includes(analysis.status))) return;
    started.current = true;
    health().then((result) => { setConfigured(result.geminiConfigured); if (result.geminiConfigured) run(); }).catch(() => setConfigured(false));
  }, [session]);
  if (!session) return <div className="report-error-state"><p>Report Not Available</p><Button onClick={() => navigate('/interviews')}>Back to Completed Interviews</Button></div>;
  const turns = session.turns || [];
  const hasAnswers = turns.some((turn) => turn.answer?.finalText?.trim());
  const requirements = toEngineJob(session.jobSnapshot).requirements || [];
  const analysis = session.analysis || {};
  if (!hasAnswers) return <div className="interview-report-page"><p>No answers were recorded; nothing to analyze.</p></div>;
  if (!requirements.length) return <div className="interview-report-page"><p>This interview has no requirements to assess.</p></div>;
  if (analysis.providerId === 'gemini' && analysis.status === 'complete') return <div className="interview-report-page"><PageHeader title={session.candidate?.name || 'Unnamed candidate'} actions={<Button size="sm" onClick={run} disabled={running}>Re-run analysis</Button>} /><GeminiReport analysis={analysis} turns={turns} candidateName={session.candidate?.name || 'Candidate'} /></div>;
  if (analysis.providerId === 'gemini' && analysis.status === 'failed') return <div className="interview-report-page"><Banner tone="error" actions={<Button onClick={run} disabled={running}>{running ? 'Retrying analysis…' : 'Retry analysis'}</Button>}>{engineErrorMessage(analysis.error)} <small>{analysis.error}</small></Banner></div>;
  if (configured === false) return <div className="interview-report-page"><p>AI is not configured; no evaluation performed.</p></div>;
  return <div className="interview-report-page"><p>Analyzing interview…</p></div>;
}
