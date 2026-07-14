import { appendFile, mkdir, writeFile } from 'node:fs/promises'

import { expect, test } from '@playwright/test'

test('AC16: 100-row by 20-column table records editing and append timing', async ({ page }) => {
  await page.goto('/?fixture=structured-table-100x20')
  const editor = page.getByTestId('rich-editor-content')
  await editor.evaluate((element) => {
    const cells = element.querySelectorAll<HTMLElement>('td')
    cells.item(cells.length - 1).click()
  })
  const editStart = performance.now()
  await page.keyboard.type('x')
  await page.evaluate(() => new Promise<void>((resolve) => requestAnimationFrame(() => resolve())))
  const editMilliseconds = performance.now() - editStart
  await page.getByTestId('table-actions').click()
  const appendStart = performance.now()
  await page.getByTestId('table-add-row').click()
  await expect.poll(() => editor.evaluate((element) => element.querySelectorAll('tr').length)).toBe(101)
  const report = { appendRowMilliseconds: performance.now() - appendStart, editMilliseconds }
  await mkdir('test-results', { recursive: true })
  await writeFile('test-results/spec0005-performance.json', `${JSON.stringify(report, null, 2)}\n`)
  if (process.env.GITHUB_STEP_SUMMARY) {
    await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Spec 0005 table performance (non-blocking)\n\n\`\`\`json\n${JSON.stringify(report, null, 2)}\n\`\`\`\n`)
  }
})
