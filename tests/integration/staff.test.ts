import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '../../server/modules/errors'
import { createDepartment, listDepartments, updateDepartment } from '../../server/modules/staff/departments'
import { createEmployee, getEmployee, listEmployees, reorderEmployees, setEmployeeArchived, updateEmployee } from '../../server/modules/staff/employees'
import { runInOrganization, type OrgContext } from '../../server/modules/tenancy/access'
import { createLocation, listLocations, updateLocation } from '../../server/modules/tenancy/locations'
import { seedTwoTenants, type TwoTenants } from './fixtures'
import { appPrisma, closeConnections, ownerPool, resetDatabase } from './helpers'

let t: TwoTenants

beforeEach(async () => {
  await resetDatabase()
  t = await seedTwoTenants()
})

afterAll(closeConnections)

const asOwnerA = <T>(fn: (ctx: OrgContext) => Promise<T>) => runInOrganization(appPrisma, t.a.owner.id, t.a.slug, fn)
const asManagerA = <T>(fn: (ctx: OrgContext) => Promise<T>) => runInOrganization(appPrisma, t.managerA.id, t.a.slug, fn)
const asOwnerB = <T>(fn: (ctx: OrgContext) => Promise<T>) => runInOrganization(appPrisma, t.b.owner.id, t.b.slug, fn)

async function expectAppError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((error: unknown) => error instanceof AppError && error.code === code)
}

describe('organization access', () => {
  it('another organization’s slug is indistinguishable from a missing one', async () => {
    await expectAppError(runInOrganization(appPrisma, t.a.owner.id, t.b.slug, async () => 'reached'), 'NOT_FOUND')
    await expectAppError(runInOrganization(appPrisma, t.a.owner.id, 'does-not-exist', async () => 'reached'), 'NOT_FOUND')
  })
})

