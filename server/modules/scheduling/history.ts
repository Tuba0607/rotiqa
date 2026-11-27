import { historyQuerySchema } from '../../../shared/schemas/scheduling'
import type { ScheduleHistoryEntry } from '../../../shared/types/schedule'
import { requireLocationAccess, type OrgContext } from '../tenancy/access'
import { readStoredChanges } from './changes'
import { toDate } from './mapping'

/**
 * Saved change sets of one location week, newest first. Lets the planner rebuild its undo/redo
 * stacks after a reload: the newest own entry with `canRevert` is what "Geri al" reverts (an
 * UNDO entry with `canRevert` is what "İleri al" reverts). Reverting itself goes through
 * revertScheduleChangeSet, which re-checks everything under the week lock.
 */
export async function listScheduleHistory(ctx: OrgContext, rawQuery: unknown): Promise<ScheduleHistoryEntry[]> {
  const query = historyQuerySchema.parse(rawQuery)
  const location = await requireLocationAccess(ctx, query.locationId)
  const where = { organizationId: ctx.organization.id, locationId: location.id, weekStart: toDate(query.week) }

  const rows = await ctx.tx.scheduleChangeSet.findMany({
    where,
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    take: query.limit,
    select: { id: true, kind: true, createdAt: true, actorUserId: true, revertsId: true, changes: true, actor: { select: { id: true, name: true } } },
  })
  const reverts = rows.length === 0
    ? []
    : await ctx.tx.scheduleChangeSet.findMany({ where: { ...where, revertsId: { in: rows.map(r => r.id) } }, select: { id: true, revertsId: true } })
  const revertedBy = new Map(reverts.map(r => [r.revertsId!, r.id]))

  return rows.map((row) => {
    const revertedById = revertedBy.get(row.id) ?? null
    return {
      id: row.id,
      kind: row.kind,
      createdAt: row.createdAt.toISOString(),
      actor: row.actor ? { id: row.actor.id, name: row.actor.name } : null,
      cellCount: readStoredChanges(row.changes).length,
      revertsId: row.revertsId,
      revertedById,
      canRevert: row.actorUserId === ctx.userId && revertedById === null,
    }
  })
}
