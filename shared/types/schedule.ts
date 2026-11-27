/**
 * Category of a shift code. Drives working-day counts, privacy masking and (later) timesheet logic.
 * - WORK:  a working shift with hours (e.g. A, B, C)
 * - OFF:   weekly day off
 * - LEAVE: annual / paid leave
 * - SICK:  medical report — health data, masked in shared images by default
 */
export type ShiftCodeKind = 'WORK' | 'OFF' | 'LEAVE' | 'SICK'

export interface ShiftCodeDefinition {
  code: string
  label: string
  kind: ShiftCodeKind
  /** "HH:mm" local time; null for non-working codes. Configured per organization, never hard-coded. */
  startTime: string | null
  endTime: string | null
  /** Hex cell color. Defaults from design tokens; organizations may override. */
  color: string
  /** Hex text color, derived with `readableTextColor(color)`. */
  textColor: string
}

export interface DepartmentDisplay {
  name: string
  /** Hex color of the employee name column. Defaults from design tokens; organizations may override. */
  color: string
}

/**
 * The editable content of one planning cell (employee × day). Times are minutes after local
 * midnight; endMinute ≤ startMinute means the shift crosses midnight. Used for optimistic
 * concurrency: a client sends the value it last saw and the server refuses to overwrite a
 * cell that has changed since.
 */
export interface CellValue {
  shiftCodeId: string
  startMinute: number | null
  endMinute: number | null
  breakMinutes: number
  isCustomTime: boolean
  note: string | null
}

/** A stored cell including the shift code details copied at assignment time. */
export interface CellSnapshot extends CellValue {
  code: string
  label: string
  kind: ShiftCodeKind
  color: string
}

export interface ScheduleCell extends CellSnapshot {
  employeeId: string
  workDate: string
}

export interface ScheduleShiftCode {
  id: string
  code: string
  label: string
  kind: ShiftCodeKind
  color: string
  startMinute: number | null
  endMinute: number | null
  breakMinutes: number
  sortOrder: number
  isActive: boolean
}

export interface ScheduleEmployee {
  id: string
  firstName: string
  lastName: string
  departmentId: string | null
  sortOrder: number
  isActive: boolean
}

export interface ScheduleDepartment {
  id: string
  name: string
  color: string
  sortOrder: number
  isActive: boolean
}

/** Everything the weekly planner needs, in one response. */
export interface WeekScheduleView {
  location: { id: string, name: string, timezone: string, isActive: boolean }
  week: { weekStart: string, status: 'DRAFT' | 'PUBLISHED', version: number, exists: boolean }
  days: string[]
  departments: ScheduleDepartment[]
  /** Active staff of the location (ordered by department, then position), plus anyone with a cell this week. */
  employees: ScheduleEmployee[]
  shiftCodes: ScheduleShiftCode[]
  cells: ScheduleCell[]
}

export interface CellChangeResult {
  employeeId: string
  workDate: string
  cell: CellSnapshot | null
}

/** Result of a save, undo or redo. Conflicting cells are left untouched and reported. */
export interface ScheduleSaveResult {
  changeSetId: string | null
  version: number
  /** True when this clientMutationId was already applied earlier (safe retry). */
  duplicate: boolean
  applied: CellChangeResult[]
  conflicts: CellChangeResult[]
  /** Changes that matched the current value already (nothing to do). */
  unchanged: number
}

/** Source cells a week copy did not apply, by reason. */
export interface CopyWeekSkipped {
  /** Target cell already held a shift (mode `fill-empty`). */
  occupied: number
  /** Employee archived or moved to another location since the source week. */
  inactiveEmployee: number
  /** Shift code deactivated since the source week. */
  inactiveCode: number
  /** Employee already has a shift in another location on that day. */
  otherLocation: number
}

export interface CopyWeekResult extends ScheduleSaveResult {
  sourceWeekStart: string
  skipped: CopyWeekSkipped
}

export type ScheduleChangeKind = 'EDIT' | 'COPY_WEEK' | 'UNDO' | 'REDO'

/** One saved change set, as listed in the week's history (newest first). */
export interface ScheduleHistoryEntry {
  id: string
  kind: ScheduleChangeKind
  createdAt: string
  actor: { id: string, name: string } | null
  cellCount: number
  /** UNDO/REDO: the change set this one reverted. */
  revertsId: string | null
  /** The UNDO/REDO that reverted this change set, if any. A change set is reverted at most once. */
  revertedById: string | null
  /** The signed-in user made it and it has not been reverted: it can be undone (or redone). */
  canRevert: boolean
}
