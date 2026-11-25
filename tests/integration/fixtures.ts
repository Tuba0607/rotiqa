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
