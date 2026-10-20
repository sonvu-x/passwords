import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig(({ command }) => ({
  plugins: [react()],
  base: command === 'build' ? '/passwords/' : '/',
  build: {
    outDir: 'docs',
  },
}))
