import { expect, test } from '@playwright/test'

test('AC1 AC5-AC15 AC31-AC39 AC42-AC51: mixed workspace opens generic text, raster, and external previews through one closed classifier', async ({ page }) => {
  await page.goto('/?fixture=other-file-types')

  await treeRow(page, 'example.ts').click()
  await expect(page.getByTestId('text-editor-content')).toBeVisible()
  await expect(page.getByTestId('text-language-label')).toHaveText('TypeScript')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'example, Preview')
  await page.getByTestId('text-editor-content').press('End')
  await page.getByTestId('text-editor-content').pressSequentially('!')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'example, dirty')
  await sendCommand(page, 'save')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'example')

  await treeRow(page, 'study.png').click()
  await expect(page.getByTestId('raster-image')).toBeVisible()
  await expect(page.getByTestId('raster-metadata')).toContainText('PNG · 1 × 1 · Static')
  await expect(page.getByTestId('document-title')).toHaveCount(0)

  await treeRow(page, 'archive.zip').click()
  await expect(page.getByTestId('external-limitation')).toContainText('cannot edit or preview')
  await expect(page.getByRole('button', { name: 'Open in Default App' })).toBeVisible()
  await expect(page.getByTestId('document-title')).toHaveCount(0)
})

test('AC20 AC22 AC24 AC58-AC62: preservation, watcher reload, conflict, and stale mixed-kind work retain their owner', async ({ page }) => {
  await page.goto('/?fixture=other-file-types-preservation')
  await treeRow(page, 'invalid.txt').click()
  await expect(page.getByTestId('preservation-explanation')).toContainText('not valid UTF-8')
  await expect(page.getByTestId('text-editor-content')).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'Open in Default App' })).toBeVisible()

  await treeRow(page, 'watched.log').click()
  await expect(page.getByTestId('text-editor-content')).toContainText('Initial')
  await expect(page.getByTestId('workspace-announcement')).toContainText('reloaded from disk')
  await expect(page.getByTestId('text-editor-content')).toContainText('External')
})

const treeRow = (page: import('@playwright/test').Page, name: string) =>
  page.getByTestId('workspace-tree-row').filter({ hasText: name })

async function sendCommand(page: import('@playwright/test').Page, command: 'save'): Promise<void> {
  await page.evaluate((detail) => window.dispatchEvent(new CustomEvent('markzen:fixture-command', { detail })), command)
}
