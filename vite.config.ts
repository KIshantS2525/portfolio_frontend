import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { fileURLToPath, URL } from 'node:url';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  server: {
    port: 3000,
    // Chat calls go to the FastAPI backend. Proxying in dev keeps the frontend
    // calling a same-origin /api path in both dev and production.
    proxy: {
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
  build: {
    target: 'es2020',
    rollupOptions: {
      output: {
        // Keep the constellation and its layout solver out of the entry chunk.
        manualChunks(id) {
          if (id.includes('src/components/graph/Constellation')) return 'constellation';
        },
      },
    },
  },
});
