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
  for (const path of ['', '/personel', '/personel/yeni', '/departmanlar', '/subeler', '/davetler', '/ayarlar']) {
    await expectNoHorizontalOverflow(page, basePath + path)
  }
  await expectNoHorizontalOverflow(page, '/hesap')
})
