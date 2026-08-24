import { appendFile, mkdir, writeFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

test('AC39 AC40: 50,000-file finder and 100-tab switcher publish non-blocking measurements', async ({ page }) => {
  const report: Record<string, number> = {}
  await page.goto('/?fixture=finder-performance')
  const indexStarted = performance.now()
  await page.keyboard.press('Control+p')
  const finder = page.getByRole('dialog', { name: 'Go to File' })
  await expect(finder.getByTestId('file-finder-status')).toContainText('50,000 files indexed')
  report.finderOpenMilliseconds = performance.now() - indexStarted
  for (const query of ['file-49999', 'f499', 'fle 499', 'résumé', 'missing']) {
    const started = performance.now()
    await finder.getByRole('searchbox').fill(query)
    await expect(finder.getByTestId('file-finder-status')).toBeVisible()
    report[`query-${query}`] = performance.now() - started
  }
  await page.keyboard.press('Escape')
  await page.keyboard.down('Control')
  const switchStarted = performance.now()
  await page.keyboard.press('Tab')
  await expect(page.getByRole('dialog', { name: 'Switch Tab' }).getByRole('option')).toHaveCount(100)
  report.switcherOpenMilliseconds = performance.now() - switchStarted
  await page.keyboard.up('Control')

  await mkdir('test-results', { recursive: true })
  await writeFile('test-results/spec0014-performance.json', `${JSON.stringify(report, null, 2)}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Spec 0014 quick-open performance (non-blocking)\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`)
})
