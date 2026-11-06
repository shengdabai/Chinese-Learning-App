import path from 'path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { GoogleGenAI } from '@google/genai';
import { authorizeLocalDev, createGeminiHandler } from './server/geminiApi';

export default defineConfig(() => {
    return {
      envDir: false,
      server: {
        port: 3000,
        // The local Gemini API checks Host/Origin against this port; fail fast instead of moving to another one.
        strictPort: true,
        host: 'localhost',
      },
      plugins: [react(), {
        name: 'local-gemini-api',
        configureServer(server) {
          const handler = createGeminiHandler({ authorize: authorizeLocalDev, getClient: () => {
            const apiKey = process.env.GEMINI_API_KEY;
            if (!apiKey) throw new Error('Server key not configured');
            return new GoogleGenAI({ apiKey, httpOptions: { apiVersion: 'v1alpha' } });
          } });
          server.middlewares.use((req, res, next) => {
            if (req.url?.startsWith('/api/gemini/')) void handler(req, res);
            else next();
          });
        },
      }],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
    };
});
