import { mkdir, writeFile } from 'node:fs/promises'
import { expect, test } from '@playwright/test'

test('spec 0015 AC35: controlled Raw open, edits, Find, scrolling, transfer and save complete with measurements', async ({ page, baseURL }) => {
  const requests: string[] = []
  const origin = new URL(baseURL!).origin
  page.on('request', (request) => { if (new URL(request.url()).origin !== origin) requests.push(request.url()) })
  const start = performance.now()
  await page.goto('/?fixture=writing-search-10k')
  const modifier = await page.evaluate(() => navigator.platform.includes('Mac') ? 'Meta' : 'Control')
  await page.getByTestId('rich-editor-content').press(`${modifier}+e`)
  const raw = page.getByTestId('raw-editor-content')
  await expect(raw).toBeVisible()
  const opened = performance.now()
  for (const fraction of [0, 0.5, 1]) {
    const target = await raw.evaluate((element, fraction) => {
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT)
      const nodes: Text[] = []
      let next: Node | null
      while ((next = walker.nextNode())) nodes.push(next as Text)
      const target = Math.floor(nodes.reduce((sum, node) => sum + node.length, 0) * fraction)
      let offset = target
      for (const node of nodes) {
        if (offset <= node.length) {
          const range = document.createRange()
          range.setStart(node, offset); range.collapse(true)
          window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range)
          return target
        }
        offset -= node.length
      }
      return -1
    }, fraction)
    expect(target).toBeGreaterThanOrEqual(0)
    await raw.pressSequentially('edit')
    expect(await raw.evaluate((element, offset) => element.textContent?.slice(offset, offset + 4), target)).toBe('edit')
  }
  await raw.press(`${modifier}+z`); await raw.press(`${modifier}+Shift+z`)
  const edited = performance.now()
  await raw.press(`${modifier}+f`); await page.getByTestId('search-input').fill('line')
  await expect(page.getByTestId('search-status')).toContainText('of 10000')
  await page.getByTestId('search-close').click()
  await page.getByTestId('raw-document').evaluate((e) => { e.scrollTop = e.scrollHeight })
  await expect.poll(() => page.getByTestId('raw-document').evaluate((element) => element.scrollTop)).toBeGreaterThan(0)
  const searchedAndScrolled = performance.now()
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('markzen:fixture-command', { detail: 'save' })))
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'search-performance')
  const saved = performance.now()
  await raw.press(`${modifier}+e`)
  await expect(page.getByTestId('rich-editor-content')).toBeVisible()
  expect(requests).toEqual([])
  await mkdir('test-results', { recursive: true })
  await writeFile('test-results/spec0015-performance.json', JSON.stringify({ elapsedMs: performance.now() - start, openMs: opened - start, editAndHistoryMs: edited - opened, findAndScrollMs: searchedAndScrolled - edited, saveMs: saved - searchedAndScrolled, transferMs: performance.now() - saved }))
})
