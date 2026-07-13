import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { FuseState, FuseV1Options, getCurrentFuseWire } from '@electron/fuses'
import { expect, test } from '@playwright/test'

import { callMain, findPackagedExecutable, launchMarkzen, quitMarkzen } from './helpers'

test('AC1: cold launch creates exactly one opaque-identified Markzen window', async () => {
  const app = await launchMarkzen()
  try {
    const windows = app.windows()
    const first = windows[0]
    if (!first) throw new Error('Expected one Markzen window')
    await expect(first.getByTestId('app-shell')).toBeVisible()
    expect(windows).toHaveLength(1)
    await expect(first.getByTestId('window-id')).not.toHaveText('')
  } finally {
    await quitMarkzen(app)
  }
})

test('AC2: the main-owned factory creates a second distinct window', async () => {
  const app = await launchMarkzen()
  try {
    const secondPagePromise = app.waitForEvent('window')
    await callMain(app, 'createMarkzenWindow')
    const second = await secondPagePromise
    const ids = await Promise.all(app.windows().map((window) => window.getByTestId('window-id').textContent()))
    await expect(second.getByTestId('app-shell')).toBeVisible()
    expect(new Set(ids).size).toBe(2)
  } finally {
    await quitMarkzen(app)
  }
})

test('AC3: a window state event is delivered only to its owning renderer', async () => {
  const app = await launchMarkzen()
  try {
    const initialPage = await app.firstWindow()
    await expect(initialPage.getByTestId('app-shell')).toHaveAttribute('data-window-state-ready', 'true')
    const firstId = await initialPage.getByTestId('window-id').textContent()
    if (!firstId) throw new Error('Expected the initial window to have an ID')

    const secondId = await callMain<string>(app, 'createMarkzenWindow')
    await expect.poll(() => app.windows().length).toBe(2)
    await Promise.all(app.windows().map(async (window) => {
      await expect(window.getByTestId('window-id')).not.toHaveText('')
    }))

    const windowsById = new Map<string, (typeof initialPage)>()
    for (const window of app.windows()) {
      const windowId = await window.getByTestId('window-id').textContent()
      if (windowId) windowsById.set(windowId, window)
    }
    const first = windowsById.get(firstId)
    const second = windowsById.get(secondId)
    if (!first || !second) throw new Error('Expected both main-owned windows to have renderer pages')

    await expect(second.getByTestId('app-shell')).toHaveAttribute('data-window-state-ready', 'true')
    const firstStatus = await first.getByTestId('app-shell').getAttribute('data-window-status')
    if (!firstStatus) throw new Error('Expected the initial window to expose its current state')
    const targetedStatus = firstStatus === 'maximized' ? 'normal' : 'maximized'

    await callMain(app, 'emitWindowStateForShellTest', [secondId, { focused: true, status: targetedStatus }])
    await expect(second.getByTestId('app-shell')).toHaveAttribute('data-window-status', targetedStatus)
    await expect(first.getByTestId('app-shell')).toHaveAttribute('data-window-status', firstStatus)
  } finally {
    await quitMarkzen(app)
  }
})

test('AC5: Windows and Linux exit after the last window closes', async () => {
  test.skip(process.platform === 'darwin', 'AC5 applies to Windows and Linux')
  const app = await launchMarkzen()
  const closed = app.waitForEvent('close')
  await app.firstWindow().then((window) => window.getByTestId('window-close').click())
  await closed
})

test('AC6: macOS activation recreates one disposed window', async () => {
  test.skip(process.platform !== 'darwin', 'AC6 applies to macOS')
  const app = await launchMarkzen()
  try {
    const first = await app.firstWindow()
    const firstClosed = first.waitForEvent('close')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]?.close())
    await firstClosed
    const nextWindow = app.waitForEvent('window')
    await app.evaluate(({ app }) => app.emit('activate'))
    await expect((await nextWindow).getByTestId('app-shell')).toBeVisible()
    expect(app.windows()).toHaveLength(1)
  } finally {
    await quitMarkzen(app)
  }
})

test('AC7: macOS uses hiddenInset custom chrome around explicit traffic lights', async () => {
  test.skip(process.platform !== 'darwin', 'AC7 applies to macOS')
  const app = await launchMarkzen()
  try {
    const options = await callMain<{ titleBarStyle: string; trafficLightPosition: { x: number; y: number } }>(app, 'getWindowOptionsForPlatform', ['darwin'])
    expect(options.titleBarStyle).toBe('hiddenInset')
    expect(options.trafficLightPosition.x).toBeGreaterThan(0)
    await expect((await app.firstWindow()).getByTestId('titlebar')).toHaveAttribute('data-platform', 'darwin')
  } finally {
    await quitMarkzen(app)
  }
})

