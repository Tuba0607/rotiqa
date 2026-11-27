import { randomUUID } from 'node:crypto'
import { expect, test, type Page } from '@playwright/test'
import { register, registerWithOrganization, uniqueEmail } from './helpers'

/** Weekly schedule editing (F2.4) through the UI, on the real API. All names are fictional. */

const WEEK = '2026-11-23'
const PREVIOUS = '2026-11-16'

async function seed(page: Page, business: string) {
  const { basePath } = await registerWithOrganization(page, business)
  const slug = basePath.split('/').pop()!
  const api = `/api/orgs/${slug}`
  const locationId: string = (await (await page.request.get(api)).json()).locations[0].id
  const salon = (await (await page.request.post(`${api}/departments`, { data: { name: 'Salon' } })).json()).id as string
  const add = async (firstName: string) =>
    (await (await page.request.post(`${api}/employees`, { data: { firstName, lastName: 'Örnek', locationId, departmentId: salon } })).json()).id as string
  const defne = await add('Defne')
  const emir = await add('Emir')
  const codes: { id: string, code: string }[] = await (await page.request.get(`${api}/shift-codes`)).json()
  const code = (c: string) => codes.find(x => x.code === c)!.id
  const save = (weekStart: string, changes: unknown[]) =>
    page.request.post(`${api}/schedule/changes`, { data: { locationId, weekStart, clientMutationId: randomUUID(), changes } })
  return { basePath, slug, api, locationId, defne, emir, code, save }
}

const cell = (page: Page, name: string, day: string) => page.getByRole('button', { name: new RegExp(`^${name} Örnek, ${day}:`) })
const picker = (page: Page) => page.getByTestId('shift-picker')
// Phones show the compact save state next to the stats, larger screens in the toolbar.
const saveState = (page: Page) => page.getByTestId('save-state').filter({ visible: true })
const saved = (page: Page) => expect(saveState(page)).toHaveText('Kaydedildi')
const toast = (page: Page) => page.getByTestId('toast')

/** Geri al / İleri al / Geçmiş: toolbar buttons on larger screens, the "⋯" menu on phones. */
async function action(page: Page, name: 'Geri al' | 'İleri al' | 'Geçmiş') {
  await expect(page.getByRole('toolbar', { name: 'Plan araçları' })).toBeVisible()
  if (page.viewportSize()!.width >= 640) return page.getByRole('button', { name, exact: true }).click()
  await page.getByRole('button', { name: 'Diğer işlemler' }).click()
  await page.getByRole('menuitem', { name }).click()
}

