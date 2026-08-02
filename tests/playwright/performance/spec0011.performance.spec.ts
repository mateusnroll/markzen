import { expect, test } from '@playwright/test'

test('AC66: bounded generic-text open, search, edits, scroll, and history publish measurements', async ({ page }) => {
  const started = performance.now()
  await page.goto('/?fixture=text-performance')
  const editor = page.getByTestId('text-editor-content')
  await expect(editor).toBeVisible()
  const opened = performance.now() - started
  await editor.press('Control+f')
  await page.getByTestId('search-input').fill('match')
  await expect(page.getByTestId('search-status')).toContainText('of')
  const searched = performance.now() - started
  for (let index = 0; index < 20; index += 1) await editor.pressSequentially('x')
  await editor.press('Control+z')
  await editor.press('Control+y')
  await editor.evaluate((element) => { element.scrollTop = element.scrollHeight })
  const completed = performance.now() - started
  await test.info().attach('spec0011-performance.json', {
    body: JSON.stringify({ completedMs: completed, openMs: opened, searchMs: searched }),
    contentType: 'application/json',
  })
})
