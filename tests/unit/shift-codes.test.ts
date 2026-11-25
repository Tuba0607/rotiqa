import { describe, expect, it } from 'vitest'
import { DEFAULT_SHIFT_CODES, formatShiftHours, toSharedDisplay } from '../../shared/utils/shift-codes'

const byCode = (code: string) => DEFAULT_SHIFT_CODES.find(def => def.code === code)!

describe('default shift codes', () => {
  it('contains the six starter codes without hard-coded hours', () => {
    expect(DEFAULT_SHIFT_CODES.map(def => def.code)).toEqual(['A', 'B', 'C', 'OFF', 'R', 'Y.İ'])
    expect(DEFAULT_SHIFT_CODES.every(def => def.startTime === null && def.endTime === null)).toBe(true)
  })
})

describe('toSharedDisplay', () => {
  it('masks medical report codes as generic leave when enabled', () => {
    expect(toSharedDisplay(byCode('R'), true)).toMatchObject({ code: 'İzinli', label: 'İzinli' })
  })

  it('keeps medical report codes when masking is disabled', () => {
    expect(toSharedDisplay(byCode('R'), false)).toMatchObject({ code: 'R', label: 'Raporlu' })
  })

  it('never masks non-sensitive codes', () => {
    expect(toSharedDisplay(byCode('Y.İ'), true).code).toBe('Y.İ')
  })
})

describe('formatShiftHours', () => {
  it('formats configured hours and ignores missing ones', () => {
    expect(formatShiftHours({ startTime: '16:00', endTime: '00:00' })).toBe('16:00–00:00')
    expect(formatShiftHours({ startTime: null, endTime: null })).toBeNull()
  })
})
