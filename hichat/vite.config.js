import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    allowedHosts: [
      'fineness-mutilated-strudel.ngrok-free.dev'
    ],
    host: true // This allows access from your local network too
  }
})
