import { expect, test, type Page } from '@playwright/test'
const command = (page: Page, detail: string) => page.evaluate((value) => window.dispatchEvent(new CustomEvent('markzen:fixture-command', { detail: value })), detail)

test('spec 0015 AC3 AC4: shortcut changes only the owning tab and switching restores Raw state', async ({ page }) => {
  await page.goto('/?fixture=basic')
  const modifier = await page.evaluate(() => navigator.platform.includes('Mac') ? 'Meta' : 'Control')
  await page.getByTestId('rich-editor-content').press(`${modifier}+e`)
  await expect(page.getByTestId('raw-editor-content')).toBeFocused()
  await page.getByTestId('raw-editor-content').pressSequentially('original')
  await page.getByTestId('tab-add').click()
  await expect(page.getByTestId('rich-editor-content')).toBeVisible()
  await page.getByTestId('document-tab').first().click()
  await expect(page.getByTestId('raw-editor-content')).toContainText('original')
})

test('spec 0015 AC5 AC6 AC7: unsupported UTF-8 is editable Raw and invalid bytes remain protected', async ({ page }) => {
  await page.goto('/?fixture=raw-markdown')
  await command(page, 'open')
  await expect(page.getByTestId('raw-editor-content')).toContainText('unsupported')
  await expect(page.getByTestId('raw-notice')).toContainText('Rich')
  await command(page, 'open')
  await expect(page.getByTestId('preservation-view')).toBeVisible()
  await command(page, 'raw-markdown')
  await expect(page.getByTestId('raw-editor-content')).toHaveCount(0)
  await command(page, 'new-csv')
  await command(page, 'raw-markdown')
  await expect(page.getByTestId('raw-editor-content')).toHaveCount(0)
})

test('spec 0015 AC26 AC27 AC28 AC29: Raw Save, failure, mixed Save All and close cancellation preserve owners', async ({ page }) => {
  await page.goto('/?fixture=lifecycle-save-error')
  await command(page, 'open'); await command(page, 'raw-markdown')
  await page.getByTestId('raw-editor-content').pressSequentially(' kept')
  await command(page, 'save')
  await expect(page.getByTestId('document-issue')).toContainText('could not be saved')
  await expect(page.getByTestId('raw-editor-content')).toContainText('kept')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', /dirty/)
  await page.goto('/?fixture=lifecycle-window-save-all')
  await command(page, 'raw-markdown')
  await page.getByTestId('raw-editor-content').pressSequentially('Raw')
  await page.getByTestId('tab-add').click()
  await page.getByTestId('rich-editor-content').pressSequentially('Rich')
  await page.getByTestId('window-close').click()
  await expect(page.getByTestId('app-shell')).toHaveAttribute('data-window-status', 'closed')
  await page.goto('/?fixture=lifecycle-window-cancel')
  await command(page, 'raw-markdown')
  await page.getByTestId('raw-editor-content').pressSequentially('Retain')
  await page.getByTestId('window-close').click()
  await expect(page.getByTestId('raw-editor-content')).toContainText('Retain')
})

test('spec 0015 AC30 AC31 AC32: external reload resets mode while dirty Raw retains its content', async ({ page }) => {
  await page.goto('/?fixture=lifecycle-external-clean')
  await command(page, 'open'); await command(page, 'raw-markdown')
  await expect(page.getByTestId('workspace-announcement')).toContainText('reloaded')
  await expect(page.getByTestId('rich-editor-content')).toContainText('External clean')
  await page.goto('/?fixture=lifecycle-external-dirty')
  await command(page, 'open'); await command(page, 'raw-markdown')
  await page.getByTestId('raw-editor-content').pressSequentially(' local')
  await expect(page.getByTestId('document-issue')).toContainText('changed on disk')
  await expect(page.getByTestId('raw-editor-content')).toContainText('local')
  await page.getByTestId('conflict-reload').click()
  await expect(page.getByTestId('rich-editor-content')).toContainText('External dirty')
})

test('spec 0015 AC33: Raw source and failed conversion cannot activate media or navigate', async ({ page, baseURL }) => {
  const requests: string[] = []
  const origin = new URL(baseURL!).origin
  page.on('request', (request) => { if (new URL(request.url()).origin !== origin) requests.push(request.url()) })
  await page.goto('/?fixture=raw-markdown')
  await command(page, 'open')
  await page.getByTestId('raw-editor-content').evaluate((element) => { const range = document.createRange(); range.selectNodeContents(element); range.collapse(false); window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range) })
  await page.getByTestId('raw-editor-content').pressSequentially('<script>alert(1)</script> ![x](https://example.com/x.png)')
  await command(page, 'raw-markdown')
  await expect(page.getByTestId('raw-editor-content')).toBeVisible()
  expect(requests).toEqual([])
  expect(await page.getByTestId('raw-editor-content').evaluate((element) => element.querySelectorAll('img,script,a').length)).toBe(0)
})


test('spec 0015 AC26 AC32: completion of captured Raw save retains a later Rich edit and current mode', async ({ page }) => {
  await page.goto('/?fixture=raw-save-race')
  await command(page, 'raw-markdown')
  await page.getByTestId('raw-editor-content').pressSequentially('first')
  await command(page, 'save')
  await expect(page.getByTestId('fixture-save-status')).toHaveAttribute('data-fixture-save-state', 'pending')
  await command(page, 'raw-markdown')
  await page.getByTestId('rich-editor-content').pressSequentially('later')
  await expect(page.getByTestId('fixture-save-status')).toHaveCount(0)
  await expect(page.getByTestId('rich-editor-content')).toContainText('later')
  await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', /dirty/)
})

test('spec 0015 AC12 AC13: fallback notice and Raw editing stay reachable at minimum size, zoom and forced colors', async ({ page }) => {
  await page.setViewportSize({ width: 480, height: 320 })
  await page.emulateMedia({ forcedColors: 'active', reducedMotion: 'reduce' })
  await page.goto('/?fixture=raw-markdown')
  await page.evaluate(() => { document.documentElement.style.zoom = '2' })
  await command(page, 'open')
  await expect(page.getByTestId('raw-notice')).toContainText('Rich')
  await expect.poll(() => page.getByTestId('raw-document').evaluate((element) => element.clientHeight)).toBeGreaterThan(32)
  expect(await page.getByTestId('raw-document').evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true)
  await page.getByTestId('raw-editor-content').pressSequentially('reachable')
  await expect(page.getByTestId('raw-editor-content')).toContainText('reachable')
  await command(page, 'find')
  await page.getByTestId('search-input').fill('reachable')
  await expect(page.getByTestId('search-status')).toHaveText('1 of 1')
})

for (const action of ['edit', 'new'] as const) {
  test(`spec 0015 AC28 AC29 AC32: Save All explains interruption by concurrent ${action}`, async ({ page }) => {
    await page.goto('/?fixture=raw-save-race')
    await command(page, 'raw-markdown')
    await page.getByTestId('raw-editor-content').pressSequentially('first')
    await command(page, 'save-all')
    await expect(page.getByTestId('fixture-save-status')).toHaveAttribute('data-fixture-save-state', 'pending')
    if (action === 'edit') await page.getByTestId('raw-editor-content').pressSequentially('later')
    else {
      await page.getByTestId('tab-add').click()
      await page.getByTestId('rich-editor-content').pressSequentially('newer')
    }
    await expect(page.getByTestId('document-issue')).toContainText('Save All stopped')
  })
}