test('assigns and clears cells with the picker and the keyboard; autosaves', async ({ page, isMobile }) => {
  const { basePath } = await seed(page, 'Düzenleme Lokantası')
  await page.goto(`${basePath}/vardiya?hafta=${WEEK}`)

  await cell(page, 'Defne', 'Pzt 23').click()
  await expect(picker(page)).toBeVisible()
  await expect(picker(page).locator('[data-code]')).toHaveText([/^A\s*Sabah/, /^B\s*Ara/, /^C\s*Akşam/, /^OFF\s*Haftalık izin/, /^R\s*Raporlu/, /^Y\.İ\s*Yıllık izin/])
  // The picker stays on screen (a bottom sheet on phones, above the tab bar).
  const viewport = page.viewportSize()!
  const box = (await picker(page).boundingBox())!
  expect(box.x).toBeGreaterThanOrEqual(0)
  expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1)
  expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1)
  if (isMobile) expect(Math.round(box.y + box.height)).toBe(viewport.height)

  await picker(page).getByRole('button', { name: /^A\s*Sabah/ }).click()
  await expect(picker(page)).toBeHidden()
  await expect(cell(page, 'Defne', 'Pzt 23')).toHaveText(/^A/)
  await saved(page)
  await expect(page.getByTestId('total-working').getByRole('cell').first()).toHaveText('1')

  // Keyboard: arrows move, Enter opens the picker on the current code, Delete clears.
  await cell(page, 'Defne', 'Pzt 23').focus()
  await page.keyboard.press('ArrowRight')
  await expect(cell(page, 'Defne', 'Sal 24')).toBeFocused()
  await page.keyboard.press('Enter')
  await expect(picker(page)).toBeVisible()
  await page.keyboard.press('ArrowRight')
  await page.keyboard.press('Enter')
  await expect(cell(page, 'Defne', 'Sal 24')).toHaveText(/^B/)
  await expect(cell(page, 'Defne', 'Sal 24')).toBeFocused()
  await page.keyboard.press('ArrowDown')
  await expect(cell(page, 'Emir', 'Sal 24')).toBeFocused()
  await page.keyboard.press('Escape')
  await cell(page, 'Defne', 'Pzt 23').focus()
  await page.keyboard.press('Delete')
  await expect(cell(page, 'Defne', 'Pzt 23')).toHaveAccessibleName(/: Boş$/)
  await saved(page)

  await page.reload()
  await expect(cell(page, 'Defne', 'Pzt 23')).toHaveAccessibleName(/: Boş$/)
  await expect(cell(page, 'Defne', 'Sal 24')).toHaveText(/^B/)

  // Clearing from the picker.
  await cell(page, 'Defne', 'Sal 24').click()
  await picker(page).getByRole('button', { name: 'Hücreyi temizle' }).click()
  await expect(cell(page, 'Defne', 'Sal 24')).toHaveAccessibleName(/: Boş$/)
  await saved(page)
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
})

test('quick assign applies one chosen code per tap and can be undone and redone', async ({ page }) => {
  const { basePath } = await seed(page, 'Hızlı Atama Lokantası')
  await page.goto(`${basePath}/vardiya?hafta=${WEEK}`)

  await page.getByRole('button', { name: 'Hızlı atama' }).click()
  await expect(page.getByTestId('quick-palette')).toBeVisible()
  // No code chosen yet: a tap changes nothing.
  await cell(page, 'Defne', 'Pzt 23').click()
  await expect(toast(page)).toContainText('Önce yukarıdan uygulanacak vardiya kodunu seçin.')
  await expect(cell(page, 'Defne', 'Pzt 23')).toHaveAccessibleName(/: Boş$/)

  await page.getByRole('radio', { name: 'C · Akşam' }).click()
  for (const [name, day] of [['Defne', 'Pzt 23'], ['Emir', 'Pzt 23'], ['Defne', 'Sal 24']] as const) await cell(page, name, day).click()
  await expect(picker(page)).toBeHidden()
  for (const [name, day] of [['Defne', 'Pzt 23'], ['Emir', 'Pzt 23'], ['Defne', 'Sal 24']] as const) await expect(cell(page, name, day)).toHaveText(/^C/)
  await saved(page)
  await expect(page.getByTestId('total-working').getByRole('cell').first()).toHaveText('2')

  // Eraser.
  await page.getByRole('radio', { name: 'Temizle' }).click()
  await cell(page, 'Emir', 'Pzt 23').click()
  await expect(cell(page, 'Emir', 'Pzt 23')).toHaveAccessibleName(/: Boş$/)
  await saved(page)

  // Undo reverts the last saved change, redo brings it back; both survive a reload.
  await page.getByRole('button', { name: 'Bitti' }).click()
  await action(page, 'Geri al')
  await expect(cell(page, 'Emir', 'Pzt 23')).toHaveText(/^C/)
  await page.reload()
  await action(page, 'İleri al')
  await expect(cell(page, 'Emir', 'Pzt 23')).toHaveAccessibleName(/: Boş$/)
  await action(page, 'Geri al')
  await expect(cell(page, 'Emir', 'Pzt 23')).toHaveText(/^C/)
  // Repeated undo/redo messages replace each other instead of piling up.
  await expect(toast(page)).toHaveCount(1)
  await expect(toast(page)).toContainText('Geri alındı')
  await expect(toast(page)).toHaveAttribute('role', 'status')

  await action(page, 'Geçmiş')
  const history = page.getByTestId('history-list').getByRole('listitem')
  await expect(history.first()).toContainText('Geri alma')
  await expect(history.filter({ hasText: 'Düzenleme' }).first()).toBeVisible()
  await page.getByRole('dialog', { name: 'Değişiklik geçmişi' }).getByRole('button', { name: 'Kapat' }).click()
})

