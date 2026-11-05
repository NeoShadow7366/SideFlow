import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  server: {
    port: 5173,
    strictPort: true,
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './src/test/setup.ts',
    css: false,
    testTimeout: 30000,
    fileParallelism: false,
    alias: {
      'lucide-react': 'lucide-react/dist/cjs/lucide-react.js',
    },
    poolOptions: {
      threads: {
        singleThread: true,
      },
    },
  },
});
