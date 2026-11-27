import { randomUUID } from 'node:crypto'
import { expect, test, type Browser, type Page } from '@playwright/test'
import { register, registerWithOrganization, uniqueEmail } from './helpers'

/**
 * Branch selection by role. Owners always get the branch selector; a manager with one branch
 * sees it as text, a manager with several sees only those branches. Access itself is enforced
 * by the API (and RLS), so URLs and direct requests for other branches must fail.
 */

const WEEK = '2026-11-23'

async function setupOwner(page: Page) {
  const { basePath } = await registerWithOrganization(page, 'Şube Rol Lokantası') // first branch: Alsancak
  const slug = basePath.split('/').pop()!
  const api = `/api/orgs/${slug}`
  const alsancak: string = (await (await page.request.get(api)).json()).locations[0].id
  const addBranch = async (name: string) => (await (await page.request.post(`${api}/locations`, { data: { name, timezone: 'Europe/Istanbul' } })).json()).id as string
  const addStaff = async (firstName: string, locationId: string) => (await (await page.request.post(`${api}/employees`, { data: { firstName, lastName: 'Örnek', locationId } })).json()).id as string
  return { basePath, slug, api, alsancak, addBranch, addStaff }
}

async function managerFor(browser: Browser, owner: Page, api: string, locationIds: string[]) {
  const email = uniqueEmail('mudur')
  const { token } = await (await owner.request.post(`${api}/invitations`, { data: { email, locationIds } })).json()
  const context = await browser.newContext({ ...test.info().project.use })
  const page = await context.newPage()
  await register(page, { name: 'Müdür Örnek', email })
  await expect(page).toHaveURL(/\/baslangic/)
  expect((await page.request.post(`/api/invitations/${token}/accept`)).ok()).toBe(true)
  return { page, context }
}

test('owner: the branch selector is always there and switches branches', async ({ page }) => {
  const { basePath, alsancak, addBranch, addStaff } = await setupOwner(page)
  await addStaff('Ece', alsancak)

  // Even with a single branch the owner sees the selector (they manage branches).
  for (const path of ['/vardiya', '/personel', '/personel/yeni']) {
    await page.goto(basePath + path)
    await expect(page.getByRole('combobox', { name: 'Şube' })).toBeVisible()
    await expect(page.getByTestId('fixed-location')).toHaveCount(0)
  }

  const bornova = await addBranch('Bornova')
  await addStaff('Mert', bornova)
  await page.goto(`${basePath}/vardiya?hafta=${WEEK}`)
  const select = page.getByRole('combobox', { name: 'Şube' })
  await expect(select.locator('option')).toHaveText(['Alsancak', 'Bornova'])
  await expect(page.getByRole('rowheader', { name: /ECE/ })).toBeVisible()
  await select.selectOption({ label: 'Bornova' })
  await expect(page).toHaveURL(new RegExp(`sube=${bornova}`))
  await expect(page.getByRole('rowheader', { name: /MERT/ })).toBeVisible()
  await expect(page.getByRole('rowheader', { name: /ECE/ })).toHaveCount(0)
})

