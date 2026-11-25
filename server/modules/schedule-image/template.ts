import { BRAND_COLORS, SHEET_COLORS } from '../../../shared/design/tokens'
import type { DepartmentDisplay, ShiftCodeDefinition } from '../../../shared/types/schedule'
import { readableTextColor } from '../../../shared/utils/color'
import { defaultDepartmentColor, formatShiftHours, toSharedDisplay, type ShiftCodeDisplay } from '../../../shared/utils/shift-codes'
import { formatWeekRange, weekDays } from '../../../shared/utils/week'
import { SCHEDULE_FONT_FAMILY } from './fonts'
import type { ScheduleImageInput } from './types'

/** Minimal element shape Satori accepts (React-element compatible, no React runtime needed). */
export interface SatoriElement {
  type: string
  props: {
    style?: Record<string, string | number>
    children?: SatoriChild | SatoriChild[]
  }
}
type SatoriChild = SatoriElement | string | number | null

type Style = Record<string, string | number>

function el(type: string, style: Style, children?: SatoriChild | SatoriChild[]): SatoriElement {
  // border-box everywhere: Satori defaults to content-box, which pushes padded/bordered cells off the grid.
  return { type, props: { style: { display: 'flex', boxSizing: 'border-box', ...style }, children } }
}

/** Layout width in CSS px; the PNG is rendered at IMAGE_SCALE (→ 1800 px wide). */
export const IMAGE_WIDTH = 900

const PADDING = 20
const DAY_COL = 94
const ROW_HEIGHT = 25
const LINE = 2
// The table's outer border sits inside the padded width.
const NAME_COL = IMAGE_WIDTH - PADDING * 2 - LINE * 2 - DAY_COL * 7
const GRID = `${LINE}px solid ${SHEET_COLORS.grid}`

const upper = (text: string) => text.toLocaleUpperCase('tr-TR')

