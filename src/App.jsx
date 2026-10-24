import React, { useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import AppShell from './components/layout/AppShell.jsx';
import Dashboard from './pages/Dashboard.jsx';
import JobConfig from './pages/JobConfig.jsx';
import { seedIfEmpty } from './data/synthetic.js';

export default function App() {
  useEffect(() => {
    seedIfEmpty();
  }, []);

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<AppShell />}>
          <Route index element={<Dashboard />} />
          <Route path="jobs" element={<Dashboard />} />
          <Route path="jobs/new" element={<JobConfig />} />
          <Route path="jobs/:id/edit" element={<JobConfig />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
