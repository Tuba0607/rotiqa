import { expect, test } from '@playwright/test'
import { registerWithOrganization } from './helpers'

/**
 * Select list position. On desktop browsers with customizable select the list is drawn in the
 * page, below the control (macOS would otherwise open its native menu upwards over the label
 * when a later option is selected). Phones keep the system picker.
 */
test('select lists open below the control on desktop and stay native on phones', async ({ page, isMobile }) => {
  const { basePath } = await registerWithOrganization(page, 'Liste Yönü Lokantası')
  const slug = basePath.split('/').pop()!
  for (const name of ['Lara', 'Muratpaşa']) {
    expect((await page.request.post(`/api/orgs/${slug}/locations`, { data: { name, timezone: 'Europe/Istanbul' } })).status()).toBe(201)
  }
  const locations: { id: string, name: string }[] = (await (await page.request.get(`/api/orgs/${slug}`)).json()).locations
  const lara = locations.find(l => l.name === 'Lara')!.id

  // A later option is selected: the case where the macOS menu used to cover the label.
  await page.goto(`${basePath}/vardiya?sube=${lara}`)
  const select = page.getByLabel('Şube', { exact: true })
  await expect(select).toHaveValue(lara)
  const appearance = await select.evaluate(el => getComputedStyle(el).appearance)

  if (isMobile) {
    expect(appearance).toBe('none')
    return
  }
  test.skip(appearance !== 'base-select', 'This browser has no customizable select; it keeps the native menu.')

  const box = (await select.boundingBox())!
  await select.click()
  const list = await select.evaluate((el: HTMLSelectElement) => ({
    open: el.matches(':open'),
    top: el.options[0]!.getBoundingClientRect().top,
    left: el.options[0]!.getBoundingClientRect().left,
  }))
  expect(list.open).toBe(true)
  // Below the control with a small gap, aligned with its left edge, never over the label.
  expect(list.top).toBeGreaterThanOrEqual(box.y + box.height)
  expect(list.top - (box.y + box.height)).toBeLessThanOrEqual(16)
  expect(Math.abs(list.left - box.x)).toBeLessThanOrEqual(8)

  // Keyboard: arrows move, Enter picks and closes.
  await page.keyboard.press('ArrowDown')
  await page.keyboard.press('Enter')
  await expect(select).toHaveValue(locations.find(l => l.name === 'Muratpaşa')!.id)
  expect(await select.evaluate(el => el.matches(':open'))).toBe(false)
  await expect(page).toHaveURL(/sube=/)
})