describe('departments', () => {
  it('OWNER creates with a default palette color and updates', async () => {
    const created = await asOwnerA(ctx => createDepartment(ctx, { name: 'Mutfak' }))
    expect(created).toMatchObject({ name: 'Mutfak', color: '#24466F', isActive: true })
    const updated = await asOwnerA(ctx => updateDepartment(ctx, created.id, { color: '#1e5f5a', isActive: false }))
    expect(updated).toMatchObject({ color: '#1E5F5A', isActive: false })
    expect((await asOwnerA(ctx => listDepartments(ctx))).map(d => d.name)).toEqual(['Salon'])
  })

  it('MANAGER can read but not create or edit', async () => {
    expect((await asManagerA(ctx => listDepartments(ctx))).map(d => d.name)).toEqual(['Salon'])
    await expectAppError(asManagerA(ctx => createDepartment(ctx, { name: 'Bar' })), 'FORBIDDEN')
    await expectAppError(asManagerA(ctx => updateDepartment(ctx, t.a.departmentId, { name: 'X' })), 'FORBIDDEN')
  })

  it('rejects duplicates, invalid colors and blank names', async () => {
    await expectAppError(asOwnerA(ctx => createDepartment(ctx, { name: 'Salon' })), 'CONFLICT')
    await expect(asOwnerA(ctx => createDepartment(ctx, { name: 'Bar', color: 'red' }))).rejects.toThrow(/#RRGGBB/)
    await expect(asOwnerA(ctx => createDepartment(ctx, { name: '   ' }))).rejects.toThrow(/gerekli/)
  })

  it('cannot edit another organization’s department', async () => {
    await expectAppError(asOwnerA(ctx => updateDepartment(ctx, t.b.departmentId, { name: 'X' })), 'NOT_FOUND')
  })
})

describe('locations', () => {
  it('OWNER creates and updates; MANAGER sees only assigned ones and cannot write', async () => {
    const created = await asOwnerA(ctx => createLocation(ctx, { name: 'Karşıyaka', timezone: 'Europe/Istanbul' }))
    await asOwnerA(ctx => updateLocation(ctx, created.id, { isActive: false }))
    expect((await asOwnerA(ctx => listLocations(ctx))).length).toBe(3)
    expect((await asManagerA(ctx => listLocations(ctx))).map(l => l.id)).toEqual([t.a.locations[0]])
    await expectAppError(asManagerA(ctx => createLocation(ctx, { name: 'X', timezone: 'Europe/Istanbul' })), 'FORBIDDEN')
  })

  it('rejects invalid time zones and duplicate names', async () => {
    await expect(asOwnerA(ctx => createLocation(ctx, { name: 'X', timezone: 'Mars/Olympus' }))).rejects.toThrow(/saat dilimi/)
    await expectAppError(asOwnerA(ctx => createLocation(ctx, { name: 'Şube A1', timezone: 'Europe/Istanbul' })), 'CONFLICT')
  })
})

describe('employees', () => {
  it('creates employees with a stable, increasing display order', async () => {
    const first = await asOwnerA(ctx => createEmployee(ctx, { firstName: 'Deniz', lastName: 'Akın', locationId: t.a.locations[0], departmentId: t.a.departmentId }))
    const second = await asOwnerA(ctx => createEmployee(ctx, { firstName: 'Ece', lastName: 'Yıldırım', locationId: t.a.locations[0] }))
    expect(second.sortOrder).toBe(first.sortOrder + 1)
    expect(first.department).toMatchObject({ name: 'Salon', color: '#60427E' })
    const list = await asOwnerA(ctx => listEmployees(ctx, { locationId: t.a.locations[0] }))
    expect(list.map(e => e.firstName)).toEqual(['PersonelA1', 'Deniz', 'Ece'])
  })

  it('reorders employees within a location', async () => {
    const created = await asOwnerA(ctx => createEmployee(ctx, { firstName: 'Zeynep', lastName: 'Kaya', locationId: t.a.locations[0] }))
    await asOwnerA(ctx => reorderEmployees(ctx, { locationId: t.a.locations[0], employeeIds: [created.id, t.a.employees[0]] }))
    const list = await asOwnerA(ctx => listEmployees(ctx, { locationId: t.a.locations[0] }))
    expect(list.map(e => e.id)).toEqual([created.id, t.a.employees[0]])
    await expectAppError(asOwnerA(ctx => reorderEmployees(ctx, { locationId: t.a.locations[0], employeeIds: [t.a.employees[1]] })), 'VALIDATION')
  })

  it('archives and reactivates without deleting, and filters by status', async () => {
    const archived = await asOwnerA(ctx => setEmployeeArchived(ctx, t.a.employees[0], true))
    expect(archived.isActive).toBe(false)
    expect(archived.archivedAt).toBeInstanceOf(Date)
    expect(await asOwnerA(ctx => listEmployees(ctx, { locationId: t.a.locations[0], status: 'active' }))).toHaveLength(0)
    expect(await asOwnerA(ctx => listEmployees(ctx, { locationId: t.a.locations[0], status: 'archived' }))).toHaveLength(1)

    const reactivated = await asOwnerA(ctx => setEmployeeArchived(ctx, t.a.employees[0], false))
    expect(reactivated).toMatchObject({ isActive: true, archivedAt: null })
    const { rows } = await ownerPool.query('SELECT count(*)::int AS n FROM employees WHERE id = $1', [t.a.employees[0]])
    expect(rows[0].n).toBe(1)
  })

  it('updates name and department; rejects departments of other organizations or inactive ones', async () => {
    const updated = await asOwnerA(ctx => updateEmployee(ctx, t.a.employees[0], { firstName: 'Yeni', departmentId: null }))
    expect(updated).toMatchObject({ firstName: 'Yeni', department: null })
    await expectAppError(asOwnerA(ctx => updateEmployee(ctx, t.a.employees[0], { departmentId: t.b.departmentId })), 'VALIDATION')
    await ownerPool.query('UPDATE departments SET is_active = false WHERE id = $1', [t.a.departmentId])
    await expectAppError(asOwnerA(ctx => createEmployee(ctx, { firstName: 'X', lastName: 'Y', locationId: t.a.locations[0], departmentId: t.a.departmentId })), 'VALIDATION')
  })

  it('validates required names', async () => {
    await expect(asOwnerA(ctx => createEmployee(ctx, { firstName: '', lastName: 'Y', locationId: t.a.locations[0] }))).rejects.toThrow(/Ad gerekli/)
  })

  it('MANAGER manages employees of assigned locations only', async () => {
    const created = await asManagerA(ctx => createEmployee(ctx, { firstName: 'Mert', lastName: 'Aydın', locationId: t.a.locations[0], departmentId: t.a.departmentId }))
    await asManagerA(ctx => updateEmployee(ctx, created.id, { lastName: 'Aydın Er' }))
    await asManagerA(ctx => setEmployeeArchived(ctx, created.id, true))

    await expectAppError(asManagerA(ctx => listEmployees(ctx, { locationId: t.a.locations[1] })), 'FORBIDDEN')
    await expectAppError(asManagerA(ctx => createEmployee(ctx, { firstName: 'X', lastName: 'Y', locationId: t.a.locations[1] })), 'FORBIDDEN')
    await expectAppError(asManagerA(ctx => getEmployee(ctx, t.a.employees[1])), 'NOT_FOUND')
    await expectAppError(asManagerA(ctx => setEmployeeArchived(ctx, t.a.employees[1], true)), 'NOT_FOUND')
    await expectAppError(asManagerA(ctx => updateEmployee(ctx, t.a.employees[0], { locationId: t.a.locations[1] })), 'FORBIDDEN')
  })

  it('an OWNER of another organization cannot read or modify these employees', async () => {
    await expectAppError(asOwnerB(ctx => getEmployee(ctx, t.a.employees[0])), 'NOT_FOUND')
    await expectAppError(asOwnerB(ctx => updateEmployee(ctx, t.a.employees[0], { firstName: 'Hacked' })), 'NOT_FOUND')
    await expectAppError(asOwnerB(ctx => setEmployeeArchived(ctx, t.a.employees[0], true)), 'NOT_FOUND')
    await expectAppError(asOwnerB(ctx => listEmployees(ctx, { locationId: t.a.locations[0] })), 'FORBIDDEN')
    await expectAppError(asOwnerB(ctx => createEmployee(ctx, { firstName: 'X', lastName: 'Y', locationId: t.a.locations[0] })), 'FORBIDDEN')
  })

  it('writes an audit trail', async () => {
    await asOwnerA(ctx => setEmployeeArchived(ctx, t.a.employees[0], true))
    const { rows } = await ownerPool.query(`SELECT action, actor_user_id FROM audit_logs WHERE entity_id = $1`, [t.a.employees[0]])
    expect(rows).toEqual([{ action: 'employee.archived', actor_user_id: t.a.owner.id }])
  })
})
