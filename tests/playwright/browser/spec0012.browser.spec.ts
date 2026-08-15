import { expect, test } from '@playwright/test'

test('AC1-AC21: nested guides, disclosure state, tab isolation, Find reveal, and visible selection compose in one journey', async ({ page }) => {
  await page.goto('/?fixture=nested-lists')
  const editor = page.getByTestId('rich-editor-content')
  const parent = page.getByTestId('nested-list-toggle').first()

  await expect(editor.getByTestId('nested-list-section')).toHaveCount(4)
  await expect(parent).toHaveAttribute('aria-expanded', 'true')
  await parent.click()
  await expect(parent).toHaveAttribute('aria-expanded', 'false')
  await expect(editor.getByTestId('nested-list-section').first()).toBeHidden()

  await page.getByTestId('document-tab').nth(1).click()
  await expect(page.getByTestId('nested-list-toggle').first()).toHaveAttribute('aria-expanded', 'true')
  await page.getByTestId('document-tab').nth(0).click()
  await expect(page.getByTestId('nested-list-toggle').first()).toHaveAttribute('aria-expanded', 'false')

  await editor.press(process.platform === 'darwin' ? 'Meta+f' : 'Control+f')
  await page.getByTestId('search-input').fill('Grandchild')
  await expect(page.getByTestId('search-status')).toContainText('1 of 1')
  await expect(page.getByTestId('nested-list-toggle').first()).toHaveAttribute('aria-expanded', 'true')
  expect(await editor.evaluate((element) => element.querySelector('.search-match-current')?.textContent)).toBe('Grandchild')

  await page.getByTestId('search-close').click()
  await page.getByTestId('nested-list-toggle').first().focus()
  await page.getByTestId('nested-list-toggle').first().press('Space')
  await expect(page.getByTestId('nested-list-toggle').first()).toBeFocused()
  await expect(page.getByTestId('nested-list-toggle').first()).toHaveAttribute('aria-expanded', 'false')
})
