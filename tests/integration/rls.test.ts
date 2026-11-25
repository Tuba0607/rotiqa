import { randomUUID } from 'node:crypto'
import pg from 'pg'
import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { seedTwoTenants, type TwoTenants } from './fixtures'
import { asApp, closeConnections, createUser, expectDbError, ownerPool, resetDatabase } from './helpers'

/**
 * Database-level isolation, independent of the application layer: every query here runs as
 * the restricted runtime role with raw SQL, the way an attacker with a bug in a handler would.
 */

const TENANT_TABLES = ['organizations', 'locations', 'memberships', 'location_access', 'departments', 'employees', 'invitations', 'invitation_locations', 'audit_logs']

let t: TwoTenants

beforeEach(async () => {
  await resetDatabase()
  t = await seedTwoTenants()
})

afterAll(closeConnections)

const count = async (client: pg.PoolClient, table: string, where = 'true', params: unknown[] = []) =>
  (await client.query(`SELECT count(*)::int AS n FROM ${table} WHERE ${where}`, params)).rows[0].n as number

describe('without tenant context', () => {
  it('sees no rows in any tenant table (fails closed)', async () => {
    await asApp({}, async (client) => {
      for (const table of TENANT_TABLES) expect(await count(client, table), table).toBe(0)
    })
  })
})

describe('cross-organization isolation (A must not reach B)', () => {
  const asOwnerA = <T>(fn: (c: pg.PoolClient) => Promise<T>, org = () => t.a.orgId) => asApp({ userId: t.a.owner.id, organizationId: org() }, fn)

  it('reads only its own organization data', async () => {
    await asOwnerA(async (client) => {
      expect(await count(client, 'employees')).toBe(2)
      expect(await count(client, 'employees', 'organization_id = $1', [t.b.orgId])).toBe(0)
      expect(await count(client, 'locations', 'organization_id = $1', [t.b.orgId])).toBe(0)
      expect(await count(client, 'departments', 'organization_id = $1', [t.b.orgId])).toBe(0)
      expect(await count(client, 'organizations', 'id = $1', [t.b.orgId])).toBe(0)
      expect(await count(client, 'memberships', 'organization_id = $1', [t.b.orgId])).toBe(0)
    })
  })

  it('gains nothing by pointing app.org_id at another organization', async () => {
    await asOwnerA(async (client) => {
      for (const table of TENANT_TABLES.filter(name => name !== 'organizations' && name !== 'memberships')) {
        expect(await count(client, table), table).toBe(0)
      }
      // Own memberships stay visible (organization switcher), foreign ones do not.
      expect(await count(client, 'memberships', 'organization_id = $1', [t.b.orgId])).toBe(0)
    }, () => t.b.orgId)
  })

  it('cannot update or delete B rows, even by id', async () => {
    await asOwnerA(async (client) => {
      const update = await client.query(`UPDATE employees SET first_name = 'Hacked' WHERE id = $1`, [t.b.employees[0]])
      expect(update.rowCount).toBe(0)
      const dept = await client.query(`UPDATE departments SET name = 'Hacked' WHERE id = $1`, [t.b.departmentId])
      expect(dept.rowCount).toBe(0)
      const org = await client.query(`UPDATE organizations SET name = 'Hacked' WHERE id = $1`, [t.b.orgId])
      expect(org.rowCount).toBe(0)
      const del = await client.query(`DELETE FROM memberships WHERE organization_id = $1`, [t.b.orgId])
      expect(del.rowCount).toBe(0)
    }, () => t.b.orgId)

    const { rows } = await ownerPool.query(`SELECT first_name FROM employees WHERE id = $1`, [t.b.employees[0]])
    expect(rows[0].first_name).toBe('PersonelB1')
  })

  it('cannot insert rows into B', async () => {
    const message = await asOwnerA(client => expectDbError(client.query(
      `INSERT INTO employees (id, organization_id, location_id, first_name, last_name, is_active, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, 'X', 'Y', true, 0, now(), now())`,
      [randomUUID(), t.b.orgId, t.b.locations[0]],
    )), () => t.b.orgId)
    expect(message).toMatch(/row-level security/)
  })

  it('cannot attach an A employee to a B location or department (composite foreign keys)', async () => {
    const toLocation = await asOwnerA(client => expectDbError(client.query(`UPDATE employees SET location_id = $1 WHERE id = $2`, [t.b.locations[0], t.a.employees[0]])))
    expect(toLocation).toMatch(/row-level security|foreign key/)
    const toDepartment = await asOwnerA(client => expectDbError(client.query(`UPDATE employees SET department_id = $1 WHERE id = $2`, [t.b.departmentId, t.a.employees[0]])))
    expect(toDepartment).toMatch(/foreign key/)
  })

  it('cannot add itself to B as OWNER or MANAGER', async () => {
    for (const role of ['OWNER', 'MANAGER']) {
      const message = await asOwnerA(client => expectDbError(client.query(
        `INSERT INTO memberships (id, user_id, organization_id, role, created_at, updated_at) VALUES ($1, $2, $3, $4, now(), now())`,
        [randomUUID(), t.a.owner.id, t.b.orgId, role],
      )), () => t.b.orgId)
      expect(message).toMatch(/row-level security/)
    }
  })

  it('a non-member cannot see an organization at all', async () => {
    const outsider = await createUser('Dışarıdan')
    await asApp({ userId: outsider.id, organizationId: t.a.orgId }, async (client) => {
      for (const table of TENANT_TABLES) expect(await count(client, table), table).toBe(0)
    })
  })
})

