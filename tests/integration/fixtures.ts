import { randomUUID } from 'node:crypto'
import { createUser, ownerPool, type TestUser } from './helpers'

export interface TenantFixture {
  orgId: string
  slug: string
  owner: TestUser
  locations: [string, string]
  departmentId: string
  /** One employee per location: [location 0, location 1]. */
  employees: [string, string]
}

export interface TwoTenants {
  a: TenantFixture
  b: TenantFixture
  /** MANAGER of org A with access to a.locations[0] only. */
  managerA: TestUser
  managerMembershipId: string
}

async function seedTenant(label: string): Promise<TenantFixture> {
  const owner = await createUser(`Sahip ${label}`)
  const orgId = randomUUID()
  const slug = `test-${label.toLowerCase()}-${orgId.slice(0, 6)}`
  const locations: [string, string] = [randomUUID(), randomUUID()]
  const departmentId = randomUUID()
  const employees: [string, string] = [randomUUID(), randomUUID()]

  await ownerPool.query(`INSERT INTO organizations (id, name, slug, created_by_id, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())`, [orgId, `İşletme ${label}`, slug, owner.id])
  await ownerPool.query(`INSERT INTO memberships (id, user_id, organization_id, role, created_at, updated_at) VALUES ($1, $2, $3, 'OWNER', now(), now())`, [randomUUID(), owner.id, orgId])
  for (const [i, id] of locations.entries()) {
    await ownerPool.query(`INSERT INTO locations (id, organization_id, name, timezone, is_active, created_at, updated_at) VALUES ($1, $2, $3, 'Europe/Istanbul', true, now(), now())`, [id, orgId, `Şube ${label}${i + 1}`])
  }
  await ownerPool.query(`INSERT INTO departments (id, organization_id, name, color, sort_order, is_active, created_at, updated_at) VALUES ($1, $2, 'Salon', '#60427E', 0, true, now(), now())`, [departmentId, orgId])
  for (const [i, id] of employees.entries()) {
    await ownerPool.query(
      `INSERT INTO employees (id, organization_id, location_id, department_id, first_name, last_name, is_active, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, 'Örnek', true, 0, now(), now())`,
      [id, orgId, locations[i], departmentId, `Personel${label}${i + 1}`],
    )
  }
  return { orgId, slug, owner, locations, departmentId, employees }
}

export async function seedTwoTenants(): Promise<TwoTenants> {
  const a = await seedTenant('A')
  const b = await seedTenant('B')
  const managerA = await createUser('Müdür A')
  const managerMembershipId = randomUUID()
  await ownerPool.query(`INSERT INTO memberships (id, user_id, organization_id, role, created_at, updated_at) VALUES ($1, $2, $3, 'MANAGER', now(), now())`, [managerMembershipId, managerA.id, a.orgId])
  await ownerPool.query(`INSERT INTO location_access (membership_id, location_id, organization_id, created_at) VALUES ($1, $2, $3, now())`, [managerMembershipId, a.locations[0], a.orgId])
  return { a, b, managerA, managerMembershipId }
}

export const WEEK = '2026-11-23' // a Monday

export interface TenantSchedule {
  workCodeId: string
  offCodeId: string
  /** Assignment ids for employees[0] (location 0) and employees[1] (location 1), on WEEK. */
  assignments: [string, string]
}

async function seedTenantSchedule(t: TenantFixture): Promise<TenantSchedule> {
  const workCodeId = randomUUID()
  const offCodeId = randomUUID()
  await ownerPool.query(
    `INSERT INTO shift_codes (id, organization_id, code, label, kind, start_minute, end_minute, color, sort_order, created_at, updated_at)
     VALUES ($1, $3, 'A', 'Sabah', 'WORK', 480, 960, '#8EDFE3', 0, now(), now()),
            ($2, $3, 'OFF', 'Haftalık izin', 'OFF', NULL, NULL, '#F8E4E4', 1, now(), now())`,
    [workCodeId, offCodeId, t.orgId],
  )
  const assignments: [string, string] = [randomUUID(), randomUUID()]
  for (const [i, locationId] of t.locations.entries()) {
    await ownerPool.query(
      `INSERT INTO schedule_weeks (id, organization_id, location_id, week_start, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())`,
      [randomUUID(), t.orgId, locationId, WEEK],
    )
    await ownerPool.query(
      `INSERT INTO shift_assignments (id, organization_id, location_id, week_start, employee_id, work_date, shift_code_id,
         code_snapshot, label_snapshot, kind_snapshot, color_snapshot, start_minute, end_minute, created_at, updated_at, updated_by_id)
       VALUES ($1, $2, $3, $4, $5, $4, $6, 'A', 'Sabah', 'WORK', '#8EDFE3', 480, 960, now(), now(), $7)`,
      [assignments[i], t.orgId, locationId, WEEK, t.employees[i], workCodeId, t.owner.id],
    )
    await ownerPool.query(
      `INSERT INTO schedule_change_sets (id, organization_id, location_id, week_start, actor_user_id, client_mutation_id, kind, changes, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, 'EDIT', '[]', now())`,
      [randomUUID(), t.orgId, locationId, WEEK, t.owner.id, randomUUID()],
    )
  }
  return { workCodeId, offCodeId, assignments }
}

/** Shift codes, a week, one assignment and one change set per location, for both tenants. */
export async function seedSchedules(t: TwoTenants): Promise<{ a: TenantSchedule, b: TenantSchedule }> {
  return { a: await seedTenantSchedule(t.a), b: await seedTenantSchedule(t.b) }
}
