import React from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import AppShell from './components/layout/AppShell.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Positions from './pages/Positions.jsx';
import JobConfig from './pages/JobConfig.jsx';
import InterviewSession from './pages/InterviewSession.jsx';
import InterviewList from './pages/InterviewList.jsx';
import InterviewReport from './pages/InterviewReport.jsx';

function RedirectJobId() {
  const { id } = useParams();
  return <Navigate to={`/positions/${id}`} replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Candidate-facing focused interview session */}
        <Route path="/interview/:jobId" element={<InterviewSession />} />

        {/* Recruiter portal */}
        <Route path="/" element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="positions" element={<Positions />} />
          <Route path="positions/new" element={<JobConfig />} />
          <Route path="positions/:id" element={<JobConfig />} />
          <Route path="interviews" element={<InterviewList />} />
          <Route path="interviews/:sessionId" element={<InterviewReport />} />

          {/* Backward compatibility redirects */}
          <Route path="jobs" element={<Navigate to="/positions" replace />} />
          <Route path="jobs/new" element={<Navigate to="/positions/new" replace />} />
          <Route path="jobs/:id/edit" element={<RedirectJobId />} />
          <Route path="jobs/:id" element={<RedirectJobId />} />

          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
