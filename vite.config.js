import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 2000,
    allowedHosts: ['localhost','*'],
    proxy: {
      '/api/ess/': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api/crdb/': {
        target: 'http://localhost:5000',
        changeOrigin: true,
      },
    },
  },
   build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        crdb: resolve(__dirname, 'crdb.html'),
       
      },
    },
  },
});