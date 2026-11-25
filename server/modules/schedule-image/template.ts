import type { ShiftCodeDefinition } from '../../../shared/types/schedule'
import { formatShiftHours, toSharedDisplay, type ShiftCodeDisplay } from '../../../shared/utils/shift-codes'
import { formatDayHeader, formatWeekRange, weekDays } from '../../../shared/utils/week'
import { SCHEDULE_FONT_FAMILY } from './fonts'
import type { ScheduleImageInput } from './types'

/** Minimal element shape Satori accepts (React-element compatible, no React runtime needed). */
export interface SatoriElement {
  type: string
  props: {
    style?: Record<string, string | number>
    src?: string
    width?: number
    height?: number
    children?: SatoriChild | SatoriChild[]
  }
}
type SatoriChild = SatoriElement | string | number | null

type Style = Record<string, string | number>

function el(type: string, style: Style, children?: SatoriChild | SatoriChild[]): SatoriElement {
  return { type, props: { style: { display: 'flex', ...style }, children } }
}

export const IMAGE_WIDTH = 1080

const COLORS = {
  navy: '#0A1628',
  darkBlue: '#13294B',
  teal: '#14B8A6',
  cream: '#F8F6F1',
  amber: '#F59E0B',
  border: '#E7E3DA',
  muted: '#64748B',
  empty: '#FFFFFF',
}

const PADDING = 40
const NAME_COL = 230
const DAY_COL = (IMAGE_WIDTH - PADDING * 2 - NAME_COL) / 7
const ROW_HEIGHT = 52

function header(input: ScheduleImageInput): SatoriElement {
  const logo = input.logoDataUrl
    ? { type: 'img', props: { src: input.logoDataUrl, width: 72, height: 72, style: { borderRadius: 16, objectFit: 'contain', backgroundColor: '#FFFFFF' } } }
    : el('div', { width: 72, height: 72, borderRadius: 16, backgroundColor: COLORS.teal, color: COLORS.navy, fontSize: 36, fontWeight: 700, alignItems: 'center', justifyContent: 'center' },
        input.organizationName.trim().charAt(0).toLocaleUpperCase('tr-TR'))

  const subtitle = [input.locationName, 'Haftalık Vardiya Planı'].filter(Boolean).join(' · ')

  return el('div', { backgroundColor: COLORS.navy, padding: `36px ${PADDING}px`, alignItems: 'center', gap: 24 }, [
    logo,
    el('div', { flexDirection: 'column', flexGrow: 1 }, [
      el('div', { color: '#FFFFFF', fontSize: 34, fontWeight: 700 }, input.organizationName),
      el('div', { color: '#CBD5E1', fontSize: 20, marginTop: 4 }, subtitle),
    ]),
    el('div', { backgroundColor: COLORS.darkBlue, color: COLORS.cream, fontSize: 22, fontWeight: 600, padding: '12px 20px', borderRadius: 12, borderLeft: `4px solid ${COLORS.amber}` },
      formatWeekRange(input.weekStart)),
  ])
}

function dayHeaderRow(days: string[]): SatoriElement {
  return el('div', { height: 60, alignItems: 'center', borderBottom: `2px solid ${COLORS.navy}` }, [
    el('div', { width: NAME_COL, fontSize: 18, fontWeight: 600, color: COLORS.muted }, 'Personel'),
    ...days.map((day) => {
      const { weekday, day: dayLabel } = formatDayHeader(day)
      return el('div', { width: DAY_COL, flexDirection: 'column', alignItems: 'center' }, [
        el('div', { fontSize: 18, fontWeight: 700, color: COLORS.navy }, weekday),
        el('div', { fontSize: 15, color: COLORS.muted }, dayLabel),
      ])
    }),
  ])
}

function cell(display: ShiftCodeDisplay | null): SatoriElement {
  const inner = display
    ? el('div', { width: DAY_COL - 12, height: ROW_HEIGHT - 14, borderRadius: 10, backgroundColor: display.color, color: display.textColor, fontSize: display.code.length > 3 ? 16 : 20, fontWeight: 700, alignItems: 'center', justifyContent: 'center' }, display.code)
    : el('div', { width: DAY_COL - 12, height: ROW_HEIGHT - 14, borderRadius: 10, border: `1.5px dashed ${COLORS.border}`, backgroundColor: COLORS.empty })
  return el('div', { width: DAY_COL, justifyContent: 'center' }, inner)
}

