import { execFileSync } from 'node:child_process'
import 'dotenv/config'

/** Migrates the test database before the e2e run (same database as integration tests). */
export default function globalSetup(): void {
  const ownerUrl = process.env.TEST_MIGRATION_DATABASE_URL
  if (!ownerUrl || !/\/rotiqa_test(\?|$)/.test(ownerUrl)) throw new Error('E2E tests only run against the rotiqa_test database')
  execFileSync('pnpm', ['exec', 'prisma', 'migrate', 'deploy'], { env: { ...process.env, MIGRATION_DATABASE_URL: ownerUrl }, stdio: 'pipe' })
}
