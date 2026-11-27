import type { ScheduleCell, ScheduleDepartment, ScheduleEmployee, ScheduleShiftCode, WeekScheduleView } from '../../shared/types/schedule'
import { cellKey } from '../../shared/utils/schedule-cells'
import { startOfWeek } from '../../shared/utils/week'

/** Pure view helpers for the read-only weekly table (F2.3). No fetching, no Vue. */

export interface ScheduleRow {
  employee: ScheduleEmployee
  /** One entry per day of the week (Mon → Sun); null = nothing planned. */
  cells: (ScheduleCell | null)[]
}

export interface ScheduleGroup {
  /** null = staff without a department (always last). */
  department: ScheduleDepartment | null
  rows: ScheduleRow[]
  /** Working shifts (kind WORK) of this group per day. */
  working: number[]
}

export interface DayTotals {
  working: number
  off: number
  /** Rows without any cell that day. */
  empty: number
}

/** Fallback name-column color for staff without a department (cream-300 from the tokens). */
export const NO_DEPARTMENT_COLOR = '#E7E3DA'

/**
 * Groups the staff by department, keeping the server's order (department sortOrder, then the
 * employee order set on the staff page). Empty departments are left out.
 */
export function groupSchedule(view: Pick<WeekScheduleView, 'days' | 'departments' | 'employees' | 'cells'>): ScheduleGroup[] {
  const byKey = new Map(view.cells.map(cell => [cellKey(cell.employeeId, cell.workDate), cell]))
  const known = new Map(view.departments.map(d => [d.id, d]))
  const groups = new Map<string, ScheduleGroup>()

  for (const employee of view.employees) {
    const department = employee.departmentId ? known.get(employee.departmentId) ?? null : null
    const id = department?.id ?? ''
    let group = groups.get(id)
    if (!group) {
      group = { department, rows: [], working: view.days.map(() => 0) }
      groups.set(id, group)
    }
    const cells = view.days.map(day => byKey.get(cellKey(employee.id, day)) ?? null)
    cells.forEach((cell, i) => {
      if (cell?.kind === 'WORK') group.working[i]!++
    })
    group.rows.push({ employee, cells })
  }

  const order = (g: ScheduleGroup) => g.department ? g.department.sortOrder : Number.POSITIVE_INFINITY
  return [...groups.values()].sort((a, b) => order(a) - order(b))
}

/** Per-day headcounts over all groups. */
export function dayTotals(groups: ScheduleGroup[], dayCount = 7): DayTotals[] {
  const totals = Array.from({ length: dayCount }, () => ({ working: 0, off: 0, empty: 0 }))
  for (const group of groups) {
    for (const row of group.rows) {
      row.cells.forEach((cell, i) => {
        const total = totals[i]!
        if (!cell) total.empty++
        else if (cell.kind === 'WORK') total.working++
        else total.off++
      })
    }
  }
  return totals
}

export interface WeekSummary {
  staff: number
  /** Staff rows × days. */
  cells: number
  /** Cells holding any code (working or not). */
  filled: number
  /** Working shifts only (kind WORK); OFF, R and Y.İ are not counted. */
  working: number
  empty: number
}

/** Week totals for the summary line, computed from the grouped rows. */
export function weekSummary(groups: ScheduleGroup[]): WeekSummary {
  const summary = { staff: 0, cells: 0, filled: 0, working: 0, empty: 0 }
  for (const row of groups.flatMap(g => g.rows)) {
    summary.staff++
    for (const cell of row.cells) {
      summary.cells++
      if (!cell) summary.empty++
      else {
        summary.filled++
        if (cell.kind === 'WORK') summary.working++
      }
    }
  }
  return summary
}

/** "HH:mm" from minutes after midnight. */
export function formatMinute(minute: number): string {
  return `${String(Math.floor(minute / 60) % 24).padStart(2, '0')}:${String(minute % 60).padStart(2, '0')}`
}

/** "08:00–16:00" for cells with hours, otherwise null. */
export function cellHours(cell: Pick<ScheduleCell, 'startMinute' | 'endMinute'>): string | null {
  if (cell.startMinute === null || cell.endMinute === null) return null
  return `${formatMinute(cell.startMinute)}–${formatMinute(cell.endMinute)}`
}

/** Screen-reader text of one cell, e.g. "Sabah, 08:00–16:00, özel saat". */
export function describeCell(cell: ScheduleCell | null): string {
  if (!cell) return 'Boş'
  const hours = cellHours(cell)
  return [cell.label, hours, cell.isCustomTime ? 'özel saat' : null, cell.note ? `not: ${cell.note}` : null].filter(Boolean).join(', ')
}

/** Codes for the legend: active ones plus any inactive code still used this week. */
export function legendCodes(codes: ScheduleShiftCode[], cells: Pick<ScheduleCell, 'shiftCodeId'>[]): ScheduleShiftCode[] {
  const used = new Set(cells.map(c => c.shiftCodeId))
  return codes.filter(code => code.isActive || used.has(code.id)).sort((a, b) => a.sortOrder - b.sortOrder)
}

/** The Monday of a `?hafta=` value, or null when it is missing or not a real date. */
export function parseWeekParam(value: unknown): string | null {
  if (typeof value !== 'string') return null
  try {
    return startOfWeek(value)
  }
  catch {
    return null
  }
}
