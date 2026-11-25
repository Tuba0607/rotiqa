import { DEFAULT_SHIFT_CODES } from '../../../shared/utils/shift-codes'
import type { ScheduleImageInput } from './types'

/** Fictional data for the F0 rendering spike. Names and business are invented. */
const HOURS: Record<string, [string, string]> = { A: ['08:00', '16:00'], B: ['12:00', '20:00'], C: ['16:00', '00:00'] }

export const SAMPLE_SCHEDULE_IMAGE: ScheduleImageInput = {
  organizationName: 'Kordon Bistro',
  locationName: 'Alsancak',
  weekStart: '2026-11-23',
  maskSensitiveCodes: true,
  footerNote: 'Sürüm 1 · Örnek veri',
  shiftCodes: DEFAULT_SHIFT_CODES.map(def => ({
    ...def,
    startTime: HOURS[def.code]?.[0] ?? null,
    endTime: HOURS[def.code]?.[1] ?? null,
  })),
  rows: [
    { employeeName: 'Deniz Akın', department: 'Salon', codes: ['A', 'A', 'OFF', 'B', 'C', 'C', 'A'] },
    { employeeName: 'Ece Yıldırım', department: 'Salon', codes: ['C', 'OFF', 'A', 'A', 'B', 'C', 'C'] },
    { employeeName: 'Barış Çelik', department: 'Salon', codes: ['B', 'B', 'C', 'OFF', 'A', 'A', 'R'] },
    { employeeName: 'İrem Şahin', department: 'Salon', codes: ['OFF', 'C', 'C', 'C', 'A', 'B', 'B'] },
    { employeeName: 'Göktuğ Öztürk', department: 'Mutfak', codes: ['A', 'A', 'A', 'OFF', 'C', 'C', 'B'] },
    { employeeName: 'Şule Kaya', department: 'Mutfak', codes: ['C', 'C', 'OFF', 'A', 'A', 'B', 'A'] },
    { employeeName: 'Ilgın Doğan', department: 'Mutfak', codes: ['Y.İ', 'Y.İ', 'Y.İ', 'Y.İ', 'Y.İ', 'OFF', null] },
    { employeeName: 'Mert Aydın', department: 'Bar', codes: ['B', 'OFF', 'B', 'C', 'C', 'A', 'A'] },
    { employeeName: 'Çağla Arslan', department: 'Bar', codes: ['OFF', 'A', 'C', 'B', null, 'C', 'C'] },
  ],
}
