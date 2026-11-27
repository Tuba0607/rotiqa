import { describe, expect, it } from 'vitest'
import { copiedCell } from '../../server/modules/scheduling/copy-week'
import { cellInputSchema, copyWeekSchema, customTimeSchema, historyQuerySchema, saveChangesSchema } from '../../shared/schemas/scheduling'
import { formatMinutes, resolveCell, sameCell, shiftDurationMinutes } from '../../shared/utils/schedule-cells'
import { addDays, currentWeekStart, isMonday, todayIn } from '../../shared/utils/week'

const code = { id: '00000000-0000-7000-8000-000000000001', code: 'A', label: 'Sabah', kind: 'WORK' as const, color: '#8EDFE3', startMinute: 480, endMinute: 960, breakMinutes: 30 }
const base = { shiftCodeId: code.id, startMinute: 480, endMinute: 960, breakMinutes: 30, isCustomTime: false, note: null }

describe('resolveCell', () => {
  it('uses the code hours unless custom times are given', () => {
    expect(resolveCell({ shiftCodeId: code.id }, code)).toMatchObject({ ...base, code: 'A', color: '#8EDFE3' })
    expect(resolveCell({ shiftCodeId: code.id, custom: { startMinute: 600, endMinute: 1080, breakMinutes: 0 }, note: '  Açılış  ' }, code))
      .toMatchObject({ startMinute: 600, endMinute: 1080, breakMinutes: 0, isCustomTime: true, note: 'Açılış' })
  })
})

describe('sameCell', () => {
  it('compares stored values, treating null as empty', () => {
    expect(sameCell(null, null)).toBe(true)
    expect(sameCell(base, null)).toBe(false)
    expect(sameCell(base, { ...base })).toBe(true)
    expect(sameCell(base, { ...base, note: 'x' })).toBe(false)
    expect(sameCell(base, { ...base, isCustomTime: true })).toBe(false)
    // Display fields (code, label, color) do not count: renaming a code is not a conflict.
    expect(sameCell(resolveCell({ shiftCodeId: code.id }, code), resolveCell({ shiftCodeId: code.id }, { ...code, label: 'Gündüz' }))).toBe(true)
  })
})

describe('time helpers', () => {
  it('handles shifts crossing midnight and 24:00', () => {
    expect(shiftDurationMinutes(480, 960)).toBe(480)
    expect(shiftDurationMinutes(1320, 360)).toBe(480)
    expect(shiftDurationMinutes(960, 1440)).toBe(480)
    expect(formatMinutes(1440)).toBe('24:00')
    expect(formatMinutes(75)).toBe('01:15')
  })

  it('finds the current week in the location time zone', () => {
    const sundayNightUtc = new Date('2026-11-29T22:30:00Z') // Monday 01:30 in Istanbul (UTC+3)
    expect(todayIn('Europe/Istanbul', sundayNightUtc)).toBe('2026-11-30')
    expect(currentWeekStart('Europe/Istanbul', sundayNightUtc)).toBe('2026-11-30')
    expect(currentWeekStart('UTC', sundayNightUtc)).toBe('2026-11-23')
    expect(isMonday('2026-11-23')).toBe(true)
    expect(isMonday('2026-11-24')).toBe(false)
    expect(addDays('2026-12-28', 6)).toBe('2027-01-03')
  })
})

describe('scheduling schemas', () => {
  it('validates custom times in Turkish', () => {
    expect(customTimeSchema.safeParse({ startMinute: 600, endMinute: 600 }).error?.issues[0]?.message).toBe('Başlangıç ve bitiş saati aynı olamaz.')
    expect(customTimeSchema.safeParse({ startMinute: 600, endMinute: 660, breakMinutes: 60 }).error?.issues[0]?.message).toBe('Mola süresi vardiya süresinden kısa olmalı.')
    expect(customTimeSchema.parse({ startMinute: 1320, endMinute: 360 })).toEqual({ startMinute: 1320, endMinute: 360, breakMinutes: 0 })
  })

  it('normalizes notes and rejects long ones', () => {
    expect(cellInputSchema.parse({ shiftCodeId: code.id, note: '   ' }).note).toBeNull()
    expect(cellInputSchema.safeParse({ shiftCodeId: code.id, note: 'x'.repeat(501) }).success).toBe(false)
  })

  it('requires a Monday week start and a sane batch', () => {
    const batch = { locationId: code.id, weekStart: '2026-11-24', clientMutationId: code.id, changes: [{ employeeId: code.id, workDate: '2026-11-24', expected: null, value: null }] }
    expect(saveChangesSchema.safeParse(batch).error?.issues[0]?.message).toBe('Hafta pazartesi günü başlamalı.')
    expect(saveChangesSchema.safeParse({ ...batch, weekStart: '2026-11-23', changes: [] }).error?.issues[0]?.message).toBe('Kaydedilecek değişiklik yok.')
    expect(saveChangesSchema.safeParse({ ...batch, weekStart: '2026-11-23' }).success).toBe(true)
  })
})

describe('copiedCell', () => {
  const stored = { isCustomTime: false, startMinute: 420, endMinute: 900, breakMinutes: 15 }

  it('takes the current code hours unless the source had custom hours', () => {
    expect(copiedCell(stored, code)).toMatchObject({ startMinute: 480, endMinute: 960, breakMinutes: 30, isCustomTime: false, note: null })
    expect(copiedCell({ ...stored, isCustomTime: true }, code)).toMatchObject({ startMinute: 420, endMinute: 900, breakMinutes: 15, isCustomTime: true })
  })

  it('drops custom hours if the code is no longer a working shift', () => {
    const off = { ...code, kind: 'OFF' as const, startMinute: null, endMinute: null, breakMinutes: 0 }
    expect(copiedCell({ ...stored, isCustomTime: true }, off)).toMatchObject({ startMinute: null, endMinute: null, breakMinutes: 0, isCustomTime: false })
  })
})

describe('copy and history schemas', () => {
  const base = { locationId: code.id, weekStart: '2026-11-30', clientMutationId: code.id }

  it('defaults to filling empty cells and rejects copying a week onto itself', () => {
    expect(copyWeekSchema.parse(base)).toMatchObject({ mode: 'fill-empty' })
    expect(copyWeekSchema.safeParse({ ...base, sourceWeekStart: '2026-11-30' }).error?.issues[0]?.message).toBe('Kaynak hafta ile hedef hafta aynı olamaz.')
    expect(copyWeekSchema.safeParse({ ...base, sourceWeekStart: '2026-11-24' }).error?.issues[0]?.message).toBe('Kaynak hafta pazartesi günü başlamalı.')
    expect(copyWeekSchema.safeParse({ ...base, mode: 'merge' }).success).toBe(false)
  })

  it('bounds the history page size', () => {
    expect(historyQuerySchema.parse({ locationId: code.id, week: '2026-11-30' }).limit).toBe(50)
    expect(historyQuerySchema.parse({ locationId: code.id, week: '2026-11-30', limit: '5' }).limit).toBe(5)
    expect(historyQuerySchema.safeParse({ locationId: code.id, week: '2026-11-30', limit: '1000' }).success).toBe(false)
  })
})
