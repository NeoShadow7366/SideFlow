import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 750,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('lucide-react')) {
              return 'vendor-icons';
            }
            if (
              id.includes('/react/') ||
              id.includes('/react-dom/') ||
              id.includes('\\react\\') ||
              id.includes('\\react-dom\\') ||
              id.includes('scheduler')
            ) {
              return 'vendor-react';
            }
          }
          return undefined;
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    pool: 'threads',
    minWorkers: 1,
    maxWorkers: 4,
    setupFiles: './src/test/setup.ts',
    css: false,
    testTimeout: 30000,
  },
});
