import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    root: __dirname,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
      },
    },
    server: {
      port: 5173,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      allowedHosts: [
        '.cloudspaces.litng.ai',
        '.lightning.ai',
        'localhost',
      ],
      proxy: {
        '/api': 'http://127.0.0.1:3000',
        '/health': 'http://127.0.0.1:3000',
        '/v1': 'http://127.0.0.1:3000',
        '/ollama': {
          target: 'http://localhost:11434',
          changeOrigin: true,
          timeout: 120000,
          rewrite: (path) => path.replace(/^\/ollama/, ''),
        },
      }
    },
    build: {
      outDir: 'dist',
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          terminal: path.resolve(__dirname, 'terminal.html'),
        },
      },
    },
  };
});
