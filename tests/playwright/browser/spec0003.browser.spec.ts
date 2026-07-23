import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.goto('/?fixture=workspace-basic')
})

test('AC7-AC9 AC14-AC16 AC23 AC30-AC32: workspace roots and the lazy empty tree remain stable', async ({ page }) => {
  await expect(page.getByTestId('workspace-root-header')).toHaveCount(2)
  await expect(page.getByTestId('workspace-root-header').nth(0)).toContainText('notes')
  await expect(page.getByTestId('workspace-root-header').nth(1)).toContainText('second')
  await expect(page.getByTestId('empty-document-message')).toHaveText('Select a file from the sidebar')
  await expect(treeRow(page, 'image.png')).toHaveAttribute('aria-disabled', 'true')

  await page.getByTestId('workspace-root-header').nth(0).click()
  await expect(treeRow(page, 'alpha.md')).toHaveCount(0)
  await page.getByTestId('workspace-root-header').nth(0).click()
  await expect(treeRow(page, 'alpha.md')).toBeVisible()
})

test('AC28 AC29 AC35 AC40 AC44 AC45: nested recognized files load lazily with relative title context', async ({ page }) => {
  await treeRow(page, 'nested').click()
  await expect(treeRow(page, 'deep.markdown')).toBeVisible()
  await treeRow(page, 'deep.markdown').click()
  await expect(page.getByTestId('document-title')).toHaveValue('deep')
  await expect(page.getByTestId('document-secondary-path')).toHaveText('nested')
  await expect(page.getByTestId('document-secondary-path')).toHaveAttribute('title', 'nested')
})

test('AC46-AC48 AC52 AC55-AC58 AC61: preview replacement, promotion, and pinned insertion are deterministic', async ({ page }) => {
  await treeRow(page, 'alpha.md').click()
  await expect(page.getByTestId('document-tab')).toHaveCount(1)
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'alpha, Preview')

  await treeRow(page, 'beta.md').click()
  await expect(page.getByTestId('document-tab')).toHaveCount(1)
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'beta, Preview')

  await treeRow(page, 'beta.md').dblclick()
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'beta')
  await treeRow(page, 'alpha.md').click()
  await expect(page.getByTestId('document-tab')).toHaveCount(2)
  await page.getByTestId('tab-add').click()
  const labels = await page.getByTestId('document-tab').evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('aria-label')))
  expect(labels).toEqual(['beta', 'Untitled', 'alpha, Preview'])

  await page.getByTestId('document-tab-close').last().click()
  await expect(page.getByTestId('document-tab')).toHaveCount(2)
})

test('AC50 AC51 AC56 AC57 AC96 AC140 AC141: persistent edits and ordinary New/Open semantics never replace preview data', async ({ page }) => {
  await treeRow(page, 'alpha.md').click()
  await page.getByTestId('rich-editor-content').click()
  await page.keyboard.type('changed')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'alpha, dirty')

  await treeRow(page, 'beta.md').click()
  await expect(page.getByTestId('document-tab')).toHaveCount(2)
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('markzen:fixture-command', { detail: 'save' }))
  })
  await expect(page.getByTestId('document-tab').last()).not.toHaveAttribute('aria-label', /Preview/)
})

const treeRow = (page: import('@playwright/test').Page, name: string) =>
  page.getByTestId('workspace-tree-row').filter({ hasText: name })

test('AC74-AC77 AC111 AC147-AC149 AC152: splitter remains reachable at minimum width and high zoom', async ({ page }) => {
  await page.setViewportSize({ height: 320, width: 480 })
  await page.evaluate(() => { document.documentElement.style.zoom = '2' })
  const splitter = page.getByTestId('workspace-splitter')
  await splitter.focus()
  await page.keyboard.press('ArrowRight')
  await expect(splitter).toHaveAttribute('aria-valuenow', /\d+/)
  await expect(page.getByTestId('tab-add')).toBeVisible()
  await expect(page.getByTestId('workspace-sidebar')).toBeVisible()
})
