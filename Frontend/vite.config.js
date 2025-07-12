import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    proxy: {
      // Proxy for your backend API
      '/api': 'http://localhost:8000',
      // Proxy for OpenRouteService
      '/orsapi': {
        target: 'https://api.openrouteservice.org',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/orsapi/, ''),
        secure: false, 
      },
    },
  },
});
