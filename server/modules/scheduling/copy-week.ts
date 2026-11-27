import { copyWeekSchema } from '../../../shared/schemas/scheduling'
import type { CellSnapshot, CopyWeekResult, CopyWeekSkipped } from '../../../shared/types/schedule'
import { cellKey, resolveCell, type ShiftCodeLike } from '../../../shared/utils/schedule-cells'
import { addDays } from '../../../shared/utils/week'
import { AppError } from '../errors'
import type { OrgContext } from '../tenancy/access'
import { applyChanges, findDuplicate, lockWeek, requireWritableLocation, type PlannedChange } from './changes'
import { assignmentSelect, fromDate, toDate, toSnapshot, type AssignmentRow } from './mapping'

/**
 * Week copy ("copy last week"): plans a target week from a source week of the same location.
 *
 * - Day by day: Monday → Monday, … Sunday → Sunday.
 * - Only active staff whose home location is still this location are copied, and only with
 *   shift codes that are still active. Everything else is skipped and counted, never an error,
 *   so one archived employee does not block copying a 30-person plan.
 * - Hours come from the shift code as it is today (codes are the source of truth for new
 *   plans); per-day custom hours are kept. Day notes are not copied: they describe one date.
 * - `fill-empty` (default) leaves cells that already hold a shift alone; `overwrite` replaces
 *   them. Cells that are empty in the source are never cleared in the target.
 * - The whole copy is one COPY_WEEK change set: one undo reverts it, and a retried request
 *   (same clientMutationId) is applied once.
 */

const noSkips = (): CopyWeekSkipped => ({ occupied: 0, inactiveEmployee: 0, inactiveCode: 0, otherLocation: 0 })

/** The cell a source cell becomes in the new week. */
export function copiedCell(source: Pick<AssignmentRow, 'isCustomTime' | 'startMinute' | 'endMinute' | 'breakMinutes'>, code: ShiftCodeLike): CellSnapshot {
  const keepCustom = source.isCustomTime && code.kind === 'WORK' && source.startMinute !== null && source.endMinute !== null
  return resolveCell({
    shiftCodeId: code.id,
    custom: keepCustom ? { startMinute: source.startMinute!, endMinute: source.endMinute!, breakMinutes: source.breakMinutes } : null,
    note: null,
  }, code)
}

export async function copyScheduleWeek(ctx: OrgContext, rawInput: unknown): Promise<CopyWeekResult> {
  const input = copyWeekSchema.parse(rawInput)
  const sourceWeekStart = input.sourceWeekStart ?? addDays(input.weekStart, -7)
  const offsetDays = Math.round((toDate(input.weekStart).getTime() - toDate(sourceWeekStart).getTime()) / 86_400_000)
  const organizationId = ctx.organization.id

  const location = await requireWritableLocation(ctx, input.locationId)
  const week = await lockWeek(ctx, location.id, input.weekStart)
  const duplicate = await findDuplicate(ctx, input.clientMutationId, { locationId: location.id, weekStart: input.weekStart, version: week.version, kinds: ['COPY_WEEK'] })
  if (duplicate) return { ...duplicate, sourceWeekStart, skipped: noSkips() }

  const source = await ctx.tx.shiftAssignment.findMany({
    where: { organizationId, locationId: location.id, weekStart: toDate(sourceWeekStart) },
    select: assignmentSelect,
    orderBy: [{ workDate: 'asc' }],
  })
  if (source.length === 0) throw new AppError('VALIDATION', 'Kopyalanacak haftada planlanmış vardiya yok.')

  const employeeIds = [...new Set(source.map(row => row.employeeId))]
  const targetDays = [...new Set(source.map(row => addDays(fromDate(row.workDate), offsetDays)))]
  const [employees, codes, existing] = await Promise.all([
    ctx.tx.employee.findMany({ where: { organizationId, id: { in: employeeIds } }, select: { id: true, locationId: true, isActive: true } }),
    ctx.tx.shiftCode.findMany({ where: { organizationId, id: { in: [...new Set(source.map(row => row.shiftCodeId))] } } }),
    // Current target cells, in every location this user can see (one shift per employee per day).
    ctx.tx.shiftAssignment.findMany({
      where: { organizationId, employeeId: { in: employeeIds }, workDate: { in: targetDays.map(toDate) } },
      select: assignmentSelect,
    }),
  ])
  const employeeById = new Map(employees.map(e => [e.id, e]))
  const codeById = new Map(codes.map(c => [c.id, c]))
  const existingByKey = new Map(existing.map(row => [cellKey(row.employeeId, fromDate(row.workDate)), row]))

  const skipped = noSkips()
  const planned: PlannedChange[] = []
  for (const row of source) {
    const employee = employeeById.get(row.employeeId)
    if (!employee || !employee.isActive || employee.locationId !== location.id) {
      skipped.inactiveEmployee++
      continue
    }
    const code = codeById.get(row.shiftCodeId)
    if (!code || !code.isActive) {
      skipped.inactiveCode++
      continue
    }
    const workDate = addDays(fromDate(row.workDate), offsetDays)
    const current = existingByKey.get(cellKey(row.employeeId, workDate))
    if (current && current.locationId !== location.id) {
      skipped.otherLocation++
      continue
    }
    if (current && input.mode === 'fill-empty') {
      skipped.occupied++
      continue
    }
    // The week row is locked, so the value read above is still current when it is applied.
    planned.push({ employeeId: row.employeeId, workDate, expected: current ? toSnapshot(current) : null, target: copiedCell(row, code) })
  }

  const result = await applyChanges(ctx, { locationId: location.id, weekStart: input.weekStart, week }, planned, { kind: 'COPY_WEEK', clientMutationId: input.clientMutationId })
  return { ...result, sourceWeekStart, skipped }
}
