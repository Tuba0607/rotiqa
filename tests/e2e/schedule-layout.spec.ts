import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { registerWithOrganization } from './helpers'

/** Schedule page layout: the table never covers the header, toasts never move the table. */

const WEEK = '2026-11-23'
const NAMES = ['Defne', 'Emir', 'Lale', 'Kaan', 'Selin', 'Nehir', 'Tuna', 'Ilgaz', 'Berk', 'Ece', 'Mert', 'Serra']

async function seed(page: Page) {
  const { basePath } = await registerWithOrganization(page, 'Yerleşim Lokantası')
  const slug = basePath.split('/').pop()!
  const api = `/api/orgs/${slug}`
  const locationId: string = (await (await page.request.get(api)).json()).locations[0].id
  const departments = await Promise.all(['Salon', 'Mutfak', 'Bar'].map(async name => (await (await page.request.post(`${api}/departments`, { data: { name } })).json()).id as string))
  const ids: string[] = []
  for (const [i, firstName] of NAMES.entries()) {
    ids.push((await (await page.request.post(`${api}/employees`, { data: { firstName, lastName: 'Örnek', locationId, departmentId: departments[i % 3] } })).json()).id)
  }
  const codes: { id: string, code: string }[] = await (await page.request.get(`${api}/shift-codes`)).json()
  const a = codes.find(c => c.code === 'A')!.id
  const changes = ids.map(employeeId => ({ employeeId, workDate: WEEK, expected: null, value: { shiftCodeId: a } }))
  expect((await page.request.post(`${api}/schedule/changes`, { data: { locationId, weekStart: WEEK, clientMutationId: randomUUID(), changes } })).status()).toBe(200)
  return basePath
}

const widths = (isMobile: boolean) => (isMobile ? [360, 390] : [1280])
const tableTop = (page: Page) => page.getByTestId('schedule-scroll').evaluate(el => el.getBoundingClientRect().top + window.scrollY)

test('no table cell, department row or header cell ever covers the page header or tab bar', async ({ page, isMobile }) => {
  const basePath = await seed(page)
  for (const width of widths(isMobile)) {
    await page.setViewportSize({ width, height: isMobile ? 780 : 800 })
    await page.goto(`${basePath}/vardiya?hafta=${WEEK}`)
    await expect(page.getByRole('table')).toBeVisible()
    // Scroll the page top to bottom (and the table sideways) and probe the header and tab bar.
    const covered = await page.evaluate(async () => {
      const header = document.querySelector('header')!
      const tabBar = [...document.querySelectorAll('nav')].find(n => getComputedStyle(n).position === 'fixed' && n.getBoundingClientRect().height > 0) ?? null
      const scroller = document.querySelector<HTMLElement>('[data-testid="schedule-scroll"]')!
      const bad: string[] = []
      const max = document.documentElement.scrollHeight - innerHeight
      for (const left of [0, 9999]) {
        scroller.scrollLeft = left
        for (let y = 0; y <= max + 40; y += 30) {
          window.scrollTo(0, y)
          await new Promise(r => requestAnimationFrame(() => r(null)))
          const h = header.getBoundingClientRect()
          for (let x = 2; x < innerWidth; x += 20) {
            for (const py of [h.top + 1, h.top + h.height / 2, h.bottom - 1]) {
              const el = document.elementFromPoint(x, py)
              if (el && !header.contains(el)) bad.push(`header y=${y} x=${x}: ${el.tagName}`)
            }
            if (tabBar) {
              const t = tabBar.getBoundingClientRect()
              const el = document.elementFromPoint(x, t.top + t.height / 2)
              if (el && !tabBar.contains(el)) bad.push(`tab bar y=${y} x=${x}: ${el.tagName}`)
            }
          }
        }
      }
      return bad
    })
    expect(covered, covered.slice(0, 5).join('\n')).toEqual([])
    // Department rows scroll with the page (they are not stuck to the top).
    await page.evaluate(() => window.scrollTo(0, 0))
    const before = (await page.getByTestId('department-group').first().getByRole('rowheader').first().boundingBox())!.y
    await page.evaluate(() => window.scrollBy(0, 200))
    const after = (await page.getByTestId('department-group').first().getByRole('rowheader').first().boundingBox())!.y
    expect(Math.round(before - after)).toBe(200)
  }
})

