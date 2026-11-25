import type { ScheduleImageFont } from './types'

/**
 * Inter subsets bundled in server/assets/fonts. latin-ext covers Turkish (ğ, ş, İ).
 * Satori does not fall back between fonts sharing a name, so each subset gets its own
 * family and the template lists both (see SCHEDULE_FONT_FAMILY).
 */
const SUBSETS = [
  { subset: 'latin', name: 'Inter' },
  { subset: 'latin-ext', name: 'Inter Ext' },
] as const

export const SCHEDULE_FONT_FAMILY = SUBSETS.map(({ name }) => `"${name}"`).join(', ')

export const SCHEDULE_FONT_FILES = [400, 600, 700].flatMap(weight =>
  SUBSETS.map(({ subset, name }) => ({ name, file: `fonts/inter-${subset}-${weight}-normal.woff`, weight: weight as ScheduleImageFont['weight'] })),
)

export async function loadScheduleFonts(readAsset: (file: string) => Promise<ArrayBuffer | Buffer | null>): Promise<ScheduleImageFont[]> {
  return Promise.all(SCHEDULE_FONT_FILES.map(async ({ name, file, weight }) => {
    const data = await readAsset(file)
    if (!data) throw new Error(`Missing font asset: ${file}`)
    return { name, data, weight, style: 'normal' as const }
  }))
}
