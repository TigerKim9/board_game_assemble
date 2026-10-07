import react from '@vitejs/plugin-react'
import { defineConfig } from 'vitest/config'

// base: './' keeps asset paths relative so the build works on GitHub Pages sub-paths.
export default defineConfig({
  base: './',
  plugins: [react()],
  // `npm run server` in another terminal makes online play work in `npm run dev`.
  server: { proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } } },
  test: {
    include: ['src/**/*.test.ts', 'server/**/*.test.ts'],
  },
})
