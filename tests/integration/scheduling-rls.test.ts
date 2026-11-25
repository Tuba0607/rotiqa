import { randomUUID } from 'node:crypto'
import type pg from 'pg'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { seedSchedules, seedTwoTenants, WEEK, type TenantSchedule, type TwoTenants } from './fixtures'
import { asApp, closeConnections, expectDbError, ownerPool, resetDatabase } from './helpers'

/**
 * F2 scheduling tables under Row Level Security, exercised with raw SQL as the runtime role.
 * Mirrors tests/integration/rls.test.ts for shift codes, weeks, assignments and change sets.
 */

const SCHEDULING_TABLES = ['shift_codes', 'schedule_weeks', 'shift_assignments', 'schedule_change_sets']

let t: TwoTenants
let s: { a: TenantSchedule, b: TenantSchedule }

beforeEach(async () => {
  await resetDatabase()
  t = await seedTwoTenants()
  s = await seedSchedules(t)
})

afterAll(closeConnections)

const count = async (client: pg.PoolClient, table: string, where = 'true', params: unknown[] = []) =>
  (await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, params)).rows[0].n as number

const asOwnerA = <T>(fn: (c: pg.PoolClient) => Promise<T>, org = () => t.a.orgId) => asApp({ userId: t.a.owner.id, organizationId: org() }, fn)
const asManagerA = <T>(fn: (c: pg.PoolClient) => Promise<T>) => asApp({ userId: t.managerA.id, organizationId: t.a.orgId }, fn)

/** INSERT for one assignment cell; defaults to A's employee 0 at location 0 on Tuesday. */
function insertAssignment(client: pg.PoolClient, overrides: Partial<Record<'org' | 'location' | 'week' | 'employee' | 'date' | 'code' | 'kind' | 'start' | 'end' | 'custom' | 'note', unknown>> = {}) {
  const v = {
    org: t.a.orgId,
    location: t.a.locations[0],
    week: WEEK,
    employee: t.a.employees[0],
    date: '2026-11-24',
    code: s.a.workCodeId,
    kind: 'WORK',
    start: 480,
    end: 960,
    custom: false,
    note: null,
    ...overrides,
  }
  return client.query(
    `INSERT INTO shift_assignments (id, organization_id, location_id, week_start, employee_id, work_date, shift_code_id,
       code_snapshot, label_snapshot, kind_snapshot, color_snapshot, start_minute, end_minute, is_custom_time, note, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, 'A', 'Sabah', $8, '#8EDFE3', $9, $10, $11, $12, now(), now())`,
    [randomUUID(), v.org, v.location, v.week, v.employee, v.date, v.code, v.kind, v.start, v.end, v.custom, v.note],
  )
}

describe('without tenant context', () => {
  it('sees no scheduling rows (fails closed)', async () => {
    await asApp({}, async (client) => {
      for (const table of SCHEDULING_TABLES) expect(await count(client, table), table).toBe(0)
    })
  })
})

describe('cross-organization isolation', () => {
  it('reads only its own codes, weeks, assignments and change sets', async () => {
    await asOwnerA(async (client) => {
      expect(await count(client, 'shift_codes')).toBe(2)
      expect(await count(client, 'schedule_weeks')).toBe(2)
      expect(await count(client, 'shift_assignments')).toBe(2)
      expect(await count(client, 'schedule_change_sets')).toBe(2)
      for (const table of SCHEDULING_TABLES) expect(await count(client, table, 'organization_id = $1', [t.b.orgId]), table).toBe(0)
    })
  })

  it('gains nothing by pointing app.org_id at another organization', async () => {
    await asOwnerA(async (client) => {
      for (const table of SCHEDULING_TABLES) expect(await count(client, table), table).toBe(0)
    }, () => t.b.orgId)
  })

  it('cannot update or delete B rows by id', async () => {
    await asOwnerA(async (client) => {
      expect((await client.query(`UPDATE shift_assignments SET note = 'x' WHERE id = $1`, [s.b.assignments[0]])).rowCount).toBe(0)
      expect((await client.query(`DELETE FROM shift_assignments WHERE id = $1`, [s.b.assignments[0]])).rowCount).toBe(0)
      expect((await client.query(`UPDATE shift_codes SET label = 'x' WHERE id = $1`, [s.b.workCodeId])).rowCount).toBe(0)
      expect((await client.query(`UPDATE schedule_weeks SET version = version + 1 WHERE organization_id = $1`, [t.b.orgId])).rowCount).toBe(0)
    }, () => t.b.orgId)
    const { rows } = await ownerPool.query(`SELECT count(*)::int AS n FROM shift_assignments WHERE organization_id = $1 AND note IS NULL`, [t.b.orgId])
    expect(rows[0].n).toBe(2)
  })

  it('cannot insert weeks or assignments into B', async () => {
    const week = await asOwnerA(client => expectDbError(client.query(
      `INSERT INTO schedule_weeks (id, organization_id, location_id, week_start, created_at, updated_at) VALUES ($1, $2, $3, '2026-11-30', now(), now())`,
      [randomUUID(), t.b.orgId, t.b.locations[0]],
    )), () => t.b.orgId)
    expect(week).toMatch(/row-level security/)
    const cell = await asOwnerA(client => expectDbError(insertAssignment(client, { org: t.b.orgId, location: t.b.locations[0], employee: t.b.employees[0], code: s.b.workCodeId })), () => t.b.orgId)
    expect(cell).toMatch(/row-level security/)
  })

  it('cannot use another organization’s shift code or employee (composite foreign keys)', async () => {
    expect(await asOwnerA(client => expectDbError(insertAssignment(client, { code: s.b.workCodeId })))).toMatch(/foreign key/)
    expect(await asOwnerA(client => expectDbError(insertAssignment(client, { employee: t.b.employees[0] })))).toMatch(/foreign key/)
  })
})

