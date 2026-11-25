import { z } from 'zod'

const hexColor = z.string().trim().regex(/^#[0-9A-Fa-f]{6}$/, 'Renk #RRGGBB biçiminde olmalı.').transform(value => value.toUpperCase())

const personName = (label: string) =>
  z.string({ error: `${label} gerekli.` }).trim().min(1, `${label} gerekli.`).max(60, `${label} en fazla 60 karakter olabilir.`)

export const departmentSchema = z.object({
  name: z.string({ error: 'Departman adı gerekli.' }).trim().min(1, 'Departman adı gerekli.').max(60, 'Departman adı en fazla 60 karakter olabilir.'),
  color: hexColor.optional(),
})

export const updateDepartmentSchema = departmentSchema.partial().extend({
  isActive: z.boolean().optional(),
  sortOrder: z.number().int().min(0).max(10_000).optional(),
})

export const employeeSchema = z.object({
  firstName: personName('Ad'),
  lastName: personName('Soyad'),
  locationId: z.uuid('Şube seçin.'),
  departmentId: z.uuid('Geçersiz departman.').nullable().optional(),
})

export const updateEmployeeSchema = employeeSchema.partial()

export const employeeListQuerySchema = z.object({
  locationId: z.uuid('Şube seçin.'),
  status: z.enum(['active', 'archived']).default('active'),
})

export const reorderEmployeesSchema = z.object({
  locationId: z.uuid(),
  employeeIds: z.array(z.uuid()).min(1).max(1000),
})

export type DepartmentInput = z.infer<typeof departmentSchema>
export type UpdateDepartmentInput = z.infer<typeof updateDepartmentSchema>
export type EmployeeInput = z.infer<typeof employeeSchema>
export type UpdateEmployeeInput = z.infer<typeof updateEmployeeSchema>
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>
