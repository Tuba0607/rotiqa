import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '../../server/modules/errors'
import { runInOrganization } from '../../server/modules/tenancy/access'
import { setTenantOrganization, withTenant } from '../../server/modules/tenancy/context'
import { createOrganization, getOrganizationOverview, listMembers, listMyOrganizations, updateOrganization } from '../../server/modules/tenancy/organizations'
import { appPrisma, closeConnections, createUser, ownerPool, resetDatabase, type TestUser } from './helpers'

let user: TestUser

beforeEach(async () => {
  await resetDatabase()
  user = await createUser('Kurucu')
})

afterAll(closeConnections)

describe('onboarding', () => {
  it('creates organization, OWNER membership and first location together', async () => {
    const org = await createOrganization(appPrisma, user.id, { name: 'Kordon Bistro', locationName: 'Alsancak' })
    expect(org).toMatchObject({ name: 'Kordon Bistro', slug: 'kordon-bistro', role: 'OWNER' })

    const overview = await runInOrganization(appPrisma, user.id, org.slug, ctx => getOrganizationOverview(ctx))
    expect(overview.locations).toEqual([expect.objectContaining({ name: 'Alsancak', timezone: 'Europe/Istanbul', isActive: true })])
    expect(await listMyOrganizations(appPrisma, user.id)).toEqual([{ id: org.id, name: 'Kordon Bistro', slug: 'kordon-bistro', role: 'OWNER' }])
  })

  it('gives a new organization the starter shift codes without hours', async () => {
    const org = await createOrganization(appPrisma, user.id, { name: 'Kordon Bistro', locationName: 'Alsancak' })
    const codes = await runInOrganization(appPrisma, user.id, org.slug, ctx => ctx.tx.shiftCode.findMany({
      orderBy: { sortOrder: 'asc' },
      select: { code: true, label: true, kind: true, color: true, startMinute: true, endMinute: true, isActive: true },
    }))
    expect(codes.map(c => c.code)).toEqual(['A', 'B', 'C', 'OFF', 'R', 'Y.İ'])
    expect(codes.every(c => c.startMinute === null && c.endMinute === null && c.isActive)).toBe(true)
    expect(codes.find(c => c.code === 'R')).toMatchObject({ kind: 'SICK', color: '#DC3545' })
  })

  it('is atomic: a failure after the organization insert leaves nothing behind', async () => {
    await expect(withTenant(appPrisma, { userId: user.id }, async (tx) => {
      const org = await tx.organization.create({ data: { name: 'Yarım', slug: 'yarim', createdById: user.id } })
      await tx.membership.create({ data: { userId: user.id, organizationId: org.id, role: 'OWNER' } })
      await setTenantOrganization(tx, org.id)
      await tx.location.create({ data: { organizationId: org.id, name: '   ' } }) // violates CHECK constraint
    })).rejects.toThrow()
    const { rows } = await ownerPool.query(`SELECT (SELECT count(*) FROM organizations)::int AS orgs, (SELECT count(*) FROM memberships)::int AS members`)
    expect(rows[0]).toEqual({ orgs: 0, members: 0 })
  })

  it('validates input in Turkish', async () => {
    await expect(createOrganization(appPrisma, user.id, { name: '', locationName: 'Merkez' })).rejects.toThrow('İşletme adı gerekli.')
    await expect(createOrganization(appPrisma, user.id, { name: 'X', locationName: 'Merkez', timezone: 'Nowhere/City' })).rejects.toThrow('Geçerli bir saat dilimi seçin.')
  })

  it('rejects a duplicate business name for the same owner (double submit)', async () => {
    await createOrganization(appPrisma, user.id, { name: 'Kordon Bistro', locationName: 'Alsancak' })
    await expect(createOrganization(appPrisma, user.id, { name: 'kordon bistro', locationName: 'Alsancak' }))
      .rejects.toSatisfy((error: unknown) => error instanceof AppError && error.code === 'CONFLICT')
  })

  it('gives different owners unique slugs for the same name', async () => {
    const other = await createUser()
    const first = await createOrganization(appPrisma, user.id, { name: 'Kordon Bistro', locationName: 'Alsancak' })
    const second = await createOrganization(appPrisma, other.id, { name: 'Kordon Bistro', locationName: 'Bornova' })
    expect(first.slug).toBe('kordon-bistro')
    expect(second.slug).toMatch(/^kordon-bistro-[a-z0-9]{4}$/)
  })

  it('supports users with several organizations', async () => {
    await createOrganization(appPrisma, user.id, { name: 'Kordon Bistro', locationName: 'Alsancak' })
    await createOrganization(appPrisma, user.id, { name: 'Ege Kafe', locationName: 'Bornova' })
    expect((await listMyOrganizations(appPrisma, user.id)).map(o => o.name)).toEqual(['Kordon Bistro', 'Ege Kafe'])
  })
})

describe('organization settings', () => {
  it('OWNER renames the organization and lists members', async () => {
    const org = await createOrganization(appPrisma, user.id, { name: 'Kordon Bistro', locationName: 'Alsancak' })
    const renamed = await runInOrganization(appPrisma, user.id, org.slug, ctx => updateOrganization(ctx, { name: 'Kordon Bistro & Bar' }))
    expect(renamed.name).toBe('Kordon Bistro & Bar')
    const members = await runInOrganization(appPrisma, user.id, org.slug, ctx => listMembers(ctx))
    expect(members).toEqual([expect.objectContaining({ role: 'OWNER', email: user.email })])
  })
})
