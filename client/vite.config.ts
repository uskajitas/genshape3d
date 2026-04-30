import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 3110,
    allowedHosts: ['genshape3d.com', 'localhost'],
    proxy: {
      '/api': 'http://localhost:8110',
    },
  },
});