test('AC8: Windows and Linux are frameless with working custom controls', async () => {
  test.skip(process.platform === 'darwin', 'AC8 applies to Windows and Linux')
  const app = await launchMarkzen()
  try {
    const options = await callMain<{ frame: boolean }>(app, 'getWindowOptionsForPlatform', [process.platform])
    expect(options.frame).toBe(false)
    const page = await app.firstWindow()
    await page.getByTestId('window-maximize').click()
    await expect(page.getByTestId('window-maximize')).toHaveAttribute('aria-pressed', 'true')
  } finally {
    await quitMarkzen(app)
  }
})

test('AC9: minimum-size chrome remains non-overlapping at 100% and 200% zoom', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    for (const zoomFactor of [1, 2]) {
      await app.evaluate(({ BrowserWindow }, zoom) => {
        const window = BrowserWindow.getAllWindows()[0]
        window?.setSize(480, 320)
        window?.webContents.setZoomFactor(zoom)
      }, zoomFactor)
      const chrome = await page.getByTestId('titlebar').boundingBox()
      const content = await page.getByTestId('shell-content').boundingBox()
      expect(chrome).not.toBeNull()
      expect(content).not.toBeNull()
      expect(content!.y).toBeGreaterThanOrEqual(chrome!.y + chrome!.height - 1)
    }
  } finally {
    await quitMarkzen(app)
  }
})

test('AC10: only the designated non-interactive titlebar region is draggable', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    await expect(page.getByTestId('titlebar')).toBeVisible()
    const regions = await page.evaluate(() => {
      const drag = getComputedStyle(document.querySelector('[data-testid="window-drag-region"]')!).getPropertyValue('-webkit-app-region')
      const outsideDrag = document.querySelector('[data-testid="window-close"]') ?? document.querySelector('[data-testid="titlebar"]')!
      return {
        drag,
        outsideDrag: getComputedStyle(outsideDrag).getPropertyValue('-webkit-app-region'),
      }
    })
    expect(regions.drag).toBe('drag')
    expect(regions.outsideDrag).not.toBe('drag')
  } finally {
    await quitMarkzen(app)
  }
})

for (const [ac, key, expected] of [
  ['AC14', 'nodeIntegration', false],
  ['AC15', 'contextIsolation', true],
  ['AC16', 'sandbox', true],
  ['AC17', 'webSecurity', true],
  ['AC18', 'webviewTag', false],
] as const) {
  test(`${ac}: effective BrowserWindow security preference ${key} is ${String(expected)}`, async () => {
    const app = await launchMarkzen()
    try {
      const options = await callMain<Record<string, unknown>>(app, 'getWindowOptionsForPlatform', [process.platform])
      expect((options.webPreferences as Record<string, unknown>)[key]).toBe(expected)
      if (ac === 'AC17') expect((options.webPreferences as Record<string, unknown>).allowRunningInsecureContent).toBe(false)
      if (ac === 'AC18') {
        expect((options.webPreferences as Record<string, unknown>).experimentalFeatures).toBe(false)
        expect((options.webPreferences as Record<string, unknown>).navigateOnDragDrop).toBe(false)
      }
    } finally {
      await quitMarkzen(app)
    }
  })
}

test('AC19: the app protocol serves only allowlisted bundled paths', async () => {
  const app = await launchMarkzen()
  try {
    const responses = await app.evaluate(async ({ net }) => {
      const allowed = await net.fetch('markzen://app/')
      const traversal = await net.fetch('markzen://app/%2e%2e/package.json')
      const host = await net.fetch('markzen://other/')
      return { allowed: allowed.status, host: host.status, traversal: traversal.status }
    })
    expect(responses.allowed).toBe(200)
    expect(responses.traversal).toBeGreaterThanOrEqual(400)
    expect(responses.host).toBeGreaterThanOrEqual(400)
  } finally {
    await quitMarkzen(app)
  }
})

test('AC20: packaged renderer responses carry the exact restrictive CSP', async () => {
  const app = await launchMarkzen()
  try {
    const csp = await app.evaluate(async ({ net }) => (await net.fetch('markzen://app/')).headers.get('content-security-policy'))
    expect(csp).toContain("default-src 'none'")
    expect(csp).toContain("script-src 'self'")
    expect(csp).toContain("connect-src 'none'")
    expect(csp).toContain("frame-ancestors 'none'")
    expect(csp).not.toContain('unsafe-inline')
    expect(csp).not.toContain('unsafe-eval')
  } finally {
    await quitMarkzen(app)
  }
})

test('AC21: preload exposes one frozen versioned narrow capability', async () => {
  const app = await launchMarkzen()
  try {
    const surface = await (await app.firstWindow()).evaluate(() => {
      const api = window.markzen
      return {
        frozen: Object.isFrozen(api),
        keys: Object.keys(api ?? {}).sort(),
        version: api?.version,
      }
    })
    expect(surface.version).toBe(1)
    expect(surface.frozen).toBe(true)
    expect(surface.keys).toEqual(['bootstrap', 'document', 'openExternal', 'settings', 'version', 'window', 'workspace'])
  } finally {
    await quitMarkzen(app)
  }
})

