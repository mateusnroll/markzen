import { appendFile, mkdir, writeFile } from 'node:fs/promises'

import { test } from '@playwright/test'

test('AC15 AC16 AC49 AC67 AC168: controlled document performance report', async ({ page }) => {
  const report: Record<string, unknown> = {}
  await page.goto('/?fixture=basic')
  const editor = page.getByTestId('rich-editor-content')
  await editor.click()
  const editTimes: number[] = []
  for (let index = 0; index < 20; index += 1) {
    const start = performance.now()
    await page.keyboard.type('x')
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    editTimes.push(performance.now() - start)
  }
  report.edits = summarize(editTimes)

  const wheelStart = performance.now()
  await editor.hover()
  await page.mouse.wheel(0, 400)
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  report.wheelMilliseconds = performance.now() - wheelStart

  const tabsStart = performance.now()
  for (let index = 1; index < 30; index += 1) await page.getByTestId('tab-add').click()
  await page.getByTestId('document-tab').nth(29).waitFor()
  const activationTimes: number[] = []
  for (let index = 0; index < 30; index += 1) {
    const start = performance.now()
    await page.getByTestId('document-tab').nth(index).click()
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    activationTimes.push(performance.now() - start)
  }
  report.tabs = { ...summarize(activationTimes), totalMilliseconds: performance.now() - tabsStart }

  await page.goto('/?fixture=performance-10mb')
  const openStart = performance.now()
  await page.evaluate(() => {
    window.dispatchEvent(new CustomEvent('markzen:fixture-command', { detail: 'open' }))
  })
  await page.getByTestId('document-title').waitFor({ state: 'visible', timeout: 120_000 })
  await page.getByTestId('document-title').evaluate((element) => {
    if (!(element instanceof HTMLInputElement) || element.value !== 'large') throw new Error('10MB document did not open')
  })
  await page.getByTestId('rich-editor-content').waitFor({ state: 'visible', timeout: 120_000 })
  report.open10MbMilliseconds = performance.now() - openStart

  await mkdir('test-results', { recursive: true })
  await writeFile('test-results/spec0002-performance.json', `${JSON.stringify(report, null, 2)}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Spec 0002 performance (non-blocking)\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`)
  }
})

function summarize(values: readonly number[]): { maximum: number; p50: number; p95: number } {
  const sorted = [...values].sort((left, right) => left - right)
  return {
    maximum: sorted.at(-1) ?? 0,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
  }
}

const percentile = (values: readonly number[], proportion: number): number =>
  values[Math.min(values.length - 1, Math.floor(values.length * proportion))] ?? 0
