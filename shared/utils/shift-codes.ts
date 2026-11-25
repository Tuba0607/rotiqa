import type { ShiftCodeDefinition } from '../types/schedule'

/**
 * Starter codes copied into a new organization. Hours are intentionally empty:
 * each business defines its own A/B/C times in settings.
 */
export const DEFAULT_SHIFT_CODES: readonly ShiftCodeDefinition[] = [
  { code: 'A', label: 'Sabah vardiyası', kind: 'WORK', startTime: null, endTime: null, color: '#CCFBF1', textColor: '#115E59' },
  { code: 'B', label: 'Ara vardiya', kind: 'WORK', startTime: null, endTime: null, color: '#FEF3C7', textColor: '#92400E' },
  { code: 'C', label: 'Akşam vardiyası', kind: 'WORK', startTime: null, endTime: null, color: '#DBEAFE', textColor: '#1E3A8A' },
  { code: 'OFF', label: 'Haftalık izin', kind: 'OFF', startTime: null, endTime: null, color: '#E5E7EB', textColor: '#374151' },
  { code: 'R', label: 'Raporlu', kind: 'SICK', startTime: null, endTime: null, color: '#FFE4E6', textColor: '#9F1239' },
  { code: 'Y.İ', label: 'Yıllık izin', kind: 'LEAVE', startTime: null, endTime: null, color: '#EDE9FE', textColor: '#5B21B6' },
]

/** Neutral presentation used when sensitive (SICK) codes are masked in shared outputs. */
export const MASKED_LEAVE_DISPLAY = {
  code: 'İzinli',
  label: 'İzinli',
  color: '#F1F5F9',
  textColor: '#475569',
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
