import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApi } from './server/baatcheet-engine.mjs';

const baatcheetApi = () => ({
  name: 'baatcheet-api',
  configureServer(s) {
    s.middlewares.use(async (req, res, next) => {
      if (req.url && req.url.startsWith('/api/') && await handleApi(req, res)) return;
      next();
    });
  },
});

export default defineConfig(() => {
  return {
    plugins: [
      baatcheetApi(),
      react(),
    ],
    test: {
      environment: 'node',
      globals: true,
    },
  };
});
