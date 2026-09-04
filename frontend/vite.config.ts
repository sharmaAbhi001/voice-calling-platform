import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

const here = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig(({ mode }) => {
  // The repo keeps one .env at the root; Vite only exposes VITE_* keys.
  const env = loadEnv(mode, path.resolve(here, '..'), 'VITE_');
  return {
    plugins: [react()],
    envDir: path.resolve(here, '..'),
    resolve: { alias: { '@': path.resolve(here, 'src') } },
    server: { port: 5173, strictPort: true },
    define: {
      __API_BASE_URL__: JSON.stringify(env.VITE_API_BASE_URL ?? 'http://localhost:4000'),
    },
  };
});
