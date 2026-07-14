import { mkdtemp, mkdir, readFile, rename, rm, symlink, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { callMain, launchMarkzen, quitMarkzen } from './helpers'

test('AC1 AC10 AC11 AC36 AC79 AC80 AC81 AC93 AC110: packaged workspace boot lists a real root and owns one disposed watcher', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-workspace-'))
  await writeFile(path.join(directory, 'Olá world.md'), '# Workspace\n')
  const app = await launchMarkzen()
  try {
    const source = await app.firstWindow()
    await source.bringToFront()
    await expect(source.getByTestId('document-tab')).toBeVisible()
    await source.waitForTimeout(100)
    const created = app.waitForEvent('window')
    await callMain(app, 'createMarkzenWindow', ['workspace', directory])
    const workspace = await created
    await expect(workspace.getByTestId('workspace-sidebar')).toBeVisible()
    await expect(workspace.getByTestId('workspace-tree-row').filter({ hasText: 'Olá world.md' })).toBeVisible()
    expect(await callMain<number>(app, 'getWorkspaceWatcherCount')).toBe(1)
    await app.evaluate(({ dialog }, selected) => {
      Object.defineProperty(dialog, 'showOpenDialog', { configurable: true, value: async () => ({ canceled: false, filePaths: [selected] }) })
    }, directory)
    await workspace.evaluate(() => window.markzen?.workspace.addFolder())
    await expect(workspace.getByTestId('workspace-root-header')).toHaveCount(1)
    expect(await callMain<number>(app, 'getWorkspaceWatcherCount')).toBe(1)

    await writeFile(path.join(directory, 'created.md'), '# Created\n')
    await expect(workspace.getByTestId('workspace-tree-row').filter({ hasText: 'created.md' })).toBeVisible({ timeout: 10_000 })
    const closed = workspace.waitForEvent('close')
    await workspace.evaluate(() => window.markzen?.window.close()).catch(() => undefined)
    await closed
    await expect.poll(() => callMain<number>(app, 'getWorkspaceWatcherCount')).toBe(0)
  } finally {
    await quitMarkzen(app)
    await rm(directory, { force: true, recursive: true })
  }
})

test('AC6 AC78 AC130 AC139: native folder commands and the preload expose only named main-owned intents', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    const surface = await page.evaluate(() => ({
      root: Object.keys(window.markzen ?? {}).sort(),
      settings: Object.keys(window.markzen?.settings ?? {}).sort(),
      workspace: Object.keys(window.markzen?.workspace ?? {}).sort(),
    }))
    expect(surface.root).toEqual(['asset', 'bootstrap', 'document', 'openExternal', 'settings', 'version', 'window', 'workspace'])
    expect(surface.settings).toEqual(['onAppearance', 'onSnapshot', 'onWarning', 'patch', 'retry'])
    expect(surface.workspace).toEqual(['addFolder', 'list', 'onEvent', 'open', 'retryRoot'])
    const menu = await callMain<readonly MenuItem[]>(app, 'getApplicationMenuSnapshot', [process.platform])
    const items = flatten(menu)
    expect(items.find((item) => item.label === 'Open Folder…')?.accelerator).toBe('CmdOrCtrl+Shift+O')
    expect(items.find((item) => item.label === 'Add Folder…')).toBeDefined()
    const regions = {
      sidebar: await page.getByTestId('shell-content').evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region')),
      titlebar: await page.getByTestId('window-drag-region').evaluate((element) => getComputedStyle(element).getPropertyValue('-webkit-app-region')),
    }
    expect(regions.sidebar).not.toBe('drag')
    expect(regions.titlebar).toBe('drag')
  } finally {
    await quitMarkzen(app)
  }
})

