import { expect, test } from '@playwright/test'

test('home page shows the product tagline', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Ekibini planla')
  await expect(page).toHaveTitle(/Rotiqa/)
})

test('design system renders all default shift codes', async ({ page }) => {
  await page.goto('/design-system')
  for (const label of ['Sabah vardiyası', 'Ara vardiya', 'Akşam vardiyası', 'Haftalık izin', 'Raporlu', 'Yıllık izin']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible()
  }
})

test('health endpoint reports database connectivity', async ({ request }) => {
  const response = await request.get('/api/health')
  expect(response.status()).toBe(200)
  expect(await response.json()).toEqual({ status: 'ok', database: 'ok' })
})

test('dev-only image route is not exposed in production', async ({ request }) => {
  const response = await request.get('/api/dev/schedule-image')
  expect(response.status()).toBe(404)
})
