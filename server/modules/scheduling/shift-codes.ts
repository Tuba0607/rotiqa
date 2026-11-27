import type { ShiftCodeKind } from '../../generated/prisma/client'
import { DEFAULT_SHIFT_CODES } from '../../../shared/utils/shift-codes'
import type { TenantTx } from '../tenancy/context'

/** "HH:mm" → minutes after midnight ("24:00" → 1440). */
export function toMinutes(time: string | null): number | null {
  if (!time) return null
  const [h, m] = time.split(':').map(Number)
  return h! * 60 + m!
}

/** Rows for the starter shift codes (no hours: each business sets its own). */
export function defaultShiftCodeRows(organizationId: string) {
  return DEFAULT_SHIFT_CODES.map((def, index) => ({
    organizationId,
    code: def.code,
    label: def.label,
    kind: def.kind as ShiftCodeKind,
    startMinute: toMinutes(def.startTime),
    endMinute: toMinutes(def.endTime),
    color: def.color,
    sortOrder: index,
  }))
}

/**
 * Seeds the starter codes for a new organization inside its onboarding transaction.
 * createMany avoids INSERT … RETURNING (keeps the write independent of read policies).
 */
export async function createDefaultShiftCodes(tx: TenantTx, organizationId: string): Promise<void> {
  await tx.shiftCode.createMany({ data: defaultShiftCodeRows(organizationId) })
}

const shiftCodeSelect = {
  id: true,
  code: true,
  label: true,
  kind: true,
  color: true,
  startMinute: true,
  endMinute: true,
  breakMinutes: true,
  sortOrder: true,
  isActive: true,
} as const

/** Shift codes of the organization (members read; RLS). Inactive codes only when asked. */
export function listShiftCodes(tx: TenantTx, organizationId: string, options: { includeInactive?: boolean, alsoIds?: string[] } = {}) {
  return tx.shiftCode.findMany({
    where: {
      organizationId,
      ...(options.includeInactive ? {} : { OR: [{ isActive: true }, { id: { in: options.alsoIds ?? [] } }] }),
    },
    orderBy: [{ sortOrder: 'asc' }, { code: 'asc' }],
    select: shiftCodeSelect,
  })
}