test('AC2 AC4 AC135: cancellation and failed folders leave the source window unchanged', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-open-folder-'))
  await writeFile(path.join(directory, 'one.md'), '# One\n')
  const app = await launchMarkzen()
  try {
    await (await app.firstWindow()).bringToFront()
    await app.evaluate(({ dialog }) => {
      Object.defineProperty(dialog, 'showOpenDialog', { configurable: true, value: async () => ({ canceled: true, filePaths: [] }) })
    })
    await callMain(app, 'openFolderForShellTest')
    expect(app.windows()).toHaveLength(1)

    const missing = path.join(directory, 'missing')
    await app.evaluate(({ dialog }, selected) => {
      Object.defineProperty(dialog, 'showOpenDialog', { configurable: true, value: async () => ({ canceled: false, filePaths: [selected] }) })
      Object.defineProperty(dialog, 'showMessageBox', { configurable: true, value: async () => ({ checkboxChecked: false, response: 0 }) })
    }, missing)
    await callMain(app, 'openFolderForShellTest')
    expect(app.windows()).toHaveLength(1)

  } finally {
    await quitMarkzen(app)
    await rm(directory, { force: true, recursive: true })
  }
})

test('AC3 AC138: a ready folder boot closes its pristine source window', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-ready-folder-'))
  await writeFile(path.join(directory, 'one.md'), '# One\n')
  const app = await launchMarkzen()
  try {
    const source = await app.firstWindow()
    await source.bringToFront()
    await expect(source.getByTestId('document-tab')).toBeVisible()
    await source.waitForTimeout(100)
    await app.evaluate(({ dialog }, selected) => {
      Object.defineProperty(dialog, 'showOpenDialog', { configurable: true, value: async () => ({ canceled: false, filePaths: [selected] }) })
    }, directory)
    const created = app.waitForEvent('window')
    await callMain(app, 'openFolderForShellTest')
    const workspace = await created
    await expect(workspace.getByTestId('workspace-sidebar')).toBeVisible()
    await expect.poll(() => app.windows().length).toBe(1)
  } finally {
    await quitMarkzen(app)
    await rm(directory, { force: true, recursive: true })
  }
})

test('AC136 AC137: one chooser per source suppresses overlap and late completion after disposal', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-pending-folder-'))
  const app = await launchMarkzen()
  try {
    const sourceCreated = app.waitForEvent('window')
    await callMain(app, 'createMarkzenWindow')
    const source = await sourceCreated
    await source.bringToFront()
    await app.evaluate(({ app: electronApp, dialog }) => {
      const instrumented = electronApp as typeof electronApp & {
        folderDialogCount?: number
        resolveFolderDialog?: (value: Electron.OpenDialogReturnValue) => void
      }
      instrumented.folderDialogCount = 0
      Object.defineProperty(dialog, 'showOpenDialog', { configurable: true, value: async () => {
        instrumented.folderDialogCount = (instrumented.folderDialogCount ?? 0) + 1
        return new Promise<Electron.OpenDialogReturnValue>((resolve) => { instrumented.resolveFolderDialog = resolve })
      } })
    })
    const pending = callMain(app, 'openFolderForShellTest')
    await expect.poll(() => app.evaluate(({ app: electronApp }) =>
      (electronApp as typeof electronApp & { folderDialogCount?: number }).folderDialogCount)).toBe(1)
    await callMain(app, 'openFolderForShellTest')
    expect(await app.evaluate(({ app: electronApp }) =>
      (electronApp as typeof electronApp & { folderDialogCount?: number }).folderDialogCount)).toBe(1)
    await source.evaluate(() => window.markzen?.window.close()).catch(() => undefined)
    await app.evaluate(({ app: electronApp }, selected) => {
      const instrumented = electronApp as typeof electronApp & {
        resolveFolderDialog?: (value: Electron.OpenDialogReturnValue) => void
      }
      instrumented.resolveFolderDialog?.({ canceled: false, filePaths: [selected] })
    }, directory)
    await pending
    await expect.poll(() => app.windows().length).toBe(1)
  } finally {
    await quitMarkzen(app)
    await rm(directory, { force: true, recursive: true })
  }
})

