import type { Prisma } from '../../generated/prisma/client'
import { revertSchema, saveChangesSchema } from '../../../shared/schemas/scheduling'
import type { CellChangeResult, CellSnapshot, CellValue, ScheduleChangeKind, ScheduleSaveResult } from '../../../shared/types/schedule'
import { cellKey, resolveCell, sameCell } from '../../../shared/utils/schedule-cells'
import { weekDays } from '../../../shared/utils/week'
import { AppError, isUniqueViolation } from '../errors'
import { requireLocationAccess, type OrgContext } from '../tenancy/access'
import { assignmentSelect, fromDate, snapshotColumns, toDate, toSnapshot, type AssignmentRow } from './mapping'

/**
 * Saving planner edits with cell-level optimistic concurrency.
 *
 * - Writers to the same week are serialized by locking its schedule_weeks row (FOR UPDATE).
 * - Every change carries the value the client last saw (`expected`). If the cell has changed
 *   since, it is NOT overwritten: it is reported back as a conflict with its current value.
 *   Non-conflicting changes in the same batch are applied.
 * - Each request has a clientMutationId. A repeated id returns the original result instead of
 *   applying the changes twice (safe retries on flaky mobile networks).
 * - Applied changes are stored as one append-only change set (before/after per cell), which is
 *   what undo and redo revert.
 */

type ChangeKind = ScheduleChangeKind

export interface PlannedChange {
  employeeId: string
  workDate: string
  expected: CellValue | null
  target: CellSnapshot | null
}

export interface StoredChange {
  employeeId: string
  workDate: string
  before: CellSnapshot | null
  after: CellSnapshot | null
}

export interface LockedWeek {
  id: string
  status: 'DRAFT' | 'PUBLISHED'
  version: number
}

export async function requireWritableLocation(ctx: OrgContext, locationId: string) {
  const location = await requireLocationAccess(ctx, locationId)
  if (!location.isActive) throw new AppError('VALIDATION', 'Pasif bir şubenin planı değiştirilemez.')
  return location
}

/** Creates the week row if needed and locks it for the rest of the transaction. */
export async function lockWeek(ctx: OrgContext, locationId: string, weekStart: string): Promise<LockedWeek> {
  const organizationId = ctx.organization.id
  await ctx.tx.$executeRaw`
    INSERT INTO schedule_weeks (id, organization_id, location_id, week_start, created_at, updated_at)
    VALUES (gen_random_uuid(), ${organizationId}::uuid, ${locationId}::uuid, ${weekStart}::date, now(), now())
    ON CONFLICT (organization_id, location_id, week_start) DO NOTHING`
  const [week] = await ctx.tx.$queryRaw<LockedWeek[]>`
    SELECT id, status::text AS status, version FROM schedule_weeks
    WHERE organization_id = ${organizationId}::uuid AND location_id = ${locationId}::uuid AND week_start = ${weekStart}::date
    FOR UPDATE`
  if (!week) throw new AppError('FORBIDDEN', 'Bu şubeye erişim yetkiniz yok.')
  if (week.status === 'PUBLISHED') throw new AppError('CONFLICT', 'Yayınlanmış bir plan değiştirilemez.')
  return week
}

const MUTATION_ID_REUSED = 'Bu istek kimliği başka bir işlem için kullanılmış.'

/**
 * Returns the stored result when this clientMutationId was already applied. The id must have
 * been used by the same user, for the same location, week and kind of operation; anything
 * else is a client bug and is refused rather than silently answered with another result.
 */
export async function findDuplicate(
  ctx: OrgContext,
  clientMutationId: string,
  scope: { locationId: string, weekStart: string, version: number, kinds: ChangeKind[] },
): Promise<ScheduleSaveResult | null> {
  const existing = await ctx.tx.scheduleChangeSet.findUnique({
    where: { organizationId_clientMutationId: { organizationId: ctx.organization.id, clientMutationId } },
    select: { id: true, kind: true, locationId: true, weekStart: true, actorUserId: true, changes: true },
  })
  if (!existing) return null
  if (
    existing.locationId !== scope.locationId
    || fromDate(existing.weekStart) !== scope.weekStart
    || existing.actorUserId !== ctx.userId
    || !scope.kinds.includes(existing.kind)
  ) {
    throw new AppError('CONFLICT', MUTATION_ID_REUSED)
  }
  const version = scope.version
  const changes = readStoredChanges(existing.changes)
  return {
    changeSetId: existing.id,
    version,
    duplicate: true,
    applied: changes.map(c => ({ employeeId: c.employeeId, workDate: c.workDate, cell: c.after })),
    conflicts: [],
    unchanged: 0,
  }
}

