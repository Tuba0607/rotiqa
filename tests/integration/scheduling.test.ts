import { randomUUID } from 'node:crypto'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '../../server/modules/errors'
import { revertScheduleChangeSet, saveScheduleChanges } from '../../server/modules/scheduling/changes'
import { copyScheduleWeek } from '../../server/modules/scheduling/copy-week'
import { listScheduleHistory } from '../../server/modules/scheduling/history'
import { getWeekSchedule } from '../../server/modules/scheduling/weeks'
import { runInOrganization } from '../../server/modules/tenancy/access'
import type { CellValue, ScheduleSaveResult } from '../../shared/types/schedule'
import { seedSchedules, seedTwoTenants, WEEK, type TenantSchedule, type TwoTenants } from './fixtures'
import { appPrisma, closeConnections, ownerPool, resetDatabase } from './helpers'

let t: TwoTenants
let s: { a: TenantSchedule, b: TenantSchedule }
const TUESDAY = '2026-11-24'
const NEXT_WEEK = '2026-11-30'

beforeEach(async () => {
  await resetDatabase()
  t = await seedTwoTenants()
  s = await seedSchedules(t)
})

afterAll(closeConnections)

/** The seeded Monday cell of A's employee 0 (code A, 08:00–16:00). */
const seeded = (): CellValue => ({ shiftCodeId: s.a.workCodeId, startMinute: 480, endMinute: 960, breakMinutes: 0, isCustomTime: false, note: null })

type Change = { employeeId?: string, workDate?: string, expected?: CellValue | null, value: unknown }

function save(userId: string, changes: Change[], options: { slug?: string, locationId?: string, weekStart?: string, id?: string } = {}): Promise<ScheduleSaveResult> {
  return runInOrganization(appPrisma, userId, options.slug ?? t.a.slug, ctx => saveScheduleChanges(ctx, {
    locationId: options.locationId ?? t.a.locations[0],
    weekStart: options.weekStart ?? WEEK,
    clientMutationId: options.id ?? randomUUID(),
    changes: changes.map(c => ({ employeeId: t.a.employees[0], workDate: TUESDAY, expected: null, ...c })),
  }))
}

function revert(userId: string, changeSetId: string, id = randomUUID()) {
  return runInOrganization(appPrisma, userId, t.a.slug, ctx => revertScheduleChangeSet(ctx, { locationId: t.a.locations[0], weekStart: WEEK, changeSetId, clientMutationId: id }))
}

function copy(userId: string, input: Record<string, unknown> = {}, slug = t.a.slug) {
  return runInOrganization(appPrisma, userId, slug, ctx => copyScheduleWeek(ctx, { locationId: t.a.locations[0], weekStart: NEXT_WEEK, clientMutationId: randomUUID(), ...input }))
}

const history = (userId: string, query: Record<string, string> = {}) =>
  runInOrganization(appPrisma, userId, t.a.slug, ctx => listScheduleHistory(ctx, { locationId: t.a.locations[0], week: WEEK, ...query }))

const week = (userId: string, query: Record<string, string>, slug = t.a.slug) =>
  runInOrganization(appPrisma, userId, slug, ctx => getWeekSchedule(ctx, query))

async function expectAppError(promise: Promise<unknown>, code: string, message?: RegExp) {
  await expect(promise).rejects.toSatisfy((error: unknown) => error instanceof AppError && error.code === code && (!message || message.test(error.message)))
}

async function cellRow(employeeId: string, workDate: string) {
  const { rows } = await ownerPool.query(`SELECT code_snapshot, start_minute, end_minute, break_minutes, is_custom_time, note, updated_by_id FROM shift_assignments WHERE employee_id = $1 AND work_date = $2`, [employeeId, workDate])
  return rows[0] ?? null
}

async function weekVersion(locationId = t.a.locations[0], weekStart = WEEK): Promise<number | null> {
  const { rows } = await ownerPool.query(`SELECT version FROM schedule_weeks WHERE location_id = $1 AND week_start = $2`, [locationId, weekStart])
  return rows[0]?.version ?? null
}

