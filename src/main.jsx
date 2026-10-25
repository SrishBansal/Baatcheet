import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { seedIfEmpty } from './data/synthetic.js';
import './index.css';
import './styles/tokens.css';
import { sessionStore, SessionStatus } from './data/sessions.js';

const activeSessionIds = typeof sessionStorage === 'undefined' ? [] : Object.keys(sessionStorage)
  .filter((key) => key.startsWith('hirepilot:active_session:')).map((key) => sessionStorage.getItem(key));
for (const session of sessionStore.getAll()) {
  const latestTurn = (session.turns || []).map((turn) => turn.answer?.answeredAt || turn.askedAt).filter(Boolean).sort().pop();
  const lastActivity = latestTurn || session.startedAt;
  if (session.status === SessionStatus.IN_PROGRESS && !activeSessionIds.includes(session.id) && Date.now() - new Date(lastActivity).getTime() > 15 * 60 * 1000) {
    sessionStore.save({ ...session, status: SessionStatus.ABORTED, abortReason: 'abandoned', endedAt: lastActivity });
  }
}

// Initialize seed data synchronously before any React component mounts
seedIfEmpty();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
