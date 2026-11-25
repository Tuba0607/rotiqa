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
  /** Hex background color of the cell. */
  color: string
  /** Hex text color, chosen for contrast against `color`. */
  textColor: string
}
