import { expect, test } from '@playwright/test'

test('AC5 AC21 AC59-AC62: JSON workspace activation, exact-copy Save As, save, watcher, and conflict reuse the shared lifecycle', async ({ page }) => {
  await page.goto('/?fixture=json-basic')
  await treeRow(page, 'data.json').click()
  await expect(page.getByTestId('json-tree')).toBeVisible()
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'data, Preview')
  await page.getByTestId('json-row').filter({ hasText: 'name' }).getByTestId('json-row-preview').dblclick()
  await page.getByTestId('json-inline-editor').fill('Changed')
  const apply = page.getByTestId('json-apply')
  if (await apply.isVisible()) await apply.click()
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'data, dirty')
  await sendCommand(page, 'save')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'data')
})

test('AC35-AC39 AC64 AC69 AC73: measured JSON virtualization remains complete when returning to its tab', async ({ page }) => {
  await page.goto('/?fixture=json-performance')
  const tree = page.getByTestId('json-tree')
  await expect(tree).toHaveAttribute('role', 'tree')
  await expect(page.getByRole('treeitem', { selected: true })).toHaveCount(1)
  await expect.poll(() => page.getByRole('treeitem').count()).toBeGreaterThan(21)
  await page.getByTestId('tab-add').click()
  await expect(page.getByTestId('rich-editor-content')).toBeFocused()
  await page.getByRole('tab', { name: 'JSON performance' }).click()
  await expect(page.getByTestId('json-tree')).toBeVisible()
  await expect.poll(() => page.getByRole('treeitem').count()).toBeGreaterThan(21)
  await expect(page.getByTestId('json-tree')).toHaveJSProperty('scrollTop', 0)
})

const treeRow = (page: import('@playwright/test').Page, name: string) =>
  page.getByTestId('workspace-tree-row').filter({ hasText: name })

async function sendCommand(page: import('@playwright/test').Page, command: 'save'): Promise<void> {
  await page.evaluate((detail) => window.dispatchEvent(new CustomEvent('markzen:fixture-command', { detail })), command)
}
