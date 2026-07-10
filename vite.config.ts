import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true },
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: { manualChunks: (id) => id.includes('/node_modules/firebase/') || id.includes('/node_modules/@firebase/') ? 'firebase' : undefined },
    },
  },
})
