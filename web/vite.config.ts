import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const api = process.env.VITE_API_PROXY ?? 'http://localhost:3002';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: { port: 5175, proxy: { '/api': { target: api, changeOrigin: true } } },
  preview: { port: 5175, proxy: { '/api': { target: api, changeOrigin: true } } },
});
