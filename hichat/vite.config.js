import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 1500,
    rollupOptions: {
      onwarn(warning, warn) {
        if (warning.code === 'MODULE_EXTERNALIZED' || warning.message?.includes('externalized for browser compatibility')) {
          return;
        }
        warn(warning);
      }
    }
  },
  server: {
    allowedHosts: [
      'fineness-mutilated-strudel.ngrok-free.dev'
    ],
    host: true // This allows access from your local network too
  }
})
