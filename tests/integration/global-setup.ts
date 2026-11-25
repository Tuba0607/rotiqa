import { execFileSync } from 'node:child_process'

/** Applies migrations to the test database as the owner role before integration tests run. */
export default function setup(): void {
  const ownerUrl = process.env.TEST_MIGRATION_DATABASE_URL
  const appUrl = process.env.TEST_DATABASE_URL
  if (!ownerUrl || !appUrl) throw new Error('TEST_MIGRATION_DATABASE_URL and TEST_DATABASE_URL must be set (see .env.example)')
  if (!/\/rotiqa_test(\?|$)/.test(ownerUrl) || !/\/rotiqa_test(\?|$)/.test(appUrl)) {
    throw new Error('Integration tests only run against the rotiqa_test database')
  }
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], {
    env: { ...process.env, MIGRATION_DATABASE_URL: ownerUrl },
    stdio: 'pipe',
  })
}
