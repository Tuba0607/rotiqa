import { DEPARTMENT_COLORS, SHIFT_COLORS } from '../design/tokens'
import type { ShiftCodeDefinition, ShiftCodeKind } from '../types/schedule'
import { readableTextColor } from './color'

function starter(code: keyof typeof SHIFT_COLORS, label: string, kind: ShiftCodeKind): ShiftCodeDefinition {
  const color = SHIFT_COLORS[code]
  return { code, label, kind, startTime: null, endTime: null, color, textColor: readableTextColor(color) }
}

/**
 * Starter codes copied into a new organization. Hours are intentionally empty:
 * each business defines its own A/B/C times (and may recolor codes) in settings.
 */
export const DEFAULT_SHIFT_CODES: readonly ShiftCodeDefinition[] = [
  starter('A', 'Sabah', 'WORK'),
  starter('B', 'Ara', 'WORK'),
  starter('C', 'Akşam', 'WORK'),
  starter('OFF', 'Haftalık izin', 'OFF'),
  starter('R', 'Raporlu', 'SICK'),
  starter('Y.İ', 'Yıllık izin', 'LEAVE'),
]

/**
 * Neutral presentation used when sensitive (SICK) codes are masked in shared outputs.
 * Shares the day-off color so it does not stand out as a distinct category.
 */
export const MASKED_LEAVE_DISPLAY = {
  code: 'İZİNLİ',
  label: 'İzinli',
  color: SHIFT_COLORS.OFF,
  textColor: readableTextColor(SHIFT_COLORS.OFF),
} as const

export interface ShiftCodeDisplay {
  code: string
  label: string
  color: string
  textColor: string
}

/** How a code appears in outputs shared outside the app (e.g. WhatsApp image). */
export function toSharedDisplay(def: ShiftCodeDefinition, maskSensitive: boolean): ShiftCodeDisplay {
  if (maskSensitive && def.kind === 'SICK') return { ...MASKED_LEAVE_DISPLAY }
  return { code: def.code, label: def.label, color: def.color, textColor: def.textColor }
}

export function formatShiftHours(def: Pick<ShiftCodeDefinition, 'startTime' | 'endTime'>): string | null {
  return def.startTime && def.endTime ? `${def.startTime}–${def.endTime}` : null
}

/** Default color for the n-th department (0-based); cycles through the palette. */
export function defaultDepartmentColor(index: number): string {
  return DEPARTMENT_COLORS[((index % DEPARTMENT_COLORS.length) + DEPARTMENT_COLORS.length) % DEPARTMENT_COLORS.length]!
}
