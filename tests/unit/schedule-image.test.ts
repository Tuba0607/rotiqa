import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { loadScheduleFonts, SCHEDULE_FONT_FAMILY } from '../../server/modules/schedule-image/fonts'
import { IMAGE_SCALE, renderSchedulePng } from '../../server/modules/schedule-image/render'
import { SAMPLE_SCHEDULE_IMAGE } from '../../server/modules/schedule-image/sample'
import { buildScheduleTemplate, IMAGE_WIDTH, type SatoriElement } from '../../server/modules/schedule-image/template'

const assetsDir = fileURLToPath(new URL('../../server/assets/', import.meta.url))
const loadFonts = () => loadScheduleFonts(file => readFile(assetsDir + file))

function collectText(node: SatoriElement | string | number | null | undefined): string[] {
  if (node === null || node === undefined) return []
  if (typeof node !== 'object') return [String(node)]
  const children = node.props.children
  return (Array.isArray(children) ? children : [children]).flatMap(child => collectText(child))
}

function pngSize(png: Buffer) {
  return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
}

describe('schedule image template', () => {
  it('includes every employee, the organization and the week range', () => {
    const text = collectText(buildScheduleTemplate(SAMPLE_SCHEDULE_IMAGE))
    for (const row of SAMPLE_SCHEDULE_IMAGE.rows) expect(text).toContain(row.employeeName)
    expect(text).toContain('Kordon Bistro')
    expect(text).toContain('23–29 Kasım 2026')
  })

  it('hides medical report codes when masking is on', () => {
    const text = collectText(buildScheduleTemplate({ ...SAMPLE_SCHEDULE_IMAGE, maskSensitiveCodes: true }))
    expect(text).not.toContain('R')
    expect(text).not.toContain('Raporlu')
    expect(text).toContain('İzinli')
  })

  it('shows medical report codes when masking is off', () => {
    const text = collectText(buildScheduleTemplate({ ...SAMPLE_SCHEDULE_IMAGE, maskSensitiveCodes: false }))
    expect(text).toContain('R')
    expect(text).toContain('Raporlu')
  })

  it('counts only working shifts per day', () => {
    const text = collectText(buildScheduleTemplate({
      ...SAMPLE_SCHEDULE_IMAGE,
      rows: [
        { employeeName: 'X', department: 'D', codes: ['A', 'OFF', 'R', null, 'B', 'C', 'Y.İ'] },
        { employeeName: 'Y', department: 'D', codes: ['C', 'A', 'OFF', null, 'B', 'OFF', 'A'] },
      ],
    }))
    const countsStart = text.indexOf('Çalışan sayısı')
    expect(text.slice(countsStart + 1, countsStart + 8)).toEqual(['2', '1', '0', '0', '2', '1', '1'])
  })
})

describe('schedule image fonts', () => {
  // Regression: Satori does not fall back between fonts sharing a name, which rendered ş/ğ/İ as boxes.
  it('registers the Turkish (latin-ext) subset as its own fallback family', async () => {
    const fonts = await loadFonts()
    expect(new Set(fonts.map(font => font.name))).toEqual(new Set(['Inter', 'Inter Ext']))
    expect(buildScheduleTemplate(SAMPLE_SCHEDULE_IMAGE).props.style?.fontFamily).toBe(SCHEDULE_FONT_FAMILY)
    expect(SCHEDULE_FONT_FAMILY).toBe('"Inter", "Inter Ext"')
  })
})

describe('renderSchedulePng', () => {
  it('produces a high resolution PNG from data', async () => {
    const png = await renderSchedulePng(SAMPLE_SCHEDULE_IMAGE, await loadFonts())

    expect(png.subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))
    const { width, height } = pngSize(png)
    expect(width).toBe(IMAGE_WIDTH * IMAGE_SCALE)
    expect(height).toBeGreaterThan(width) // tall enough to include every row
  })

  it('grows with the number of employees', async () => {
    const fonts = await loadFonts()
    const small = await renderSchedulePng({ ...SAMPLE_SCHEDULE_IMAGE, rows: SAMPLE_SCHEDULE_IMAGE.rows.slice(0, 2) }, fonts)
    const full = await renderSchedulePng(SAMPLE_SCHEDULE_IMAGE, fonts)
    expect(pngSize(full).height).toBeGreaterThan(pngSize(small).height)
  })
})
