import { DEPARTMENT_COLORS } from '../../../shared/design/tokens'
import { DEFAULT_SHIFT_CODES } from '../../../shared/utils/shift-codes'
import type { ScheduleImageInput } from './types'

/** Fictional data for the rendering prototype. The business and every name are invented. */
const HOURS: Record<string, [string, string]> = { A: ['08:00', '16:00'], B: ['12:00', '20:00'], C: ['16:00', '24:00'] }

const salon = (employeeName: string, codes: (string | null)[]) => ({ employeeName, department: 'Salon', codes })
const mutfak = (employeeName: string, codes: (string | null)[]) => ({ employeeName, department: 'Mutfak', codes })

export const SAMPLE_SCHEDULE_IMAGE: ScheduleImageInput = {
  organizationName: 'Kordon Bistro',
  locationName: 'Konyaaltı',
  weekStart: '2026-11-23',
  maskSensitiveCodes: true,
  footerNote: 'Sürüm v2 · Örnek veri',
  shiftCodes: DEFAULT_SHIFT_CODES.map(def => ({
    ...def,
    startTime: HOURS[def.code]?.[0] ?? null,
    endTime: HOURS[def.code]?.[1] ?? null,
  })),
  departments: [
    { name: 'Salon', color: DEPARTMENT_COLORS[0] },
    { name: 'Mutfak', color: DEPARTMENT_COLORS[1] },
  ],
  rows: [
    salon('Deniz Akın', ['A', 'A', 'A', 'OFF', 'A', 'A', 'A']),
    salon('Ece Yıldırım', ['A', 'OFF', 'A', 'A', 'A', 'A', 'A']),
    salon('Barış Çelik', ['B', 'B', 'B', 'B', 'OFF', 'B', 'B']),
    salon('İrem Şahin', ['OFF', 'A', 'A', 'A', 'A', 'A', 'A']),
    salon('Kerem Aksoy', ['C', 'C', 'OFF', 'C', 'C', 'C', 'C']),
    salon('Şule Kaya', ['C', 'C', 'C', 'C', 'C', 'OFF', 'C']),
    salon('Tolga Er', ['R', 'R', 'R', 'A', 'A', 'A', 'OFF']),
    salon('Yasemin Uçar', ['B', 'OFF', 'B', 'B', 'B', 'B', 'B']),
    salon('Onur Işık', ['C', 'C', 'C', 'OFF', 'C', 'C', 'C']),
    mutfak('Göktuğ Öztürk', ['A', 'A', 'A', 'A', 'A', 'OFF', 'A']),
    mutfak('Gizem Polat', ['OFF', 'B', 'B', 'B', 'B', 'B', 'B']),
    mutfak('Serdar Tan', ['C', 'C', 'C', 'C', 'OFF', 'C', 'C']),
    mutfak('Melis Doğan', ['A', 'A', 'OFF', 'A', 'A', 'A', 'A']),
    mutfak('Emre Bulut', ['C', 'OFF', 'C', 'C', 'C', 'C', 'C']),
    mutfak('Ilgın Er', ['Y.İ', 'Y.İ', 'A', 'A', 'A', 'A', 'OFF']),
    mutfak('Cem Yavuz', ['B', 'B', 'B', 'OFF', 'B', 'B', 'B']),
    mutfak('Nazlı Güneş', ['A', 'C', 'C', 'C', 'C', 'OFF', null]),
  ],
}