describe('getWeekSchedule', () => {
  it('returns days, ordered staff, codes and cells for the location', async () => {
    const view = await week(t.a.owner.id, { locationId: t.a.locations[0], week: '2026-11-26' }) // Thursday → Monday
    expect(view.week).toEqual({ weekStart: WEEK, status: 'DRAFT', version: 0, exists: true })
    expect(view.days).toHaveLength(7)
    expect(view.employees.map(e => e.id)).toEqual([t.a.employees[0]])
    expect(view.shiftCodes.map(c => c.code)).toEqual(['A', 'OFF'])
    expect(view.cells).toEqual([{ employeeId: t.a.employees[0], workDate: WEEK, code: 'A', label: 'Sabah', kind: 'WORK', color: '#8EDFE3', ...seeded() }])
  })

  it('never creates a week just by viewing it', async () => {
    const view = await week(t.a.owner.id, { locationId: t.a.locations[0], week: '2026-11-30' })
    expect(view.week).toMatchObject({ exists: false, version: 0 })
    expect(await weekVersion(t.a.locations[0], '2026-11-30')).toBeNull()
  })

  it('keeps archived staff who still have cells that week, drops the others', async () => {
    await ownerPool.query(`UPDATE employees SET is_active = false, archived_at = now() WHERE id = $1`, [t.a.employees[0]])
    expect((await week(t.a.owner.id, { locationId: t.a.locations[0], week: WEEK })).employees.map(e => [e.id, e.isActive])).toEqual([[t.a.employees[0], false]])
    expect((await week(t.a.owner.id, { locationId: t.a.locations[0], week: '2026-11-30' })).employees).toEqual([])
  })

  it('enforces location and organization access', async () => {
    await expectAppError(week(t.managerA.id, { locationId: t.a.locations[1] }), 'FORBIDDEN')
    await expectAppError(week(t.b.owner.id, { locationId: t.a.locations[0] }, t.b.slug), 'FORBIDDEN')
    await expectAppError(week(t.a.owner.id, { locationId: t.a.locations[0] }, t.b.slug), 'NOT_FOUND')
  })
})

