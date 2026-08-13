import { expect, test } from '@playwright/test'

test('AC66: bounded generic-text open, search, edits, scroll, and history publish measurements', async ({ page }) => {
  const report: Record<string, { readonly completedMs: number; readonly openMs: number; readonly searchMs: number }> = {}
  for (const fixture of ['text-performance', 'text-performance-highlighted']) {
    const started = performance.now()
    await page.goto(`/?fixture=${fixture}`)
    const editor = page.getByTestId('text-editor-content')
    await expect(editor).toBeVisible()
    if (fixture.endsWith('highlighted')) expect(await editor.evaluate((element) => element.querySelector('.hljs-keyword')?.textContent)).toBe('export')
    else expect(await editor.evaluate((element) => element.querySelector('[class^="hljs-"]'))).toBeNull()
    const opened = performance.now() - started
    await editor.press('Control+f')
    await page.getByTestId('search-input').fill('match')
    await expect(page.getByTestId('search-status')).toContainText('of')
    const searched = performance.now() - started
    for (let index = 0; index < 20; index += 1) await editor.pressSequentially('x')
    await editor.press('Control+z')
    await editor.press('Control+y')
    await page.getByTestId('text-document').evaluate((element) => { element.scrollTop = element.scrollHeight })
    report[fixture] = { completedMs: performance.now() - started, openMs: opened, searchMs: searched }
  }
  await test.info().attach('spec0011-performance.json', {
    body: JSON.stringify(report),
    contentType: 'application/json',
  })
})