test('manager with one branch: no selector, other branches unreachable by URL or API', async ({ page, browser, isMobile }) => {
  const { basePath, slug, api, alsancak, addBranch, addStaff } = await setupOwner(page)
  const bornova = await addBranch('Bornova')
  const ece = await addStaff('Ece', alsancak)
  await addStaff('Deniz', bornova)
  const { page: manager, context } = await managerFor(browser, page, api, [bornova])

  const widths = isMobile ? [360, 390] : [1280]
  for (const width of widths) {
    await manager.setViewportSize({ width, height: 800 })
    // Pointing the URL at another branch falls back to the assigned one.
    await manager.goto(`${basePath}/vardiya?sube=${alsancak}&hafta=${WEEK}`)
    await expect(manager.getByTestId('fixed-location')).toHaveText(/Bornova/)
    await expect(manager.getByRole('combobox', { name: 'Şube' })).toHaveCount(0)
    await expect(manager.getByRole('rowheader', { name: /DENİZ/ })).toBeVisible()
    await expect(manager.getByRole('rowheader', { name: /ECE/ })).toHaveCount(0)
    await expect(manager).toHaveURL(new RegExp(`sube=${bornova}`))
    expect(await manager.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0)

    for (const path of [`/personel?sube=${alsancak}`, '/personel/yeni']) {
      await manager.goto(basePath + path)
      await expect(manager.getByTestId('fixed-location')).toHaveText(/Bornova/)
      await expect(manager.getByRole('combobox', { name: 'Şube' })).toHaveCount(0)
    }
  }

  // A new employee lands in the manager's branch without a branch choice.
  await manager.getByLabel('Ad', { exact: true }).fill('Ada')
  await manager.getByLabel('Soyad').fill('Örnek')
  await manager.getByRole('button', { name: 'Personeli ekle' }).click()
  await expect(manager.getByRole('link', { name: /Ada Örnek/ })).toBeVisible()

  // Direct API requests for the other branch are refused.
  const denied = (status: number) => expect([403, 404]).toContain(status)
  denied((await manager.request.get(`/api/orgs/${slug}/employees`, { params: { locationId: alsancak } })).status())
  denied((await manager.request.get(`/api/orgs/${slug}/schedule`, { params: { locationId: alsancak, week: WEEK } })).status())
  denied((await manager.request.get(`/api/orgs/${slug}/employees/${ece}`)).status())
  const codes: { id: string }[] = await (await manager.request.get(`/api/orgs/${slug}/shift-codes`)).json()
  denied((await manager.request.post(`/api/orgs/${slug}/schedule/changes`, {
    data: { locationId: alsancak, weekStart: WEEK, clientMutationId: randomUUID(), changes: [{ employeeId: ece, workDate: WEEK, expected: null, value: { shiftCodeId: codes[0]!.id } }] },
  })).status())
  // History, week copy, undo and staff changes of the other branch are refused too, also when
  // a real change set id of that branch is sent with the manager's own branch.
  const ownerEdit = await (await page.request.post(`${api}/schedule/changes`, {
    data: { locationId: alsancak, weekStart: WEEK, clientMutationId: randomUUID(), changes: [{ employeeId: ece, workDate: WEEK, expected: null, value: { shiftCodeId: codes[0]!.id } }] },
  })).json()
  expect(ownerEdit.changeSetId).toBeTruthy()
  denied((await manager.request.get(`/api/orgs/${slug}/schedule/history`, { params: { locationId: alsancak, week: WEEK } })).status())
  denied((await manager.request.post(`/api/orgs/${slug}/schedule/copy-week`, { data: { locationId: alsancak, weekStart: '2026-11-30', clientMutationId: randomUUID() } })).status())
  denied((await manager.request.post(`/api/orgs/${slug}/schedule/revert`, { data: { locationId: alsancak, weekStart: WEEK, changeSetId: ownerEdit.changeSetId, clientMutationId: randomUUID() } })).status())
  denied((await manager.request.post(`/api/orgs/${slug}/schedule/revert`, { data: { locationId: bornova, weekStart: WEEK, changeSetId: ownerEdit.changeSetId, clientMutationId: randomUUID() } })).status())
  denied((await manager.request.post(`/api/orgs/${slug}/employees/${ece}/archive`)).status())
  denied((await manager.request.patch(`/api/orgs/${slug}/employees/${ece}`, { data: { firstName: 'Değişti' } })).status())
  // The owner's change is untouched.
  const ownerView = await (await page.request.get(`${api}/schedule`, { params: { locationId: alsancak, week: WEEK } })).json()
  expect(ownerView.cells).toHaveLength(1)
  expect(ownerView.employees.find((e: { id: string }) => e.id === ece)).toMatchObject({ firstName: 'Ece', isActive: true })

  // Organization-wide management stays with the owner.
  denied((await manager.request.post(`/api/orgs/${slug}/locations`, { data: { name: 'Karşıyaka', timezone: 'Europe/Istanbul' } })).status())
  denied((await manager.request.post(`/api/orgs/${slug}/departments`, { data: { name: 'Bar' } })).status())
  await manager.goto(`${basePath}/subeler`)
  await expect(manager.getByRole('button', { name: 'Şube ekle' })).toHaveCount(0)
  await context.close()
})

test('manager with several branches: the selector lists only those branches', async ({ page, browser }) => {
  const { basePath, api, addBranch, addStaff } = await setupOwner(page)
  const bornova = await addBranch('Bornova')
  const karsiyaka = await addBranch('Karşıyaka')
  await addStaff('Deniz', bornova)
  await addStaff('Lale', karsiyaka)
  const { page: manager, context } = await managerFor(browser, page, api, [bornova, karsiyaka])

  await manager.goto(`${basePath}/vardiya?hafta=${WEEK}`)
  const select = manager.getByRole('combobox', { name: 'Şube' })
  await expect(select.locator('option')).toHaveText(['Bornova', 'Karşıyaka'])
  await select.selectOption({ label: 'Karşıyaka' })
  await expect(manager.getByRole('rowheader', { name: /LALE/ })).toBeVisible()
  await manager.goto(`${basePath}/personel`)
  await expect(manager.getByRole('combobox', { name: 'Şube' }).locator('option')).toHaveText(['Bornova', 'Karşıyaka'])
  await context.close()
})