export function readStoredChanges(json: Prisma.JsonValue): StoredChange[] {
  if (!Array.isArray(json)) throw new Error('Corrupt change set: changes is not an array')
  return json as unknown as StoredChange[]
}

/** Applies planned changes cell by cell, skipping conflicts, and records one change set. */
export async function applyChanges(
  ctx: OrgContext,
  scope: { locationId: string, weekStart: string, week: LockedWeek },
  planned: PlannedChange[],
  meta: { kind: ChangeKind, clientMutationId: string, revertsId?: string },
): Promise<ScheduleSaveResult> {
  const organizationId = ctx.organization.id
  const current = await ctx.tx.shiftAssignment.findMany({
    where: {
      organizationId,
      employeeId: { in: [...new Set(planned.map(c => c.employeeId))] },
      workDate: { in: [...new Set(planned.map(c => c.workDate))].map(toDate) },
    },
    select: assignmentSelect,
  })
  const byKey = new Map<string, AssignmentRow>(current.map(row => [cellKey(row.employeeId, fromDate(row.workDate)), row]))

  const applied: CellChangeResult[] = []
  const conflicts: CellChangeResult[] = []
  const stored: StoredChange[] = []
  let unchanged = 0

  for (const change of planned) {
    const row = byKey.get(cellKey(change.employeeId, change.workDate))
    if (row && row.locationId !== scope.locationId) {
      throw new AppError('VALIDATION', 'Bu personelin aynı gün başka bir şubede vardiyası var.')
    }
    const before = row ? toSnapshot(row) : null

    // Never overwrite a cell someone else changed since the client last saw it.
    if (!sameCell(before, change.expected)) {
      conflicts.push({ employeeId: change.employeeId, workDate: change.workDate, cell: before })
      continue
    }
    if (sameCell(before, change.target)) {
      unchanged++
      continue
    }

    if (!change.target) {
      await ctx.tx.shiftAssignment.delete({ where: { id: row!.id }, select: { id: true } })
    }
    else if (row) {
      await ctx.tx.shiftAssignment.update({ where: { id: row.id }, data: { ...snapshotColumns(change.target), updatedById: ctx.userId }, select: { id: true } })
    }
    else {
      try {
        await ctx.tx.shiftAssignment.create({
          data: {
            organizationId,
            locationId: scope.locationId,
            weekStart: toDate(scope.weekStart),
            employeeId: change.employeeId,
            workDate: toDate(change.workDate),
            updatedById: ctx.userId,
            ...snapshotColumns(change.target),
          },
          select: { id: true },
        })
      }
      catch (error) {
        // A shift in a location this user cannot see (one shift per employee per day).
        if (isUniqueViolation(error)) throw new AppError('VALIDATION', 'Bu personelin aynı gün başka bir şubede vardiyası var.')
        throw error
      }
    }
    applied.push({ employeeId: change.employeeId, workDate: change.workDate, cell: change.target })
    stored.push({ employeeId: change.employeeId, workDate: change.workDate, before, after: change.target })
  }

  if (stored.length === 0) {
    return { changeSetId: null, version: scope.week.version, duplicate: false, applied, conflicts, unchanged }
  }

  // Same id, different week (a different lock): the unique index catches the race. The
  // transaction is aborted at this point, so the only safe answer is to refuse the request.
  const changeSet = await ctx.tx.scheduleChangeSet.create({
    data: {
      organizationId,
      locationId: scope.locationId,
      weekStart: toDate(scope.weekStart),
      actorUserId: ctx.userId,
      clientMutationId: meta.clientMutationId,
      kind: meta.kind,
      revertsId: meta.revertsId ?? null,
      changes: stored as unknown as Prisma.InputJsonValue,
    },
    select: { id: true },
  }).catch((error: unknown) => {
    if (isUniqueViolation(error)) throw new AppError('CONFLICT', MUTATION_ID_REUSED)
    throw error
  })
  const [{ version }] = await ctx.tx.$queryRaw<{ version: number }[]>`
    UPDATE schedule_weeks SET version = version + 1, updated_at = now() WHERE id = ${scope.week.id}::uuid RETURNING version` as [{ version: number }]

  return { changeSetId: changeSet.id, version, duplicate: false, applied, conflicts, unchanged }
}

