import { describe, expect, it } from 'vitest'
import { formatDayHeader, formatWeekRange, startOfWeek, weekDays } from '../../shared/utils/week'

describe('startOfWeek', () => {
  it('returns Monday for any day of the week', () => {
    expect(startOfWeek('2026-11-23')).toBe('2026-11-23') // Monday
    expect(startOfWeek('2026-11-26')).toBe('2026-11-23') // Thursday
    expect(startOfWeek('2026-11-29')).toBe('2026-11-23') // Sunday
  })

  it('crosses year boundaries', () => {
    expect(startOfWeek('2027-01-01')).toBe('2026-12-28')
  })

  it('rejects invalid dates', () => {
    expect(() => startOfWeek('2026-02-30')).toThrow()
    expect(() => startOfWeek('26-11-23')).toThrow()
  })
})

describe('weekDays', () => {
  it('lists seven consecutive days from Monday', () => {
    expect(weekDays('2026-11-25')).toEqual([
      '2026-11-23', '2026-11-24', '2026-11-25', '2026-11-26', '2026-11-27', '2026-11-28', '2026-11-29',
    ])
  })
})

describe('Turkish formatting', () => {
  it('formats a single-month week', () => {
    expect(formatWeekRange('2026-11-23')).toBe('23–29 Kasım 2026')
  })

  it('formats a week spanning two months', () => {
    expect(formatWeekRange('2026-11-30')).toBe('30 Kasım – 6 Aralık 2026')
  })

  it('formats a week spanning two years', () => {
    expect(formatWeekRange('2026-12-28')).toBe('28 Aralık 2026 – 3 Ocak 2027')
  })

  it('formats day headers', () => {
    expect(formatDayHeader('2026-11-25')).toEqual({ weekday: 'Çar', day: '25.11' })
  })
})
