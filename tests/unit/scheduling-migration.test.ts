import { readdirSync, readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { defaultShiftCodeRows, toMinutes } from '../../server/modules/scheduling/shift-codes'
import { DEFAULT_SHIFT_CODES } from '../../shared/utils/shift-codes'

const migrationsDir = new URL('../../prisma/migrations/', import.meta.url)
const schedulingDir = readdirSync(migrationsDir).find(name => name.endsWith('_scheduling'))!
const sql = readFileSync(new URL(`${schedulingDir}/migration.sql`, migrationsDir), 'utf8')

describe('scheduling migration', () => {
  it('backfills exactly the starter codes new organizations get', () => {
    const values = [...sql.matchAll(/\('([^']+)', '([^']+)', '(WORK|OFF|LEAVE|SICK)', '(#[0-9A-F]{6})', (\d+)\)/g)]
      .map(([, code, label, kind, color, order]) => ({ code, label, kind, color, sortOrder: Number(order) }))
    expect(values).toEqual(DEFAULT_SHIFT_CODES.map((def, index) => ({ code: def.code, label: def.label, kind: def.kind, color: def.color, sortOrder: index })))
  })

  it('only adds codes to organizations that have none', () => {
    expect(sql).toContain('WHERE NOT EXISTS (SELECT 1 FROM shift_codes s WHERE s.organization_id = o.id)')
  })

  it('is additive: drops nothing and does not alter existing columns', () => {
    expect(sql).not.toMatch(/\bDROP\b/i)
    expect(sql).not.toMatch(/ALTER TABLE "?(users|organizations|locations|memberships|employees|departments)"? (ALTER|DROP)/i)
  })
})

describe('shift code helpers', () => {
  it('converts HH:mm to minutes, including 24:00', () => {
    expect(toMinutes('08:00')).toBe(480)
    expect(toMinutes('24:00')).toBe(1440)
    expect(toMinutes(null)).toBeNull()
  })

  it('builds starter rows with no hours and stable order', () => {
    const rows = defaultShiftCodeRows('org-id')
    expect(rows.map(r => [r.code, r.sortOrder, r.startMinute, r.endMinute])).toEqual(
      DEFAULT_SHIFT_CODES.map((def, i) => [def.code, i, null, null]),
    )
  })
})