test('toasts are fixed: showing and closing one never moves the table', async ({ page, isMobile }) => {
  const basePath = await seed(page)
  for (const width of widths(isMobile)) {
    await page.setViewportSize({ width, height: isMobile ? 780 : 800 })
    await page.goto(`${basePath}/vardiya?hafta=${WEEK}`)
    await expect(page.getByRole('table')).toBeVisible()
    const start = await tableTop(page)

    // Undo with nothing to undo → info toast; then a real edit, its undo → success toast.
    await page.getByRole('button', { name: /^Defne Örnek, Sal 24:/ }).click()
    await page.getByTestId('shift-picker').getByRole('button', { name: /^B\s*Ara/ }).click()
    await expect(page.getByTestId('save-state').filter({ visible: true })).toHaveText('Kaydedildi')
    expect(await tableTop(page)).toBe(start)

    if (isMobile) {
      await page.getByRole('button', { name: 'Diğer işlemler' }).click()
      await page.getByRole('menuitem', { name: 'Geri al' }).click()
    }
    else await page.getByRole('button', { name: 'Geri al', exact: true }).click()
    const toast = page.getByTestId('toast')
    await expect(toast).toHaveText(/Geri alındı: 1 hücre/)
    await expect(toast).toHaveAttribute('role', 'status')
    expect(await tableTop(page)).toBe(start)

    // Placement: above the tab bar on phones, top right on larger screens; inside the viewport.
    const box = (await toast.boundingBox())!
    const viewport = page.viewportSize()!
    expect(box.x).toBeGreaterThanOrEqual(0)
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width)
    if (isMobile) {
      const tabBar = (await page.getByRole('navigation', { name: 'Ana menü' }).filter({ visible: true }).boundingBox())!
      expect(box.y + box.height).toBeLessThanOrEqual(tabBar.y)
    }
    else {
      expect(box.y).toBeLessThan(120)
      expect(viewport.width - (box.x + box.width)).toBeLessThanOrEqual(24)
    }

    await toast.getByRole('button', { name: 'Bildirimi kapat' }).click()
    await expect(toast).toHaveCount(0)
    expect(await tableTop(page)).toBe(start)
  }
})

test('success toasts close by themselves, error toasts stay until closed', async ({ page }) => {
  const basePath = await seed(page)
  await page.goto(`${basePath}/vardiya?hafta=${WEEK}`)
  await page.route('**/schedule/changes', route => route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ statusCode: 403, message: 'Bu şubeye erişim yetkiniz yok.', data: { code: 'FORBIDDEN', message: 'Bu şubeye erişim yetkiniz yok.' } }) }))
  await page.getByRole('button', { name: /^Emir Örnek, Çar 25:/ }).click()
  await page.getByTestId('shift-picker').getByRole('button', { name: /^C\s*Akşam/ }).click()
  const error = page.getByTestId('toast').filter({ hasText: 'Bu şubeye erişim yetkiniz yok.' })
  await expect(error).toHaveAttribute('role', 'alert')
  await page.unroute('**/schedule/changes')

  await page.getByRole('button', { name: 'Hızlı atama' }).click()
  await page.getByRole('button', { name: /^Defne Örnek, Pzt 23:/ }).click()
  const info = page.getByTestId('toast').filter({ hasText: 'Önce yukarıdan' })
  await expect(info).toBeVisible()
  await expect(info).toBeHidden({ timeout: 8000 })
  await expect(error).toBeVisible()
  await error.getByRole('button', { name: 'Bildirimi kapat' }).click()
  await expect(error).toHaveCount(0)
})