test('never overwrites a cell changed elsewhere and reports save errors', async ({ page }) => {
  const { basePath, defne, code, save } = await seed(page, 'Çakışma Lokantası')
  await page.goto(`${basePath}/vardiya?hafta=${WEEK}`)
  await expect(cell(page, 'Defne', 'Pzt 23')).toHaveAccessibleName(/: Boş$/)

  // Someone else plans the cell after this page loaded.
  expect((await save(WEEK, [{ employeeId: defne, workDate: WEEK, expected: null, value: { shiftCodeId: code('B') } }])).status()).toBe(200)
  await cell(page, 'Defne', 'Pzt 23').click()
  await picker(page).getByRole('button', { name: /^A\s*Sabah/ }).click()
  const conflict = toast(page).filter({ hasText: 'başka biri tarafından değiştirildi' })
  await expect(conflict).toContainText('1 hücre siz kaydetmeden önce başka biri tarafından değiştirildi')
  await expect(conflict).toContainText('Defne Örnek (Pzt 23)')
  await expect(conflict).toHaveAttribute('role', 'alert')
  await expect(cell(page, 'Defne', 'Pzt 23')).toHaveText(/^B/)

  // A temporary server error is retried with the same request id, then saved.
  let failures = 1
  await page.route('**/schedule/changes', async (route) => {
    if (failures-- > 0) return route.fulfill({ status: 503, contentType: 'application/json', body: '{"statusCode":503,"message":"Geçici hata"}' })
    return route.continue()
  })
  await cell(page, 'Emir', 'Sal 24').click()
  await picker(page).getByRole('button', { name: /^OFF/ }).click()
  await expect(saveState(page)).toHaveText(/yeniden deneniyor…/i)
  await saved(page)
  await page.unroute('**/schedule/changes')

  // A refused change (validation) is rolled back and explained.
  await page.route('**/schedule/changes', route => route.fulfill({ status: 422, contentType: 'application/json', body: JSON.stringify({ statusCode: 422, message: 'Geçersiz veya pasif vardiya kodu.', data: { code: 'VALIDATION', message: 'Geçersiz veya pasif vardiya kodu.' } }) }))
  await cell(page, 'Emir', 'Çar 25').click()
  await picker(page).getByRole('button', { name: /^C\s*Akşam/ }).click()
  await expect(toast(page).filter({ hasText: 'Geçersiz veya pasif vardiya kodu. Değişiklik uygulanmadı' })).toHaveAttribute('role', 'alert')
  // Errors do not disappear on their own; the earlier conflict is still readable too.
  await expect(conflict).toBeVisible()
  await expect(cell(page, 'Emir', 'Çar 25')).toHaveAccessibleName(/: Boş$/)
  await page.unroute('**/schedule/changes')

  await page.reload()
  await expect(cell(page, 'Emir', 'Sal 24')).toHaveText(/^OFF/)
})

