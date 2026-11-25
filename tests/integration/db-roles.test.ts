import { afterAll, describe, expect, it } from 'vitest'
import { appPool, closeConnections, expectDbError, ownerPool } from './helpers'

afterAll(closeConnections)

describe('runtime database role', () => {
  it('connects as rotiqa_app, which is not superuser and cannot bypass RLS', async () => {
    const { rows } = await appPool.query(`SELECT current_user, r.rolsuper, r.rolbypassrls, r.rolcreatedb, r.rolcreaterole FROM pg_roles r WHERE r.rolname = current_user`)
    expect(rows[0]).toEqual({ current_user: 'rotiqa_app', rolsuper: false, rolbypassrls: false, rolcreatedb: false, rolcreaterole: false })
  })

  it('owns no tables (so RLS always applies to it)', async () => {
    const { rows } = await ownerPool.query(`SELECT count(*)::int AS n FROM pg_class WHERE relowner = 'rotiqa_app'::regrole`)
    expect(rows[0].n).toBe(0)
  })

  it('has RLS enabled on every tenant-owned table', async () => {
    const { rows } = await ownerPool.query(`SELECT relname FROM pg_class WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity ORDER BY relname`)
    expect(rows.map(r => r.relname)).toEqual([
      'audit_logs', 'departments', 'employees', 'invitation_locations', 'invitations',
      'location_access', 'locations', 'memberships', 'organizations',
      'schedule_change_sets', 'schedule_weeks', 'shift_assignments', 'shift_codes',
    ])
  })

  it('cannot run DDL', async () => {
    expect(await expectDbError(appPool.query('CREATE TABLE intruder (id int)'))).toMatch(/permission denied/)
    expect(await expectDbError(appPool.query('ALTER TABLE employees DISABLE ROW LEVEL SECURITY'))).toMatch(/must be owner/)
    expect(await expectDbError(appPool.query('CREATE SCHEMA intruder'))).toMatch(/permission denied/)
  })

  it('cannot truncate, hard-delete staff, or touch the migrations table', async () => {
    expect(await expectDbError(appPool.query('TRUNCATE employees'))).toMatch(/permission denied/)
    expect(await expectDbError(appPool.query('DELETE FROM employees'))).toMatch(/permission denied/)
    expect(await expectDbError(appPool.query('DELETE FROM organizations'))).toMatch(/permission denied/)
    expect(await expectDbError(appPool.query('SELECT * FROM _prisma_migrations'))).toMatch(/permission denied/)
  })

  it('has exactly the privileges Better Auth needs on its tables', async () => {
    const { rows } = await ownerPool.query(`
      SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
      FROM information_schema.role_table_grants
      WHERE grantee = 'rotiqa_app' AND table_name IN ('users', 'sessions', 'accounts', 'verifications')
      GROUP BY table_name ORDER BY table_name`)
    expect(rows).toEqual([
      { table_name: 'accounts', privileges: 'INSERT,SELECT,UPDATE' },
      { table_name: 'sessions', privileges: 'DELETE,INSERT,SELECT,UPDATE' },
      { table_name: 'users', privileges: 'INSERT,SELECT,UPDATE' },
      { table_name: 'verifications', privileges: 'DELETE,INSERT,SELECT,UPDATE' },
    ])
  })

  it('has least-privilege grants on scheduling tables (no DDL, append-only change sets)', async () => {
    const { rows } = await ownerPool.query(`
      SELECT table_name, string_agg(privilege_type, ',' ORDER BY privilege_type) AS privileges
      FROM information_schema.role_table_grants
      WHERE grantee = 'rotiqa_app' AND table_name IN ('shift_codes', 'schedule_weeks', 'shift_assignments', 'schedule_change_sets')
      GROUP BY table_name ORDER BY table_name`)
    expect(rows).toEqual([
      { table_name: 'schedule_change_sets', privileges: 'INSERT,SELECT' },
      { table_name: 'schedule_weeks', privileges: 'INSERT,SELECT,UPDATE' },
      { table_name: 'shift_assignments', privileges: 'DELETE,INSERT,SELECT,UPDATE' },
      { table_name: 'shift_codes', privileges: 'INSERT,SELECT,UPDATE' },
    ])
  })

  it('app helper functions are not executable by PUBLIC and run with a fixed search_path', async () => {
    const { rows } = await ownerPool.query(`
      SELECT p.proname,
             has_function_privilege('public', p.oid, 'EXECUTE') AS public_exec,
             p.prosecdef AS security_definer,
             p.proconfig
      FROM pg_proc p WHERE p.pronamespace = 'app'::regnamespace ORDER BY p.proname`)
    for (const fn of rows) {
      expect(fn.public_exec, fn.proname).toBe(false)
      expect(fn.proconfig, fn.proname).toContain('search_path=pg_catalog')
    }
    expect(rows.filter(fn => fn.security_definer).map(fn => fn.proname).sort()).toEqual([
      'accept_invitation', 'can_access_location', 'invitation_preview', 'is_member', 'is_owner', 'org_has_members',
    ])
  })
})
