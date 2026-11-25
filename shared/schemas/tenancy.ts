import { z } from 'zod'

/** IANA zones known to the runtime (Node and modern browsers). */
export function isValidTimeZone(value: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: value })
    return true
  }
  catch {
    return false
  }
}

const name = (label: string, max = 80) =>
  z.string({ error: `${label} gerekli.` })
    .trim()
    .min(1, `${label} gerekli.`)
    .max(max, `${label} en fazla ${max} karakter olabilir.`)

export const timeZoneSchema = z.string().trim().refine(isValidTimeZone, 'Geçerli bir saat dilimi seçin.')

export const createOrganizationSchema = z.object({
  name: name('İşletme adı'),
  locationName: name('Şube adı'),
  timezone: timeZoneSchema.default('Europe/Istanbul'),
})

export const updateOrganizationSchema = z.object({
  name: name('İşletme adı'),
})

export const locationSchema = z.object({
  name: name('Şube adı'),
  timezone: timeZoneSchema,
})

export const updateLocationSchema = locationSchema.partial().extend({
  isActive: z.boolean().optional(),
})

export const createInvitationSchema = z.object({
  email: z.email('Geçerli bir e-posta adresi girin.').trim().toLowerCase(),
  locationIds: z.array(z.uuid('Geçersiz şube.')).min(1, 'En az bir şube seçin.').max(100),
})

export type CreateOrganizationInput = z.infer<typeof createOrganizationSchema>
export type LocationInput = z.infer<typeof locationSchema>
export type UpdateLocationInput = z.infer<typeof updateLocationSchema>
export type CreateInvitationInput = z.infer<typeof createInvitationSchema>
