import { defineConfig } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    globals: true,
    setupFiles: ['src/__tests__/setup.ts'],
    environment: 'node',
    include: ['src/__tests__/**/*.test.{ts,tsx}'],
    exclude: process.env.TEST_DATABASE_URL ? [] : ['src/__tests__/integration/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
