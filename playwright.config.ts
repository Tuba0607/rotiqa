import 'dotenv/config'
import { randomBytes } from 'node:crypto'
import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const isCI = !!process.env.CI
// The production build refuses placeholder secrets, so e2e generates a strong one per run
// (unless CI already provides one).
process.env.E2E_AUTH_SECRET ??= process.env.CI && process.env.BETTER_AUTH_SECRET ? process.env.BETTER_AUTH_SECRET : randomBytes(32).toString('base64')

export default defineConfig({
  testDir: 'tests/e2e',
  globalSetup: './tests/e2e/global-setup.ts',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    locale: 'tr-TR',
  },
  projects: [
    // Mobile first: managers mostly use phones.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Tests run against the production build (run `pnpm build` first) and the test database.
    command: `node .output/server/index.mjs`,
    env: {
      PORT: String(PORT),
      DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
      BETTER_AUTH_SECRET: process.env.E2E_AUTH_SECRET,
      BETTER_AUTH_URL: `http://localhost:${PORT}`,
      // Many sign-ups from one IP within seconds; the limiter itself stays on in production.
      AUTH_RATE_LIMIT: 'off',
    },
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !isCI,
  },
})
