import { loadScheduleFonts } from '../../modules/schedule-image/fonts'
import { renderSchedulePng } from '../../modules/schedule-image/render'
import { SAMPLE_SCHEDULE_IMAGE } from '../../modules/schedule-image/sample'

/** F0 spike: renders the sample schedule as PNG. Development only. */
export default defineEventHandler(async (event) => {
  if (!import.meta.dev) throw createError({ statusCode: 404 })

  const storage = useStorage('assets:server')
  const fonts = await loadScheduleFonts(file => storage.getItemRaw<Buffer>(file))
  const png = await renderSchedulePng(SAMPLE_SCHEDULE_IMAGE, fonts)

  setResponseHeaders(event, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store' })
  return png
})
