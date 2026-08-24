import { appendFile, mkdir, writeFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

test('AC34: table and image candidate navigation and commit publish non-blocking measurements without serialization', async ({ page }) => {
  const report: Record<string, number> = {}
  await page.goto('/?fixture=structured-table-100x20')
  const editor = page.getByTestId('rich-editor-content')
  const source = await editor.evaluate((element) => {
    const cells = element.querySelectorAll<HTMLElement>('td')
    const cell = cells.item(cells.length - 1)
    cell.scrollIntoView({ block: 'center' })
    const rectangle = cell.getBoundingClientRect()
    return { height: rectangle.height, width: rectangle.width, x: rectangle.x, y: rectangle.y }
  })
  await page.mouse.click(source.x + source.width / 2, source.y + source.height / 2)
  await expect(page.getByTestId('table-row-drag-handle')).toBeEnabled()
  await page.getByTestId('table-actions').click()
  await page.getByTestId('table-move-row').click()
  const navigationStarted = performance.now()
  await page.getByTestId('move-first').click()
  report.tableNavigationMilliseconds = performance.now() - navigationStarted
  const commitStarted = performance.now()
  await page.getByTestId('move-place').click()
  await expect.poll(() => editor.evaluate((element) => element.querySelectorAll('tr').item(1).textContent)).toContain('99:0')
  report.tableCommitMilliseconds = performance.now() - commitStarted

  await page.goto('/?fixture=reordering-500')
  await page.getByTestId('blocked-image').first().click()
  await page.getByTestId('image-move').click()
  const imageStarted = performance.now()
  await page.getByTestId('move-last').click()
  await page.getByTestId('move-place').click()
  report.imageMoveMilliseconds = performance.now() - imageStarted

  await mkdir('test-results', { recursive: true })
  await writeFile('test-results/spec0013-performance.json', `${JSON.stringify(report, null, 2)}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Spec 0013 reorder performance (non-blocking)\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`)
  }
})
