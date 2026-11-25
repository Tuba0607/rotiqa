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
    for (const row of SAMPLE_SCHEDULE_IMAGE.rows) expect(text).toContain(row.employeeName.toLocaleUpperCase('tr-TR'))
    expect(text).toContain('KORDON BİSTRO')
    expect(text.some(line => line.includes('23–29 Kasım 2026'))).toBe(true)
  })

  it('hides medical report codes when masking is on', () => {
    const text = collectText(buildScheduleTemplate({ ...SAMPLE_SCHEDULE_IMAGE, maskSensitiveCodes: true }))
    expect(text).not.toContain('R')
    expect(text).not.toContain('Raporlu')
    expect(text).toContain('İZİNLİ')
  })

  it('shows medical report codes when masking is off', () => {
    const text = collectText(buildScheduleTemplate({ ...SAMPLE_SCHEDULE_IMAGE, maskSensitiveCodes: false }))
    expect(text).toContain('R')
    expect(text).toContain('Raporlu')
  })

  it('colors the name column by department and lists departments in the legend', () => {
    const template = buildScheduleTemplate({ ...SAMPLE_SCHEDULE_IMAGE, departments: [{ name: 'Salon', color: '#112233' }] })
    const json = JSON.stringify(template)
    expect(json).toContain('#112233') // organization override
    expect(json).toContain('#24466F') // Mutfak was not configured → default palette color
    expect(collectText(template)).toEqual(expect.arrayContaining(['Salon', 'Mutfak']))
  })

  it('uppercases names with Turkish rules', () => {
    const text = collectText(buildScheduleTemplate(SAMPLE_SCHEDULE_IMAGE))
    expect(text).toContain('İREM ŞAHİN')
    expect(text).toContain('ILGIN ER')
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
    const { width } = pngSize(png)
    expect(width).toBe(IMAGE_WIDTH * IMAGE_SCALE)
    expect(width).toBe(1800)
  })

  it('grows with the number of employees', async () => {
    const fonts = await loadFonts()
    const small = await renderSchedulePng({ ...SAMPLE_SCHEDULE_IMAGE, rows: SAMPLE_SCHEDULE_IMAGE.rows.slice(0, 2) }, fonts)
    const full = await renderSchedulePng(SAMPLE_SCHEDULE_IMAGE, fonts)
    expect(pngSize(full).height).toBeGreaterThan(pngSize(small).height)
  })
})