describe('saveScheduleChanges', () => {
  it('assigns a cell with the code’s hours copied in, and records the change', async () => {
    const result = await save(t.managerA.id, [{ value: { shiftCodeId: s.a.workCodeId } }])
    expect(result).toMatchObject({ duplicate: false, version: 1, conflicts: [], unchanged: 0 })
    expect(result.applied[0]!.cell).toMatchObject({ code: 'A', startMinute: 480, endMinute: 960, isCustomTime: false })
    expect(await cellRow(t.a.employees[0], TUESDAY)).toMatchObject({ code_snapshot: 'A', start_minute: 480, updated_by_id: t.managerA.id })

    const { rows } = await ownerPool.query(`SELECT kind, actor_user_id, changes FROM schedule_change_sets WHERE id = $1`, [result.changeSetId])
    expect(rows[0]).toMatchObject({ kind: 'EDIT', actor_user_id: t.managerA.id })
    expect(rows[0].changes).toEqual([{ employeeId: t.a.employees[0], workDate: TUESDAY, before: null, after: result.applied[0]!.cell }])
  })

  it('stores custom times and a trimmed note for working shifts only', async () => {
    const result = await save(t.a.owner.id, [{ value: { shiftCodeId: s.a.workCodeId, custom: { startMinute: 1320, endMinute: 360, breakMinutes: 30 }, note: '  Kapanış  ' } }])
    expect(result.applied[0]!.cell).toMatchObject({ startMinute: 1320, endMinute: 360, breakMinutes: 30, isCustomTime: true, note: 'Kapanış' })
    await expectAppError(save(t.a.owner.id, [{ workDate: '2026-11-25', value: { shiftCodeId: s.a.offCodeId, custom: { startMinute: 480, endMinute: 960 } } }]), 'VALIDATION', /özel saat/)
  })

  it('updates and clears cells when the expected value matches', async () => {
    const updated = await save(t.a.owner.id, [{ workDate: WEEK, expected: seeded(), value: { shiftCodeId: s.a.offCodeId } }])
    expect(updated.applied[0]!.cell).toMatchObject({ code: 'OFF', startMinute: null, endMinute: null })
    const offValue = { shiftCodeId: s.a.offCodeId, startMinute: null, endMinute: null, breakMinutes: 0, isCustomTime: false, note: null }
    const cleared = await save(t.a.owner.id, [{ workDate: WEEK, expected: offValue, value: null }])
    expect(cleared.applied).toEqual([{ employeeId: t.a.employees[0], workDate: WEEK, cell: null }])
    expect(await cellRow(t.a.employees[0], WEEK)).toBeNull()
    expect(cleared.version).toBe(2)
  })

  it('never overwrites a cell that changed since the client saw it', async () => {
    const result = await save(t.a.owner.id, [
      { workDate: WEEK, expected: null, value: { shiftCodeId: s.a.offCodeId } }, // stale: cell is A
      { workDate: TUESDAY, expected: null, value: { shiftCodeId: s.a.workCodeId } }, // fine
    ])
    expect(result.conflicts).toEqual([{ employeeId: t.a.employees[0], workDate: WEEK, cell: expect.objectContaining({ code: 'A', ...seeded() }) }])
    expect(result.applied.map(a => a.workDate)).toEqual([TUESDAY])
    expect(await cellRow(t.a.employees[0], WEEK)).toMatchObject({ code_snapshot: 'A' })
    expect(result.version).toBe(1)
  })

  it('treats a change to the current value as unchanged (no change set, no version bump)', async () => {
    const result = await save(t.a.owner.id, [{ workDate: WEEK, expected: seeded(), value: { shiftCodeId: s.a.workCodeId } }])
    expect(result).toMatchObject({ changeSetId: null, version: 0, unchanged: 1, applied: [], conflicts: [] })
  })

  it('validates the batch', async () => {
    await expectAppError(save(t.a.owner.id, [{ workDate: '2026-11-30', value: null }]), 'VALIDATION', /haftanın dışında/)
    await expectAppError(save(t.a.owner.id, [{ value: null }, { value: null }]), 'VALIDATION', /yalnızca bir kez/)
    await expect(save(t.a.owner.id, [{ value: null }], { weekStart: TUESDAY })).rejects.toThrow('Hafta pazartesi günü başlamalı.')
    await expect(save(t.a.owner.id, [{ value: { shiftCodeId: 'not-a-uuid' } }])).rejects.toThrow()
  })

  it('only assigns shifts to active staff of this location with active codes', async () => {
    await expectAppError(save(t.a.owner.id, [{ employeeId: t.a.employees[1], value: { shiftCodeId: s.a.workCodeId } }]), 'VALIDATION', /aktif personeline/)
    await ownerPool.query(`UPDATE employees SET is_active = false, archived_at = now() WHERE id = $1`, [t.a.employees[0]])
    await expectAppError(save(t.a.owner.id, [{ value: { shiftCodeId: s.a.workCodeId } }]), 'VALIDATION', /aktif personeline/)
    await ownerPool.query(`UPDATE employees SET is_active = true, archived_at = NULL WHERE id = $1`, [t.a.employees[0]])
    await ownerPool.query(`UPDATE shift_codes SET is_active = false WHERE id = $1`, [s.a.offCodeId])
    await expectAppError(save(t.a.owner.id, [{ value: { shiftCodeId: s.a.offCodeId } }]), 'VALIDATION', /pasif vardiya kodu/)
  })

  it('rejects other organizations’ codes, employees and locations', async () => {
    await expectAppError(save(t.a.owner.id, [{ value: { shiftCodeId: s.b.workCodeId } }]), 'VALIDATION', /vardiya kodu/)
    await expectAppError(save(t.a.owner.id, [{ employeeId: t.b.employees[0], value: { shiftCodeId: s.a.workCodeId } }]), 'VALIDATION', /Personel bulunamadı/)
    await expectAppError(save(t.b.owner.id, [{ value: null }], { slug: t.b.slug }), 'FORBIDDEN')
    await expectAppError(save(t.a.owner.id, [{ value: null }], { slug: t.b.slug }), 'NOT_FOUND')
  })

  it('keeps managers inside their assigned locations', async () => {
    await expectAppError(save(t.managerA.id, [{ employeeId: t.a.employees[1], value: null }], { locationId: t.a.locations[1] }), 'FORBIDDEN')
    // Referencing another location's employee from an allowed week: invisible under RLS.
    await expectAppError(save(t.managerA.id, [{ employeeId: t.a.employees[1], value: null }]), 'VALIDATION', /Personel bulunamadı/)
    expect(await cellRow(t.a.employees[1], WEEK)).not.toBeNull()
  })

  it('refuses edits to inactive locations and published weeks', async () => {
    await ownerPool.query(`UPDATE schedule_weeks SET status = 'PUBLISHED' WHERE location_id = $1`, [t.a.locations[0]])
    await expectAppError(save(t.a.owner.id, [{ value: null }]), 'CONFLICT', /Yayınlanmış/)
    await ownerPool.query(`UPDATE locations SET is_active = false WHERE id = $1`, [t.a.locations[0]])
    await expectAppError(save(t.a.owner.id, [{ value: null }]), 'VALIDATION', /Pasif/)
  })

  it('applies a repeated clientMutationId only once', async () => {
    const id = randomUUID()
    const change = [{ value: { shiftCodeId: s.a.workCodeId } }]
    const first = await save(t.a.owner.id, change, { id })
    const retry = await save(t.a.owner.id, change, { id })
    expect(retry).toMatchObject({ duplicate: true, changeSetId: first.changeSetId, version: 1 })
    expect(retry.applied).toEqual(first.applied)
    const { rows } = await ownerPool.query(`SELECT count(*)::int AS n FROM schedule_change_sets WHERE client_mutation_id = $1`, [id])
    expect(rows[0].n).toBe(1)
  })

  it('applies concurrent duplicates of the same request once', async () => {
    const id = randomUUID()
    const results = await Promise.all([1, 2, 3].map(() => save(t.a.owner.id, [{ value: { shiftCodeId: s.a.workCodeId } }], { id })))
    expect(results.filter(r => !r.duplicate)).toHaveLength(1)
    expect(await weekVersion()).toBe(1)
  })

  it('rejects reusing a clientMutationId for another kind of operation', async () => {
    const id = randomUUID()
    const edit = await save(t.a.owner.id, [{ value: { shiftCodeId: s.a.workCodeId } }], { id })
    await expectAppError(revert(t.a.owner.id, edit.changeSetId!, id), 'CONFLICT', /istek kimliği/)
    await expectAppError(copy(t.a.owner.id, { weekStart: NEXT_WEEK, sourceWeekStart: WEEK, clientMutationId: id }), 'CONFLICT', /istek kimliği/)
  })

  it('refuses (instead of failing) concurrent reuse of one clientMutationId for two weeks', async () => {
    const id = randomUUID()
    const results = await Promise.allSettled([
      save(t.a.owner.id, [{ value: { shiftCodeId: s.a.workCodeId } }], { id }),
      save(t.a.owner.id, [{ workDate: '2026-12-01', value: { shiftCodeId: s.a.workCodeId } }], { id, weekStart: NEXT_WEEK }),
    ])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const failure = results.find(r => r.status === 'rejected') as PromiseRejectedResult
    expect(failure.reason).toBeInstanceOf(AppError)
    expect(failure.reason.code).toBe('CONFLICT')
  })

  it('rejects reusing a clientMutationId for a different week', async () => {
    const id = randomUUID()
    await save(t.a.owner.id, [{ value: { shiftCodeId: s.a.workCodeId } }], { id })
    await expectAppError(save(t.a.owner.id, [{ workDate: '2026-12-01', value: null }], { id, weekStart: '2026-11-30' }), 'CONFLICT', /istek kimliği/)
  })

  it('serializes concurrent writers: different cells both apply, the same cell has one winner', async () => {
    const [x, y] = await Promise.all([
      save(t.a.owner.id, [{ workDate: TUESDAY, value: { shiftCodeId: s.a.workCodeId } }]),
      save(t.managerA.id, [{ workDate: '2026-11-25', value: { shiftCodeId: s.a.offCodeId } }]),
    ])
    expect([x.applied.length, y.applied.length]).toEqual([1, 1])
    expect(await weekVersion()).toBe(2)

    const [p, q] = await Promise.all([
      save(t.a.owner.id, [{ workDate: '2026-11-26', value: { shiftCodeId: s.a.workCodeId } }]),
      save(t.managerA.id, [{ workDate: '2026-11-26', value: { shiftCodeId: s.a.offCodeId } }]),
    ])
    const winners = [p, q].filter(r => r.applied.length === 1)
    const losers = [p, q].filter(r => r.conflicts.length === 1)
    expect(winners).toHaveLength(1)
    expect(losers).toHaveLength(1)
    expect((await cellRow(t.a.employees[0], '2026-11-26')).code_snapshot).toBe(winners[0]!.applied[0]!.cell!.code)
    expect(losers[0]!.conflicts[0]!.cell!.code).toBe(winners[0]!.applied[0]!.cell!.code)
  })
})

