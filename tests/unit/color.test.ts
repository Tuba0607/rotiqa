import { describe, expect, it } from 'vitest'
import { contrastRatio, readableTextColor, relativeLuminance } from '../../shared/utils/color'

describe('color utilities', () => {
  it('computes WCAG luminance and contrast', () => {
    expect(relativeLuminance('#000000')).toBe(0)
    expect(relativeLuminance('#FFFFFF')).toBe(1)
    expect(contrastRatio('#000000', '#FFFFFF')).toBeCloseTo(21, 5)
  })

  it('picks white on dark and navy on light custom colors', () => {
    expect(readableTextColor('#DC3545')).toBe('#FFFFFF')
    expect(readableTextColor('#60427E')).toBe('#FFFFFF')
    expect(readableTextColor('#8EDFE3')).toBe('#0A1628')
    expect(readableTextColor('#FFFF00')).toBe('#0A1628')
  })

  it('rejects malformed colors', () => {
    expect(() => relativeLuminance('red')).toThrow()
    expect(() => relativeLuminance('#FFF')).toThrow()
  })
})