describe('manager location restrictions (same organization)', () => {
  const asManager = <T>(fn: (c: pg.PoolClient) => Promise<T>) => asApp({ userId: t.managerA.id, organizationId: t.a.orgId }, fn)

  it('sees only assigned locations and their employees', async () => {
    await asManager(async (client) => {
      const locations = (await client.query('SELECT id FROM locations')).rows.map(r => r.id)
      expect(locations).toEqual([t.a.locations[0]])
      const employees = (await client.query('SELECT id FROM employees')).rows.map(r => r.id)
      expect(employees).toEqual([t.a.employees[0]])
    })
  })

  it('cannot read, update or create employees in an unassigned location', async () => {
    await asManager(async (client) => {
      const update = await client.query(`UPDATE employees SET first_name = 'Hacked' WHERE id = $1`, [t.a.employees[1]])
      expect(update.rowCount).toBe(0)
    })
    const insert = await asManager(client => expectDbError(client.query(
      `INSERT INTO employees (id, organization_id, location_id, first_name, last_name, is_active, sort_order, created_at, updated_at)
       VALUES ($1, $2, $3, 'X', 'Y', true, 0, now(), now())`,
      [randomUUID(), t.a.orgId, t.a.locations[1]],
    )))
    expect(insert).toMatch(/row-level security/)
  })

  it('cannot move an employee into an unassigned location', async () => {
    const message = await asManager(client => expectDbError(client.query(`UPDATE employees SET location_id = $1 WHERE id = $2`, [t.a.locations[1], t.a.employees[0]])))
    expect(message).toMatch(/row-level security/)
  })

  it('can manage employees in the assigned location', async () => {
    await asManager(async (client) => {
      const update = await client.query(`UPDATE employees SET is_active = false, archived_at = now() WHERE id = $1`, [t.a.employees[0]])
      expect(update.rowCount).toBe(1)
      await client.query(
        `INSERT INTO employees (id, organization_id, location_id, first_name, last_name, is_active, sort_order, created_at, updated_at)
         VALUES ($1, $2, $3, 'Yeni', 'Kişi', true, 1, now(), now())`,
        [randomUUID(), t.a.orgId, t.a.locations[0]],
      )
    })
  })

  it('reads departments but cannot create or change them, nor locations, invitations or access', async () => {
    await asManager(async (client) => {
      expect(await count(client, 'departments')).toBe(1)
      expect((await client.query(`UPDATE departments SET name = 'X' WHERE id = $1`, [t.a.departmentId])).rowCount).toBe(0)
      expect((await client.query(`UPDATE locations SET name = 'X' WHERE id = $1`, [t.a.locations[0]])).rowCount).toBe(0)
      expect(await count(client, 'invitations')).toBe(0)
    })
    const attempts = [
      [`INSERT INTO departments (id, organization_id, name, color, sort_order, is_active, created_at, updated_at) VALUES ($1, $2, 'Bar', '#1E5F5A', 1, true, now(), now())`, [randomUUID(), t.a.orgId]],
      [`INSERT INTO locations (id, organization_id, name, timezone, is_active, created_at, updated_at) VALUES ($1, $2, 'Yeni', 'Europe/Istanbul', true, now(), now())`, [randomUUID(), t.a.orgId]],
      [`INSERT INTO location_access (membership_id, location_id, organization_id, created_at) VALUES ($1, $2, $3, now())`, [t.managerMembershipId, t.a.locations[1], t.a.orgId]],
      [`UPDATE memberships SET role = 'OWNER' WHERE id = $1 RETURNING id`, [t.managerMembershipId]],
    ] as const
    for (const [sql, params] of attempts) {
      const result = await asManager(async (client) => {
        try {
          const res = await client.query(sql, [...params])
          return res.rowCount === 0 ? 'blocked' : 'ALLOWED'
        }
        catch (error) {
          return /row-level security/.test((error as Error).message) ? 'blocked' : (error as Error).message
        }
      })
      expect(result, sql).toBe('blocked')
    }
  })
})

