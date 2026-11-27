import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { registerWithOrganization } from './helpers'

/** Read-only weekly table (F2.3) against the real scheduling API. All names are fictional. */

const WEEK = '2026-11-23'

async function seed(page: Page, slug: string) {
  const api = `/api/orgs/${slug}`
  const overview = await (await page.request.get(api)).json()
  const locationId: string = overview.locations[0].id
  const salon = await (await page.request.post(`${api}/departments`, { data: { name: 'Salon' } })).json()
  const mutfak = await (await page.request.post(`${api}/departments`, { data: { name: 'Mutfak' } })).json()
  const add = async (firstName: string, departmentId: string) =>
    (await (await page.request.post(`${api}/employees`, { data: { firstName, lastName: 'Örnek', locationId, departmentId } })).json()).id as string
  const defne = await add('Defne', salon.id)
  const emir = await add('Emir', salon.id)
  const nehir = await add('Nehir', mutfak.id)
  const serra = await add('Serra', mutfak.id)
  const codes: { id: string, code: string }[] = await (await page.request.get(`${api}/shift-codes`)).json()
  const code = (c: string) => codes.find(x => x.code === c)!.id
  const changes = [
    { employeeId: defne, workDate: '2026-11-23', expected: null, value: { shiftCodeId: code('A') } },
    { employeeId: emir, workDate: '2026-11-23', expected: null, value: { shiftCodeId: code('OFF') } },
    { employeeId: nehir, workDate: '2026-11-23', expected: null, value: { shiftCodeId: code('C') } },
    { employeeId: nehir, workDate: '2026-11-29', expected: null, value: { shiftCodeId: code('B') } },
    // Sick leave and annual leave are not working shifts.
    { employeeId: serra, workDate: '2026-11-23', expected: null, value: { shiftCodeId: code('R') } },
    { employeeId: serra, workDate: '2026-11-24', expected: null, value: { shiftCodeId: code('Y.İ') } },
  ]
  const saved = await page.request.post(`${api}/schedule/changes`, { data: { locationId, weekStart: WEEK, clientMutationId: randomUUID(), changes } })
  expect(saved.status()).toBe(200)
  return { locationId }
}

