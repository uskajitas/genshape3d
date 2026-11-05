import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react-swc';
import { fileURLToPath } from 'node:url';

// Login is uwidget's, never a copy (uwidget/docs/LOGIN.md).
const login = fileURLToPath(new URL('../../uwidget/client/src/login', import.meta.url));

export default defineConfig(({ mode }) => {
  // API_PROXY_TARGET (env var or .env.*.local) lets a dev client point at a
  // remote API (e.g. the prod server) instead of a local one — useful when
  // testing UI against real data.
  const env = loadEnv(mode, process.cwd(), '');
  const apiTarget = env.API_PROXY_TARGET || 'http://localhost:8110';
  const proxy = { '/api': { target: apiTarget, changeOrigin: true } };

  return {
    plugins: [react()],
    resolve: {
      alias: { '@login': login },
      dedupe: ['react', 'react-dom', 'react-router-dom', 'styled-components', 'firebase'],
    },
    server: {
      fs: { allow: ['.', login] },
      port: 3110,
      allowedHosts: ['genshape3d.com', 'localhost'],
      proxy,
    },
    preview: {
      port: 3110,
      allowedHosts: ['genshape3d.com', 'localhost'],
      proxy,
    },
  };
});
