import type { CellSnapshot, ScheduleCell } from '../../../shared/types/schedule'

/** Prisma @db.Date ↔ ISO calendar date (dates are stored as UTC midnight). */
export const toDate = (isoDate: string): Date => new Date(`${isoDate}T00:00:00Z`)
export const fromDate = (date: Date): string => date.toISOString().slice(0, 10)

export const assignmentSelect = {
  id: true,
  employeeId: true,
  workDate: true,
  locationId: true,
  shiftCodeId: true,
  codeSnapshot: true,
  labelSnapshot: true,
  kindSnapshot: true,
  colorSnapshot: true,
  startMinute: true,
  endMinute: true,
  breakMinutes: true,
  isCustomTime: true,
  note: true,
} as const

export interface AssignmentRow {
  id: string
  employeeId: string
  workDate: Date
  locationId: string
  shiftCodeId: string
  codeSnapshot: string
  labelSnapshot: string
  kindSnapshot: CellSnapshot['kind']
  colorSnapshot: string
  startMinute: number | null
  endMinute: number | null
  breakMinutes: number
  isCustomTime: boolean
  note: string | null
}

export function toSnapshot(row: AssignmentRow): CellSnapshot {
  return {
    shiftCodeId: row.shiftCodeId,
    code: row.codeSnapshot,
    label: row.labelSnapshot,
    kind: row.kindSnapshot,
    color: row.colorSnapshot,
    startMinute: row.startMinute,
    endMinute: row.endMinute,
    breakMinutes: row.breakMinutes,
    isCustomTime: row.isCustomTime,
    note: row.note,
  }
}

export function toScheduleCell(row: AssignmentRow): ScheduleCell {
  return { employeeId: row.employeeId, workDate: fromDate(row.workDate), ...toSnapshot(row) }
}

/** Columns for writing a snapshot into shift_assignments. */
export function snapshotColumns(cell: CellSnapshot) {
  return {
    shiftCodeId: cell.shiftCodeId,
    codeSnapshot: cell.code,
    labelSnapshot: cell.label,
    kindSnapshot: cell.kind,
    colorSnapshot: cell.color,
    startMinute: cell.startMinute,
    endMinute: cell.endMinute,
    breakMinutes: cell.breakMinutes,
    isCustomTime: cell.isCustomTime,
    note: cell.note,
  }
}