describe('manager location restrictions', () => {
  it('sees weeks, assignments and change sets of assigned locations only, and all codes', async () => {
    await asManagerA(async (client) => {
      expect((await client.query('SELECT location_id FROM schedule_weeks')).rows.map(r => r.location_id)).toEqual([t.a.locations[0]])
      expect((await client.query('SELECT id FROM shift_assignments')).rows.map(r => r.id)).toEqual([s.a.assignments[0]])
      expect(await count(client, 'schedule_change_sets')).toBe(1)
      expect(await count(client, 'shift_codes')).toBe(2)
    })
  })

  it('plans freely in the assigned location', async () => {
    await asManagerA(async (client) => {
      await insertAssignment(client)
      expect((await client.query(`UPDATE shift_assignments SET note = 'Açılışı yapacak' WHERE id = $1`, [s.a.assignments[0]])).rowCount).toBe(1)
      expect((await client.query(`DELETE FROM shift_assignments WHERE id = $1`, [s.a.assignments[0]])).rowCount).toBe(1)
      await client.query(
        `INSERT INTO schedule_weeks (id, organization_id, location_id, week_start, created_at, updated_at) VALUES ($1, $2, $3, '2026-11-30', now(), now())`,
        [randomUUID(), t.a.orgId, t.a.locations[0]],
      )
    })
  })

  it('cannot read, change, delete or create in an unassigned location', async () => {
    await asManagerA(async (client) => {
      expect((await client.query(`UPDATE shift_assignments SET note = 'x' WHERE id = $1`, [s.a.assignments[1]])).rowCount).toBe(0)
      expect((await client.query(`DELETE FROM shift_assignments WHERE id = $1`, [s.a.assignments[1]])).rowCount).toBe(0)
    })
    const cell = await asManagerA(client => expectDbError(insertAssignment(client, { location: t.a.locations[1], employee: t.a.employees[1] })))
    expect(cell).toMatch(/row-level security/)
    const week = await asManagerA(client => expectDbError(client.query(
      `INSERT INTO schedule_weeks (id, organization_id, location_id, week_start, created_at, updated_at) VALUES ($1, $2, $3, '2026-11-30', now(), now())`,
      [randomUUID(), t.a.orgId, t.a.locations[1]],
    )))
    expect(week).toMatch(/row-level security/)
  })

  it('cannot move an assignment into an unassigned location', async () => {
    const message = await asManagerA(client => expectDbError(client.query(`UPDATE shift_assignments SET location_id = $1 WHERE id = $2`, [t.a.locations[1], s.a.assignments[0]])))
    expect(message).toMatch(/row-level security|foreign key/)
  })

  it('cannot create or edit shift codes (OWNER only)', async () => {
    await asManagerA(async (client) => {
      expect((await client.query(`UPDATE shift_codes SET label = 'x' WHERE id = $1`, [s.a.workCodeId])).rowCount).toBe(0)
    })
    const message = await asManagerA(client => expectDbError(client.query(
      `INSERT INTO shift_codes (id, organization_id, code, label, kind, color, created_at, updated_at) VALUES ($1, $2, 'X', 'X', 'WORK', '#000000', now(), now())`,
      [randomUUID(), t.a.orgId],
    )))
    expect(message).toMatch(/row-level security/)
  })
})

