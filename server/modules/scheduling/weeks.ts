import { weekQuerySchema } from '../../../shared/schemas/scheduling'
import type { WeekScheduleView } from '../../../shared/types/schedule'
import { currentWeekStart, startOfWeek, weekDays } from '../../../shared/utils/week'
import { requireLocationAccess, type OrgContext } from '../tenancy/access'
import { assignmentSelect, toDate, toScheduleCell } from './mapping'
import { listShiftCodes } from './shift-codes'

/**
 * The weekly planner view for one location. Read-only: it never creates a week row (that
 * happens on the first saved change). `week` may be any date; it is normalized to Monday.
 * Without `week`, the current week in the location's time zone is returned.
 */
export async function getWeekSchedule(ctx: OrgContext, rawQuery: unknown): Promise<WeekScheduleView> {
  const query = weekQuerySchema.parse(rawQuery)
  const location = await requireLocationAccess(ctx, query.locationId)
  const weekStart = query.week ? startOfWeek(query.week) : currentWeekStart(location.timezone)
  const organizationId = ctx.organization.id

  const [week, assignments] = await Promise.all([
    ctx.tx.scheduleWeek.findUnique({
      where: { organizationId_locationId_weekStart: { organizationId, locationId: location.id, weekStart: toDate(weekStart) } },
      select: { status: true, version: true },
    }),
    ctx.tx.shiftAssignment.findMany({
      where: { organizationId, locationId: location.id, weekStart: toDate(weekStart) },
      select: assignmentSelect,
    }),
  ])

  const referencedEmployees = [...new Set(assignments.map(a => a.employeeId))]
  const referencedCodes = [...new Set(assignments.map(a => a.shiftCodeId))]

  const [employees, departments, shiftCodes] = await Promise.all([
    ctx.tx.employee.findMany({
      // Active staff of this location, plus archived/moved staff who still have cells this week.
      where: { organizationId, OR: [{ locationId: location.id, isActive: true }, { id: { in: referencedEmployees } }] },
      select: { id: true, firstName: true, lastName: true, departmentId: true, sortOrder: true, isActive: true },
    }),
    ctx.tx.department.findMany({
      where: { organizationId },
      select: { id: true, name: true, color: true, sortOrder: true, isActive: true },
    }),
    listShiftCodes(ctx.tx, organizationId, { alsoIds: referencedCodes }),
  ])

  const departmentOrder = new Map(departments.map(d => [d.id, d.sortOrder]))
  employees.sort((a, b) => {
    const da = a.departmentId ? departmentOrder.get(a.departmentId) ?? 9999 : 10_000
    const db = b.departmentId ? departmentOrder.get(b.departmentId) ?? 9999 : 10_000
    return da - db || a.sortOrder - b.sortOrder || a.lastName.localeCompare(b.lastName, 'tr') || a.firstName.localeCompare(b.firstName, 'tr') || a.id.localeCompare(b.id)
  })
  // Employees the user cannot see (RLS) are dropped together with their cells.
  const visible = new Set(employees.map(e => e.id))
  const usedDepartments = new Set(employees.map(e => e.departmentId).filter(Boolean))

  return {
    location,
    week: { weekStart, status: week?.status ?? 'DRAFT', version: week?.version ?? 0, exists: !!week },
    days: weekDays(weekStart),
    departments: departments.filter(d => d.isActive || usedDepartments.has(d.id)).sort((a, b) => a.sortOrder - b.sortOrder),
    employees,
    shiftCodes,
    cells: assignments.filter(a => visible.has(a.employeeId)).map(toScheduleCell),
  }
}
