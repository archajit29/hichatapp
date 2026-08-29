import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
    include: ['src/**/*.{test,spec}.{ts,tsx,js,jsx}'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json'],
      include: ['src/**/*.{ts,tsx,js,jsx}'],
      exclude: [
        'src/test/**',
        'src/**/*.d.ts',
        'src/main.jsx',
        'src/soundUtils.ts',
        'dist/**',
      ],
    },
  },
});
