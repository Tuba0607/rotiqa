import { expect, test } from '@playwright/test'
import { registerWithOrganization } from './helpers'

/** Header business switcher: compact, keyboard reachable, switches and creates organizations. */
test('business switcher switches organizations, links to a new one and shows a thin focus ring', async ({ page, isMobile }) => {
  const first = await registerWithOrganization(page, 'Seçici Birinci Lokanta')

  await page.goto('/baslangic?yeni=1')
  await page.getByLabel('İşletme adı').fill('Seçici İkinci Lokanta Sahil ve Teras Restoranı')
  await page.getByLabel('İlk şube adı').fill('Sahil')
  await page.getByRole('button', { name: 'İşletmeyi oluştur' }).click()
  await expect(page.getByRole('heading', { level: 1, name: /Seçici İkinci/ })).toBeVisible()

  const switcher = page.getByLabel('İşletme seç')
  // Compact header size: 36px on desktop, 40px on phones; a long name never widens the page.
  const box = (await switcher.boundingBox())!
  expect(box.height).toBe(isMobile ? 40 : 36)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true)

  // Keyboard: reachable with Tab, shows the thin teal focus border.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur())
  for (let i = 0; i < 10 && !(await switcher.evaluate(el => el === document.activeElement)); i++) await page.keyboard.press('Tab')
  await expect(switcher).toBeFocused()
  await expect(switcher).toHaveCSS('border-top-color', 'rgb(20, 184, 166)')

  await switcher.selectOption({ label: 'Seçici Birinci Lokanta' })
  await expect(page).toHaveURL(new RegExp(`${first.basePath}$`))
  await expect(page.getByRole('heading', { level: 1, name: 'Seçici Birinci Lokanta' })).toBeVisible()

  await page.getByLabel('İşletme seç').selectOption({ label: '+ Yeni işletme ekle' })
  await expect(page).toHaveURL(/\/baslangic\?yeni=1$/)
})