describe('revertScheduleChangeSet (undo / redo)', () => {
  it('undoes and redoes an edit, then refuses to revert the same change set twice', async () => {
    const edit = await save(t.a.owner.id, [
      { workDate: WEEK, expected: seeded(), value: { shiftCodeId: s.a.offCodeId } },
      { workDate: TUESDAY, value: { shiftCodeId: s.a.workCodeId } },
    ])
    const undo = await revert(t.a.owner.id, edit.changeSetId!)
    expect(undo.applied.map(a => [a.workDate, a.cell?.code ?? null])).toEqual([[WEEK, 'A'], [TUESDAY, null]])
    expect(await cellRow(t.a.employees[0], WEEK)).toMatchObject({ code_snapshot: 'A', start_minute: 480 })
    expect(await cellRow(t.a.employees[0], TUESDAY)).toBeNull()

    const redo = await revert(t.a.owner.id, undo.changeSetId!)
    expect(redo.applied.map(a => [a.workDate, a.cell?.code ?? null])).toEqual([[WEEK, 'OFF'], [TUESDAY, 'A']])
    const { rows } = await ownerPool.query(`SELECT kind, reverts_id FROM schedule_change_sets WHERE id = ANY($1) ORDER BY created_at`, [[undo.changeSetId, redo.changeSetId]])
    expect(rows).toEqual([{ kind: 'UNDO', reverts_id: edit.changeSetId }, { kind: 'REDO', reverts_id: undo.changeSetId }])

    await expectAppError(revert(t.a.owner.id, edit.changeSetId!), 'CONFLICT', /zaten geri alınmış/)
  })

  it('skips cells someone else changed after the edit', async () => {
    const edit = await save(t.a.owner.id, [
      { workDate: TUESDAY, value: { shiftCodeId: s.a.workCodeId } },
      { workDate: '2026-11-25', value: { shiftCodeId: s.a.workCodeId } },
    ])
    const tuesdayA = edit.applied[0]!.cell!
    await save(t.managerA.id, [{ workDate: TUESDAY, expected: tuesdayA, value: { shiftCodeId: s.a.offCodeId } }])

    const undo = await revert(t.a.owner.id, edit.changeSetId!)
    expect(undo.applied.map(a => a.workDate)).toEqual(['2026-11-25'])
    expect(undo.conflicts).toEqual([{ employeeId: t.a.employees[0], workDate: TUESDAY, cell: expect.objectContaining({ code: 'OFF' }) }])
    expect((await cellRow(t.a.employees[0], TUESDAY)).code_snapshot).toBe('OFF')
  })

  it('restores the exact earlier snapshot even if the code changed or was deactivated', async () => {
    const edit = await save(t.a.owner.id, [{ workDate: WEEK, expected: seeded(), value: null }])
    await ownerPool.query(`UPDATE shift_codes SET start_minute = 540, end_minute = 1020, is_active = false WHERE id = $1`, [s.a.workCodeId])
    await revert(t.a.owner.id, edit.changeSetId!)
    expect(await cellRow(t.a.employees[0], WEEK)).toMatchObject({ code_snapshot: 'A', start_minute: 480, end_minute: 960 })
  })

  it('only reverts your own change sets, in the same location and week', async () => {
    const edit = await save(t.a.owner.id, [{ value: { shiftCodeId: s.a.workCodeId } }])
    await expectAppError(revert(t.managerA.id, edit.changeSetId!), 'FORBIDDEN', /kendi değişikliklerinizi/)
    await expectAppError(
      runInOrganization(appPrisma, t.a.owner.id, t.a.slug, ctx => revertScheduleChangeSet(ctx, { locationId: t.a.locations[1], weekStart: WEEK, changeSetId: edit.changeSetId!, clientMutationId: randomUUID() })),
      'NOT_FOUND',
    )
    await expectAppError(revert(t.a.owner.id, randomUUID()), 'NOT_FOUND')
  })

  it('is idempotent per clientMutationId', async () => {
    const edit = await save(t.a.owner.id, [{ value: { shiftCodeId: s.a.workCodeId } }])
    const id = randomUUID()
    const first = await revert(t.a.owner.id, edit.changeSetId!, id)
    const retry = await revert(t.a.owner.id, edit.changeSetId!, id)
    expect(retry).toMatchObject({ duplicate: true, changeSetId: first.changeSetId })
  })
})

