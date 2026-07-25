import axe from 'axe-core'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { ShellApp } from '../../src/app/ShellApp'
import { asRootId, asWindowId, ok, type PlatformResult, type WindowPort, type WindowState } from '../../src/platform/contracts'
import { createMemoryPlatform } from '../../src/platform/memory'
import { FakeDocumentGateway } from './document-gateway.fake'

let root: Root | undefined

afterEach(() => {
  root?.unmount()
  root = undefined
  document.body.innerHTML = '<div id="test-root"></div>'
})

describe('spec 0001 accessible custom chrome', () => {
  test('AC3: a late initial state cannot overwrite a newer window event', async () => {
    const windowId = asWindowId('window-regression')
    let resolveInitial!: (result: PlatformResult<WindowState>) => void
    const initialState = new Promise<PlatformResult<WindowState>>((resolve) => {
      resolveInitial = resolve
    })
    let emitState: ((state: WindowState) => void) | undefined
    const windowPort: Pick<WindowPort, 'close' | 'getState' | 'minimize' | 'onState' | 'toggleMaximize'> = {
      close: async () => ok(undefined),
      getState: async () => initialState,
      minimize: async () => ok(undefined),
      onState: (_owner, listener) => {
        emitState = listener
        return () => { emitState = undefined }
      },
      toggleMaximize: async () => ok(undefined),
    }
    const container = document.getElementById('test-root') ?? document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
    root.render(
      <ShellApp
        documentGateway={new FakeDocumentGateway()}
        environment={{ forcedColors: false, reducedMotion: false }}
        fixtureName="browser-test"
        platformName="linux"
        windowId={windowId}
        windowPort={windowPort}
      />,
    )
    await expect.element(page.getByTestId('app-shell')).toBeVisible()

    emitState?.({ focused: true, status: 'maximized' })
    resolveInitial(ok({ focused: true, status: 'normal' }))

    await expect.element(page.getByTestId('app-shell')).toHaveAttribute('data-window-state-ready', 'true')
    await expect.element(page.getByTestId('app-shell')).toHaveAttribute('data-window-status', 'maximized')
  })

  test('AC11: Enter and Space activate focused custom title-bar controls', async () => {
    const rendered = await renderShell('linux')
    const minimize = byTestId<HTMLButtonElement>('window-minimize')
    minimize.focus()
    await userEvent.keyboard('{Enter}')
    await tick()
    expect(await rendered.platform.window.getState(rendered.windowId)).toMatchObject({
      ok: true,
      value: { status: 'minimized' },
    })

    const maximize = byTestId<HTMLButtonElement>('window-maximize')
    maximize.focus()
    await userEvent.keyboard(' ')
    await tick()
    expect(await rendered.platform.window.getState(rendered.windowId)).toMatchObject({
      ok: true,
      value: { status: 'maximized' },
    })
  })

  test('AC12: custom controls expose stable names, state, and focus styling', async () => {
    await renderShell('linux')
    const maximize = byTestId<HTMLButtonElement>('window-maximize')
    maximize.focus()

    expect(maximize.getAttribute('aria-label')).toBe('Maximize window')
    expect(maximize.getAttribute('aria-pressed')).toBe('false')
    expect(getComputedStyle(maximize).outlineStyle).not.toBe('none')
  })

  test('AC13: reduced motion disables non-essential chrome transitions', async () => {
    await renderShell('linux', { reducedMotion: true })
    const chrome = byTestId<HTMLElement>('titlebar')

    expect(getComputedStyle(chrome).transitionDuration).toBe('0s')
  })

  test('AC64: every interactive shell element has native semantics and state', async () => {
    await renderShell('linux')
    const controls = ['window-minimize', 'window-maximize', 'window-close'].map((id) => byTestId<HTMLButtonElement>(id))

    expect(controls.every((control) => control.tagName === 'BUTTON')).toBe(true)
    expect(controls.every((control) => Boolean(control.getAttribute('aria-label')))).toBe(true)
    expect(controls[1]?.hasAttribute('aria-pressed')).toBe(true)
  })

  test('AC65: keyboard traversal follows a deterministic custom-chrome order', async () => {
    await renderShell('linux')
    const controls = ['window-minimize', 'window-maximize', 'window-close'].map((id) => byTestId<HTMLButtonElement>(id))

    expect(controls.map((control) => control.tabIndex)).toEqual([0, 0, 0])
    controls[0]?.focus()
    expect(document.activeElement).toBe(controls[0])
    controls[1]?.focus()
    expect(document.activeElement).toBe(controls[1])
    controls[2]?.focus()
    expect(document.activeElement).toBe(controls[2])
  })

  test('AC66: platform, zoom, contrast, and motion variants pass the shell audit', async () => {
    for (const platform of ['darwin', 'win32', 'linux'] as const) {
      const rendered = await renderShell(platform, { forcedColors: true, reducedMotion: true })
      document.documentElement.style.zoom = '2'
      const audit = await axe.run(document.body, { resultTypes: ['violations'] })
      expect(audit.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
      if (platform === 'linux') expect(byTestId('titlebar').getAttribute('data-platform')).toBe(platform)
      else expect(document.querySelector('[data-testid="titlebar"]')).toBeNull()
      rendered.unmount()
      document.body.innerHTML = '<div id="test-root"></div>'
    }
  })
})

describe('spec 0007 native chrome', () => {
  test('AC1 AC2 AC3 AC5 AC6 AC9: platform chrome occupies the approved app surface without overlapping controls', async () => {
    const macWorkspace = await renderShell('darwin', {}, true)
    const spacer = byTestId<HTMLElement>('workspace-native-titlebar')
    expect(document.querySelector('[data-testid="titlebar"]')).toBeNull()
    expect(getComputedStyle(spacer).height).toBe('40px')
    expect(getComputedStyle(spacer).borderBottomWidth).toBe('0px')
    expect(getComputedStyle(byTestId('workspace-sidebar')).backgroundColor).not.toBe('rgba(0, 0, 0, 0)')
    macWorkspace.unmount()
    document.body.innerHTML = '<div id="test-root"></div>'

    const macSingle = await renderShell('darwin')
    expect(document.querySelector('[data-testid="titlebar"]')).toBeNull()
    expect(getComputedStyle(byTestId('tab-strip')).paddingLeft).toBe('78px')
    macSingle.unmount()
    document.body.innerHTML = '<div id="test-root"></div>'

    const windows = await renderShell('win32')
    expect(document.querySelector('[data-testid="titlebar"]')).toBeNull()
    expect(document.querySelector('[data-testid="window-controls"]')).toBeNull()
    expect(byTestId('app-shell').getAttribute('data-platform')).toBe('win32')
    expect(getComputedStyle(byTestId('tab-strip')).minHeight).toBe('40px')
    windows.unmount()
    document.body.innerHTML = '<div id="test-root"></div>'

    await renderShell('linux')
    expect(byTestId('titlebar')).not.toBeNull()
    expect(byTestId('window-controls')).not.toBeNull()
    document.documentElement.style.zoom = '2'
    const tab = byTestId('document-tab').getBoundingClientRect()
    const controls = byTestId('window-controls').getBoundingClientRect()
    expect(tab.bottom).toBeGreaterThan(controls.bottom - 1)
  })
})

async function renderShell(
  platformName: 'darwin' | 'win32' | 'linux',
  environment: { forcedColors?: boolean; reducedMotion?: boolean } = {},
  workspace = false,
) {
  const memory = createMemoryPlatform({ platform: platformName === 'win32' ? 'win32' : 'posix', caseSensitive: platformName !== 'win32' })
  const workspacePath = platformName === 'win32' ? 'C:\\notes' : '/notes'
  if (workspace) memory.harness.mkdir(workspacePath)
  const windowId = await memory.platform.window.create()
  const container = document.getElementById('test-root') ?? document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  root.render(
    <ShellApp
      documentGateway={new FakeDocumentGateway()}
      environment={{ forcedColors: environment.forcedColors ?? false, reducedMotion: environment.reducedMotion ?? false }}
      fixtureName="browser-test"
      platformName={platformName}
      windowId={windowId}
      windowPort={memory.platform.window}
      {...(workspace ? {
        workspace: {
          onList: async () => [],
          onWidthChange: () => undefined,
          roots: [{ entries: [], path: memory.harness.path(workspacePath), rootId: asRootId('root') }],
          width: 240,
        },
      } : {})}
    />,
  )
  await expect.element(page.getByTestId('app-shell')).toBeVisible()
  return { ...memory, windowId, unmount: () => root?.unmount() }
}

function byTestId<T extends Element = HTMLElement>(testId: string): T {
  const element = document.querySelector(`[data-testid="${testId}"]`)
  if (!element) throw new Error(`Missing data-testid=${testId}`)
  return element as T
}

async function tick(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}
