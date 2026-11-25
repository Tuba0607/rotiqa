import type { ShiftCodeDefinition } from '../../../shared/types/schedule'

export interface ScheduleImageRow {
  employeeName: string
  department: string
  /** Seven entries, Monday → Sunday. `null` = unassigned. */
  codes: (string | null)[]
}

export interface ScheduleImageInput {
  organizationName: string
  locationName?: string
  /** PNG/JPEG/SVG data URL. Falls back to an initial badge when absent. */
  logoDataUrl?: string
  /** Any ISO date inside the target week. */
  weekStart: string
  shiftCodes: ShiftCodeDefinition[]
  rows: ScheduleImageRow[]
  /** Show SICK codes as generic "İzinli" (default on, to avoid exposing health data). */
  maskSensitiveCodes: boolean
  /** Optional footer note, e.g. publication version. */
  footerNote?: string
}

export interface ScheduleImageFont {
  name: string
  data: ArrayBuffer | Buffer
  weight: 400 | 600 | 700
  style: 'normal'
}