describe('copyScheduleWeek', () => {
  /** A second employee in location 0, so a copy has several rows to work with. */
  async function addEmployee(): Promise<string> {
    const id = randomUUID()
    await ownerPool.query(
      `INSERT INTO employees (id, organization_id, location_id, department_id, first_name, last_name, is_active, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'İkinci', 'Örnek', true, 1, now(), now())`,
      [id, t.a.orgId, t.a.locations[0], t.a.departmentId],
    )
    return id
  }

  it('copies the previous week day by day as one undoable change set', async () => {
    await save(t.a.owner.id, [
      { workDate: '2026-11-29', value: { shiftCodeId: s.a.workCodeId, custom: { startMinute: 1320, endMinute: 360, breakMinutes: 30 }, note: 'Sadece bu pazar' } },
      { workDate: '2026-11-25', value: { shiftCodeId: s.a.offCodeId } },
    ])
    const result = await copy(t.managerA.id) // source defaults to the previous week
    expect(result).toMatchObject({ sourceWeekStart: WEEK, duplicate: false, version: 1, conflicts: [], skipped: { occupied: 0, inactiveEmployee: 0, inactiveCode: 0, otherLocation: 0 } })
    expect(result.applied.map(a => [a.workDate, a.cell?.code])).toEqual([[NEXT_WEEK, 'A'], ['2026-12-02', 'OFF'], ['2026-12-06', 'A']])

    // Custom hours survive the copy; the day note does not.
    expect(await cellRow(t.a.employees[0], '2026-12-06')).toMatchObject({ start_minute: 1320, end_minute: 360, break_minutes: 30, is_custom_time: true, note: null, updated_by_id: t.managerA.id })
    const { rows } = await ownerPool.query(`SELECT kind, actor_user_id, jsonb_array_length(changes) AS n FROM schedule_change_sets WHERE id = $1`, [result.changeSetId])
    expect(rows[0]).toEqual({ kind: 'COPY_WEEK', actor_user_id: t.managerA.id, n: 3 })

    const undo = await runInOrganization(appPrisma, t.managerA.id, t.a.slug, ctx => revertScheduleChangeSet(ctx, { locationId: t.a.locations[0], weekStart: NEXT_WEEK, changeSetId: result.changeSetId!, clientMutationId: randomUUID() }))
    expect(undo.applied.every(a => a.cell === null)).toBe(true)
    expect((await week(t.a.owner.id, { locationId: t.a.locations[0], week: NEXT_WEEK })).cells).toEqual([])
  })

  it('takes hours from the shift code as it is today', async () => {
    await ownerPool.query(`UPDATE shift_codes SET start_minute = 540, end_minute = 1020, break_minutes = 30, color = '#AABBCC' WHERE id = $1`, [s.a.workCodeId])
    const result = await copy(t.a.owner.id)
    expect(result.applied[0]!.cell).toMatchObject({ code: 'A', startMinute: 540, endMinute: 1020, breakMinutes: 30, color: '#AABBCC', isCustomTime: false })
    // The source week keeps its original snapshot.
    expect(await cellRow(t.a.employees[0], WEEK)).toMatchObject({ start_minute: 480, end_minute: 960 })
  })

  it('fills only empty cells by default, or overwrites when asked', async () => {
    const second = await addEmployee()
    await save(t.a.owner.id, [{ employeeId: second, workDate: WEEK, value: { shiftCodeId: s.a.workCodeId } }])
    await save(t.a.owner.id, [{ workDate: NEXT_WEEK, value: { shiftCodeId: s.a.offCodeId } }], { weekStart: NEXT_WEEK })

    const filled = await copy(t.a.owner.id)
    expect(filled.applied.map(a => a.employeeId)).toEqual([second])
    expect(filled.skipped.occupied).toBe(1)
    expect((await cellRow(t.a.employees[0], NEXT_WEEK)).code_snapshot).toBe('OFF')

    const overwritten = await copy(t.a.owner.id, { mode: 'overwrite' })
    expect(overwritten.applied.map(a => a.employeeId)).toEqual([t.a.employees[0]])
    expect(overwritten.unchanged).toBe(1) // the second employee's cell already matched
    expect((await cellRow(t.a.employees[0], NEXT_WEEK)).code_snapshot).toBe('A')

    // Undoing the overwrite brings the replaced cell back exactly.
    await runInOrganization(appPrisma, t.a.owner.id, t.a.slug, ctx => revertScheduleChangeSet(ctx, { locationId: t.a.locations[0], weekStart: NEXT_WEEK, changeSetId: overwritten.changeSetId!, clientMutationId: randomUUID() }))
    expect((await cellRow(t.a.employees[0], NEXT_WEEK)).code_snapshot).toBe('OFF')
  })

  it('skips archived or moved staff and deactivated codes instead of failing', async () => {
    const second = await addEmployee()
    const third = await addEmployee()
    await save(t.a.owner.id, [
      { employeeId: second, workDate: WEEK, value: { shiftCodeId: s.a.offCodeId } },
      { employeeId: third, workDate: WEEK, value: { shiftCodeId: s.a.workCodeId } },
    ])
    await ownerPool.query(`UPDATE employees SET is_active = false, archived_at = now() WHERE id = $1`, [t.a.employees[0]])
    await ownerPool.query(`UPDATE employees SET location_id = $2 WHERE id = $1`, [third, t.a.locations[1]])
    await ownerPool.query(`UPDATE shift_codes SET is_active = false WHERE id = $1`, [s.a.offCodeId])

    const result = await copy(t.a.owner.id)
    expect(result.applied).toEqual([])
    expect(result.changeSetId).toBeNull()
    expect(result.skipped).toEqual({ occupied: 0, inactiveEmployee: 2, inactiveCode: 1, otherLocation: 0 })
  })

  it('skips days where the employee already works in another location', async () => {
    await ownerPool.query(
      `INSERT INTO schedule_weeks (id, organization_id, location_id, week_start, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())`,
      [randomUUID(), t.a.orgId, t.a.locations[1], NEXT_WEEK],
    )
    await ownerPool.query(
      `INSERT INTO shift_assignments (id, organization_id, location_id, week_start, employee_id, work_date, shift_code_id, code_snapshot, label_snapshot, kind_snapshot, color_snapshot, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $4, $6, 'OFF', 'Haftalık izin', 'OFF', '#F8E4E4', now(), now())`,
      [randomUUID(), t.a.orgId, t.a.locations[1], NEXT_WEEK, t.a.employees[0], s.a.offCodeId],
    )
    const result = await copy(t.a.owner.id)
    expect(result.skipped.otherLocation).toBe(1)
    expect(result.applied).toEqual([])
  })

  it('validates weeks and refuses an empty source', async () => {
    await expect(copy(t.a.owner.id, { sourceWeekStart: NEXT_WEEK })).rejects.toThrow('Kaynak hafta ile hedef hafta aynı olamaz.')
    await expect(copy(t.a.owner.id, { weekStart: '2026-12-01' })).rejects.toThrow('Hafta pazartesi günü başlamalı.')
    await expectAppError(copy(t.a.owner.id, { weekStart: '2026-12-14' }), 'VALIDATION', /planlanmış vardiya yok/)
    // A later source week works too (copy backwards).
    expect((await copy(t.a.owner.id, { weekStart: '2026-11-16', sourceWeekStart: WEEK })).applied).toHaveLength(1)
  })

  it('applies a retried copy once', async () => {
    const id = randomUUID()
    const first = await copy(t.a.owner.id, { clientMutationId: id })
    const retry = await copy(t.a.owner.id, { clientMutationId: id })
    expect(retry).toMatchObject({ duplicate: true, changeSetId: first.changeSetId, version: 1 })
    expect(await weekVersion(t.a.locations[0], NEXT_WEEK)).toBe(1)
  })

  it('keeps managers and other organizations out', async () => {
    await expectAppError(copy(t.managerA.id, { locationId: t.a.locations[1] }), 'FORBIDDEN')
    await expectAppError(copy(t.b.owner.id, {}, t.b.slug), 'FORBIDDEN')
    await expectAppError(copy(t.a.owner.id, {}, t.b.slug), 'NOT_FOUND')
    // B's own copy never sees A's plan.
    const ofB = await runInOrganization(appPrisma, t.b.owner.id, t.b.slug, ctx => copyScheduleWeek(ctx, { locationId: t.b.locations[0], weekStart: NEXT_WEEK, clientMutationId: randomUUID() }))
    expect(ofB.applied.map(a => a.employeeId)).toEqual([t.b.employees[0]])
  })
})

