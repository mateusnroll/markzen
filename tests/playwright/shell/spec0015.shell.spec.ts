import { mkdtemp, readFile, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { callMain, focusMarkzen, launchMarkzen, quitMarkzen } from './helpers'

test('spec 0015 AC1 AC2: native Raw command is checked per focused eligible window and disabled without focus', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow(); await focusMarkzen(app)
    await expect(page.getByTestId('rich-editor-content')).toBeVisible()
    await expect.poll(() => app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('markzen-raw-markdown')?.enabled)).toBe(true)
    await app.evaluate(({ Menu }) => { const item = Menu.getApplicationMenu()?.getMenuItemById('markzen-raw-markdown'); item?.click() })
    await expect(page.getByTestId('raw-editor-content')).toBeVisible()
    await expect.poll(() => app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('markzen-raw-markdown')?.checked)).toBe(true)
    const firstWindow = await app.browserWindow(page)
    const secondPromise = app.waitForEvent('window')
    await callMain(app, 'createMarkzenWindow')
    const second = await secondPromise
    await expect(second.getByTestId('rich-editor-content')).toBeVisible()
    const secondWindow = await app.browserWindow(second)
    await secondWindow.evaluate((window) => window.focus())
    await expect.poll(() => secondWindow.evaluate((window) => window.isFocused())).toBe(true)
    await expect.poll(() => app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('markzen-raw-markdown')?.checked)).toBe(false)
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await second.getByTestId('rich-editor-content').press(`${modifier}+e`)
    await expect(second.getByTestId('raw-editor-content')).toBeVisible()
    await expect(page.getByTestId('raw-editor-content')).toBeVisible()
    const secondId = await second.getByTestId('window-id').textContent()
    await callMain(app, 'dispatchApplicationCommandForShellTest', [secondId, 'new-csv'])
    await expect(second.getByTestId('csv-grid')).toBeVisible()
    await expect.poll(() => app.evaluate(({ Menu }) => ({
      enabled: Menu.getApplicationMenu()?.getMenuItemById('markzen-raw-markdown')?.enabled,
      checked: Menu.getApplicationMenu()?.getMenuItemById('markzen-raw-markdown')?.checked,
    }))).toEqual({ enabled: false, checked: false })
    await page.bringToFront()
    await firstWindow.evaluate((window) => window.focus())
    await expect.poll(() => firstWindow.evaluate((window) => window.isFocused())).toBe(true)
    await expect.poll(() => app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('markzen-raw-markdown')?.checked)).toBe(true)
    await app.evaluate(({ BrowserWindow }) => { for (const window of BrowserWindow.getAllWindows()) window.hide() })
    await expect.poll(() => app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('markzen-raw-markdown')?.enabled)).toBe(false)
  } finally { await quitMarkzen(app) }
})

test('spec 0015 AC37: packaged Raw writes authored bytes while retaining isolation and no public requests', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-raw-'))
  const file = path.join(directory, 'raw.md')
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow(); await focusMarkzen(app)
    await expect(page.getByTestId('rich-editor-content')).toBeVisible()
    await expect.poll(() => app.evaluate(({ Menu }) => Menu.getApplicationMenu()?.getMenuItemById('markzen-raw-markdown')?.enabled)).toBe(true)
    const requests: string[] = []
    page.on('request', (request) => { if (/^https?:/.test(request.url())) requests.push(request.url()) })
    await app.evaluate(({ Menu }) => { Menu.getApplicationMenu()?.getMenuItemById('markzen-raw-markdown')?.click() })
    await page.getByTestId('raw-editor-content').pressSequentially('$$unsupported\nspaces  ')
    await app.evaluate(({ Menu }) => { Menu.getApplicationMenu()?.getMenuItemById('markzen-raw-markdown')?.click() })
    await expect(page.getByTestId('raw-notice')).toBeVisible()
    await app.evaluate(({ dialog, Menu }, target) => {
      Object.defineProperty(dialog, 'showSaveDialog', { configurable: true, value: async () => ({ canceled: false, filePath: target }) })
      Menu.getApplicationMenu()?.getMenuItemById('markzen-save-as')?.click()
    }, file)
    await expect.poll(async () => readFile(file, 'utf8').catch(() => '')).toBe('$$unsupported\nspaces  ')
    await app.evaluate(({ Menu }) => { Menu.getApplicationMenu()?.getMenuItemById('markzen-find')?.click() })
    await page.getByTestId('search-input').fill('spaces')
    await expect(page.getByTestId('search-status')).toHaveText('1 of 1')
    await page.getByTestId('search-close').click()
    const modifier = process.platform === 'darwin' ? 'Meta' : 'Control'
    await page.getByTestId('raw-editor-content').press(`${modifier}+a`)
    await page.getByTestId('raw-editor-content').pressSequentially('# Supported')
    await app.evaluate(({ Menu }) => { Menu.getApplicationMenu()?.getMenuItemById('markzen-raw-markdown')?.click() })
    await expect(page.getByTestId('rich-editor-content')).toHaveText('Supported')
    await app.evaluate(({ dialog, Menu }) => {
      Object.defineProperty(dialog, 'showMessageBox', { configurable: true, value: async () => ({ response: 1, checkboxChecked: false }) })
      Menu.getApplicationMenu()?.getMenuItemById('markzen-close-tab')?.click()
    })
    await expect(page.getByTestId('rich-editor-content')).toHaveCount(0)
    expect(await page.evaluate(() => ({ node: typeof window.require, process: typeof window.process }))).toEqual({ node: 'undefined', process: 'undefined' })
    expect(requests).toEqual([])
  } finally { await quitMarkzen(app); await rm(directory, { recursive: true, force: true }) }
})
