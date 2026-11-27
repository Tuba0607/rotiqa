import { expect, test } from '@playwright/test'
import { PASSWORD, registerWithOrganization } from './helpers'

test('onboarding, departments and the employee lifecycle', async ({ page }) => {
  const { basePath } = await registerWithOrganization(page, 'Kordon Bistro')
  await expect(page.getByText('Owner', { exact: true })).toBeVisible()

  // Dashboard checklist reflects real data.
  const steps = page.getByTestId('setup-steps')
  await expect(page.getByText('0/3 tamamlandı')).toBeVisible()
  await expect(steps.locator('[data-step="departments"]')).toHaveAttribute('data-done', 'false')

  // Department
  await page.goto(`${basePath}/departmanlar`)
  await page.getByRole('button', { name: 'Departman ekle' }).click()
  await page.getByLabel('Departman adı').fill('Salon')
  await page.getByRole('button', { name: 'Kaydet' }).click()
  await expect(page.getByText('Salon', { exact: true })).toBeVisible()
  await page.goto(basePath)
  await expect(page.getByTestId('setup-steps').locator('[data-step="departments"]')).toHaveAttribute('data-done', 'true')
  await expect(page.getByText('1 departman')).toBeVisible()
  await expect(page.getByRole('link', { name: 'Departman ekle' })).toHaveCount(0)

  // Employee
  await page.goto(`${basePath}/personel`)
  await expect(page.getByText('Bu şubede henüz personel yok')).toBeVisible()
  await page.getByRole('link', { name: 'Personel ekle' }).click()
  await page.getByLabel('Ad', { exact: true }).fill('Deniz')
  await page.getByLabel('Soyad').fill('Akın')
  await page.getByLabel('Departman').selectOption({ label: 'Salon' })
  await page.getByRole('button', { name: 'Personeli ekle' }).click()
  await expect(page.getByRole('link', { name: /Deniz Akın/ })).toBeVisible()

  // Edit
  await page.getByRole('link', { name: /Deniz Akın/ }).click()
  await page.getByLabel('Soyad').fill('Akın Er')
  await page.getByRole('button', { name: 'Kaydet' }).click()
  await expect(page.getByText('Değişiklikler kaydedildi.')).toBeVisible()

  // Archive → archived tab → reactivate
  page.once('dialog', dialog => dialog.accept())
  await page.getByRole('button', { name: 'Arşivle' }).click()
  await expect(page.getByText('Arşivde')).toBeVisible()
  await page.goto(`${basePath}/personel`)
  await expect(page.getByText('Bu şubede henüz personel yok')).toBeVisible()
  await page.getByRole('tab', { name: 'Arşiv' }).click()
  await expect(page.getByRole('link', { name: /Deniz Akın Er/ })).toBeVisible()
  await page.getByRole('button', { name: 'Geri al' }).click()
  await expect(page.getByText('Arşivlenmiş personel yok')).toBeVisible()
  await page.getByRole('tab', { name: 'Aktif' }).click()
  await expect(page.getByRole('link', { name: /Deniz Akın Er/ })).toBeVisible()
})

test('manager invitation is limited to the selected location', async ({ page, browser }) => {
  const { basePath } = await registerWithOrganization(page, 'Ege Kafe')

  // Second location with its own employee
  await page.goto(`${basePath}/subeler`)
  await page.getByRole('button', { name: 'Şube ekle' }).click()
  await page.getByLabel('Şube adı').fill('Bornova')
  await page.getByRole('button', { name: 'Kaydet' }).click()
  await expect(page.getByText('Bornova')).toBeVisible()

  for (const [location, first] of [['Alsancak', 'Ece'], ['Bornova', 'Mert']] as const) {
    await page.goto(`${basePath}/personel/yeni`)
    await page.getByLabel('Ad', { exact: true }).fill(first)
    await page.getByLabel('Soyad').fill('Örnek')
    await page.getByLabel('Şube').selectOption({ label: location })
    await page.getByRole('button', { name: 'Personeli ekle' }).click()
    await expect(page.getByRole('link', { name: new RegExp(`${first} Örnek`) })).toBeVisible()
  }

  // Invite a manager for Bornova only. The UI must not claim an email was sent.
  const managerEmail = `mudur-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.test`
  await page.goto(`${basePath}/davetler`)
  await page.getByLabel('Yöneticinin e-posta adresi').fill(managerEmail)
  await page.getByLabel('Bornova').check()
  await page.getByRole('button', { name: 'Bağlantı oluştur' }).click()
  const linkBox = page.getByTestId('invitation-link')
  await expect(linkBox).toContainText('E-posta gönderilmedi.')
  const link = await page.getByLabel('Davet bağlantısı').inputValue()
  expect(link).toMatch(/\/davet\/[\w-]{43}$/)
  await expect(page.getByText('Bekliyor')).toBeVisible()

  // Manager registers through the link and accepts.
  const managerContext = await browser.newContext()
  const manager = await managerContext.newPage()
  await manager.goto(link)
  await expect(manager.getByRole('heading', { name: 'Ege Kafe' })).toBeVisible()
  await manager.getByRole('link', { name: 'Kayıt ol' }).click()
  await manager.getByLabel('Ad soyad').fill('Müdür Örnek')
  await manager.getByLabel('E-posta').fill(managerEmail)
  await manager.getByLabel('Şifre', { exact: true }).fill(PASSWORD)
  await manager.getByRole('button', { name: 'Kayıt ol' }).click()
  await manager.getByRole('button', { name: 'Daveti kabul et' }).click()
  await expect(manager.getByText('Şube yöneticisi')).toBeVisible()

  // Sees only Bornova and its staff; cannot manage departments.
  await manager.goto(`${basePath}/personel`)
  await expect(manager.getByRole('link', { name: /Mert Örnek/ })).toBeVisible()
  await expect(manager.getByRole('link', { name: /Ece Örnek/ })).toHaveCount(0)
  // A single assigned branch is shown as text, not as a dropdown with one option.
  await expect(manager.getByTestId('fixed-location')).toHaveText(/Bornova/)
  await expect(manager.getByRole('combobox', { name: 'Şube' })).toHaveCount(0)
  await manager.goto(`${basePath}/departmanlar`)
  await expect(manager.getByText('Departmanları yalnızca Owner düzenleyebilir.')).toBeVisible()
  await expect(manager.getByRole('button', { name: 'Departman ekle' })).toHaveCount(0)

  // The link is single-use.
  await manager.goto(link)
  await expect(manager.getByText('Bu davet daha önce kullanılmış.')).toBeVisible()
  await managerContext.close()

  await page.reload()
  await expect(page.getByText('Kabul edildi')).toBeVisible()

  // Departments are still missing, so setup is 2/3; a manager sees only the staff step (done).
  await page.goto(basePath)
  await expect(page.getByText('2/3 tamamlandı')).toBeVisible()
})

test('another organization’s pages are not reachable', async ({ page, browser }) => {
  const { basePath } = await registerWithOrganization(page, 'Gizli Lokanta')

  const otherContext = await browser.newContext()
  const other = await otherContext.newPage()
  await registerWithOrganization(other, 'Başka İşletme')
  await other.goto(basePath)
  await expect(other.getByText('İşletme bulunamadı.')).toBeVisible()
  const api = await other.request.get(`/api${basePath.replace('/app', '/orgs')}/members`)
  expect(api.status()).toBe(404)
  await otherContext.close()
})