describe('change sets are append-only and attributed', () => {
  const insertChangeSet = (client: pg.PoolClient, actor: string, mutationId = randomUUID()) => client.query(
    `INSERT INTO schedule_change_sets (id, organization_id, location_id, week_start, actor_user_id, client_mutation_id, kind, changes, created_at)
     VALUES ($1, $2, $3, $4, $5, $6, 'EDIT', '[]', now())`,
    [randomUUID(), t.a.orgId, t.a.locations[0], WEEK, actor, mutationId],
  )

  it('can only be written as yourself', async () => {
    await asManagerA(client => insertChangeSet(client, t.managerA.id))
    expect(await asManagerA(client => expectDbError(insertChangeSet(client, t.a.owner.id)))).toMatch(/row-level security/)
  })

  it('cannot be updated or deleted', async () => {
    expect(await asOwnerA(client => expectDbError(client.query(`UPDATE schedule_change_sets SET changes = '[]'`)))).toMatch(/permission denied/)
    expect(await asOwnerA(client => expectDbError(client.query(`DELETE FROM schedule_change_sets`)))).toMatch(/permission denied/)
  })

  it('rejects a reused client mutation id (idempotent retries)', async () => {
    const mutationId = randomUUID()
    await asApp({ userId: t.a.owner.id, organizationId: t.a.orgId }, client => insertChangeSet(client, t.a.owner.id, mutationId), { commit: true })
    const message = await asOwnerA(client => expectDbError(insertChangeSet(client, t.a.owner.id, mutationId)))
    expect(message).toMatch(/unique|duplicate key/)
  })
})

describe('integrity constraints', () => {
  it('weeks must start on Monday', async () => {
    const message = await asOwnerA(client => expectDbError(client.query(
      `INSERT INTO schedule_weeks (id, organization_id, location_id, week_start, created_at, updated_at) VALUES ($1, $2, $3, '2026-11-25', now(), now())`,
      [randomUUID(), t.a.orgId, t.a.locations[0]],
    )))
    expect(message).toMatch(/schedule_weeks_starts_monday/)
  })

  it('assignment dates must fall inside their week, and the week must exist', async () => {
    expect(await asOwnerA(client => expectDbError(insertAssignment(client, { date: '2026-11-30' })))).toMatch(/shift_assignments_date_in_week/)
    expect(await asOwnerA(client => expectDbError(insertAssignment(client, { week: '2026-11-30', date: '2026-11-30' })))).toMatch(/foreign key/)
  })

  it('allows one shift per employee per day', async () => {
    expect(await asOwnerA(client => expectDbError(insertAssignment(client, { date: WEEK })))).toMatch(/unique|duplicate key/)
  })

  it('validates times: ranges, pairing, non-work codes and custom times', async () => {
    const cases: [Parameters<typeof insertAssignment>[1], RegExp][] = [
      [{ start: 1440 }, /start_range/],
      [{ end: 0 }, /end_range/],
      [{ start: 480, end: null }, /times_paired/],
      [{ start: 600, end: 600 }, /not_zero_length/],
      [{ kind: 'OFF' }, /hours_only_for_work/],
      [{ custom: true, start: null, end: null }, /custom_time_has_times/],
      [{ note: 'x'.repeat(501) }, /note_length/],
    ]
    for (const [overrides, error] of cases) {
      expect(await asOwnerA(client => expectDbError(insertAssignment(client, overrides))), String(error)).toMatch(error)
    }
  })

  it('accepts a night shift crossing midnight and a 24:00 end', async () => {
    await asOwnerA(async (client) => {
      await insertAssignment(client, { start: 1320, end: 360 }) // 22:00 → 06:00
      await insertAssignment(client, { date: '2026-11-25', start: 960, end: 1440 }) // 16:00 → 24:00
    })
  })

  it('validates shift codes', async () => {
    const insertCode = (code: string, kind: string, start: number | null, end: number | null, color = '#123456') => asOwnerA(client => expectDbError(client.query(
      `INSERT INTO shift_codes (id, organization_id, code, label, kind, start_minute, end_minute, color, created_at, updated_at)
       VALUES ($1, $2, $3, 'Etiket', $4, $5, $6, $7, now(), now())`,
      [randomUUID(), t.a.orgId, code, kind, start, end, color],
    )))
    expect(await insertCode('TOOLONG', 'WORK', null, null)).toMatch(/code_format/)
    expect(await insertCode('X', 'OFF', 480, 960)).toMatch(/hours_only_for_work/)
    expect(await insertCode('X', 'WORK', null, null, 'red')).toMatch(/color_hex/)
    expect(await insertCode('A', 'WORK', null, null)).toMatch(/unique|duplicate key/)
  })
})
