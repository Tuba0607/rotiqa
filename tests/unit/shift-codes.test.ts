import { describe, expect, it } from 'vitest'
import { DEPARTMENT_COLORS, SHIFT_COLORS } from '../../shared/design/tokens'
import { DEFAULT_SHIFT_CODES, defaultDepartmentColor, formatShiftHours, toSharedDisplay } from '../../shared/utils/shift-codes'

const byCode = (code: string) => DEFAULT_SHIFT_CODES.find(def => def.code === code)!

describe('default shift codes', () => {
  it('contains the six starter codes without hard-coded hours', () => {
    expect(DEFAULT_SHIFT_CODES.map(def => def.code)).toEqual(['A', 'B', 'C', 'OFF', 'R', 'Y.İ'])
    expect(DEFAULT_SHIFT_CODES.every(def => def.startTime === null && def.endTime === null)).toBe(true)
  })

  it('takes its colors from the design tokens', () => {
    for (const def of DEFAULT_SHIFT_CODES) expect(def.color).toBe(SHIFT_COLORS[def.code as keyof typeof SHIFT_COLORS])
    expect(byCode('R').textColor).toBe('#FFFFFF')
  })
})

describe('toSharedDisplay', () => {
  it('masks medical report codes as generic leave when enabled', () => {
    expect(toSharedDisplay(byCode('R'), true)).toMatchObject({ code: 'İZİNLİ', label: 'İzinli', color: SHIFT_COLORS.OFF })
  })

  it('keeps medical report codes when masking is disabled', () => {
    expect(toSharedDisplay(byCode('R'), false)).toMatchObject({ code: 'R', label: 'Raporlu', color: SHIFT_COLORS.R })
  })

  it('never masks non-sensitive codes', () => {
    expect(toSharedDisplay(byCode('Y.İ'), true).code).toBe('Y.İ')
  })

  it('respects organization color overrides', () => {
    expect(toSharedDisplay({ ...byCode('A'), color: '#123456', textColor: '#FFFFFF' }, true).color).toBe('#123456')
  })
})

describe('formatShiftHours', () => {
  it('formats configured hours and ignores missing ones', () => {
    expect(formatShiftHours({ startTime: '16:00', endTime: '24:00' })).toBe('16:00–24:00')
    expect(formatShiftHours({ startTime: null, endTime: null })).toBeNull()
  })
})

describe('defaultDepartmentColor', () => {
  it('assigns palette colors in order and cycles', () => {
    expect(defaultDepartmentColor(0)).toBe(DEPARTMENT_COLORS[0])
    expect(defaultDepartmentColor(1)).toBe(DEPARTMENT_COLORS[1])
    expect(defaultDepartmentColor(DEPARTMENT_COLORS.length)).toBe(DEPARTMENT_COLORS[0])
  })
})
