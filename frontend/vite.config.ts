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
    build: {
      rollupOptions: {
        output: {
          // The Radix primitives behind shadcn/ui are a large, near-static block.
          // Splitting them off keeps them cached across deploys instead of being
          // re-downloaded whenever application code changes. React and ReactDOM
          // stay in one chunk together: they must initialise as a unit.
          manualChunks: (id) => {
            if (!id.includes('node_modules')) return undefined;
            if (id.includes('@radix-ui') || id.includes('cmdk') || id.includes('sonner')) {
              return 'vendor-ui';
            }
            if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) {
              return 'vendor-forms';
            }
            return 'vendor';
          },
        },
      },
    },
  };
});
