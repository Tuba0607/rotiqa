import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '../generated/prisma/client'

export function createPrismaClient(connectionString: string): PrismaClient {
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
}

const globalForPrisma = globalThis as unknown as { __rotiqaPrisma?: PrismaClient }

/**
 * Shared client for the application database. Created lazily so builds and tests
 * never need a database connection. The demo database gets its own client (F6).
 */
export function usePrisma(): PrismaClient {
  if (!globalForPrisma.__rotiqaPrisma) {
    const url = process.env.DATABASE_URL
    if (!url) throw new Error('DATABASE_URL is not set')
    globalForPrisma.__rotiqaPrisma = createPrismaClient(url)
  }
  return globalForPrisma.__rotiqaPrisma
}
