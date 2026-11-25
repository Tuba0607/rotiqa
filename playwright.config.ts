import 'dotenv/config'
import { defineConfig, devices } from '@playwright/test'

const PORT = 3100
const isCI = !!process.env.CI

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: isCI,
  retries: isCI ? 1 : 0,
  reporter: isCI ? 'github' : 'list',
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  projects: [
    // Mobile first: managers mostly use phones.
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // Tests run against the production build (run `pnpm build` first).
    command: `node .output/server/index.mjs`,
    // The production server does not read .env itself; forward what it needs.
    env: { PORT: String(PORT), DATABASE_URL: process.env.DATABASE_URL ?? '' },
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !isCI,
  },
})
