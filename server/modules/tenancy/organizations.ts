import type { PrismaClient } from '../../generated/prisma/client'
import { createOrganizationSchema, updateOrganizationSchema } from '../../../shared/schemas/tenancy'
import { slugify } from '../../../shared/utils/slug'
import { recordAudit } from '../audit/audit'
import { createDefaultShiftCodes } from '../scheduling/shift-codes'
import { AppError, isUniqueViolation } from '../errors'
import type { OrgContext } from './access'
import { requireOwner } from './access'
import { setTenantOrganization, withTenant } from './context'

export interface OrganizationSummary {
  id: string
  name: string
  slug: string
  role: 'OWNER' | 'MANAGER'
}

/** Organizations the user belongs to, for the switcher and post-login redirect. */
export async function listMyOrganizations(prisma: PrismaClient, userId: string): Promise<OrganizationSummary[]> {
  return withTenant(prisma, { userId }, async (tx) => {
    const memberships = await tx.membership.findMany({
      where: { userId },
      select: { role: true, organization: { select: { id: true, name: true, slug: true } } },
      orderBy: { createdAt: 'asc' },
    })
    return memberships.map(m => ({ ...m.organization, role: m.role }))
  })
}

const SLUG_ATTEMPTS = 4

function randomSuffix(): string {
  return Math.random().toString(36).slice(2, 6)
}

/**
 * Onboarding: creates the organization, the creator's OWNER membership and the first
 * location in one transaction. Either all three exist afterwards or none do.
 */
export async function createOrganization(prisma: PrismaClient, userId: string, rawInput: unknown): Promise<OrganizationSummary> {
  const input = createOrganizationSchema.parse(rawInput)

  // Guard against double submissions: the same owner cannot create two businesses with the same name.
  const existing = await listMyOrganizations(prisma, userId)
  if (existing.some(org => org.role === 'OWNER' && org.name.toLocaleLowerCase('tr-TR') === input.name.toLocaleLowerCase('tr-TR'))) {
    throw new AppError('CONFLICT', 'Bu isimde bir işletmeniz zaten var.', { name: 'Bu isimde bir işletmeniz zaten var.' })
  }

  const base = slugify(input.name)
  for (let attempt = 0; attempt < SLUG_ATTEMPTS; attempt++) {
    // Other tenants' slugs are invisible under RLS, so uniqueness is enforced by the
    // database: on conflict the whole transaction rolls back and retries with a suffix.
    const slug = attempt === 0 ? base : `${base}-${randomSuffix()}`
    try {
      return await withTenant(prisma, { userId }, async (tx) => {
        const organization = await tx.organization.create({
          data: { name: input.name, slug, createdById: userId },
          select: { id: true, name: true, slug: true },
        })
        await tx.membership.create({ data: { userId, organizationId: organization.id, role: 'OWNER' } })
        await setTenantOrganization(tx, organization.id)
        const location = await tx.location.create({
          data: { organizationId: organization.id, name: input.locationName, timezone: input.timezone },
          select: { id: true },
        })
        await createDefaultShiftCodes(tx, organization.id)
        await recordAudit(tx, { organizationId: organization.id, actorUserId: userId, action: 'organization.created', entityType: 'organization', entityId: organization.id, metadata: { firstLocationId: location.id } })
        return { ...organization, role: 'OWNER' as const }
      })
    }
    catch (error) {
      if (isUniqueViolation(error) && attempt < SLUG_ATTEMPTS - 1) continue
      throw error
    }
  }
  throw new AppError('CONFLICT', 'İşletme oluşturulamadı. Lütfen tekrar deneyin.')
}

export async function getOrganizationOverview(ctx: OrgContext) {
  const isOwner = ctx.role === 'OWNER'
  const [locations, activeEmployees, departments, managers, pendingInvitations] = await Promise.all([
    ctx.tx.location.findMany({ where: { organizationId: ctx.organization.id }, orderBy: { createdAt: 'asc' }, select: { id: true, name: true, timezone: true, isActive: true } }),
    ctx.tx.employee.count({ where: { organizationId: ctx.organization.id, isActive: true } }),
    ctx.tx.department.count({ where: { organizationId: ctx.organization.id, isActive: true } }),
    // Team setup progress is only relevant (and, for invitations, only visible under RLS) to the OWNER.
    isOwner ? ctx.tx.membership.count({ where: { organizationId: ctx.organization.id, role: 'MANAGER' } }) : 0,
    isOwner ? ctx.tx.invitation.count({ where: { organizationId: ctx.organization.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }) : 0,
  ])
  return {
    organization: ctx.organization,
    role: ctx.role,
    locations,
    stats: { activeEmployees, departments, locations: locations.length, managers, pendingInvitations },
  }
}

export async function updateOrganization(ctx: OrgContext, rawInput: unknown) {
  requireOwner(ctx)
  const input = updateOrganizationSchema.parse(rawInput)
  const organization = await ctx.tx.organization.update({ where: { id: ctx.organization.id }, data: { name: input.name }, select: { id: true, name: true, slug: true } })
  await recordAudit(ctx.tx, { organizationId: organization.id, actorUserId: ctx.userId, action: 'organization.updated', entityType: 'organization', entityId: organization.id })
  return organization
}

/** Members and their location access. OWNER only. */
export async function listMembers(ctx: OrgContext) {
  requireOwner(ctx)
  const members = await ctx.tx.membership.findMany({
    where: { organizationId: ctx.organization.id },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true,
      role: true,
      user: { select: { name: true, email: true } },
      locationAccess: { select: { location: { select: { id: true, name: true } } } },
    },
  })
  return members.map(m => ({ id: m.id, role: m.role, name: m.user.name, email: m.user.email, locations: m.locationAccess.map(a => a.location) }))
}
