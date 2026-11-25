import { randomUUID } from 'node:crypto'
import pg from 'pg'
import type { PrismaClient } from '../../server/generated/prisma/client'
import { createPrismaClient } from '../../server/utils/db'

const ownerUrl = process.env.TEST_MIGRATION_DATABASE_URL!
const appUrl = process.env.TEST_DATABASE_URL!

/** Owner connection: test setup and cleanup only. Bypasses RLS (table owner). */
export const ownerPool = new pg.Pool({ connectionString: ownerUrl, max: 2 })
/** Runtime-role connection for raw SQL checks. RLS applies. */
export const appPool = new pg.Pool({ connectionString: appUrl, max: 4 })
/** Runtime-role Prisma client, as used by the app. */
export const appPrisma: PrismaClient = createPrismaClient(appUrl)

const TABLES = [
  'audit_logs', 'invitation_locations', 'invitations', 'employees', 'departments',
  'location_access', 'memberships', 'locations', 'organizations',
  'sessions', 'accounts', 'verifications', 'users',
]

export async function resetDatabase(): Promise<void> {
  await ownerPool.query(`TRUNCATE ${TABLES.join(', ')} CASCADE`)
}

export interface TestUser { id: string, email: string, name: string }

/** Inserts a bare user row (no password); enough for tenancy tests. */
export async function createUser(name = 'Test Kullanıcı'): Promise<TestUser> {
  const user = { id: randomUUID(), email: `user-${randomUUID().slice(0, 8)}@example.test`, name }
  await ownerPool.query('INSERT INTO users (id, name, email, email_verified, created_at, updated_at) VALUES ($1, $2, $3, false, now(), now())', [user.id, user.name, user.email])
  return user
}

/**
 * Runs SQL as the runtime role inside a transaction with the given tenant settings,
 * then rolls back unless `commit` is set. Mirrors server/modules/tenancy/context.ts.
 */
export async function asApp<T>(
  context: { userId?: string, organizationId?: string },
  fn: (client: pg.PoolClient) => Promise<T>,
  options: { commit?: boolean } = {},
): Promise<T> {
  const client = await appPool.connect()
  try {
    await client.query('BEGIN')
    await client.query(`SELECT set_config('app.user_id', $1, true), set_config('app.org_id', $2, true)`, [context.userId ?? '', context.organizationId ?? ''])
    const result = await fn(client)
    await client.query(options.commit ? 'COMMIT' : 'ROLLBACK')
    return result
  }
  catch (error) {
    await client.query('ROLLBACK').catch(() => {})
    throw error
  }
  finally {
    client.release()
  }
}

/** Expects a PostgreSQL error (RLS violation, permission denied, …) and returns its message. */
export async function expectDbError(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  }
  catch (error) {
    return (error as Error).message
  }
  throw new Error('Expected a database error, but the statement succeeded')
}

export async function closeConnections(): Promise<void> {
  await Promise.all([ownerPool.end(), appPool.end(), appPrisma.$disconnect()])
}
