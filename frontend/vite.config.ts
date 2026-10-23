import { cpSync, existsSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'

const rootDir = dirname(fileURLToPath(import.meta.url))

function copyWellKnown(): Plugin {
  return {
    name: 'copy-well-known',
    closeBundle() {
      const source = resolve(rootDir, 'public/.well-known')
      if (existsSync(source)) {
        cpSync(source, resolve(rootDir, 'dist/.well-known'), { recursive: true })
      }
    },
  }
}

export default defineConfig({
  plugins: [react(), copyWellKnown()],
  server: {
    port: 5173,
    proxy: {
      // Keeps cookies/tokens same-origin in development and avoids CORS.
      '/api': { target: 'http://127.0.0.1:8000', changeOrigin: true },
      '/uploads': { target: 'http://127.0.0.1:8000', changeOrigin: true },
    },
  },
})
