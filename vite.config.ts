import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// base: './' keeps asset paths relative so the build works on GitHub Pages sub-paths.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    include: ['src/**/*.test.ts'],
  },
})