test('copies the previous week: empty cells by default, overwrite only when confirmed, one undo', async ({ page }) => {
  const { basePath, api, defne, emir, code, save } = await seed(page, 'Kopya Lokantası')
  // Previous week: Defne Mon A, Tue B; Emir Mon C (Emir is archived afterwards).
  expect((await save(PREVIOUS, [
    { employeeId: defne, workDate: '2026-11-16', expected: null, value: { shiftCodeId: code('A') } },
    { employeeId: defne, workDate: '2026-11-17', expected: null, value: { shiftCodeId: code('B') } },
    { employeeId: emir, workDate: '2026-11-16', expected: null, value: { shiftCodeId: code('C') } },
  ])).status()).toBe(200)
  // This week Defne already has Monday off.
  expect((await save(WEEK, [{ employeeId: defne, workDate: WEEK, expected: null, value: { shiftCodeId: code('OFF') } }])).status()).toBe(200)
  expect((await page.request.post(`${api}/employees/${emir}/archive`)).status()).toBe(200)

  await page.goto(`${basePath}/vardiya?hafta=${WEEK}`)
  await page.getByRole('button', { name: /kopyala/i }).click()
  const dialog = page.getByRole('dialog', { name: 'Önceki haftayı kopyala' })
  await expect(dialog.getByRole('radio', { name: /Yalnızca boş hücreleri doldur/ })).toBeChecked()
  await dialog.getByRole('button', { name: 'Boş hücrelere kopyala' }).click()
  await expect(dialog).toBeHidden()
  await expect(toast(page)).toContainText('1 hücre kopyalandı. Atlanan: 1 dolu hücre, arşivlenmiş veya başka şubeye geçmiş personelin 1 hücresi.')
  await expect(cell(page, 'Defne', 'Pzt 23')).toHaveText(/^OFF/)
  await expect(cell(page, 'Defne', 'Sal 24')).toHaveText(/^B/)

  // Overwrite needs an explicit confirmation.
  await page.getByRole('button', { name: /kopyala/i }).click()
  await dialog.getByText('Dolu hücrelerin üzerine yaz').click()
  const submit = dialog.getByRole('button', { name: 'Üzerine yazarak kopyala' })
  await expect(submit).toBeDisabled()
  await dialog.getByRole('checkbox').check()
  await submit.click()
  await expect(cell(page, 'Defne', 'Pzt 23')).toHaveText(/^A/)

  // The whole overwrite is undone in one step.
  await action(page, 'Geri al')
  await expect(cell(page, 'Defne', 'Pzt 23')).toHaveText(/^OFF/)
  await expect(cell(page, 'Defne', 'Sal 24')).toHaveText(/^B/)
})

test('a manager edits only assigned branches; the server refuses the others', async ({ page, browser, isMobile }) => {
  test.skip(isMobile, 'Permission flow; one browser project is enough.')
  const { basePath, api, slug, locationId: alsancak } = await seed(page, 'Yetki Lokantası')
  const bornova = (await (await page.request.post(`${api}/locations`, { data: { name: 'Bornova', timezone: 'Europe/Istanbul' } })).json()).id as string
  const deniz = (await (await page.request.post(`${api}/employees`, { data: { firstName: 'Deniz', lastName: 'Örnek', locationId: bornova } })).json()).id as string
  const email = uniqueEmail('mudur')
  const { token } = await (await page.request.post(`${api}/invitations`, { data: { email, locationIds: [bornova] } })).json()

  const context = await browser.newContext()
  const manager = await context.newPage()
  await register(manager, { name: 'Müdür Örnek', email })
  await expect(manager).toHaveURL(/\/baslangic/)
  expect((await manager.request.post(`/api/invitations/${token}/accept`)).ok()).toBe(true)

  await manager.goto(`${basePath}/vardiya?hafta=${WEEK}`)
  // One assigned branch: shown as text, no dropdown the manager cannot use.
  await expect(manager.getByTestId('fixed-location')).toHaveText(/Bornova/)
  await expect(manager.getByRole('combobox', { name: 'Şube' })).toHaveCount(0)
  await cell(manager, 'Deniz', 'Pzt 23').click()
  await picker(manager).getByRole('button', { name: /^A\s*Sabah/ }).click()
  await saved(manager)

  // Not assigned to Alsancak: the API refuses reads and writes there.
  const codes: { id: string, code: string }[] = await (await manager.request.get(`/api/orgs/${slug}/shift-codes`)).json()
  const write = await manager.request.post(`/api/orgs/${slug}/schedule/changes`, {
    data: { locationId: alsancak, weekStart: WEEK, clientMutationId: randomUUID(), changes: [{ employeeId: deniz, workDate: WEEK, expected: null, value: { shiftCodeId: codes[0]!.id } }] },
  })
  expect([403, 404]).toContain(write.status())
  expect([403, 404]).toContain((await manager.request.get(`/api/orgs/${slug}/schedule`, { params: { locationId: alsancak, week: WEEK } })).status())
  await context.close()

  // The owner sees the manager's change but cannot undo it (only own changes are undone).
  await page.goto(`${basePath}/vardiya?sube=${bornova}&hafta=${WEEK}`)
  await expect(cell(page, 'Deniz', 'Pzt 23')).toHaveText(/^A/)
  await expect(page.getByRole('button', { name: 'Geri al' })).toBeDisabled()
})

