import type { Prisma } from '../../generated/prisma/client'
import type { TenantTx } from '../tenancy/context'

export interface AuditEntry {
  organizationId: string
  actorUserId: string
  action: string
  entityType: string
  entityId?: string
  metadata?: Prisma.InputJsonValue
}

/**
 * Appends an audit record inside the current tenant transaction (RLS: actor must be a member).
 * Uses createMany because it does not read the row back: INSERT … RETURNING would also need
 * SELECT permission, and only OWNERs may read the audit log.
 */
export async function recordAudit(tx: TenantTx, entry: AuditEntry): Promise<void> {
  await tx.auditLog.createMany({ data: [entry] })
}