describe('listScheduleHistory', () => {
  it('lists change sets newest first with revert links and who may revert them', async () => {
    const edit = await save(t.a.owner.id, [{ value: { shiftCodeId: s.a.workCodeId } }])
    const managerEdit = await save(t.managerA.id, [{ workDate: '2026-11-25', value: { shiftCodeId: s.a.offCodeId } }])
    const undo = await revert(t.a.owner.id, edit.changeSetId!)

    const entries = await history(t.a.owner.id)
    // The fixture's own (empty) seed change set comes last.
    expect(entries.map(e => e.id).slice(0, 3)).toEqual([undo.changeSetId, managerEdit.changeSetId, edit.changeSetId])
    expect(entries[0]).toMatchObject({ kind: 'UNDO', revertsId: edit.changeSetId, revertedById: null, canRevert: true, cellCount: 1, actor: { id: t.a.owner.id } })
    expect(entries[1]).toMatchObject({ kind: 'EDIT', canRevert: false, actor: { id: t.managerA.id, name: 'Müdür A' } })
    expect(entries[2]).toMatchObject({ kind: 'EDIT', revertedById: undo.changeSetId, canRevert: false })
    expect((await history(t.managerA.id)).find(e => e.id === managerEdit.changeSetId)?.canRevert).toBe(true)
    expect(await history(t.a.owner.id, { limit: '1' })).toHaveLength(1)
  })

  it('is limited to accessible locations and Monday weeks', async () => {
    await expectAppError(history(t.managerA.id, { locationId: t.a.locations[1] }), 'FORBIDDEN')
    await expect(history(t.a.owner.id, { week: TUESDAY })).rejects.toThrow('Hafta pazartesi günü başlamalı.')
    expect(await history(t.a.owner.id, { week: NEXT_WEEK })).toEqual([])
  })
})
