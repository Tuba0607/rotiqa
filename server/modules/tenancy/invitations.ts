import { createHash, randomBytes } from 'node:crypto'
import type { PrismaClient } from '../../generated/prisma/client'
import { createInvitationSchema } from '../../../shared/schemas/tenancy'
import { recordAudit } from '../audit/audit'
import { AppError, type AppErrorCode } from '../errors'
import { requireOwner, type OrgContext } from './access'
import { withTenant } from './context'

export const INVITATION_TTL_DAYS = 7

export type InvitationStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED'

/** The secret travels only in the link; the database stores its SHA-256 hash. */
export function hashInvitationToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

function createToken(): string {
  return randomBytes(32).toString('base64url')
}

/** Tokens are 43 base64url characters; anything else is rejected before touching the DB. */
export function isWellFormedToken(token: string): boolean {
  return /^[\w-]{43}$/.test(token)
}

function statusOf(inv: { acceptedAt: Date | null, revokedAt: Date | null, expiresAt: Date }, now = new Date()): InvitationStatus {
  if (inv.revokedAt) return 'REVOKED'
  if (inv.acceptedAt) return 'ACCEPTED'
  if (inv.expiresAt <= now) return 'EXPIRED'
  return 'PENDING'
}

/**
 * Creates a MANAGER invitation for the given locations and returns the one-time token.
 * No email is sent: the owner copies the link and shares it.
 */
export async function createInvitation(ctx: OrgContext, rawInput: unknown) {
  requireOwner(ctx)
  const input = createInvitationSchema.parse(rawInput)
  const locationIds = [...new Set(input.locationIds)]

  const locations = await ctx.tx.location.findMany({ where: { id: { in: locationIds }, organizationId: ctx.organization.id, isActive: true }, select: { id: true } })
  if (locations.length !== locationIds.length) throw new AppError('VALIDATION', 'Seçilen şubelerden biri geçersiz.', { locationIds: 'Seçilen şubelerden biri geçersiz.' })

  const alreadyMember = await ctx.tx.membership.findFirst({ where: { organizationId: ctx.organization.id, user: { email: input.email } }, select: { id: true } })
  if (alreadyMember) throw new AppError('CONFLICT', 'Bu e-posta adresi zaten işletmenin üyesi.', { email: 'Bu e-posta adresi zaten işletmenin üyesi.' })

  const token = createToken()
  const invitation = await ctx.tx.invitation.create({
    data: {
      organizationId: ctx.organization.id,
      email: input.email,
      role: 'MANAGER',
      tokenHash: hashInvitationToken(token),
      expiresAt: new Date(Date.now() + INVITATION_TTL_DAYS * 24 * 60 * 60 * 1000),
      invitedById: ctx.userId,
    },
    select: { id: true, email: true, expiresAt: true },
  })
  await ctx.tx.invitationLocation.createMany({
    data: locationIds.map(locationId => ({ invitationId: invitation.id, locationId, organizationId: ctx.organization.id })),
  })
  await recordAudit(ctx.tx, { organizationId: ctx.organization.id, actorUserId: ctx.userId, action: 'invitation.created', entityType: 'invitation', entityId: invitation.id, metadata: { locationIds } })
  return { ...invitation, token }
}

export async function listInvitations(ctx: OrgContext) {
  requireOwner(ctx)
  const invitations = await ctx.tx.invitation.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      email: true,
      role: true,
      expiresAt: true,
      acceptedAt: true,
      revokedAt: true,
      createdAt: true,
      locations: { select: { location: { select: { id: true, name: true } } } },
    },
  })
  return invitations.map(({ locations, ...inv }) => ({ ...inv, status: statusOf(inv), locations: locations.map(l => l.location) }))
}

export async function revokeInvitation(ctx: OrgContext, invitationId: string) {
  requireOwner(ctx)
  const invitation = await ctx.tx.invitation.findFirst({ where: { id: invitationId, organizationId: ctx.organization.id }, select: { id: true, acceptedAt: true, revokedAt: true, expiresAt: true } })
  if (!invitation) throw new AppError('NOT_FOUND', 'Davet bulunamadı.')
  if (statusOf(invitation) !== 'PENDING') throw new AppError('CONFLICT', 'Yalnızca bekleyen davetler iptal edilebilir.')
  await ctx.tx.invitation.update({ where: { id: invitationId }, data: { revokedAt: new Date() } })
  await recordAudit(ctx.tx, { organizationId: ctx.organization.id, actorUserId: ctx.userId, action: 'invitation.revoked', entityType: 'invitation', entityId: invitationId })
}

/** Public preview for the acceptance page: organization name, invited email and status. */
export async function previewInvitation(prisma: PrismaClient, token: string) {
  if (!isWellFormedToken(token)) throw new AppError('INVITATION_INVALID')
  const rows = await prisma.$queryRaw<{ organization_name: string, email: string, status: InvitationStatus }[]>`
    SELECT * FROM app.invitation_preview(${hashInvitationToken(token)})`
  const row = rows[0]
  if (!row) throw new AppError('INVITATION_INVALID')
  return { organizationName: row.organization_name, email: row.email, status: row.status }
}

const ACCEPT_ERRORS: Record<string, AppErrorCode> = {
  INVITATION_NOT_FOUND: 'INVITATION_INVALID',
  INVITATION_UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVITATION_REVOKED: 'INVITATION_REVOKED',
  INVITATION_ALREADY_USED: 'INVITATION_USED',
  INVITATION_EXPIRED: 'INVITATION_EXPIRED',
  INVITATION_EMAIL_MISMATCH: 'INVITATION_EMAIL_MISMATCH',
  INVITATION_ALREADY_MEMBER: 'INVITATION_ALREADY_MEMBER',
}

/** Accepts an invitation for the signed-in user via app.accept_invitation() (atomic, single-use). */
export async function acceptInvitation(prisma: PrismaClient, userId: string, token: string): Promise<{ slug: string }> {
  if (!isWellFormedToken(token)) throw new AppError('INVITATION_INVALID')
  try {
    return await withTenant(prisma, { userId }, async (tx) => {
      const [row] = await tx.$queryRaw<{ organization_id: string }[]>`
        SELECT app.accept_invitation(${hashInvitationToken(token)}) AS organization_id`
      const organization = await tx.organization.findUniqueOrThrow({ where: { id: row!.organization_id }, select: { slug: true } })
      return organization
    })
  }
  catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    const match = Object.keys(ACCEPT_ERRORS).find(key => message.includes(key))
    if (match) throw new AppError(ACCEPT_ERRORS[match]!)
    throw error
  }
}
