import { expect, test, type Page } from '@playwright/test'
import { registerWithOrganization } from './helpers'

async function expectNoHorizontalOverflow(page: Page, path: string) {
  await page.goto(path)
  await page.waitForLoadState('networkidle')
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow, `${path} overflows horizontally by ${overflow}px`).toBeLessThanOrEqual(0)
}

test('production home has sign-up/sign-in actions and no developer links', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('link', { name: 'Ücretsiz başla' })).toHaveAttribute('href', '/kayit')
  await expect(page.getByRole('link', { name: 'Giriş yap' })).toHaveAttribute('href', '/giris')
  await expect(page.getByRole('link', { name: /Tasarım sistemi/ })).toHaveCount(0)
})

test('public pages have no horizontal overflow', async ({ page }) => {
  for (const path of ['/', '/giris', '/kayit', '/design-system']) await expectNoHorizontalOverflow(page, path)
})

test('app pages have no horizontal overflow', async ({ page }) => {
  const { basePath } = await registerWithOrganization(page, 'Taşma Kontrol Lokantası Uzun İsimli İşletme')
  for (const path of ['', '/vardiya', '/personel', '/personel/yeni', '/departmanlar', '/subeler', '/davetler', '/ayarlar']) {
    await expectNoHorizontalOverflow(page, basePath + path)
  }
  await expectNoHorizontalOverflow(page, '/hesap')
})

test('employee sort buttons are aligned, 44px and compact on desktop', async ({ page, isMobile }) => {
  const { basePath } = await registerWithOrganization(page, 'Hizalama Kontrol')
  for (const first of ['Ada', 'Bora', 'Cem']) {
    await page.goto(`${basePath}/personel/yeni`)
    await page.getByLabel('Ad', { exact: true }).fill(first)
    await page.getByLabel('Soyad').fill('Örnek')
    await page.getByRole('button', { name: 'Personeli ekle' }).click()
    await expect(page.getByRole('link', { name: new RegExp(`${first} Örnek`) })).toBeVisible()
  }

  const rows = page.getByTestId('employee-row')
  await expect(rows).toHaveCount(3)
  for (let i = 0; i < 3; i++) {
    const row = rows.nth(i)
    const rowBox = (await row.boundingBox())!
    const buttons = row.getByTestId('sort-controls').getByRole('button')
    const [up, down] = [(await buttons.nth(0).boundingBox())!, (await buttons.nth(1).boundingBox())!]

    for (const box of [up, down]) {
      expect(box.width).toBeGreaterThanOrEqual(44)
      expect(box.height).toBeGreaterThanOrEqual(44)
      // Vertically centred in the row, also when disabled (first/last row).
      expect(Math.abs((box.y + box.height / 2) - (rowBox.y + rowBox.height / 2))).toBeLessThanOrEqual(1)
    }
    expect(up.width).toBe(down.width)
    expect(up.height).toBe(down.height)
    expect(up.y).toBe(down.y)
    expect(down.x).toBeGreaterThan(up.x)
    // Group sits at the right edge of the row.
    expect(rowBox.x + rowBox.width - (down.x + down.width)).toBeLessThanOrEqual(8)
    if (!isMobile) expect(rowBox.height).toBeLessThanOrEqual(50)
  }

  // Spacing between the two buttons is identical on every row.
  const gaps = await rows.evaluateAll(els => els.map((el) => {
    const [a, b] = [...el.querySelectorAll('[data-testid="sort-controls"] button')].map(btn => btn.getBoundingClientRect())
    return Math.round(b!.left - a!.right)
  }))
  expect(new Set(gaps).size).toBe(1)

  await expect(rows.first().getByRole('button', { name: /yukarı taşı/ })).toBeDisabled()
  await expect(rows.last().getByRole('button', { name: /aşağı taşı/ })).toBeDisabled()
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)
  expect(overflow).toBeLessThanOrEqual(0)
})
