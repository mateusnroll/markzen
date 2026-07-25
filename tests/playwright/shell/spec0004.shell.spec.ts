import { expect, test } from '@playwright/test'

import { callMain, launchMarkzen, quitMarkzen } from './helpers'

test('AC28–AC30 AC47 AC86 AC89: unsafe absolute destinations require one main-owned native confirmation', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    await app.evaluate(({ app: electronApp, dialog, shell }) => {
      const harness = electronApp as typeof electronApp & { confirmResponse?: number; openedDestinations?: string[]; warningDestinations?: string[] }
      harness.confirmResponse = 0
      harness.openedDestinations = []
      harness.warningDestinations = []
      Object.defineProperty(shell, 'openExternal', {
        configurable: true,
        value: async (destination: string) => { harness.openedDestinations?.push(destination) },
      })
      Object.defineProperty(dialog, 'showMessageBox', {
        configurable: true,
        value: async (_window: unknown, options: { detail?: string }) => {
          if (options.detail) harness.warningDestinations?.push(options.detail)
          return { checkboxChecked: false, response: harness.confirmResponse ?? 1 }
        },
      })
    })
    await expect(page.evaluate(() => window.markzen?.openExternal('obsidian://open?vault=notes'))).resolves.toEqual({
      ok: true,
      value: { kind: 'opened' },
    })
    await app.evaluate(({ app: electronApp }) => {
      const harness = electronApp as typeof electronApp & { confirmResponse?: number }
      harness.confirmResponse = 1
    })
    expect(await page.evaluate(() => window.markzen?.openExternal('file:///tmp/cancelled.md'))).toEqual({
      ok: true,
      value: { kind: 'cancelled' },
    })
    expect(await app.evaluate(({ app: electronApp }) => {
      const harness = electronApp as typeof electronApp & { openedDestinations?: string[]; warningDestinations?: string[] }
      return { opened: harness.openedDestinations, warnings: harness.warningDestinations }
    })).toEqual({ opened: ['obsidian://open?vault=notes'], warnings: ['obsidian://open?vault=notes', 'file:///tmp/cancelled.md'] })
  } finally {
    await quitMarkzen(app)
  }
})

test('AC26 AC31 AC34 AC46 AC88 AC90 AC91: safe, blocked, and failed external opens never navigate Markzen', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    await app.evaluate(({ app: electronApp, dialog, shell }) => {
      const harness = electronApp as typeof electronApp & { openedDestinations?: string[]; warningCount?: number }
      harness.openedDestinations = []
      harness.warningCount = 0
      Object.defineProperty(dialog, 'showMessageBox', {
        configurable: true,
        value: async () => { harness.warningCount = (harness.warningCount ?? 0) + 1; return { checkboxChecked: false, response: 1 } },
      })
      Object.defineProperty(shell, 'openExternal', {
        configurable: true,
        value: async (destination: string) => {
          if (destination.includes('reject')) throw new Error('handler failed')
          harness.openedDestinations?.push(destination)
        },
      })
    })
    expect(await page.evaluate(() => window.markzen?.openExternal('example.com'))).toEqual({ ok: true, value: { kind: 'opened' } })
    expect(await page.evaluate(() => window.markzen?.openExternal('javascript:alert(1)'))).toEqual({ ok: true, value: { kind: 'unsupported' } })
    expect(await page.evaluate(() => window.markzen?.openExternal('https://reject.example.com'))).toEqual({ ok: true, value: { kind: 'error' } })
    expect(page.url()).toContain('markzen://app')
    expect(await app.evaluate(({ app: electronApp }) => {
      const harness = electronApp as typeof electronApp & { openedDestinations?: string[]; warningCount?: number }
      return { opened: harness.openedDestinations, warnings: harness.warningCount }
    })).toEqual({ opened: ['https://example.com/'], warnings: 0 })
  } finally {
    await quitMarkzen(app)
  }
})

test('AC50 AC69 AC70 AC87: native Find/Settings commands and preload surface remain focused and narrow', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    const surface = await page.evaluate(() => Object.keys(window.markzen ?? {}).sort())
    expect(surface).toEqual(['asset', 'bootstrap', 'document', 'openExternal', 'settings', 'version', 'window', 'workspace'])
    const menu = await callMain<readonly MenuItem[]>(app, 'getApplicationMenuSnapshot', [process.platform])
    const items = flatten(menu)
    expect(items.find((item) => item.label === 'Find…')?.accelerator).toBe('CmdOrCtrl+F')
    expect(items.find((item) => item.label === 'Settings…')?.accelerator).toBe(process.platform === 'darwin' ? 'Cmd+,' : 'CmdOrCtrl+,')
    await page.bringToFront()
    await expect(page.getByTestId('toolbar-summary')).toBeVisible()
    await dispatchMenuCommand(app, page, 'find')
    await expect(page.getByTestId('search-panel')).toBeVisible()
    await dispatchMenuCommand(app, page, 'settings')
    await expect(page.getByTestId('settings-dialog')).toBeVisible()
    await expect(page.getByTestId('search-panel')).toHaveCount(0)
  } finally {
    await quitMarkzen(app)
  }
})

test('AC74 AC75: persisted and System themes choose the BrowserWindow background before reveal', async () => {
  const light = await callOptions('light', false)
  const dark = await callOptions('dark', false)
  const systemDark = await callOptions('system', true)
  expect(light.backgroundColor).toBe('#f7f5f2')
  expect(dark.backgroundColor).toBe('#191715')
  expect(systemDark.backgroundColor).toBe('#191715')

  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    await expect(page.getByTestId('app-shell')).toBeVisible()
    await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'dark' })
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-theme', 'dark')
    await page.evaluate(() => window.markzen?.settings.patch({ theme: 'light' }))
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-theme', 'light')
    await app.evaluate(({ nativeTheme }) => { nativeTheme.themeSource = 'dark' })
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-theme', 'light')
    await page.evaluate(() => window.markzen?.settings.patch({ theme: 'system' }))
    await expect(page.getByTestId('app-shell')).toHaveAttribute('data-theme', 'dark')
  } finally {
    await quitMarkzen(app)
  }
})

async function callOptions(theme: 'system' | 'light' | 'dark', systemDark: boolean): Promise<{ backgroundColor?: string }> {
  const app = await launchMarkzen()
  try {
    return await callMain(app, 'getWindowOptionsForPlatform', [process.platform, theme, systemDark])
  } finally {
    await quitMarkzen(app)
  }
}

async function dispatchMenuCommand(
  app: Parameters<typeof quitMarkzen>[0],
  page: import('@playwright/test').Page,
  command: 'find' | 'settings',
): Promise<void> {
  const windowId = await page.getByTestId('window-id').textContent()
  if (!windowId) throw new Error('Expected a window ID')
  await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, command])
}

type MenuItem = { readonly accelerator?: string; readonly label?: string; readonly submenu?: readonly MenuItem[] }

function flatten(items: readonly MenuItem[]): MenuItem[] {
  return items.flatMap((item) => [item, ...flatten(item.submenu ?? [])])
}
