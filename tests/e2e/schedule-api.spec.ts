import { randomUUID } from 'node:crypto'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { registerWithOrganization } from './helpers'

/** Scheduling API end to end: real session cookies, production build, runtime DB role. */

const WEEK = '2026-11-23'

async function setup(request: APIRequestContext, slug: string) {
  const overview = await (await request.get(`/api/orgs/${slug}`)).json()
  const locationId: string = overview.locations[0].id
  const employee = await (await request.post(`/api/orgs/${slug}/employees`, { data: { firstName: 'Deniz', lastName: 'Örnek', locationId } })).json()
  const codes: { id: string, code: string }[] = await (await request.get(`/api/orgs/${slug}/shift-codes`)).json()
  return { locationId, employeeId: employee.id as string, codeA: codes.find(c => c.code === 'A')!.id, codeOff: codes.find(c => c.code === 'OFF')!.id }
}

test.describe('scheduling API', () => {
  test.skip(({ isMobile }) => isMobile, 'API-level checks; one browser project is enough.')

  test('loads a week, autosaves idempotently and reports conflicts', async ({ page }) => {
    const { basePath } = await registerWithOrganization(page, 'Plan API Lokantası')
    const slug = basePath.split('/').pop()!
    const { locationId, employeeId, codeA, codeOff } = await setup(page.request, slug)

    const codes = await (await page.request.get(`/api/orgs/${slug}/shift-codes`)).json()
    expect(codes.map((c: { code: string }) => c.code)).toEqual(['A', 'B', 'C', 'OFF', 'R', 'Y.İ'])

    const empty = await (await page.request.get(`/api/orgs/${slug}/schedule`, { params: { locationId, week: '2026-11-25' } })).json()
    expect(empty.week).toMatchObject({ weekStart: WEEK, exists: false, version: 0 })
    expect(empty.employees.map((e: { id: string }) => e.id)).toEqual([employeeId])

    const clientMutationId = randomUUID()
    const body = { locationId, weekStart: WEEK, clientMutationId, changes: [{ employeeId, workDate: WEEK, expected: null, value: { shiftCodeId: codeA } }] }
    const saved = await (await page.request.post(`/api/orgs/${slug}/schedule/changes`, { data: body })).json()
    expect(saved).toMatchObject({ duplicate: false, version: 1, conflicts: [] })

    const retried = await (await page.request.post(`/api/orgs/${slug}/schedule/changes`, { data: body })).json()
    expect(retried).toMatchObject({ duplicate: true, changeSetId: saved.changeSetId, version: 1 })

    // A stale client (still thinks the cell is empty) must not overwrite it.
    const stale = await (await page.request.post(`/api/orgs/${slug}/schedule/changes`, {
      data: { ...body, clientMutationId: randomUUID(), changes: [{ employeeId, workDate: WEEK, expected: null, value: { shiftCodeId: codeOff } }] },
    })).json()
    expect(stale.applied).toEqual([])
    expect(stale.conflicts[0].cell).toMatchObject({ code: 'A' })

    const undo = await page.request.post(`/api/orgs/${slug}/schedule/revert`, { data: { locationId, weekStart: WEEK, changeSetId: saved.changeSetId, clientMutationId: randomUUID() } })
    expect(undo.status()).toBe(200)
    const after = await (await page.request.get(`/api/orgs/${slug}/schedule`, { params: { locationId, week: WEEK } })).json()
    expect(after.cells).toEqual([])
    expect(after.week.version).toBe(2)
  })

  test('copies the previous week and lists the history for undo/redo', async ({ page }) => {
    const { basePath } = await registerWithOrganization(page, 'Plan Kopya Lokantası')
    const slug = basePath.split('/').pop()!
    const { locationId, employeeId, codeA } = await setup(page.request, slug)
    const NEXT = '2026-11-30'

    const saved = await (await page.request.post(`/api/orgs/${slug}/schedule/changes`, {
      data: { locationId, weekStart: WEEK, clientMutationId: randomUUID(), changes: [{ employeeId, workDate: WEEK, expected: null, value: { shiftCodeId: codeA } }] },
    })).json()
    expect(saved.version).toBe(1)

    const copyBody = { locationId, weekStart: NEXT, clientMutationId: randomUUID() }
    const copied = await page.request.post(`/api/orgs/${slug}/schedule/copy-week`, { data: copyBody })
    expect(copied.status()).toBe(200)
    expect(await copied.json()).toMatchObject({ sourceWeekStart: WEEK, duplicate: false, applied: [{ employeeId, workDate: NEXT }] })
    expect(await (await page.request.post(`/api/orgs/${slug}/schedule/copy-week`, { data: copyBody })).json()).toMatchObject({ duplicate: true })

    const next = await (await page.request.get(`/api/orgs/${slug}/schedule`, { params: { locationId, week: NEXT } })).json()
    expect(next.cells).toMatchObject([{ employeeId, workDate: NEXT, code: 'A' }])

    const history = await (await page.request.get(`/api/orgs/${slug}/schedule/history`, { params: { locationId, week: NEXT } })).json()
    expect(history).toMatchObject([{ kind: 'COPY_WEEK', cellCount: 1, canRevert: true, revertedById: null }])

    const empty = await page.request.post(`/api/orgs/${slug}/schedule/copy-week`, { data: { locationId, weekStart: '2026-12-21', clientMutationId: randomUUID() } })
    expect(empty.status()).toBe(422)
    expect((await empty.json()).data.message).toBe('Kopyalanacak haftada planlanmış vardiya yok.')
  })

  test('rejects anonymous, cross-site and cross-tenant requests with Turkish errors', async ({ page, browser, playwright }) => {
    const { basePath } = await registerWithOrganization(page, 'Plan Güvenlik Lokantası')
    const slug = basePath.split('/').pop()!
    const { locationId, employeeId, codeA } = await setup(page.request, slug)
    const body = { locationId, weekStart: WEEK, clientMutationId: randomUUID(), changes: [{ employeeId, workDate: WEEK, expected: null, value: { shiftCodeId: codeA } }] }

    const anonymous = await playwright.request.newContext({ baseURL: new URL(page.url()).origin })
    const anon = await anonymous.post(`/api/orgs/${slug}/schedule/changes`, { data: body })
    expect(anon.status()).toBe(401)
    expect((await anon.json()).data.message).toBe('Devam etmek için giriş yapın.')
    await anonymous.dispose()

    const crossSite = await page.request.post(`/api/orgs/${slug}/schedule/changes`, { data: body, headers: { Origin: 'https://evil.example' } })
    expect(crossSite.status()).toBe(403)

    const otherContext = await browser.newContext()
    const other = await otherContext.newPage()
    await registerWithOrganization(other, 'Başka Plan İşletmesi')
    const foreign = await other.request.post(`/api/orgs/${slug}/schedule/changes`, { data: body })
    expect(foreign.status()).toBe(404)
    expect((await other.request.get(`/api/orgs/${slug}/schedule`, { params: { locationId } })).status()).toBe(404)
    expect((await other.request.get(`/api/orgs/${slug}/schedule/history`, { params: { locationId, week: WEEK } })).status()).toBe(404)
    expect((await other.request.post(`/api/orgs/${slug}/schedule/copy-week`, { data: { locationId, weekStart: '2026-11-30', clientMutationId: randomUUID() } })).status()).toBe(404)
    await otherContext.close()

    const invalid = await page.request.post(`/api/orgs/${slug}/schedule/changes`, { data: { ...body, weekStart: '2026-11-24' } })
    expect(invalid.status()).toBe(422)
    expect((await invalid.json()).data.message).toBe('Hafta pazartesi günü başlamalı.')

    // Nothing was written by the rejected requests.
    const view = await (await page.request.get(`/api/orgs/${slug}/schedule`, { params: { locationId, week: WEEK } })).json()
    expect(view.cells).toEqual([])
  })
})