test('shows the week grouped by department with daily totals and week navigation', async ({ page, isMobile }) => {
  const { basePath } = await registerWithOrganization(page, 'Tablo Kontrol Lokantası')
  const { locationId } = await seed(page, basePath.split('/').pop()!)

  await page.goto(`${basePath}/vardiya?hafta=2026-11-25`)
  await expect(page).toHaveURL(new RegExp(`sube=${locationId}.*hafta=${WEEK}|hafta=${WEEK}.*sube=${locationId}`))
  await expect(page.getByTestId('week-label')).toHaveText('23–29 Kasım 2026')

  const table = page.getByRole('table')
  await expect(table).toBeVisible()
  // Departments keep their order; staff keep the staff-page order inside each group.
  const groups = page.getByTestId('department-group')
  await expect(groups).toHaveCount(2)
  await expect(groups.nth(0).getByRole('rowheader')).toHaveText(['SALON2 kişi', 'DEFNE ÖRNEK', 'EMİR ÖRNEK'])
  await expect(groups.nth(1).getByRole('rowheader')).toHaveText(['MUTFAK2 kişi', 'NEHİR ÖRNEK', 'SERRA ÖRNEK'])
  // Department counts follow the same rule: Monday Salon 1 (A; OFF not counted), Mutfak 1 (C; R not counted).
  await expect(groups.nth(0).getByRole('row').first().getByRole('cell')).toHaveText(['1 çalışan', '0 çalışan', '0 çalışan', '0 çalışan', '0 çalışan', '0 çalışan', '0 çalışan'])
  await expect(groups.nth(1).getByRole('row').first().getByRole('cell')).toHaveText(['1 çalışan', '0 çalışan', '0 çalışan', '0 çalışan', '0 çalışan', '0 çalışan', '1 çalışan'])

  const defne = page.getByTestId('schedule-row').filter({ hasText: 'DEFNE' })
  await expect(defne.getByRole('cell').first()).toContainText('A')
  await expect(defne.locator('td[data-empty]')).toHaveCount(6)

  // Monday: Defne (A) and Nehir (C) work; Emir (OFF) and Serra (R) do not; nobody is empty.
  // Tuesday: Serra is on annual leave (Y.İ): not working and not empty.
  const working = page.getByTestId('total-working').getByRole('cell')
  const empty = page.getByTestId('total-empty').getByRole('cell')
  await expect(working).toHaveText(['2', '0', '0', '0', '0', '0', '1'])
  await expect(empty).toHaveText(['0', '3', '4', '4', '4', '4', '3'])
  await expect(page.getByTestId('schedule-summary')).toHaveText('4 personel · 6 vardiya · 22 boş hücre')
  await expect(page.getByText('Taslak')).toBeVisible()

  // Read-only: no editable cells or buttons inside the table.
  await expect(table.getByRole('button')).toHaveCount(0)

  // Next week is empty: table stays, with a notice.
  await page.getByRole('button', { name: 'Sonraki hafta' }).click()
  await expect(page.getByTestId('week-label')).toHaveText('30 Kasım – 6 Aralık 2026')
  await expect(page).toHaveURL(/hafta=2026-11-30/)
  await expect(page.getByText('Bu hafta için henüz vardiya planlanmamış.')).toBeVisible()
  await expect(page.getByTestId('total-working').getByRole('cell')).toHaveText(Array(7).fill('0'))
  await page.getByRole('button', { name: 'Önceki hafta' }).click()
  await expect(page.getByTestId('schedule-summary')).toContainText('6 vardiya')

  // "Bu hafta" jumps back from any other week (a week in the past, so the test does not depend on today).
  await page.goto(`${basePath}/vardiya?hafta=2020-01-08`)
  await expect(page.getByTestId('week-label')).toHaveText('6–12 Ocak 2020')
  await page.getByRole('button', { name: 'Bu hafta' }).click()
  await expect(page.getByRole('button', { name: 'Bu hafta' })).toBeDisabled()
  await expect(page).not.toHaveURL(/hafta=2020-01-06/)

  if (isMobile) {
    for (const width of [360, 390]) {
      await page.setViewportSize({ width, height: 800 })
      await page.goto(`${basePath}/vardiya?hafta=${WEEK}`)
      await expect(page.getByRole('table')).toBeVisible()
      // The page never scrolls sideways; only the table does, and names stay pinned.
      expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
      const scroller = page.getByTestId('schedule-scroll')
      const name = page.getByRole('rowheader', { name: 'DEFNE ÖRNEK' })
      const before = (await name.boundingBox())!.x
      await scroller.evaluate(el => el.scrollTo({ left: 400 }))
      expect(Math.abs((await name.boundingBox())!.x - before)).toBeLessThanOrEqual(2)
      // Readable on phones: the week does not get squeezed in; cells stay ≥ 44px, codes 14px, names 12px.
      expect(await scroller.evaluate(el => el.scrollWidth > el.clientWidth)).toBe(true)
      const firstCell = defne.getByRole('cell').first()
      expect((await firstCell.boundingBox())!.width).toBeGreaterThanOrEqual(44)
      expect(await firstCell.locator('span').first().evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(14)
      expect(await name.locator('span').first().evaluate(el => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(12)
      // The fixed bottom tab bar never covers the last rows or the legend once scrolled to the end.
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight))
      const navTop = (await page.getByRole('navigation', { name: 'Ana menü' }).filter({ visible: true }).boundingBox())!.y
      for (const target of [page.getByTestId('total-empty'), page.getByRole('list', { name: 'Vardiya kodları' })]) {
        const box = (await target.boundingBox())!
        expect(box.y + box.height).toBeLessThanOrEqual(navTop)
      }
      // Week controls keep 44px touch targets.
      for (const label of ['Önceki hafta', 'Sonraki hafta']) {
        const box = (await page.getByRole('button', { name: label }).boundingBox())!
        expect(box.width).toBeGreaterThanOrEqual(44)
        expect(box.height).toBeGreaterThanOrEqual(44)
      }
    }
  }
})

test('shows an empty state when the branch has no staff', async ({ page }) => {
  const { basePath } = await registerWithOrganization(page, 'Boş Tablo Lokantası')
  await page.goto(`${basePath}/vardiya`)
  await expect(page.getByText('Bu şubede henüz personel yok')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Personel ekle' })).toBeVisible()
})

test('shows an error with a retry when the schedule cannot be loaded', async ({ page }) => {
  const { basePath } = await registerWithOrganization(page, 'Hata Tablo Lokantası')
  await page.route('**/schedule?*', route => route.fulfill({ status: 500, contentType: 'application/json', body: JSON.stringify({ statusCode: 500, message: 'Sunucu hatası' }) }))
  await page.goto(`${basePath}/vardiya`)
  await page.getByRole('link', { name: 'Personel', exact: true }).filter({ visible: true }).first().click()
  await page.getByRole('link', { name: 'Vardiya', exact: true }).filter({ visible: true }).first().click()
  await expect(page.getByRole('alert')).toContainText('Vardiya planı yüklenemedi.')
  await page.unroute('**/schedule?*')
  await page.getByRole('button', { name: 'Tekrar dene' }).click()
  await expect(page.getByText('Bu şubede henüz personel yok')).toBeVisible()
})
