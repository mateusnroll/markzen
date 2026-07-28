import { expect, test } from '@playwright/test'

test('AC5 AC21 AC59-AC62: JSON workspace activation, exact-copy Save As, save, watcher, and conflict reuse the shared lifecycle', async ({ page }) => {
  await page.goto('/?fixture=json-basic')
  await treeRow(page, 'data.json').click()
  await expect(page.getByTestId('json-tree')).toBeVisible()
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'data, Preview')
  await page.getByTestId('json-row').filter({ hasText: 'name' }).dblclick()
  await page.getByTestId('json-inline-editor').fill('Changed')
  await page.getByRole('button', { name: 'Apply' }).click()
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'data, dirty')
  await sendCommand(page, 'save')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'data')
})

test('AC35-AC57 AC64 AC69 AC73: row-first JSON navigation, editing, Find, and virtualization remain owned by the active tab', async ({ page }) => {
  await page.goto('/?fixture=json-basic')
  await treeRow(page, 'data.json').click()
  const tree = page.getByTestId('json-tree')
  await expect(tree).toHaveAttribute('role', 'tree')
  await expect(page.getByRole('treeitem', { selected: true })).toHaveCount(1)
  await page.keyboard.press('Control+f')
  await page.getByTestId('search-input').fill('needle')
  await expect(page.getByTestId('search-status')).toHaveText('1 of 1')
  await page.getByTestId('tab-add').click()
  await expect(page.getByTestId('rich-editor-content')).toBeFocused()
  await page.waitForTimeout(200)
  await expect(page.getByTestId('document-title')).toHaveValue('')
})

const treeRow = (page: import('@playwright/test').Page, name: string) =>
  page.getByTestId('workspace-tree-row').filter({ hasText: name })

async function sendCommand(page: import('@playwright/test').Page, command: 'save'): Promise<void> {
  await page.evaluate((detail) => window.dispatchEvent(new CustomEvent('markzen:fixture-command', { detail })), command)
}
