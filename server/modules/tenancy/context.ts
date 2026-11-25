import type { PrismaClient } from '../../generated/prisma/client'

/** Prisma client bound to one request transaction with tenant settings applied. */
export type TenantTx = Parameters<Parameters<PrismaClient['$transaction']>[0]>[0]

export interface TenantContext {
  userId: string
  /** Omitted for user-level operations (listing own organizations, onboarding, accepting invitations). */
  organizationId?: string
}

/**
 * Runs `fn` in a transaction whose PostgreSQL settings identify the current user and
 * organization. Row Level Security policies read them through app.current_user_id() and
 * app.current_org_id().
 *
 * set_config(..., is_local => true) scopes the values to this transaction: they are
 * discarded on commit or rollback, so a pooled connection never carries one request's
 * tenant into the next. Queries outside withTenant() run with no context and see no
 * tenant rows (fail closed).
 */
export async function withTenant<T>(prisma: PrismaClient, context: TenantContext, fn: (tx: TenantTx) => Promise<T>): Promise<T> {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT set_config('app.user_id', ${context.userId}, true), set_config('app.org_id', ${context.organizationId ?? ''}, true)`
    return fn(tx)
  })
}

/** Switches the organization inside an ongoing tenant transaction (used right after creating one). */
export async function setTenantOrganization(tx: TenantTx, organizationId: string): Promise<void> {
  await tx.$queryRaw`SELECT set_config('app.org_id', ${organizationId}, true)`
}
