import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { BRAND_COLORS, DEPARTMENT_COLORS, SHEET_COLORS, SHIFT_COLORS } from '../../shared/design/tokens'
import { contrastRatio, readableTextColor } from '../../shared/utils/color'
import { DEFAULT_SHIFT_CODES, MASKED_LEAVE_DISPLAY } from '../../shared/utils/shift-codes'

const css = readFileSync(new URL('../../app/assets/css/main.css', import.meta.url), 'utf8')
const cssToken = (name: string) => css.match(new RegExp(`--color-${name}:\\s*(#[0-9A-Fa-f]{6})`))?.[1]?.toUpperCase()

describe('CSS tokens mirror shared/design/tokens.ts', () => {
  it.each([
    ['shift-a', SHIFT_COLORS.A],
    ['shift-b', SHIFT_COLORS.B],
    ['shift-c', SHIFT_COLORS.C],
    ['shift-off', SHIFT_COLORS.OFF],
    ['shift-r', SHIFT_COLORS.R],
    ['shift-yi', SHIFT_COLORS['Y.İ']],
    ['navy-950', BRAND_COLORS.navy],
    ['navy-900', BRAND_COLORS.darkBlue],
    ['brand-500', BRAND_COLORS.teal],
    ['cream-100', BRAND_COLORS.cream],
    ['accent-500', BRAND_COLORS.amber],
    ['sheet-frame', SHEET_COLORS.frame],
    ['sheet-grid', SHEET_COLORS.grid],
    ['sheet-day', SHEET_COLORS.dayNumber],
    ['sheet-weekday', SHEET_COLORS.weekday],
    ['sheet-weekend', SHEET_COLORS.weekend],
    ...DEPARTMENT_COLORS.map((hex, i) => [`dept-${i + 1}`, hex] as [string, string]),
  ])('--color-%s = %s', (name, hex) => {
    expect(cssToken(name)).toBe(hex.toUpperCase())
  })
})

describe('legibility (WCAG AA, 4.5:1)', () => {
  it('every default shift code has readable text', () => {
    for (const def of DEFAULT_SHIFT_CODES) {
      expect(contrastRatio(def.color, def.textColor), def.code).toBeGreaterThanOrEqual(4.5)
    }
    expect(contrastRatio(MASKED_LEAVE_DISPLAY.color, MASKED_LEAVE_DISPLAY.textColor)).toBeGreaterThanOrEqual(4.5)
  })

  it('every default department color carries readable name text', () => {
    for (const hex of DEPARTMENT_COLORS) {
      expect(contrastRatio(hex, readableTextColor(hex)), hex).toBeGreaterThanOrEqual(4.5)
    }
  })

  it('sheet header bands are readable', () => {
    for (const hex of [SHEET_COLORS.dayNumber, SHEET_COLORS.weekday, SHEET_COLORS.weekend]) {
      expect(contrastRatio(hex, readableTextColor(hex)), hex).toBeGreaterThanOrEqual(4.5)
    }
  })
})
