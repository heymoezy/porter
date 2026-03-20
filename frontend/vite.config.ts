import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  base: '/v2/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8877',
        changeOrigin: true,
      },
      '/login': {
        target: 'http://127.0.0.1:8877',
        changeOrigin: true,
      },
      '/logout': {
        target: 'http://127.0.0.1:8877',
        changeOrigin: true,
      },
      '/upload': {
        target: 'http://127.0.0.1:8877',
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
})
