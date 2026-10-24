import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.jsx';
import { seedIfEmpty } from './data/synthetic.js';
import './index.css';

// Initialize seed data synchronously before any React component mounts
seedIfEmpty();

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
