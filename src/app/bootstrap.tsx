import { createElement } from 'react'

import { ShellApp } from './ShellApp'
import {
  MARKZEN_API_VERSION,
  type MarkzenApi,
  type WindowPort,
} from '../platform/contracts'
import { createMemoryPlatform } from '../platform/memory'

type BootResult =
  | { readonly ok: true; readonly element: React.ReactElement }
  | { readonly ok: false; readonly message: string; readonly testId: 'fatal-shell-error' | 'fixture-bootstrap-error' }

const fixtures = {
  basic: {
    files: [{ bytes: '# Welcome\n', path: '/notes/welcome.md' }],
  },
} as const

export async function bootstrapApplication(): Promise<BootResult> {
  const api = window.markzen
  if (api !== undefined) return bootstrapElectron(api)
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') return fatalBoot()

  const fixtureName = new URLSearchParams(window.location.search).get('fixture') ?? 'basic'
  if (!Object.hasOwn(fixtures, fixtureName)) {
    return { message: `Unknown Markzen fixture: ${fixtureName}`, ok: false, testId: 'fixture-bootstrap-error' }
  }
  const fixture = fixtures[fixtureName as keyof typeof fixtures]
  const memory = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
  memory.harness.mkdir('/notes')
  for (const file of fixture.files) {
    await memory.platform.fs.create(memory.harness.path(file.path), new TextEncoder().encode(file.bytes))
  }
  const windowId = await memory.platform.window.create()
  return {
    element: createElement(ShellApp, {
      environment: browserEnvironment(),
      fileCount: memory.harness.fileCount(),
      fixtureName,
      platformKind: 'memory',
      platformName: 'linux',
      windowId,
      windowPort: memory.platform.window,
    }),
    ok: true,
  }
}

async function bootstrapElectron(api: MarkzenApi): Promise<BootResult> {
  if (!isMarkzenApi(api)) return fatalBoot()
  const boot = await api.bootstrap()
  if (!boot.ok) return fatalBoot()
  const windowPort = electronWindowPort(api)
  return {
    element: createElement(ShellApp, {
      environment: browserEnvironment(),
      fixtureName: 'production',
      platformKind: 'electron',
      platformName: boot.value.platformName,
      windowId: boot.value.windowId,
      windowPort,
    }),
    ok: true,
  }
}

function browserEnvironment(): { forcedColors: boolean; reducedMotion: boolean } {
  return {
    forcedColors: window.matchMedia('(forced-colors: active)').matches,
    reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  }
}

function electronWindowPort(api: MarkzenApi): Pick<WindowPort, 'close' | 'getState' | 'minimize' | 'onState' | 'toggleMaximize'> {
  return {
    close: () => api.window.close(),
    getState: () => api.window.getState(),
    minimize: () => api.window.minimize(),
    onState: (_, listener) => api.window.onState(listener),
    toggleMaximize: () => api.window.toggleMaximize(),
  }
}

function fatalBoot(): BootResult {
  return {
    message: 'Markzen could not establish its secure desktop connection. Restart the application.',
    ok: false,
    testId: 'fatal-shell-error',
  }
}

function isMarkzenApi(value: unknown): value is MarkzenApi {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<MarkzenApi>
  return (
    candidate.version === MARKZEN_API_VERSION &&
    typeof candidate.bootstrap === 'function' &&
    typeof candidate.window === 'object' &&
    candidate.window !== null &&
    typeof candidate.window.close === 'function' &&
    typeof candidate.window.getState === 'function' &&
    typeof candidate.window.minimize === 'function' &&
    typeof candidate.window.onState === 'function' &&
    typeof candidate.window.toggleMaximize === 'function'
  )
}

export const createFatalElement = (result: Extract<BootResult, { ok: false }>): React.ReactElement => {
  return createElement('main', { 'data-testid': result.testId, role: 'alert' }, result.message)
}
