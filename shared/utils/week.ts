/**
 * Week helpers working on ISO calendar dates ("YYYY-MM-DD").
 * Dates are treated as calendar days in UTC so results never shift with the server's time zone.
 */

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

function parseIsoDate(value: string): Date {
  if (!ISO_DATE.test(value)) throw new Error(`Invalid ISO date: ${value}`)
  const date = new Date(`${value}T00:00:00Z`)
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`Invalid ISO date: ${value}`)
  }
  return date
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10)
}

/** Monday of the week containing `isoDate`. Weeks start on Monday (Turkey / ISO-8601). */
export function startOfWeek(isoDate: string): string {
  const date = parseIsoDate(isoDate)
  const offset = (date.getUTCDay() + 6) % 7
  date.setUTCDate(date.getUTCDate() - offset)
  return toIsoDate(date)
}

/** The seven ISO dates (Mon → Sun) of the week starting at `weekStart`. */
export function weekDays(weekStart: string): string[] {
  const start = parseIsoDate(startOfWeek(weekStart))
  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(start)
    day.setUTCDate(start.getUTCDate() + i)
    return toIsoDate(day)
  })
}

export function formatDayHeader(isoDate: string, locale = 'tr-TR'): { weekday: string, day: string } {
  const date = parseIsoDate(isoDate)
  return {
    weekday: new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(date),
    // Fixed "DD.MM" (Turkish convention) instead of Intl, whose numeric day/month output varies across ICU versions.
    day: `${String(date.getUTCDate()).padStart(2, '0')}.${String(date.getUTCMonth() + 1).padStart(2, '0')}`,
  }
}

/** e.g. "23–29 Kasım 2026", "30 Kasım – 6 Aralık 2026", "28 Aralık 2026 – 3 Ocak 2027". */
export function formatWeekRange(weekStart: string, locale = 'tr-TR'): string {
  const days = weekDays(weekStart)
  const first = parseIsoDate(days[0]!)
  const last = parseIsoDate(days[6]!)
  const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(locale, { ...opts, timeZone: 'UTC' })

  if (first.getUTCFullYear() !== last.getUTCFullYear()) {
    const full = fmt({ day: 'numeric', month: 'long', year: 'numeric' })
    return `${full.format(first)} – ${full.format(last)}`
  }
  if (first.getUTCMonth() !== last.getUTCMonth()) {
    return `${fmt({ day: 'numeric', month: 'long' }).format(first)} – ${fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(last)}`
  }
  return `${first.getUTCDate()}–${fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(last)}`
}

export function isMonday(isoDate: string): boolean {
  return startOfWeek(isoDate) === isoDate
}

/** The calendar date "now" in an IANA time zone, as YYYY-MM-DD. */
export function todayIn(timeZone: string, now: Date = new Date()): string {
  // en-CA formats as YYYY-MM-DD.
  return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** Monday of the current week for a location's time zone. */
export function currentWeekStart(timeZone: string, now: Date = new Date()): string {
  return startOfWeek(todayIn(timeZone, now))
}

export function addDays(isoDate: string, days: number): string {
  const date = parseIsoDate(isoDate)
  date.setUTCDate(date.getUTCDate() + days)
  return toIsoDate(date)
}
