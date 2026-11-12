import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    // same-origin proxy so the httpOnly refresh cookie works without CORS gymnastics
    proxy: { '/api': process.env.API_URL || 'http://localhost:4000' },
  },
  build: {
    rollupOptions: { output: { manualChunks: { charts: ['recharts'], vendor: ['react', 'react-dom', 'react-router-dom', '@tanstack/react-query'] } } },
  },
});