test('AC28: top-level navigation away from the application origin is cancelled', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    await page.evaluate(() => { window.location.href = 'https://example.com/' })
    await page.waitForTimeout(200)
    expect(page.url()).toMatch(/^markzen:\/\/app\//)
  } finally {
    await quitMarkzen(app)
  }
})

test('AC29: popups and webview attachment are denied', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    const result = await page.evaluate(() => {
      const popup = window.open('https://example.com/')
      const webview = document.createElement('webview')
      document.body.appendChild(webview)
      return { popup: popup === null, webviewConstructor: webview.constructor.name }
    })
    expect(result.popup).toBe(true)
    expect(result.webviewConstructor).not.toBe('WebViewElement')
    expect(app.windows()).toHaveLength(1)
  } finally {
    await quitMarkzen(app)
  }
})

test('AC30: Chromium permission checks and requests are denied', async () => {
  const app = await launchMarkzen()
  try {
    const state = await (await app.firstWindow()).evaluate(async () => {
      const permission = await navigator.permissions.query({ name: 'geolocation' })
      return permission.state
    })
    expect(state).toBe('denied')
  } finally {
    await quitMarkzen(app)
  }
})

test('AC31: the production artifact has the approved Electron fuse policy', async () => {
  const fuses = await getCurrentFuseWire(await findPackagedExecutable())
  expect(fuses[FuseV1Options.RunAsNode]).toBe(FuseState.DISABLE)
  expect(fuses[FuseV1Options.EnableNodeOptionsEnvironmentVariable]).toBe(FuseState.DISABLE)
  expect(fuses[FuseV1Options.GrantFileProtocolExtraPrivileges]).toBe(FuseState.DISABLE)
  expect(fuses[FuseV1Options.EnableNodeCliInspectArguments]).toBe(FuseState.ENABLE)
  expect(fuses[FuseV1Options.EnableEmbeddedAsarIntegrityValidation]).toBe(FuseState.ENABLE)
  expect(fuses[FuseV1Options.OnlyLoadAppFromAsar]).toBe(FuseState.ENABLE)
})

test('AC32: packaged fixture query parameters are ignored', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    await page.goto('markzen://app/?fixture=basic')
    await expect(page.getByTestId('platform-kind')).toHaveText('electron')
    await expect(page.getByTestId('fixture-name')).toHaveText('production')
  } finally {
    await quitMarkzen(app)
  }
})

test('AC33: missing, malformed, and incompatible preload capabilities fail closed', async () => {
  const app = await launchMarkzen()
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'markzen-preload-'))
  try {
    const preloadCases: Array<{ name: string; preload?: string }> = [{ name: 'missing' }]
    for (const [name, body] of [
      ['malformed', "const {contextBridge}=require('electron');contextBridge.exposeInMainWorld('markzen',{version:'bad'})"],
      ['incompatible', "const {contextBridge}=require('electron');contextBridge.exposeInMainWorld('markzen',{version:2})"],
    ] as const) {
      const file = path.join(temporary, `${name}.cjs`)
      await writeFile(file, body)
      preloadCases.push({ name, preload: file })
    }
    for (const preloadCase of preloadCases) {
      const pagePromise = app.waitForEvent('window')
      await app.evaluate(({ BrowserWindow }, value) => {
        const window = new BrowserWindow({
          show: false,
          webPreferences: {
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            ...(value.preload ? { preload: value.preload } : {}),
          },
        })
        void window.loadURL('markzen://app/')
      }, preloadCase)
      const page = await pagePromise
      await expect(page.getByTestId('fatal-shell-error')).toContainText('Markzen could not establish its secure desktop connection')
      await page.close()
    }
  } finally {
    await rm(temporary, { force: true, recursive: true })
    await quitMarkzen(app)
  }
})

test('AC57: packaged shell exposes the Markzen title', async () => {
  const app = await launchMarkzen()
  try {
    await expect(await app.firstWindow()).toHaveTitle('Markzen')
  } finally {
    await quitMarkzen(app)
  }
})

test('AC58: shell project config uses failure-only diagnostics', async () => {
  const config = await readFile('playwright.config.ts', 'utf8')
  expect(config).toContain("screenshot: 'only-on-failure'")
  expect(config).toContain("trace: 'retain-on-failure'")
})

test('AC59: real main-side Platform.fs bytes round-trip and temporary data is removed', async () => {
  const app = await launchMarkzen()
  const temporary = await mkdtemp(path.join(os.tmpdir(), 'markzen-roundtrip-'))
  try {
    const result = await callMain<{ cleaned: boolean; payload: string }>(app, 'runRealFsRoundTrip', [temporary, 'known-payload'])
    expect(result).toEqual({ cleaned: true, payload: 'known-payload' })
  } finally {
    await rm(temporary, { force: true, recursive: true })
    await quitMarkzen(app)
  }
})
