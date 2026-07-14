import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { callMain, launchMarkzen, quitMarkzen } from './helpers'

type MenuItem = { readonly accelerator?: string; readonly label?: string; readonly role?: string; readonly submenu?: readonly MenuItem[] }

test('AC137 AC138: native menu contents and accelerators match each platform', async () => {
  const app = await launchMarkzen()
  try {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const menu = await callMain<readonly MenuItem[]>(app, 'getApplicationMenuSnapshot', [platform])
      const items = flatten(menu)
      for (const label of ['New File', 'Open…', 'Save', 'Save As…', 'Save All', 'Close Tab', 'Close Window']) {
        expect(items.find((item) => item.label === label), `${platform}: ${label}`).toBeDefined()
      }
      expect(items.find((item) => item.label === 'New File')?.accelerator).toBe('CmdOrCtrl+N')
      expect(items.find((item) => item.label === 'Open…')?.accelerator).toBe('CmdOrCtrl+O')
      expect(items.find((item) => item.label === 'Save')?.accelerator).toBe('CmdOrCtrl+S')
      expect(items.find((item) => item.label === 'Save As…')?.accelerator).toBe('CmdOrCtrl+Shift+S')
      expect(items.find((item) => item.label === 'Close Tab')?.accelerator).toBe('CmdOrCtrl+W')
      expect(items.find((item) => item.label === 'Close Window')?.accelerator).toBe('CmdOrCtrl+Shift+W')
      expect(items.some((item) => item.role === 'undo')).toBe(true)
      expect(items.some((item) => item.role === 'selectAll')).toBe(true)
      expect(items.some((item) => item.role === 'about')).toBe(true)
    }
  } finally {
    await quitMarkzen(app)
  }
})

test('AC150 AC151 AC162: packaged Open consumes a test-stubbed native dialog through narrow document intents', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-open-'))
  const file = path.join(directory, 'Olá world.md')
  await writeFile(file, '# Shell open\n')
  const app = await launchMarkzen()
  try {
    await app.evaluate(({ dialog }, selected) => {
      const mutable = dialog as typeof dialog & { showOpenDialog: typeof dialog.showOpenDialog }
      mutable.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] })
    }, file)
    const page = await app.firstWindow()
    const surface = await page.evaluate(() => ({
      document: Object.keys(window.markzen?.document ?? {}).sort(),
      root: Object.keys(window.markzen ?? {}).sort(),
    }))
    expect(surface.root).toEqual(['asset', 'bootstrap', 'document', 'openExternal', 'settings', 'version', 'window', 'workspace'])
    expect(surface.document).toEqual([
      'acceptExternal', 'close', 'completeQuitSaveAll', 'confirmClose', 'confirmWindowClose', 'createTab', 'onCommand',
      'onExternalChange', 'open', 'overwriteExternal', 'retryCleanup', 'save', 'saveAndRename', 'saveAs', 'updateMenuState',
    ])
    await page.getByTestId('open-document').click()
    await expect(page.getByTestId('document-title')).toHaveValue('Olá world')
    await expect(page.getByTestId('rich-editor')).toContainText('Shell open')
  } finally {
    await quitMarkzen(app)
    await rm(directory, { force: true, recursive: true })
  }
})

test('AC139-AC141: menu enablement follows the focused window document state', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    await expect.poll(() => app.evaluate(({ Menu }) => ({
      close: Menu.getApplicationMenu()?.getMenuItemById('markzen-close-tab')?.enabled,
      save: Menu.getApplicationMenu()?.getMenuItemById('markzen-save')?.enabled,
      saveAll: Menu.getApplicationMenu()?.getMenuItemById('markzen-save-all')?.enabled,
      saveAs: Menu.getApplicationMenu()?.getMenuItemById('markzen-save-as')?.enabled,
    }))).toEqual({ close: true, save: false, saveAll: false, saveAs: true })
    await page.getByTestId('rich-editor-content').click()
    await page.keyboard.type('dirty')
    await expect.poll(() => app.evaluate(({ Menu }) => ({
      save: Menu.getApplicationMenu()?.getMenuItemById('markzen-save')?.enabled,
      saveAll: Menu.getApplicationMenu()?.getMenuItemById('markzen-save-all')?.enabled,
    }))).toEqual({ save: true, saveAll: true })
  } finally {
    await quitMarkzen(app)
  }
})

test('AC147 AC149: Quit warning reports windows and dirty tabs; Cancel aborts and Don’t Save All exits', async () => {
  const app = await launchMarkzen()
  const page = await app.firstWindow()
  await page.getByTestId('rich-editor-content').click()
  await page.keyboard.type('dirty')
  await expect.poll(() => callMain<number>(app, 'getDirtyDocumentCount')).toBe(1)
  await app.evaluate(({ app, dialog }) => {
    const instrumented = app as typeof app & { quitDialogMessage?: string }
    Object.defineProperty(dialog, 'showMessageBox', { configurable: true, value: async (...args: unknown[]) => {
      const options = args.at(-1) as Electron.MessageBoxOptions
      instrumented.quitDialogMessage = options.message
      return { checkboxChecked: false, response: 2 }
    } })
    app.quit()
  })
  await page.waitForTimeout(200)
  expect(await app.evaluate(({ app }) => (app as typeof app & { quitDialogMessage?: string }).quitDialogMessage)).toContain('1 window and 1 dirty tab')
  await expect(page.getByTestId('app-shell')).toBeVisible()

  const closed = app.waitForEvent('close')
  await app.evaluate(({ app, dialog }) => {
    Object.defineProperty(dialog, 'showMessageBox', { configurable: true, value: async () => ({ checkboxChecked: false, response: 1 }) })
    app.quit()
  })
  await closed
})

