import { appendFile, mkdir, writeFile } from 'node:fs/promises'

import { test } from '@playwright/test'

test('AC65: large in-document search records non-blocking settle and long-task metrics', async ({ page }) => {
  await page.goto('/?fixture=writing-search-10k')
  const longTasks = await page.evaluate(() => {
    const values: number[] = []
    const observer = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) values.push(entry.duration)
    })
    observer.observe({ entryTypes: ['longtask'] })
    ;(window as typeof window & { markzenSearchLongTasks?: number[] }).markzenSearchLongTasks = values
    return values
  })
  const start = performance.now()
  await page.getByTestId('rich-editor-content').press('Control+f')
  await page.getByTestId('search-input').fill('match')
  await page.getByTestId('search-status').filter({ hasText: /of 5000/ }).waitFor()
  const report = {
    longTasks: await page.evaluate(() => (window as typeof window & { markzenSearchLongTasks?: number[] }).markzenSearchLongTasks ?? []),
    settleMilliseconds: performance.now() - start,
  }
  void longTasks
  await mkdir('test-results', { recursive: true })
  await writeFile('test-results/spec0004-performance.json', `${JSON.stringify(report, null, 2)}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Spec 0004 search performance (non-blocking)\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`)
  }
})
