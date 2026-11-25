import { expect, test } from '@playwright/test'
import { PASSWORD, register, uniqueEmail } from './helpers'

test('protected pages redirect to sign-in', async ({ page }) => {
  await page.goto('/app')
  await expect(page).toHaveURL(/\/giris\?redirect=(%2F|\/)app$/)
  await expect(page.getByRole('heading', { name: 'Giriş yap' })).toBeVisible()
})

test('protected API rejects anonymous requests', async ({ request }) => {
  const response = await request.get('/api/me/organizations')
  expect(response.status()).toBe(401)
  expect((await response.json()).data).toMatchObject({ code: 'UNAUTHENTICATED', message: 'Devam etmek için giriş yapın.' })
})

test('duplicate registration shows a Turkish message', async ({ page, context }) => {
  const email = await register(page)
  await expect(page).toHaveURL(/\/baslangic$/)
  await context.clearCookies()
  await register(page, { email })
  await expect(page.getByRole('alert')).toHaveText('Bu e-posta adresiyle kayıtlı bir hesap var. Giriş yapmayı deneyin.')
})

test('wrong password shows a Turkish message; correct one signs in; sign-out ends the session', async ({ page, context }) => {
  const email = await register(page)
  await expect(page).toHaveURL(/\/baslangic$/)
  await context.clearCookies()

  await page.goto('/giris')
  await page.getByLabel('E-posta').fill(email)
  await page.getByLabel('Şifre').fill('yanlis-parola')
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page.getByRole('alert')).toHaveText('E-posta veya şifre hatalı.')

  await page.getByLabel('Şifre').fill(PASSWORD)
  await page.getByRole('button', { name: 'Giriş yap' }).click()
  await expect(page).toHaveURL(/\/baslangic$/)

  await page.goto('/hesap')
  await expect(page.getByText(email)).toBeVisible()
  await page.getByRole('button', { name: 'Çıkış yap' }).click()
  await expect(page).toHaveURL(/\/giris$/)
  await page.goto('/app')
  await expect(page).toHaveURL(/\/giris/)
})

test('registration validates fields', async ({ page }) => {
  await page.goto('/kayit')
  await page.getByLabel('E-posta').fill(uniqueEmail())
  await page.getByLabel('Şifre').fill('kisa')
  await page.getByRole('button', { name: 'Kayıt ol' }).click()
  await expect(page.getByText('Adınızı girin.')).toBeVisible()
  await expect(page.getByText('Şifre en az 8 karakter olmalı.')).toBeVisible()
})
