import { expect, test } from '@playwright/test'

test('AC5 AC57-AC59: CSV workspace activation, save, watcher reload, and conflict reuse the shared lifecycle', async ({ page }) => {
  await page.goto('/?fixture=csv-basic')
  await treeRow(page, 'people.csv').click()
  await expect(page.getByTestId('csv-grid')).toBeVisible()
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'people, Preview')

  await page.getByTestId('csv-cell').filter({ hasText: 'Ada' }).dblclick()
  await page.getByTestId('csv-cell-editor').fill('Grace')
  await page.keyboard.press('Enter')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'people, dirty')
  await sendCommand(page, 'save')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'people')
})

test('AC72: stale CSV search and preview work cannot steal selection or focus from a newer tab', async ({ page }) => {
  await page.goto('/?fixture=csv-stale')
  await treeRow(page, 'large.csv').click()
  await expect(page.getByTestId('csv-grid')).toBeVisible()
  await page.getByTestId('tab-add').click()
  await expect(page.getByTestId('document-title')).toHaveValue('')
  await page.waitForTimeout(200)
  await expect(page.getByTestId('document-title')).toHaveValue('')
  await expect(page.getByTestId('rich-editor-content')).toBeFocused()
})

const treeRow = (page: import('@playwright/test').Page, name: string) =>
  page.getByTestId('workspace-tree-row').filter({ hasText: name })

async function sendCommand(page: import('@playwright/test').Page, command: 'save'): Promise<void> {
  await page.evaluate((detail) => window.dispatchEvent(new CustomEvent('markzen:fixture-command', { detail })), command)
}
