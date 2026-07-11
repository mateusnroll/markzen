import { expect, test } from '@playwright/test'

test('AC34: explicit browser development boot selects MemoryPlatform', async ({ page }) => {
  await page.goto('/?fixture=basic')

  await expect(page.getByTestId('app-shell')).toBeVisible()
  await expect(page.getByTestId('platform-kind')).toHaveText('memory')
})

test('AC41: a known repository fixture loads its declared filesystem and window state', async ({ page }) => {
  await page.goto('/?fixture=basic')

  await expect(page.getByTestId('fixture-name')).toHaveText('basic')
  await expect(page.getByTestId('fixture-file-count')).toHaveText('1')
  await expect(page.getByTestId('window-id')).not.toHaveText('')
})

test('AC42: an unknown fixture fails deterministically instead of falling back', async ({ page }) => {
  await page.goto('/?fixture=missing-fixture')

  await expect(page.getByTestId('fixture-bootstrap-error')).toHaveText('Unknown Markzen fixture: missing-fixture')
  await expect(page.getByTestId('app-shell')).toHaveCount(0)
})
