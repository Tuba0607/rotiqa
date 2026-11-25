import { afterAll, beforeEach, describe, expect, it } from 'vitest'
import { AppError } from '../../server/modules/errors'
import { runInOrganization } from '../../server/modules/tenancy/access'
import { acceptInvitation, createInvitation, hashInvitationToken, listInvitations, previewInvitation, revokeInvitation } from '../../server/modules/tenancy/invitations'
import { seedTwoTenants, type TwoTenants } from './fixtures'
import { appPrisma, asApp, closeConnections, createUser, expectDbError, ownerPool, resetDatabase, type TestUser } from './helpers'

let t: TwoTenants
let invitee: TestUser

beforeEach(async () => {
  await resetDatabase()
  t = await seedTwoTenants()
  invitee = await createUser('Davetli Müdür')
})

afterAll(closeConnections)

const asOwnerA = <T>(fn: Parameters<typeof runInOrganization<T>>[3]) => runInOrganization(appPrisma, t.a.owner.id, t.a.slug, fn)
const invite = (email = invitee.email, locationIds = [t.a.locations[1]]) => asOwnerA(ctx => createInvitation(ctx, { email, locationIds }))

async function expectAppError(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((error: unknown) => error instanceof AppError && error.code === code)
}

describe('creating invitations', () => {
  it('returns a one-time token and stores only its hash', async () => {
    const created = await invite()
    expect(created.token).toMatch(/^[\w-]{43}$/)
    const { rows } = await ownerPool.query('SELECT token_hash, email, role FROM invitations WHERE id = $1', [created.id])
    expect(rows[0]).toEqual({ token_hash: hashInvitationToken(created.token), email: invitee.email, role: 'MANAGER' })
    expect(rows[0].token_hash).not.toContain(created.token)
  })

  it('normalizes the email to lower case', async () => {
    const created = await invite(invitee.email.toUpperCase())
    expect(created.email).toBe(invitee.email)
  })

  it('only the OWNER can invite', async () => {
    await expectAppError(
      runInOrganization(appPrisma, t.managerA.id, t.a.slug, ctx => createInvitation(ctx, { email: invitee.email, locationIds: [t.a.locations[0]] })),
      'FORBIDDEN',
    )
  })

  it('rejects locations of another organization', async () => {
    await expectAppError(invite(invitee.email, [t.b.locations[0]]), 'VALIDATION')
  })

  it('rejects inviting an existing member', async () => {
    await expectAppError(invite(t.managerA.email), 'CONFLICT')
  })
})

describe('preview (SECURITY DEFINER app.invitation_preview)', () => {
  it('shows organization, email and status without authentication', async () => {
    const { token } = await invite()
    expect(await previewInvitation(appPrisma, token)).toEqual({ organizationName: 'İşletme A', email: invitee.email, status: 'PENDING' })
  })

  it('rejects unknown and malformed tokens', async () => {
    await expectAppError(previewInvitation(appPrisma, 'x'.repeat(43)), 'INVITATION_INVALID')
    await expectAppError(previewInvitation(appPrisma, '\'; DROP TABLE users; --'), 'INVITATION_INVALID')
  })

  it('exposes no other columns', async () => {
    const { token } = await invite()
    const columns = await asApp({}, async client => (await client.query('SELECT * FROM app.invitation_preview($1)', [hashInvitationToken(token)])).fields.map(f => f.name))
    expect(columns).toEqual(['organization_name', 'email', 'status'])
  })
})