/** Autosave entry point: a batch of cell edits for one location and week. */
export async function saveScheduleChanges(ctx: OrgContext, rawInput: unknown): Promise<ScheduleSaveResult> {
  const input = saveChangesSchema.parse(rawInput)
  const days = new Set(weekDays(input.weekStart))
  const keys = new Set<string>()
  for (const change of input.changes) {
    if (!days.has(change.workDate)) throw new AppError('VALIDATION', 'Değişiklik seçilen haftanın dışında bir güne ait.')
    const key = cellKey(change.employeeId, change.workDate)
    if (keys.has(key)) throw new AppError('VALIDATION', 'Aynı hücre bir istekte yalnızca bir kez değiştirilebilir.')
    keys.add(key)
  }

  const location = await requireWritableLocation(ctx, input.locationId)
  const week = await lockWeek(ctx, location.id, input.weekStart)
  const duplicate = await findDuplicate(ctx, input.clientMutationId, { locationId: location.id, weekStart: input.weekStart, version: week.version, kinds: ['EDIT'] })
  if (duplicate) return duplicate

  const organizationId = ctx.organization.id
  const employeeIds = [...new Set(input.changes.map(c => c.employeeId))]
  const codeIds = [...new Set(input.changes.flatMap(c => (c.value ? [c.value.shiftCodeId] : [])))]
  const [employees, codes] = await Promise.all([
    // RLS hides employees of locations this user cannot access.
    ctx.tx.employee.findMany({ where: { organizationId, id: { in: employeeIds } }, select: { id: true, locationId: true, isActive: true } }),
    ctx.tx.shiftCode.findMany({ where: { organizationId, id: { in: codeIds } } }),
  ])
  const employeeById = new Map(employees.map(e => [e.id, e]))
  const codeById = new Map(codes.map(c => [c.id, c]))

  const planned: PlannedChange[] = input.changes.map((change) => {
    const employee = employeeById.get(change.employeeId)
    if (!employee) throw new AppError('VALIDATION', 'Personel bulunamadı.')
    if (!change.value) return { employeeId: change.employeeId, workDate: change.workDate, expected: change.expected, target: null }

    if (employee.locationId !== location.id || !employee.isActive) {
      throw new AppError('VALIDATION', 'Yalnızca bu şubenin aktif personeline vardiya atanabilir.')
    }
    const code = codeById.get(change.value.shiftCodeId)
    if (!code || !code.isActive) throw new AppError('VALIDATION', 'Geçersiz veya pasif vardiya kodu.')
    if (change.value.custom && code.kind !== 'WORK') throw new AppError('VALIDATION', 'Yalnızca çalışma vardiyalarına özel saat girilebilir.')

    return { employeeId: change.employeeId, workDate: change.workDate, expected: change.expected, target: resolveCell(change.value, code) }
  })

  return applyChanges(ctx, { locationId: location.id, weekStart: input.weekStart, week }, planned, { kind: 'EDIT', clientMutationId: input.clientMutationId })
}

/**
 * Undo/redo: reverts one of the user's own change sets by restoring each cell's `before`
 * value, but only where the cell still holds the `after` value (others are reported as
 * conflicts). Reverting an UNDO is a REDO. Each change set can be reverted once.
 */
export async function revertScheduleChangeSet(ctx: OrgContext, rawInput: unknown): Promise<ScheduleSaveResult> {
  const input = revertSchema.parse(rawInput)
  const location = await requireWritableLocation(ctx, input.locationId)
  const week = await lockWeek(ctx, location.id, input.weekStart)
  const duplicate = await findDuplicate(ctx, input.clientMutationId, { locationId: location.id, weekStart: input.weekStart, version: week.version, kinds: ['UNDO', 'REDO'] })
  if (duplicate) return duplicate

  const target = await ctx.tx.scheduleChangeSet.findFirst({
    where: { id: input.changeSetId, organizationId: ctx.organization.id, locationId: location.id, weekStart: toDate(input.weekStart) },
    select: { id: true, kind: true, actorUserId: true, changes: true },
  })
  if (!target) throw new AppError('NOT_FOUND', 'Geri alınacak değişiklik bulunamadı.')
  if (target.actorUserId !== ctx.userId) throw new AppError('FORBIDDEN', 'Yalnızca kendi değişikliklerinizi geri alabilirsiniz.')
  const alreadyReverted = await ctx.tx.scheduleChangeSet.findFirst({ where: { organizationId: ctx.organization.id, revertsId: target.id }, select: { id: true } })
  if (alreadyReverted) throw new AppError('CONFLICT', 'Bu değişiklik zaten geri alınmış.')

  const planned: PlannedChange[] = readStoredChanges(target.changes).map(change => ({
    employeeId: change.employeeId,
    workDate: change.workDate,
    expected: change.after,
    target: change.before,
  }))
  return applyChanges(ctx, { locationId: location.id, weekStart: input.weekStart, week }, planned, {
    kind: target.kind === 'UNDO' ? 'REDO' : 'UNDO',
    clientMutationId: input.clientMutationId,
    revertsId: target.id,
  })
}
