import type { MembershipRole, PrismaClient } from '../../generated/prisma/client'
import { AppError } from '../errors'
import { setTenantOrganization, withTenant, type TenantTx } from './context'

/** Everything a request inside one organization needs. Built only from server-side lookups. */
export interface OrgContext {
  tx: TenantTx
  userId: string
  organization: { id: string, name: string, slug: string }
  membershipId: string
  role: MembershipRole
}

/**
 * Resolves the organization by slug for the current user and runs `fn` with the tenant
 * context set. The slug from the URL is never trusted on its own: the organization is
 * only found if RLS shows it to this user, and a membership must exist. Unknown and
 * foreign organizations are indistinguishable (both NOT_FOUND).
 */
export async function runInOrganization<T>(
  prisma: PrismaClient,
  userId: string,
  slug: string,
  fn: (ctx: OrgContext) => Promise<T>,
): Promise<T> {
  return withTenant(prisma, { userId }, async (tx) => {
    const organization = await tx.organization.findUnique({ where: { slug }, select: { id: true, name: true, slug: true } })
    const membership = organization
      ? await tx.membership.findUnique({ where: { userId_organizationId: { userId, organizationId: organization.id } }, select: { id: true, role: true } })
      : null
    if (!organization || !membership) throw new AppError('NOT_FOUND', 'İşletme bulunamadı.')

    await setTenantOrganization(tx, organization.id)
    return fn({ tx, userId, organization, membershipId: membership.id, role: membership.role })
  })
}

export function requireOwner(ctx: OrgContext): void {
  if (ctx.role !== 'OWNER') throw new AppError('FORBIDDEN', 'Bu işlem yalnızca Owner rolüyle yapılabilir.')
}

/** Throws unless the user may work with this location (OWNER: any; MANAGER: assigned). */
export async function requireLocationAccess(ctx: OrgContext, locationId: string): Promise<{ id: string, name: string, timezone: string, isActive: boolean }> {
  // RLS (app.can_access_location) decides visibility; an invisible location is forbidden.
  const location = await ctx.tx.location.findFirst({
    where: { id: locationId, organizationId: ctx.organization.id },
    select: { id: true, name: true, timezone: true, isActive: true },
  })
  if (!location) throw new AppError('FORBIDDEN', 'Bu şubeye erişim yetkiniz yok.')
  return location
}
