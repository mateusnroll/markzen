import { appendFile, writeFile } from 'node:fs/promises'

import { test } from '@playwright/test'

test('AC70: record non-blocking large JSON tree timings', async ({ page }) => {
  const started = performance.now()
  await page.goto('/?fixture=json-performance')
  await page.getByTestId('json-tree').waitFor()
  const report = {
    mountedRows: await page.getByTestId('json-row').count(),
    openMs: Math.round(performance.now() - started),
  }
  await writeFile('test-results/spec0010-performance.json', `${JSON.stringify(report, null, 2)}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Spec 0010 JSON performance (non-blocking)\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`)
  }
})
