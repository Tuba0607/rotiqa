import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

const globalForPrisma = globalThis as unknown as { __rotiqaPrisma?: PrismaClient }

/**
 * Shared client for the application database, connected as the restricted runtime role
 * (`rotiqa_app`). Tenant data is only reachable inside `withTenant()`; see
 * server/modules/tenancy/context.ts. Created lazily so builds never need a database.
 */
export function usePrisma(): PrismaClient {
  if (!globalForPrisma.__rotiqaPrisma) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    globalForPrisma.__rotiqaPrisma = createPrismaClient(url)
  }
  return globalForPrisma.__rotiqaPrisma
}
