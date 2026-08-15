import { appendFile, mkdir, writeFile } from 'node:fs/promises'

import { test } from '@playwright/test'

test('AC22: 10,000 list items record non-blocking initial-render, toggle-to-paint, and renderer-heartbeat measurements', async ({ page }) => {
  await page.addInitScript(() => {
    const gaps: number[] = []
    let previous = performance.now()
    setInterval(() => {
      const current = performance.now()
      gaps.push(current - previous)
      previous = current
    }, 16)
    ;(window as typeof window & { markzenHeartbeatGaps?: number[] }).markzenHeartbeatGaps = gaps
  })
  const renderStarted = performance.now()
  await page.goto('/?fixture=nested-lists-10k')
  await page.getByTestId('nested-list-toggle').first().waitFor()
  const initialRenderMilliseconds = performance.now() - renderStarted

  const toggleStarted = performance.now()
  await page.getByTestId('nested-list-toggle').first().click()
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const collapseToPaintMilliseconds = performance.now() - toggleStarted
  const expandStarted = performance.now()
  await page.getByTestId('nested-list-toggle').first().click()
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
  const expandToPaintMilliseconds = performance.now() - expandStarted
  const gaps = await page.evaluate(() => (window as typeof window & { markzenHeartbeatGaps?: number[] }).markzenHeartbeatGaps ?? [])
  const report = {
    collapseToPaintMilliseconds,
    expandToPaintMilliseconds,
    initialRenderMilliseconds,
    maximumRendererHeartbeatGapMilliseconds: Math.max(0, ...gaps),
  }

  await mkdir('test-results', { recursive: true })
  await writeFile('test-results/spec0012-performance.json', `${JSON.stringify(report, null, 2)}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Spec 0012 nested-list performance (non-blocking)\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`)
  }
})