describe('organization bootstrap', () => {
  it('lets a user create an organization and become its first OWNER', async () => {
    const user = await createUser('Yeni Sahip')
    const orgId = randomUUID()
    await asApp({ userId: user.id }, async (client) => {
      await client.query(`INSERT INTO organizations (id, name, slug, created_by_id, created_at, updated_at) VALUES ($1, 'Yeni', $2, $3, now(), now())`, [orgId, `yeni-${orgId.slice(0, 6)}`, user.id])
      await client.query(`INSERT INTO memberships (id, user_id, organization_id, role, created_at, updated_at) VALUES ($1, $2, $3, 'OWNER', now(), now())`, [randomUUID(), user.id, orgId])
    })
  })

  it('cannot create an organization on behalf of someone else', async () => {
    const user = await createUser()
    const message = await asApp({ userId: user.id }, client => expectDbError(client.query(
      `INSERT INTO organizations (id, name, slug, created_by_id, created_at, updated_at) VALUES ($1, 'X', 'x-y', $2, now(), now())`,
      [randomUUID(), t.a.owner.id],
    )))
    expect(message).toMatch(/row-level security/)
  })

  it('the creator cannot re-add themselves once the organization has members', async () => {
    // Creator of A who is (hypothetically) no longer a member must not regain OWNER.
    await ownerPool.query(`DELETE FROM memberships WHERE user_id = $1 AND organization_id = $2`, [t.a.owner.id, t.a.orgId])
    const message = await asApp({ userId: t.a.owner.id }, client => expectDbError(client.query(
      `INSERT INTO memberships (id, user_id, organization_id, role, created_at, updated_at) VALUES ($1, $2, $3, 'OWNER', now(), now())`,
      [randomUUID(), t.a.owner.id, t.a.orgId],
    )))
    expect(message).toMatch(/row-level security/)
  })
})

describe('pooled connections', () => {
  it('do not leak tenant context to the next transaction', async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, max: 1 })
    try {
      const client = await pool.connect()
      const pid = (await client.query('SELECT pg_backend_pid() AS pid')).rows[0].pid
      await client.query('BEGIN')
      await client.query(`SELECT set_config('app.user_id', $1, true), set_config('app.org_id', $2, true)`, [t.a.owner.id, t.a.orgId])
      expect(await count(client, 'employees')).toBe(2)
      await client.query('COMMIT')
      client.release()

      const next = await pool.connect()
      expect((await next.query('SELECT pg_backend_pid() AS pid')).rows[0].pid).toBe(pid) // same physical connection
      const settings = (await next.query(`SELECT app.current_user_id() AS u, app.current_org_id() AS o`)).rows[0]
      expect(settings).toEqual({ u: null, o: null })
      expect(await count(next, 'employees')).toBe(0)
      next.release()
    }
    finally {
      await pool.end()
    }
  })
})