function legend(codes: ShiftCodeDefinition[], mask: boolean): SatoriElement {
  // Masked codes collapse into a single "İzinli" entry.
  const seen = new Set<string>()
  const items: { display: ShiftCodeDisplay, hours: string | null }[] = []
  for (const def of codes) {
    const display = toSharedDisplay(def, mask)
    if (seen.has(display.code)) continue
    seen.add(display.code)
    items.push({ display, hours: formatShiftHours(def) })
  }

  return el('div', { flexWrap: 'wrap', gap: 12, padding: `20px ${PADDING}px 0` },
    items.map(({ display, hours }) =>
      el('div', { alignItems: 'center', gap: 10, backgroundColor: '#FFFFFF', border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: '8px 14px 8px 8px' }, [
        el('div', { minWidth: 44, height: 32, padding: '0 8px', borderRadius: 8, backgroundColor: display.color, color: display.textColor, fontSize: 15, fontWeight: 700, alignItems: 'center', justifyContent: 'center' }, display.code),
        ...(display.label !== display.code ? [el('div', { fontSize: 16, color: COLORS.navy, fontWeight: 600 }, display.label)] : []),
        ...(hours ? [el('div', { fontSize: 15, color: COLORS.muted }, hours)] : []),
      ])),
  )
}

export function buildScheduleTemplate(input: ScheduleImageInput): SatoriElement {
  const days = weekDays(input.weekStart)
  const codeMap = new Map(input.shiftCodes.map(def => [def.code, def]))

  const displayFor = (code: string | null): ShiftCodeDisplay | null => {
    if (!code) return null
    const def = codeMap.get(code)
    // Unknown codes still render (neutral) instead of silently disappearing.
    return def ? toSharedDisplay(def, input.maskSensitiveCodes) : { code, label: code, color: '#F1F5F9', textColor: COLORS.navy }
  }

  // Group rows by department, preserving the incoming order (already sorted by the caller).
  const groups = new Map<string, typeof input.rows>()
  for (const row of input.rows) {
    const list = groups.get(row.department) ?? []
    list.push(row)
    groups.set(row.department, list)
  }

  const bodyRows: SatoriElement[] = []
  for (const [department, rows] of groups) {
    bodyRows.push(el('div', { height: 40, alignItems: 'flex-end', paddingBottom: 6, fontSize: 15, fontWeight: 700, color: COLORS.teal, letterSpacing: 1 }, department.toLocaleUpperCase('tr-TR')))
    rows.forEach((row, index) => {
      bodyRows.push(el('div', { height: ROW_HEIGHT, alignItems: 'center', backgroundColor: index % 2 === 0 ? '#FFFFFF' : '#FBFAF7', borderBottom: `1px solid ${COLORS.border}` }, [
        el('div', { width: NAME_COL, paddingLeft: 8, fontSize: 19, fontWeight: 600, color: COLORS.navy, overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }, row.employeeName),
        ...days.map((_, i) => cell(displayFor(row.codes[i] ?? null))),
      ]))
    })
  }

  const workingCounts = days.map((_, i) =>
    input.rows.filter(row => codeMap.get(row.codes[i] ?? '')?.kind === 'WORK').length)

  const countsRow = el('div', { height: 52, alignItems: 'center', marginTop: 8, backgroundColor: COLORS.cream, borderRadius: 12 }, [
    el('div', { width: NAME_COL, paddingLeft: 8, fontSize: 17, fontWeight: 600, color: COLORS.muted }, 'Çalışan sayısı'),
    ...workingCounts.map(count => el('div', { width: DAY_COL, justifyContent: 'center', fontSize: 20, fontWeight: 700, color: COLORS.navy }, String(count))),
  ])

  return el('div', { width: IMAGE_WIDTH, flexDirection: 'column', backgroundColor: '#FFFFFF', fontFamily: SCHEDULE_FONT_FAMILY, paddingBottom: 28 }, [
    header(input),
    el('div', { flexDirection: 'column', padding: `12px ${PADDING}px 0` }, [dayHeaderRow(days), ...bodyRows, countsRow]),
    legend(input.shiftCodes, input.maskSensitiveCodes),
    el('div', { justifyContent: 'space-between', padding: `24px ${PADDING}px 0`, fontSize: 14, color: COLORS.muted }, [
      el('div', {}, input.footerNote ?? ''),
      el('div', { fontWeight: 600 }, 'Rotiqa ile hazırlandı'),
    ]),
  ])
}
