import { locationSchema, updateLocationSchema } from '../../../shared/schemas/tenancy'
import { recordAudit } from '../audit/audit'
import { AppError, isUniqueViolation } from '../errors'
import { requireLocationAccess, requireOwner, type OrgContext } from './access'

const select = { id: true, name: true, timezone: true, isActive: true, createdAt: true } as const

/** Locations visible to the user (RLS: OWNER all, MANAGER assigned). */
export function listLocations(ctx: OrgContext) {
  return ctx.tx.location.findMany({ where: { organizationId: ctx.organization.id }, orderBy: [{ isActive: 'desc' }, { createdAt: 'asc' }], select })
}

export async function createLocation(ctx: OrgContext, rawInput: unknown) {
  requireOwner(ctx)
  const input = locationSchema.parse(rawInput)
  try {
    const location = await ctx.tx.location.create({ data: { ...input, organizationId: ctx.organization.id }, select })
    await recordAudit(ctx.tx, { organizationId: ctx.organization.id, actorUserId: ctx.userId, action: 'location.created', entityType: 'location', entityId: location.id })
    return location
  }
  catch (error) {
    if (isUniqueViolation(error)) throw new AppError('CONFLICT', 'Bu isimde bir şube zaten var.', { name: 'Bu isimde bir şube zaten var.' })
    throw error
  }
}

export async function updateLocation(ctx: OrgContext, locationId: string, rawInput: unknown) {
  requireOwner(ctx)
  const input = updateLocationSchema.parse(rawInput)
  await requireLocationAccess(ctx, locationId)
  try {
    const location = await ctx.tx.location.update({ where: { id: locationId }, data: input, select })
    await recordAudit(ctx.tx, { organizationId: ctx.organization.id, actorUserId: ctx.userId, action: 'location.updated', entityType: 'location', entityId: location.id, metadata: input })
    return location
  }
  catch (error) {
    if (isUniqueViolation(error)) throw new AppError('CONFLICT', 'Bu isimde bir şube zaten var.', { name: 'Bu isimde bir şube zaten var.' })
    throw error
  }
}