describe('accepting (SECURITY DEFINER app.accept_invitation)', () => {
  it('creates a MANAGER membership limited to the invited locations', async () => {
    const { token } = await invite(invitee.email, [t.a.locations[1]])
    const result = await acceptInvitation(appPrisma, invitee.id, token)
    expect(result.slug).toBe(t.a.slug)

    const visible = await runInOrganization(appPrisma, invitee.id, t.a.slug, async ctx => ({
      role: ctx.role,
      locations: (await ctx.tx.location.findMany({ select: { id: true } })).map(l => l.id),
      employees: (await ctx.tx.employee.findMany({ select: { id: true } })).map(e => e.id),
    }))
    expect(visible).toEqual({ role: 'MANAGER', locations: [t.a.locations[1]], employees: [t.a.employees[1]] })
  })

  it('is single use', async () => {
    const { token } = await invite()
    await acceptInvitation(appPrisma, invitee.id, token)
    await expectAppError(acceptInvitation(appPrisma, invitee.id, token), 'INVITATION_USED')
  })

  it('cannot be accepted by a different account', async () => {
    const { token } = await invite()
    const other = await createUser('Başkası')
    await expectAppError(acceptInvitation(appPrisma, other.id, token), 'INVITATION_EMAIL_MISMATCH')
    const { rows } = await ownerPool.query('SELECT count(*)::int AS n FROM memberships WHERE user_id = $1', [other.id])
    expect(rows[0].n).toBe(0)
  })

  it('rejects expired invitations', async () => {
    const { id, token } = await invite()
    await ownerPool.query(`UPDATE invitations SET expires_at = now() - interval '1 minute' WHERE id = $1`, [id])
    await expectAppError(acceptInvitation(appPrisma, invitee.id, token), 'INVITATION_EXPIRED')
    expect((await previewInvitation(appPrisma, token)).status).toBe('EXPIRED')
  })

  it('rejects revoked invitations', async () => {
    const { id, token } = await invite()
    await asOwnerA(ctx => revokeInvitation(ctx, id))
    await expectAppError(acceptInvitation(appPrisma, invitee.id, token), 'INVITATION_REVOKED')
  })

  it('rejects unknown tokens', async () => {
    await expectAppError(acceptInvitation(appPrisma, invitee.id, 'a'.repeat(43)), 'INVITATION_INVALID')
  })

  it('requires an authenticated user context', async () => {
    const { token } = await invite()
    const message = await asApp({}, client => expectDbError(client.query('SELECT app.accept_invitation($1)', [hashInvitationToken(token)])))
    expect(message).toContain('INVITATION_UNAUTHENTICATED')
  })

  it('accepting twice concurrently yields exactly one membership', async () => {
    const { token } = await invite()
    const results = await Promise.allSettled([acceptInvitation(appPrisma, invitee.id, token), acceptInvitation(appPrisma, invitee.id, token)])
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(1)
    const { rows } = await ownerPool.query('SELECT count(*)::int AS n FROM memberships WHERE user_id = $1', [invitee.id])
    expect(rows[0].n).toBe(1)
  })

  it('an existing member cannot accept another invitation to the same organization', async () => {
    const { token } = await invite()
    await ownerPool.query(`UPDATE invitations SET email = $1`, [t.managerA.email])
    await expectAppError(acceptInvitation(appPrisma, t.managerA.id, token), 'INVITATION_ALREADY_MEMBER')
  })
})

describe('listing and revoking', () => {
  it('lists invitations with computed status, OWNER only', async () => {
    const pending = await invite()
    const revoked = await invite((await createUser()).email)
    await asOwnerA(ctx => revokeInvitation(ctx, revoked.id))
    const list = await asOwnerA(ctx => listInvitations(ctx))
    expect(Object.fromEntries(list.map(i => [i.id, i.status]))).toEqual({ [pending.id]: 'PENDING', [revoked.id]: 'REVOKED' })
    await expectAppError(runInOrganization(appPrisma, t.managerA.id, t.a.slug, ctx => listInvitations(ctx)), 'FORBIDDEN')
  })

  it('cannot revoke another organization’s invitation', async () => {
    const created = await invite()
    await expectAppError(runInOrganization(appPrisma, t.b.owner.id, t.b.slug, ctx => revokeInvitation(ctx, created.id)), 'NOT_FOUND')
  })
})
