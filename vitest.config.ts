import 'dotenv/config'
import { defineVitestProject } from '@nuxt/test-utils/config'
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      {
        // Pure TypeScript: shared utils and server modules. Fast, no Nuxt runtime, no database.
        test: {
          name: 'unit',
          include: ['tests/unit/**/*.test.ts'],
          environment: 'node',
        },
      },
      await defineVitestProject({
        // Vue components and composables inside a Nuxt runtime.
        test: {
          name: 'nuxt',
          include: ['tests/nuxt/**/*.test.ts'],
          environment: 'nuxt',
        },
      }),
      {
        // Real PostgreSQL (`rotiqa_test`) through the restricted runtime role, so Row Level
        // Security is exercised exactly as in production. Files run serially: they share one database.
        test: {
          name: 'integration',
          include: ['tests/integration/**/*.test.ts'],
          environment: 'node',
          globalSetup: ['tests/integration/global-setup.ts'],
          fileParallelism: false,
          testTimeout: 20_000,
          hookTimeout: 60_000,
          env: {
            DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
            BETTER_AUTH_URL: 'http://localhost:3000',
          },
        },
      },
    ],
  },
})
