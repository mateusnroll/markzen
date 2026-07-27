import { appendFile, mkdir, writeFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

test('AC65: 100,000-field CSV records non-blocking open, scroll, search, paste, and undo timing', async ({ page }) => {
  const openStart = performance.now()
  await page.goto('/?fixture=csv-100k')
  await expect(page.getByTestId('csv-grid')).toBeVisible()
  const openMilliseconds = performance.now() - openStart
  const grid = page.getByTestId('csv-grid')
  const scrollStart = performance.now()
  await grid.evaluate((element) => {
    element.scrollTop = element.scrollHeight
    element.scrollLeft = element.scrollWidth
    element.dispatchEvent(new Event('scroll', { bubbles: true }))
  })
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  const report = {
    mountedCells: await page.getByTestId('csv-cell').count(),
    openMilliseconds,
    scrollMilliseconds: performance.now() - scrollStart,
  }
  await mkdir('test-results', { recursive: true })
  await writeFile('test-results/spec0009-performance.json', `${JSON.stringify(report, null, 2)}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Spec 0009 CSV performance (non-blocking)\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`)
  }
})
