import { departmentSchema, updateDepartmentSchema } from '../../../shared/schemas/staff'
import { defaultDepartmentColor } from '../../../shared/utils/shift-codes'
import { recordAudit } from '../audit/audit'
import { AppError, isUniqueViolation } from '../errors'
import { requireOwner, type OrgContext } from '../tenancy/access'

const select = { id: true, name: true, color: true, sortOrder: true, isActive: true } as const

/** Departments are organization-wide. Every member reads them; only the OWNER writes. */
export function listDepartments(ctx: OrgContext, options: { includeInactive?: boolean } = {}) {
  return ctx.tx.department.findMany({
    where: { organizationId: ctx.organization.id, ...(options.includeInactive ? {} : { isActive: true }) },
    orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    select,
  })
}

function conflict(): AppError {
  return new AppError('CONFLICT', 'Bu isimde bir departman zaten var.', { name: 'Bu isimde bir departman zaten var.' })
}

export async function createDepartment(ctx: OrgContext, rawInput: unknown) {
  requireOwner(ctx)
  const input = departmentSchema.parse(rawInput)
  const count = await ctx.tx.department.count({ where: { organizationId: ctx.organization.id } })
  try {
    const department = await ctx.tx.department.create({
      data: { organizationId: ctx.organization.id, name: input.name, color: input.color ?? defaultDepartmentColor(count), sortOrder: count },
      select,
    })
    await recordAudit(ctx.tx, { organizationId: ctx.organization.id, actorUserId: ctx.userId, action: 'department.created', entityType: 'department', entityId: department.id })
    return department
  }
  catch (error) {
    if (isUniqueViolation(error)) throw conflict()
    throw error
  }
}

export async function updateDepartment(ctx: OrgContext, departmentId: string, rawInput: unknown) {
  requireOwner(ctx)
  const input = updateDepartmentSchema.parse(rawInput)
  const existing = await ctx.tx.department.findFirst({ where: { id: departmentId, organizationId: ctx.organization.id }, select: { id: true } })
  if (!existing) throw new AppError('NOT_FOUND', 'Departman bulunamadı.')
  try {
    const department = await ctx.tx.department.update({ where: { id: departmentId }, data: input, select })
    await recordAudit(ctx.tx, { organizationId: ctx.organization.id, actorUserId: ctx.userId, action: 'department.updated', entityType: 'department', entityId: department.id, metadata: input })
    return department
  }
  catch (error) {
    if (isUniqueViolation(error)) throw conflict()
    throw error
  }
}
