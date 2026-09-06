import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('spec 0015 AC35: controlled Raw open, edits, Find, scrolling, transfer and save complete with measurements', async ({ page }) => {
  const start = performance.now()
  await page.goto('/?fixture=writing-search-10k')
  const modifier = await page.evaluate(() => navigator.platform.includes('Mac') ? 'Meta' : 'Control')
  await page.getByTestId('rich-editor-content').press('Control+e')
  const raw = page.getByTestId('raw-editor-content')
  await expect(raw).toBeVisible()
  for (const fraction of [0, 0.5, 1]) {
    await raw.evaluate((element, fraction) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      const nodes: Text[] = []
      let next: Node | null
      while ((next = walker.nextNode())) nodes.push(next as Text)
      let offset = Math.floor(nodes.reduce((sum, node) => sum + node.length, 0) * fraction)
      for (const node of nodes) {
        if (offset <= node.length) {
          const range = document.createRange()
          range.setStart(node, offset); range.collapse(true)
          window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range)
          break
        }
        offset -= node.length
      }
    }, fraction)
    await raw.pressSequentially('edit')
  }
  await raw.press(`${modifier}+z`); await raw.press(`${modifier}+Shift+z`)
  await raw.press('Control+f'); await page.getByTestId('search-input').fill('line')
  await expect(page.getByTestId('search-status')).toContainText('of 10000')
  await page.getByTestId('search-close').click()
  await page.getByTestId('raw-document').evaluate((e) => { e.scrollTop = e.scrollHeight })
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('markzen:fixture-command', { detail: 'save' })))
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'search-performance')
  await raw.press('Control+e')
  await expect(page.getByTestId('rich-editor-content')).toBeVisible()
  await mkdir('test-results', { recursive: true })
  await writeFile('test-results/spec0015-performance.json', JSON.stringify({ elapsedMs: performance.now() - start }))
})