const dayName = (iso: string) =>
  new Intl.DateTimeFormat('tr-TR', { weekday: 'long', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`))

const monthYear = (iso: string) =>
  upper(new Intl.DateTimeFormat('tr-TR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)))

function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean)
  return upper(words.slice(0, 2).map(word => word.charAt(0)).join(''))
}

/** "KASIM 2026" or "KASIM – ARALIK 2026" when the week crosses months. */
function headerMonthLabel(days: string[]): string {
  const first = monthYear(days[0]!)
  const last = monthYear(days[6]!)
  if (first === last) return first
  const [firstMonth, firstYear] = first.split(' ')
  const [lastMonth] = last.split(' ')
  return firstYear === last.split(' ')[1] ? `${firstMonth} – ${lastMonth} ${firstYear}` : `${first} – ${last}`
}

function title(input: ScheduleImageInput, days: string[]): SatoriElement[] {
  const logo = input.logoDataUrl
    ? { type: 'img', props: { src: input.logoDataUrl, width: 40, height: 40, style: { borderRadius: 20, objectFit: 'cover' } } } as SatoriElement
    : el('div', { width: 40, height: 40, borderRadius: 20, backgroundColor: BRAND_COLORS.darkBlue, color: BRAND_COLORS.white, fontSize: 15, fontWeight: 700, alignItems: 'center', justifyContent: 'center' }, initials(input.organizationName))

  const subtitle = [input.locationName, 'Haftalık Vardiya Planı', formatWeekRange(days[0]!)].filter(Boolean).join(' · ')

  return [
    el('div', { alignSelf: 'center', alignItems: 'center', gap: 16, backgroundColor: BRAND_COLORS.white, border: `3px solid ${SHEET_COLORS.grid}`, borderRadius: 999, padding: '6px 32px 6px 8px' }, [
      logo,
      el('div', { fontSize: 28, fontWeight: 700, letterSpacing: 6, color: BRAND_COLORS.navy }, upper(input.organizationName)),
    ]),
    el('div', { alignSelf: 'center', marginTop: 10, marginBottom: 12, fontSize: 19, fontWeight: 700, color: BRAND_COLORS.white }, subtitle),
  ]
}

function headerRows(days: string[]): SatoriElement {
  return el('div', { borderBottom: GRID }, [
    el('div', { width: NAME_COL, height: 64, alignItems: 'center', justifyContent: 'center', backgroundColor: SHEET_COLORS.dayNumber, color: BRAND_COLORS.white, fontSize: 15, fontWeight: 700, letterSpacing: 1.5, borderRight: GRID }, headerMonthLabel(days)),
    ...days.map((day, i) => {
      const weekend = i >= 5
      const band = weekend ? SHEET_COLORS.weekend : SHEET_COLORS.weekday
      return el('div', { width: DAY_COL, flexDirection: 'column', borderRight: i < 6 ? GRID : 'none' }, [
        el('div', { height: 40, alignItems: 'center', justifyContent: 'center', backgroundColor: weekend ? SHEET_COLORS.weekend : SHEET_COLORS.dayNumber, color: BRAND_COLORS.white, fontSize: 26, fontWeight: 700 }, String(Number(day.slice(8)))),
        el('div', { height: 24, alignItems: 'center', justifyContent: 'center', backgroundColor: band, color: readableTextColor(band), fontSize: 13, fontWeight: 600, borderTop: GRID }, dayName(day)),
      ])
    }),
  ])
}

function cell(display: ShiftCodeDisplay | null, last: boolean): SatoriElement {
  return el('div', {
    width: DAY_COL,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: display?.color ?? BRAND_COLORS.white,
    color: display?.textColor ?? BRAND_COLORS.navy,
    fontSize: 13,
    fontWeight: 700,
    borderRight: last ? 'none' : GRID,
  }, display ? upper(display.code) : '')
}

function legend(codes: ShiftCodeDefinition[], departments: DepartmentDisplay[], mask: boolean): SatoriElement {
  // Masked codes collapse into a single "İzinli" entry.
  const seen = new Set<string>()
  const items: SatoriElement[] = []
  for (const def of codes) {
    const display = toSharedDisplay(def, mask)
    if (seen.has(display.code)) continue
    seen.add(display.code)
    const hours = formatShiftHours(def)
    items.push(el('div', { alignItems: 'center', gap: 6 }, [
      el('div', { minWidth: 34, height: 18, padding: '0 6px', alignItems: 'center', justifyContent: 'center', borderRadius: 3, backgroundColor: display.color, color: display.textColor, fontSize: 10, fontWeight: 700 }, upper(display.code)),
      el('div', { fontSize: 12, color: BRAND_COLORS.navy }, hours ? `${display.label} ${hours}` : display.label),
    ]))
  }
  for (const dept of departments) {
    items.push(el('div', { alignItems: 'center', gap: 6 }, [
      el('div', { width: 14, height: 14, borderRadius: 3, backgroundColor: dept.color }),
      el('div', { fontSize: 12, color: BRAND_COLORS.navy }, dept.name),
    ]))
  }
  return el('div', { flexWrap: 'wrap', justifyContent: 'center', columnGap: 18, rowGap: 6, marginTop: 12, padding: '9px 14px', backgroundColor: BRAND_COLORS.white, borderRadius: 8 }, items)
}

export function buildScheduleTemplate(input: ScheduleImageInput): SatoriElement {
  const days = weekDays(input.weekStart)
  const codeMap = new Map(input.shiftCodes.map(def => [def.code, def]))

  // Departments without a configured color (or not listed) still get a stable default.
  const departments = [...input.departments]
  for (const row of input.rows) {
    if (!departments.some(dept => dept.name === row.department)) {
      departments.push({ name: row.department, color: defaultDepartmentColor(departments.length) })
    }
  }
  const departmentColor = new Map(departments.map(dept => [dept.name, dept.color]))
  const usedDepartments = departments.filter(dept => input.rows.some(row => row.department === dept.name))

  const displayFor = (code: string | null): ShiftCodeDisplay | null => {
    if (!code) return null
    const def = codeMap.get(code)
    // Unknown codes still render (neutral) instead of silently disappearing.
    return def ? toSharedDisplay(def, input.maskSensitiveCodes) : { code, label: code, color: BRAND_COLORS.cream, textColor: BRAND_COLORS.navy }
  }

  const bodyRows = input.rows.map((row, index) => {
    const nameColor = departmentColor.get(row.department)!
    return el('div', { height: ROW_HEIGHT, borderBottom: index < input.rows.length - 1 ? GRID : 'none' }, [
      el('div', { width: NAME_COL, height: '100%', alignItems: 'center', paddingLeft: 10, backgroundColor: nameColor, color: readableTextColor(nameColor), fontSize: 13, fontWeight: 700, borderRight: GRID, overflow: 'hidden', whiteSpace: 'nowrap' }, upper(row.employeeName)),
      ...days.map((_, i) => cell(displayFor(row.codes[i] ?? null), i === 6)),
    ])
  })

  return el('div', { width: IMAGE_WIDTH, flexDirection: 'column', backgroundColor: SHEET_COLORS.frame, fontFamily: SCHEDULE_FONT_FAMILY, padding: `18px ${PADDING}px 14px` }, [
    ...title(input, days),
    el('div', { flexDirection: 'column', border: GRID, backgroundColor: BRAND_COLORS.white }, [headerRows(days), ...bodyRows]),
    legend(input.shiftCodes, usedDepartments, input.maskSensitiveCodes),
    el('div', { justifyContent: 'space-between', marginTop: 8, fontSize: 11, color: '#D5E3E8' }, [
      el('div', {}, input.footerNote ?? ''),
      el('div', { fontWeight: 600 }, 'Rotiqa ile hazırlandı'),
    ]),
  ])
}
