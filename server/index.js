/**
 * Minimal Standalone Server using Node built-in http.
 */

import http from 'node:http';
import { handleApiRequest } from './apiHandler.js';

const PORT = process.env.PORT || 3001;

const server = http.createServer(async (req, res) => {
  // CORS headers for development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  const handled = await handleApiRequest(req, res);
  if (!handled) {
    res.statusCode = 404;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify({ error: 'Endpoint not found.' }));
  }
});

if (process.env.NODE_ENV !== 'test') {
  server.listen(PORT, () => {
    console.log(`[HirePilot Server] Listening on http://localhost:${PORT}`);
  });
}

export { server };
