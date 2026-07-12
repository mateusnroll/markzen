import { expect, test } from '@playwright/test'

test('AC39-AC44 AC50: Open uses one pristine tab and preserves Unicode identity', async ({ page }) => {
  await page.goto('/?fixture=lifecycle-open')
  await expect(page.getByTestId('document-tab')).toHaveCount(1)

  await page.getByTestId('open-document').click()

  await expect(page.getByTestId('document-tab')).toHaveCount(1)
  await expect(page.getByTestId('document-title')).toHaveValue('Olá world')
  await expect(page.getByTestId('rich-editor')).toContainText('Welcome')
})

test('AC42: cancelling Open leaves the pristine tab unchanged', async ({ page }) => {
  await page.goto('/?fixture=lifecycle-open-cancel')
  await page.getByTestId('open-document').click()
  await expect(page.getByTestId('document-tab')).toHaveCount(1)
  await expect(page.getByTestId('document-title')).toHaveValue('')
})

test('AC92 AC96-AC98 AC119 AC123 AC153: Save As creates from the current tab and replaces its identity', async ({ page }) => {
  await page.goto('/?fixture=lifecycle-save-as')
  await page.getByTestId('document-title').fill('New note')
  await page.getByTestId('rich-editor-content').click()
  await page.keyboard.type('Hello')

  await page.getByTestId('save-as-document').click()

  await expect(page.getByTestId('document-title')).toHaveValue('New note')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'New note')
  await expect(page.getByTestId('document-tab')).toHaveCount(1)
})

test('AC94 AC101 AC102 AC143 AC171: pure rename moves clean content while edited rename requires the explicit decision', async ({ page }) => {
  await page.goto('/?fixture=lifecycle-rename')
  await page.getByTestId('open-document').click()
  await page.getByTestId('document-title').fill('Moved')
  await page.getByTestId('save-document').click()
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'Moved')

  await page.getByTestId('document-title').fill('Moved again')
  await page.getByTestId('rich-editor-content').click()
  await page.keyboard.type(' edited')
  await page.getByTestId('save-document').click()
  await expect(page.getByTestId('document-issue')).toContainText('content must be saved before the file can move')
  await page.getByTestId('rename-cancel').click()
  await expect(page.getByTestId('document-title')).toHaveValue('Moved')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'Moved, dirty')
  await page.getByTestId('document-title').fill('Final')
  await page.getByTestId('save-document').click()
  await page.getByTestId('rename-save').click()
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'Final')
})

test('AC124-AC129: dirty close choices retain or dispose the tab deterministically', async ({ page }) => {
  await page.goto('/?fixture=lifecycle-close')
  await page.getByTestId('rich-editor-content').click()
  await page.keyboard.type('dirty')
  await page.getByTestId('document-tab-close').click()
  await expect(page.getByTestId('document-tab')).toHaveCount(1)
  await page.getByTestId('document-tab-close').click()
  await expect(page.getByTestId('document-tab')).toHaveCount(0)
  await expect(page.getByTestId('empty-new-file')).toBeVisible()
})

test('AC154 AC159: a clean watched document reloads and announces the fresh disk model', async ({ page }) => {
  await page.goto('/?fixture=lifecycle-external-clean')
  await page.getByTestId('open-document').click()
  await expect(page.getByTestId('rich-editor')).toContainText('External clean')
  await expect(page.getByTestId('workspace-announcement')).toHaveText('Document reloaded from disk.')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'watched')
})

test('AC105 AC155-AC158: a dirty watched document keeps editor content and exercises all conflict outcomes', async ({ page }) => {
  await page.goto('/?fixture=lifecycle-external-dirty')
  await page.getByTestId('open-document').click()
  await page.getByTestId('rich-editor-content').click()
  await page.keyboard.type(' editor change')
  await expect(page.getByTestId('document-issue')).toContainText('changed on disk')
  await expect(page.getByTestId('rich-editor')).toContainText('editor change')
  await expect(page.getByTestId('conflict-overwrite')).toBeVisible()
  await expect(page.getByTestId('conflict-reload')).toBeVisible()
  await expect(page.getByTestId('conflict-save-as')).toBeVisible()
  await page.getByTestId('conflict-reload').click()
  await expect(page.getByTestId('rich-editor')).toContainText('External dirty')
  await expect(page.getByTestId('document-issue')).toHaveCount(0)

  await page.goto('/?fixture=lifecycle-external-dirty')
  await page.getByTestId('open-document').click()
  await page.getByTestId('rich-editor-content').click()
  await page.keyboard.type(' overwrite copy')
  await expect(page.getByTestId('document-issue')).toContainText('changed on disk')
  await page.getByTestId('conflict-overwrite').click()
  await expect(page.getByTestId('document-issue')).toHaveCount(0)
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'watched')

  await page.goto('/?fixture=lifecycle-external-dirty')
  await page.getByTestId('open-document').click()
  await page.getByTestId('rich-editor-content').click()
  await page.keyboard.type(' preserved copy')
  await expect(page.getByTestId('document-issue')).toContainText('changed on disk')
  await page.getByTestId('conflict-save-as').click()
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'editor-copy')
  await page.getByTestId('open-document').click()
  await expect(page.getByTestId('document-tab')).toHaveCount(2)
  await expect(page.getByTestId('rich-editor')).toContainText('External dirty')
})

test('AC103 AC104: failed writes keep the visible editor revision dirty', async ({ page }) => {
  await page.goto('/?fixture=lifecycle-save-error')
  await page.getByTestId('open-document').click()
  await page.getByTestId('rich-editor-content').click()
  await page.keyboard.type(' edited')
  await page.getByTestId('save-document').click()
  await expect(page.getByTestId('document-issue')).toContainText('could not be saved')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'read-only, dirty')
})

test('AC130-AC132 AC135-AC136: window close cancel retains state and discard closes without writes', async ({ page }) => {
  await page.goto('/?fixture=lifecycle-window-cancel')
  await page.getByTestId('rich-editor-content').click()
  await page.keyboard.type('dirty')
  await page.getByTestId('window-close').click()
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-window-status', 'normal')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'Untitled, dirty')

  await page.goto('/?fixture=lifecycle-window-discard')
  await page.getByTestId('rich-editor-content').click()
  await page.keyboard.type('dirty')
  await page.getByTestId('window-close').click()
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-window-status', 'closed')
})

test('AC133-AC134: Save All runs left-to-right and stops with the window open on cancellation', async ({ page }) => {
  await page.goto('/?fixture=lifecycle-window-save-all')
  await dirtyTwoTabs(page)
  await page.getByTestId('window-close').click()
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-window-status', 'closed')

  await page.goto('/?fixture=lifecycle-window-save-stop')
  await dirtyTwoTabs(page)
  await page.getByTestId('window-close').click()
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-window-status', 'normal')
  await expect(page.getByTestId('document-issue')).toContainText('Save All stopped')
  const labels = await page.getByTestId('document-tab').evaluateAll((tabs) => tabs.map((tab) => tab.getAttribute('aria-label')))
  expect(labels).toEqual(['first', 'second, dirty'])
})

async function dirtyTwoTabs(page: import('@playwright/test').Page): Promise<void> {
  await page.getByTestId('document-title').fill('first')
  await page.getByTestId('rich-editor-content').click()
  await page.keyboard.type('one')
  await page.getByTestId('tab-add').click()
  await expect(page.getByTestId('document-tab')).toHaveCount(2)
  await page.getByTestId('document-title').fill('second')
  await page.getByTestId('rich-editor-content').click()
  await page.keyboard.type('two')
}