test('AC148: Quit Save All persists dirty tabs before process exit', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-quit-save-'))
  const target = path.join(directory, 'saved.md')
  const app = await launchMarkzen()
  let exited = false
  try {
    const page = await app.firstWindow()
    await page.getByTestId('rich-editor-content').click()
    await page.keyboard.type('saved on quit')
    await expect.poll(() => callMain<number>(app, 'getDirtyDocumentCount')).toBe(1)
    await app.evaluate(({ dialog }, file) => {
      Object.defineProperty(dialog, 'showMessageBox', { configurable: true, value: async () => ({ checkboxChecked: false, response: 0 }) })
      Object.defineProperty(dialog, 'showSaveDialog', { configurable: true, value: async () => ({ canceled: false, filePath: file }) })
    }, target)
    const closed = app.waitForEvent('close')
    await app.evaluate(({ app }) => app.quit())
    await closed
    exited = true
    await expect.poll(async () => (await import('node:fs/promises')).readFile(target, 'utf8')).toContain('saved on quit')
  } finally {
    if (!exited) await quitMarkzen(app)
    await rm(directory, { force: true, recursive: true })
  }
})

test('AC173: native OS window close controls run the dirty-window guard before disposal', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    await page.getByTestId('rich-editor-content').click()
    await page.keyboard.type('dirty')
    await expect.poll(() => callMain<number>(app, 'getDirtyDocumentCount')).toBe(1)
    await app.evaluate(({ app, BrowserWindow, dialog }) => {
      const instrumented = app as typeof app & { nativeClosePromptCount?: number }
      instrumented.nativeClosePromptCount = 0
      Object.defineProperty(dialog, 'showMessageBox', { configurable: true, value: async () => {
        instrumented.nativeClosePromptCount = (instrumented.nativeClosePromptCount ?? 0) + 1
        return { checkboxChecked: false, response: 2 }
      } })
      BrowserWindow.getAllWindows()[0]?.close()
    })
    await page.waitForTimeout(200)
    await expect(page.getByTestId('app-shell')).toBeVisible()
    expect(await app.evaluate(({ app }) => (app as typeof app & { nativeClosePromptCount?: number }).nativeClosePromptCount)).toBe(1)

    const closed = page.waitForEvent('close')
    await app.evaluate(({ BrowserWindow, dialog }) => {
      Object.defineProperty(dialog, 'showMessageBox', {
        configurable: true,
        value: async () => ({ checkboxChecked: false, response: 1 }),
      })
      BrowserWindow.getAllWindows()[0]?.close()
    })
    await closed
  } finally {
    await quitMarkzen(app)
  }
})

test('AC154-AC161: packaged exact-file watcher reloads clean content and reports a dirty conflict', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-watch-'))
  const file = path.join(directory, 'watched.md')
  await writeFile(file, '# Initial\n')
  const app = await launchMarkzen()
  try {
    await app.evaluate(({ dialog }, selected) => {
      const mutable = dialog as typeof dialog & { showOpenDialog: typeof dialog.showOpenDialog }
      mutable.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] })
    }, file)
    const page = await app.firstWindow()
    await page.getByTestId('open-document').click()
    await expect(page.getByTestId('rich-editor')).toContainText('Initial')
    expect(await callMain<number>(app, 'getDocumentWatcherCount')).toBe(1)
    await writeFile(file, '# External clean\n')
    await expect(page.getByTestId('rich-editor')).toContainText('External clean')

    await page.getByTestId('rich-editor-content').click()
    await page.keyboard.type(' editor')
    await expect(page.getByTestId('document-tab')).toHaveAttribute('aria-label', 'watched, dirty')
    await page.waitForTimeout(300)
    await writeFile(file, '# External dirty\n')
    await expect(page.getByTestId('document-issue')).toContainText('changed on disk', { timeout: 10_000 })
    await expect(page.getByTestId('rich-editor')).toContainText('editor')
  } finally {
    await quitMarkzen(app)
    await rm(directory, { force: true, recursive: true })
  }
})

test('AC45 AC46 AC116: main-owned registry focuses one owner across two windows', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-registry-'))
  const file = path.join(directory, 'one.md')
  await writeFile(file, '# One\n')
  const app = await launchMarkzen()
  try {
    await app.evaluate(({ dialog }, selected) => {
      const mutable = dialog as typeof dialog & { showOpenDialog: typeof dialog.showOpenDialog }
      mutable.showOpenDialog = async () => ({ canceled: false, filePaths: [selected] })
    }, file)
    const first = await app.firstWindow()
    const secondPromise = app.waitForEvent('window')
    await callMain(app, 'createMarkzenWindow')
    const second = await secondPromise
    await first.getByTestId('open-document').click()
    await expect(first.getByTestId('document-title')).toHaveValue('one')
    await second.getByTestId('open-document').click()
    await expect(second.getByTestId('document-title')).toHaveValue('')
    await expect(first.getByTestId('document-title')).toHaveValue('one')
  } finally {
    await quitMarkzen(app)
    await rm(directory, { force: true, recursive: true })
  }
})

const flatten = (items: readonly MenuItem[]): MenuItem[] => items.flatMap((item) => [item, ...flatten(item.submenu ?? [])])