test('AC18 AC20 AC39 AC142 AC146: real aliases deduplicate across workspaces while out-of-root targets are refused', async () => {
  test.skip(process.platform === 'win32', 'Creating unprivileged symlinks is not reliable on Windows CI')
  const parent = await mkdtemp(path.join(os.tmpdir(), 'markzen-workspace-link-'))
  const root = path.join(parent, 'root')
  const outside = path.join(parent, 'outside.md')
  await mkdir(root)
  await writeFile(path.join(root, 'inside.md'), '# Inside\n')
  await writeFile(outside, '# Outside\n')
  await symlink(path.join(root, 'inside.md'), path.join(root, 'alias.md'))
  await symlink(outside, path.join(root, 'outside-link.md'))
  const app = await launchMarkzen()
  try {
    const created = app.waitForEvent('window')
    await callMain(app, 'createMarkzenWindow', ['workspace', root])
    const workspace = await created
    const rows = workspace.getByTestId('workspace-tree-row')
    await rows.filter({ hasText: 'inside.md' }).click()
    await expect(workspace.getByTestId('document-tab')).toHaveCount(1)
    const secondCreated = app.waitForEvent('window')
    await callMain(app, 'createMarkzenWindow', ['workspace', root])
    const second = await secondCreated
    await second.getByTestId('workspace-tree-row').filter({ hasText: 'alias.md' }).click()
    await expect(second.getByTestId('document-tab')).toHaveCount(0)
    await rows.filter({ hasText: 'alias.md' }).dblclick()
    await expect(workspace.getByTestId('document-tab')).toHaveCount(1)
    await rows.filter({ hasText: 'outside-link.md' }).click()
    await expect(workspace.getByTestId('document-issue')).toContainText('could not be opened')
    await expect(workspace.getByTestId('document-issue')).not.toContainText(parent)
  } finally {
    await quitMarkzen(app)
    await rm(parent, { force: true, recursive: true })
  }
})

test('AC33 AC34 AC89 AC90 AC92: a missing root remains visible and explicit Retry recovers without an app retry loop', async () => {
  const parent = await mkdtemp(path.join(os.tmpdir(), 'markzen-root-recovery-'))
  const root = path.join(parent, 'root')
  const moved = path.join(parent, 'moved')
  await mkdir(root)
  await writeFile(path.join(root, 'one.md'), '# One\n')
  const app = await launchMarkzen()
  try {
    const created = app.waitForEvent('window')
    await callMain(app, 'createMarkzenWindow', ['workspace', root])
    const workspace = await created
    await rename(root, moved)
    await expect(workspace.getByTestId('workspace-warning')).toBeVisible({ timeout: 10_000 })
    await expect(workspace.getByTestId('workspace-root-header')).toHaveCount(1)
    await rename(moved, root)
    await workspace.getByTestId('workspace-root-retry').click()
    await expect(workspace.getByTestId('workspace-warning')).toHaveCount(0)
    await expect(workspace.getByTestId('workspace-tree-row').filter({ hasText: 'one.md' })).toBeVisible()
  } finally {
    await quitMarkzen(app)
    await rm(parent, { force: true, recursive: true })
  }
})

test('AC5 AC97 AC100-AC106 AC110 AC112 AC123: independent same-root windows share authoritative atomic settings', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-workspace-settings-'))
  const app = await launchMarkzen()
  try {
    const firstCreated = app.waitForEvent('window')
    await callMain(app, 'createMarkzenWindow', ['workspace', directory])
    const first = await firstCreated
    const secondCreated = app.waitForEvent('window')
    await callMain(app, 'createMarkzenWindow', ['workspace', directory])
    const second = await secondCreated
    const firstSplitter = first.getByTestId('workspace-splitter')
    await firstSplitter.focus()
    await first.keyboard.press('ArrowRight')
    await expect(firstSplitter).toHaveAttribute('aria-valuenow', '250')
    await expect(second.getByTestId('workspace-splitter')).toHaveAttribute('aria-valuenow', '250')
    const profile = await app.evaluate(({ app: electronApp }) => electronApp.getPath('userData'))
    await expect.poll(async () => {
      try {
        return JSON.parse(await readFile(path.join(profile, 'settings.json'), 'utf8')) as unknown
      } catch {
        return undefined
      }
    }).toMatchObject({
      schemaVersion: 1,
      sidebarWidth: 250,
    })
  } finally {
    await quitMarkzen(app)
    await rm(directory, { force: true, recursive: true })
  }
})

type MenuItem = { readonly accelerator?: string; readonly label?: string; readonly submenu?: readonly MenuItem[] }
const flatten = (items: readonly MenuItem[]): MenuItem[] => items.flatMap((item) => [item, ...flatten(item.submenu ?? [])])
