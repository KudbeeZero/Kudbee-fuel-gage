import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => {
  return {
    root: __dirname,
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        'node:crypto': path.resolve(__dirname, 'src/lib/browser-crypto.ts'),
      },
    },
    optimizeDeps: {
      exclude: [
        "@kudbee/utils",
        "@kudbee/opencode",
      ],
    },
    server: {
      port: 5173,
      host: true,
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
      allowedHosts: true,
      proxy: {
        '/api': 'http://127.0.0.1:3001',
        '/health': 'http://127.0.0.1:3001',
        '/v1': 'http://127.0.0.1:3001',
        '/ollama': {
          target: 'http://localhost:11434',
          changeOrigin: true,
          timeout: 120000,
          rewrite: (path) => path.replace(/^\/ollama/, ''),
        },
      },
    },
    build: {
      outDir: 'dist',
      modulePreload: false,
      rollupOptions: {
        input: {
          main: path.resolve(__dirname, 'index.html'),
          terminal: path.resolve(__dirname, 'terminal.html'),
          tower: path.resolve(__dirname, 'tower.html'),
        },
        output: {
          manualChunks(id) {
            if (id.includes('node_modules')) {
              if (id.includes('/react-dom/') || id.includes('/react/')) {
                return 'vendor-react';
              }
              if (id.includes('/react-router/')) {
                return 'vendor-router';
              }
              if (id.includes('/lucide-react/')) {
                return 'vendor-lucide';
              }
              if (id.includes('/recharts/')) {
                return 'vendor-recharts';
              }
              if (id.includes('/d3/')) {
                return 'vendor-d3';
              }
              if (id.includes('/motion/')) {
                return 'vendor-motion';
              }
              if (id.includes('/zustand/')) {
                return 'vendor-zustand';
              }
              if (id.includes('/@noble/ed25519/')) {
                return 'vendor-crypto';
              }
            }
          },
        },
      },
    },
  };
});
