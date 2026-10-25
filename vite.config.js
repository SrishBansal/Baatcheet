import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { handleApiRequest } from './server/apiHandler.js';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [
      react(),
      {
        name: 'hirepilot-api-middleware',
        configureServer(server) {
          server.middlewares.use(async (req, res, next) => {
            if (req.url?.startsWith('/api/')) {
              const handled = await handleApiRequest(req, res, {
                apiKey: env.GEMINI_API_KEY,
                model: env.GEMINI_MODEL,
              });
              if (handled) return;
            }
            next();
          });
        },
      },
    ],
    test: {
      environment: 'node',
      globals: true,
    },
  };
});
