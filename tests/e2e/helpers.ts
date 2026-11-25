import { randomUUID } from 'node:crypto'
import { expect, type Page } from '@playwright/test'

export const PASSWORD = 'Test-parola-2026'

export function uniqueEmail(prefix = 'kullanici'): string {
  return `${prefix}-${randomUUID().slice(0, 8)}@example.test`
}

export async function register(page: Page, { name = 'Ayşe Demir', email = uniqueEmail() } = {}): Promise<string> {
  await page.goto('/kayit')
  await page.getByLabel('Ad soyad').fill(name)
  await page.getByLabel('E-posta').fill(email)
  await page.getByLabel('Şifre', { exact: true }).fill(PASSWORD)
  await page.getByRole('button', { name: 'Kayıt ol' }).click()
  return email
}

/** Registers and completes onboarding; returns the organization's base path (/app/<slug>). */
export async function registerWithOrganization(page: Page, businessName: string): Promise<{ email: string, basePath: string }> {
  const email = await register(page)
  await expect(page).toHaveURL(/\/baslangic$/)
  await page.getByLabel('İşletme adı').fill(businessName)
  await page.getByLabel('İlk şube adı').fill('Alsancak')
  await page.getByRole('button', { name: 'İşletmeyi oluştur' }).click()
  await expect(page.getByRole('heading', { level: 1, name: businessName })).toBeVisible()
  return { email, basePath: new URL(page.url()).pathname }
}
