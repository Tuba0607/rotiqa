import { Resvg } from '@resvg/resvg-js'
import satori from 'satori'
import { buildScheduleTemplate, IMAGE_WIDTH } from './template'
import type { ScheduleImageFont, ScheduleImageInput } from './types'

/** Output is rendered at 2x for crisp text on phone screens after WhatsApp compression. */
export const IMAGE_SCALE = 2

export async function renderScheduleSvg(input: ScheduleImageInput, fonts: ScheduleImageFont[]): Promise<string> {
  if (fonts.length === 0) throw new Error('At least one font is required to render the schedule image')
  // Satori is typed against React's ReactNode but only reads { type, props }; we don't ship React.
  const element = buildScheduleTemplate(input) as unknown as Parameters<typeof satori>[0]
  return satori(element, { width: IMAGE_WIDTH, fonts })
}

export async function renderSchedulePng(input: ScheduleImageInput, fonts: ScheduleImageFont[]): Promise<Buffer> {
  const svg = await renderScheduleSvg(input, fonts)
  const resvg = new Resvg(svg, {
    fitTo: { mode: 'width', value: IMAGE_WIDTH * IMAGE_SCALE },
    font: { loadSystemFonts: false },
  })
  return resvg.render().asPng()
}
