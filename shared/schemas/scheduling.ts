import { z } from 'zod'
import { shiftDurationMinutes } from '../utils/schedule-cells'
import { isMonday, startOfWeek } from '../utils/week'

export const MAX_CHANGES_PER_BATCH = 500

export const isoDateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Tarih YYYY-AA-GG biçiminde olmalı.').refine((value) => {
  try {
    startOfWeek(value)
    return true
  }
  catch {
    return false
  }
}, 'Geçersiz tarih.')

const startMinute = z.number().int().min(0).max(1439)
const endMinute = z.number().int().min(1).max(1440)
const breakMinutes = z.number().int().min(0).max(720)

/** Times for one day, overriding the shift code's default hours. */
export const customTimeSchema = z.object({
  startMinute,
  endMinute,
  breakMinutes: breakMinutes.default(0),
}).superRefine((value, ctx) => {
  if (value.startMinute === value.endMinute) {
    ctx.addIssue({ code: 'custom', path: ['endMinute'], message: 'Başlangıç ve bitiş saati aynı olamaz.' })
    return
  }
  if (value.breakMinutes >= shiftDurationMinutes(value.startMinute, value.endMinute)) {
    ctx.addIssue({ code: 'custom', path: ['breakMinutes'], message: 'Mola süresi vardiya süresinden kısa olmalı.' })
  }
})

const noteSchema = z.string().trim().max(500, 'Not en fazla 500 karakter olabilir.').transform(value => value || null).nullable()

/** What the client wants a cell to become (null = clear the cell). */
export const cellInputSchema = z.object({
  shiftCodeId: z.uuid('Geçersiz vardiya kodu.'),
  custom: customTimeSchema.nullable().optional(),
  note: noteSchema.optional(),
})

/** The value the client last saw for a cell (null = empty). */
export const cellValueSchema = z.object({
  shiftCodeId: z.uuid(),
  startMinute: startMinute.nullable(),
  endMinute: endMinute.nullable(),
  breakMinutes,
  isCustomTime: z.boolean(),
  note: z.string().max(500).nullable(),
})

export const cellChangeSchema = z.object({
  employeeId: z.uuid('Geçersiz personel.'),
  workDate: isoDateSchema,
  expected: cellValueSchema.nullable(),
  value: cellInputSchema.nullable(),
})

export const saveChangesSchema = z.object({
  locationId: z.uuid('Şube seçin.'),
  weekStart: isoDateSchema.refine(isMonday, 'Hafta pazartesi günü başlamalı.'),
  clientMutationId: z.uuid(),
  changes: z.array(cellChangeSchema).min(1, 'Kaydedilecek değişiklik yok.').max(MAX_CHANGES_PER_BATCH, `Tek seferde en fazla ${MAX_CHANGES_PER_BATCH} hücre değiştirilebilir.`),
})

export const revertSchema = z.object({
  locationId: z.uuid(),
  weekStart: isoDateSchema.refine(isMonday, 'Hafta pazartesi günü başlamalı.'),
  changeSetId: z.uuid(),
  clientMutationId: z.uuid(),
})

export const weekQuerySchema = z.object({
  locationId: z.uuid('Şube seçin.'),
  week: isoDateSchema.optional(),
})

/**
 * Copies one week's plan into another week of the same location (default: the previous week).
 * `fill-empty` never touches cells that already hold a shift; `overwrite` replaces them.
 */
export const copyWeekSchema = z.object({
  locationId: z.uuid('Şube seçin.'),
  weekStart: isoDateSchema.refine(isMonday, 'Hafta pazartesi günü başlamalı.'),
  sourceWeekStart: isoDateSchema.refine(isMonday, 'Kaynak hafta pazartesi günü başlamalı.').optional(),
  mode: z.enum(['fill-empty', 'overwrite']).default('fill-empty'),
  clientMutationId: z.uuid(),
}).refine(value => value.sourceWeekStart !== value.weekStart, { path: ['sourceWeekStart'], message: 'Kaynak hafta ile hedef hafta aynı olamaz.' })

export const MAX_HISTORY_ITEMS = 100

export const historyQuerySchema = z.object({
  locationId: z.uuid('Şube seçin.'),
  week: isoDateSchema.refine(isMonday, 'Hafta pazartesi günü başlamalı.'),
  limit: z.coerce.number().int().min(1).max(MAX_HISTORY_ITEMS).default(50),
})

export type CellInput = z.infer<typeof cellInputSchema>
export type CellChangeInput = z.infer<typeof cellChangeSchema>
export type SaveChangesInput = z.infer<typeof saveChangesSchema>
export type RevertInput = z.infer<typeof revertSchema>
export type CopyWeekInput = z.input<typeof copyWeekSchema>
