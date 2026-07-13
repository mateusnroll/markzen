import { appendFile, mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'

import { test } from '@playwright/test'

import { RealFileSystem } from '../../../src/platform/electron/real-fs'
import { asPath, type DirectoryEntry } from '../../../src/platform/contracts'
import { filterAndSortEntries } from '../../../src/workspaces/state'

test('AC115 AC117 AC118 AC120 AC129: folder-workspace performance report is non-blocking', async ({ page }) => {
  const report: Record<string, unknown> = { gating: false, runs: 3 }
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-list-10k-'))
  try {
    for (let start = 0; start < 10_000; start += 250) {
      await Promise.all(Array.from({ length: Math.min(250, 10_000 - start) }, (_, offset) =>
        writeFile(path.join(directory, `file-${start + offset}.md`), '')))
    }
    const fs = new RealFileSystem()
    const listing: number[] = []
    let snapshot: readonly DirectoryEntry[] = []
    for (let run = 0; run < 3; run += 1) {
      const started = performance.now()
      const result = await fs.list(asPath(directory))
      listing.push(performance.now() - started)
      if (result.ok) snapshot = result.value
    }
    const deterministic: number[] = []
    for (let run = 0; run < 3; run += 1) {
      const started = performance.now()
      filterAndSortEntries(snapshot)
      deterministic.push(performance.now() - started)
    }
    report.realBatchedListMilliseconds = summarize(listing)
    report.filterAndSortMilliseconds = summarize(deterministic)

    const expansionStarted = performance.now()
    await page.goto('/?fixture=workspace-performance-10k')
    await page.getByTestId('workspace-tree-row').first().waitFor()
    report.memoryExpansionToFirstRowsMilliseconds = performance.now() - expansionStarted

    const first = page.getByTestId('workspace-tree-row').first()
    const second = page.getByTestId('workspace-tree-row').nth(1)
    await first.dblclick()
    await second.click()
    const activationStarted = performance.now()
    await page.getByTestId('document-tab').first().click()
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    report.cachedPreviewActivationMilliseconds = performance.now() - activationStarted

    await page.goto('/?fixture=workspace-performance-20k')
    const row = page.getByTestId('workspace-tree-row').first()
    await row.focus()
    const keyboardStarted = performance.now()
    await page.keyboard.press('ArrowDown')
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    const keyboard = performance.now() - keyboardStarted
    const wheelStarted = performance.now()
    await page.getByTestId('workspace-sidebar').hover()
    await page.mouse.wheel(0, 500)
    await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
    report.largeTreeInputMilliseconds = { keyboard, wheel: performance.now() - wheelStarted }
  } finally {
    await rm(directory, { force: true, recursive: true })
    await mkdir('test-results', { recursive: true })
    await writeFile('test-results/spec0003-performance.json', `${JSON.stringify(report, null, 2)}\n`)
    if (process.env.GITHUB_STEP_SUMMARY) {
      await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Spec 0003 performance (non-blocking)\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`)
    }
  }
})

function summarize(values: readonly number[]): { readonly maximum: number; readonly p50: number; readonly minimum: number } {
  const sorted = [...values].sort((left, right) => left - right)
  return {
    maximum: sorted.at(-1) ?? 0,
    minimum: sorted[0] ?? 0,
    p50: sorted[Math.floor(sorted.length / 2)] ?? 0,
  }
}