test('editing stays usable at 360 and 390 px', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Phone widths.')
  const { basePath } = await seed(page, 'Mobil Düzenleme')
  for (const width of [360, 390]) {
    await page.setViewportSize({ width, height: 780 })
    await page.goto(`${basePath}/vardiya?hafta=${WEEK}`)
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)
    // One row of main actions, 44px each; undo, redo and history live in the "⋯" menu.
    const tops = new Set<number>()
    for (const name of ['Hızlı atama', 'Kopyala', 'Diğer işlemler']) {
      const box = (await page.getByRole('button', { name, exact: true }).boundingBox())!
      expect(box.height).toBeGreaterThanOrEqual(44)
      tops.add(Math.round(box.y))
    }
    expect(tops.size).toBe(1)
    const more = page.getByRole('button', { name: 'Diğer işlemler' })
    await more.click()
    const menu = page.getByRole('menu', { name: 'Diğer işlemler' })
    await expect(menu.getByRole('menuitem')).toHaveText(['Geri al', 'İleri al', 'Geçmiş'])
    await expect(menu.getByRole('menuitem', { name: 'Geri al' })).toBeDisabled()
    await expect(menu.getByRole('menuitem', { name: 'Geçmiş' })).toBeFocused() // first enabled item
    for (const item of await menu.getByRole('menuitem').all()) expect((await item.boundingBox())!.height).toBeGreaterThanOrEqual(44)
    await page.keyboard.press('Escape')
    await expect(menu).toBeHidden()
    await expect(more).toBeFocused()
    // Quick assign: one compact row (codes scroll sideways), every option a 44px target.
    await page.getByRole('button', { name: 'Hızlı atama' }).click()
    const palette = page.getByTestId('quick-palette')
    expect((await palette.boundingBox())!.height).toBeLessThanOrEqual(64)
    const options = page.getByTestId('quick-codes').getByRole('radio')
    await expect(options).toHaveCount(7)
    for (const option of await options.all()) {
      const optionBox = (await option.boundingBox())!
      expect(optionBox.height).toBeGreaterThanOrEqual(44)
      expect(optionBox.width).toBeGreaterThanOrEqual(44)
    }
    await page.getByRole('radio', { name: 'Temizle' }).click()
    await expect(page.getByRole('radio', { name: 'Temizle' })).toBeInViewport()
    await page.getByRole('button', { name: 'Bitti' }).click()

    // Sunday needs a sideways scroll; the picker still opens fully on screen.
    await cell(page, 'Emir', 'Paz 29').click()
    const box = (await picker(page).boundingBox())!
    expect(box.x).toBe(0)
    expect(Math.round(box.width)).toBe(width)
    expect(Math.round(box.y + box.height)).toBe(780)
    await page.keyboard.press('Escape')
    await expect(picker(page)).toBeHidden()
  }
})
