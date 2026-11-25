import { employeeListQuerySchema, employeeSchema, reorderEmployeesSchema, updateEmployeeSchema } from '../../../shared/schemas/staff'
import { recordAudit } from '../audit/audit'
import { AppError } from '../errors'
import { requireLocationAccess, type OrgContext } from '../tenancy/access'

const select = {
  id: true,
  firstName: true,
  lastName: true,
  locationId: true,
  isActive: true,
  archivedAt: true,
  sortOrder: true,
  department: { select: { id: true, name: true, color: true } },
} as const

/**
 * Employees belong to one location. OWNERs and MANAGERs with access to that location can
 * add, edit, archive and reactivate them (enforced here and by RLS). Employees are never
 * deleted: archived rows stay referenceable by future schedules and timesheets.
 */
export async function listEmployees(ctx: OrgContext, rawQuery: unknown) {
  const query = employeeListQuerySchema.parse(rawQuery)
  await requireLocationAccess(ctx, query.locationId)
  return ctx.tx.employee.findMany({
    where: { organizationId: ctx.organization.id, locationId: query.locationId, isActive: query.status === 'active' },
    orderBy: [{ sortOrder: 'asc' }, { lastName: 'asc' }, { firstName: 'asc' }, { id: 'asc' }],
    select,
  })
}

async function findEmployee(ctx: OrgContext, employeeId: string) {
  // RLS hides employees of locations the user cannot access.
  const employee = await ctx.tx.employee.findFirst({ where: { id: employeeId, organizationId: ctx.organization.id }, select })
  if (!employee) throw new AppError('NOT_FOUND', 'Personel bulunamadı.')
  return employee
}

export const getEmployee = findEmployee

async function requireActiveDepartment(ctx: OrgContext, departmentId: string | null | undefined): Promise<void> {
  if (!departmentId) return
  const department = await ctx.tx.department.findFirst({ where: { id: departmentId, organizationId: ctx.organization.id, isActive: true }, select: { id: true } })
  if (!department) throw new AppError('VALIDATION', 'Geçersiz departman.', { departmentId: 'Geçersiz departman.' })
}

export async function createEmployee(ctx: OrgContext, rawInput: unknown) {
  const input = employeeSchema.parse(rawInput)
  const location = await requireLocationAccess(ctx, input.locationId)
  if (!location.isActive) throw new AppError('VALIDATION', 'Pasif bir şubeye personel eklenemez.', { locationId: 'Pasif bir şubeye personel eklenemez.' })
  await requireActiveDepartment(ctx, input.departmentId)

  const last = await ctx.tx.employee.aggregate({ where: { organizationId: ctx.organization.id, locationId: input.locationId }, _max: { sortOrder: true } })
  const employee = await ctx.tx.employee.create({
    data: {
      organizationId: ctx.organization.id,
      locationId: input.locationId,
      departmentId: input.departmentId ?? null,
      firstName: input.firstName,
      lastName: input.lastName,
      sortOrder: (last._max.sortOrder ?? -1) + 1,
    },
    select,
  })
  await recordAudit(ctx.tx, { organizationId: ctx.organization.id, actorUserId: ctx.userId, action: 'employee.created', entityType: 'employee', entityId: employee.id })
  return employee
}

export async function updateEmployee(ctx: OrgContext, employeeId: string, rawInput: unknown) {
  const input = updateEmployeeSchema.parse(rawInput)
  const current = await findEmployee(ctx, employeeId)
  if (input.locationId && input.locationId !== current.locationId) await requireLocationAccess(ctx, input.locationId)
  await requireActiveDepartment(ctx, input.departmentId)

  const employee = await ctx.tx.employee.update({ where: { id: employeeId }, data: input, select })
  await recordAudit(ctx.tx, { organizationId: ctx.organization.id, actorUserId: ctx.userId, action: 'employee.updated', entityType: 'employee', entityId: employeeId, metadata: input })
  return employee
}

export async function setEmployeeArchived(ctx: OrgContext, employeeId: string, archived: boolean) {
  const current = await findEmployee(ctx, employeeId)
  if (current.isActive === !archived) return current
  const employee = await ctx.tx.employee.update({
    where: { id: employeeId },
    data: { isActive: !archived, archivedAt: archived ? new Date() : null },
    select,
  })
  await recordAudit(ctx.tx, { organizationId: ctx.organization.id, actorUserId: ctx.userId, action: archived ? 'employee.archived' : 'employee.reactivated', entityType: 'employee', entityId: employeeId })
  return employee
}

/** Persists a new display order for the active employees of one location. */
export async function reorderEmployees(ctx: OrgContext, rawInput: unknown) {
  const input = reorderEmployeesSchema.parse(rawInput)
  await requireLocationAccess(ctx, input.locationId)
  const ids = [...new Set(input.employeeIds)]
  const found = await ctx.tx.employee.count({ where: { id: { in: ids }, organizationId: ctx.organization.id, locationId: input.locationId } })
  if (found !== ids.length || ids.length !== input.employeeIds.length) throw new AppError('VALIDATION', 'Sıralama listesi geçersiz.')
  for (const [index, id] of ids.entries()) {
    await ctx.tx.employee.update({ where: { id }, data: { sortOrder: index }, select: { id: true } })
  }
}
