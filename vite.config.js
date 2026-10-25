import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApiRequest } from './server/apiHandler.js';

function apiMiddlewarePlugin() {
  return {
    name: 'hirepilot-api-middleware',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        if (req.url?.startsWith('/api/')) {
          const handled = await handleApiRequest(req, res);
          if (handled) return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), apiMiddlewarePlugin()],
  test: {
    environment: 'node',
    globals: true,
  },
});
