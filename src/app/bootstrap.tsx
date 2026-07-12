import { createElement } from 'react'

import { ShellApp } from './ShellApp'
import { DocumentGateway, ElectronDocumentGateway } from '../documents/gateway'
import {
  MARKZEN_API_VERSION,
  type MarkzenApi,
  type WindowPort,
} from '../platform/contracts'
import { createMemoryPlatform } from '../platform/memory'
import type { DialogResult } from '../platform/contracts'

type BootResult =
  | { readonly ok: true; readonly element: React.ReactElement }
  | { readonly ok: false; readonly message: string; readonly testId: 'fatal-shell-error' | 'fixture-bootstrap-error' }

type Fixture = {
  readonly dialogs?: readonly ({ readonly kind: 'open' | 'save'; readonly path?: string } | { readonly choice: number; readonly kind: 'confirm' })[]
  readonly externalAfterOpen?: { readonly bytes: string; readonly delay: number; readonly path: string }
  readonly files: readonly {
    readonly bytes?: string
    readonly generatedBytes?: number
    readonly generatedPattern?: string
    readonly path: string
    readonly writable?: boolean
  }[]
}

const fixtures: Readonly<Record<string, Fixture>> = {
  basic: {
    files: [{ bytes: '# Welcome\n', path: '/notes/welcome.md' }],
  },
  'lifecycle-open': {
    dialogs: [{ kind: 'open', path: '/notes/Olá world.md' }],
    files: [{ bytes: '# Welcome\n', path: '/notes/Olá world.md' }],
  },
  'lifecycle-open-cancel': {
    dialogs: [{ kind: 'open' }],
    files: [],
  },
  'lifecycle-close': {
    dialogs: [{ choice: 2, kind: 'confirm' }, { choice: 1, kind: 'confirm' }],
    files: [],
  },
  'lifecycle-window-discard': {
    dialogs: [{ choice: 1, kind: 'confirm' }],
    files: [],
  },
  'lifecycle-window-cancel': {
    dialogs: [{ choice: 2, kind: 'confirm' }],
    files: [],
  },
  'lifecycle-window-save-all': {
    dialogs: [
      { choice: 0, kind: 'confirm' },
      { kind: 'save', path: '/notes/first.md' },
      { kind: 'save', path: '/notes/second.md' },
    ],
    files: [],
  },
  'lifecycle-window-save-stop': {
    dialogs: [
      { choice: 0, kind: 'confirm' },
      { kind: 'save', path: '/notes/first.md' },
      { kind: 'save' },
    ],
    files: [],
  },
  'lifecycle-save-as': {
    dialogs: [{ kind: 'save', path: '/notes/New note.md' }],
    files: [],
  },
  'lifecycle-rename': {
    dialogs: [{ kind: 'open', path: '/notes/Original.markdown' }],
    files: [{ bytes: 'Original bytes', path: '/notes/Original.markdown' }],
  },
  'lifecycle-save-error': {
    dialogs: [{ kind: 'open', path: '/notes/read-only.md' }],
    files: [{ bytes: 'Original\n', path: '/notes/read-only.md', writable: false }],
  },
  'performance-10mb': {
    dialogs: [{ kind: 'open', path: '/notes/large.md' }],
    files: [{ generatedBytes: 10 * 1024 * 1024, generatedPattern: 'word ', path: '/notes/large.md' }],
  },
  'lifecycle-external-clean': {
    dialogs: [{ kind: 'open', path: '/notes/watched.md' }],
    externalAfterOpen: { bytes: '# External clean\n', delay: 100, path: '/notes/watched.md' },
    files: [{ bytes: '# Initial\n', path: '/notes/watched.md' }],
  },
  'lifecycle-external-dirty': {
    dialogs: [
      { kind: 'open', path: '/notes/watched.md' },
      { kind: 'save', path: '/notes/editor-copy.md' },
      { kind: 'open', path: '/notes/watched.md' },
    ],
    externalAfterOpen: { bytes: '# External dirty\n', delay: 300, path: '/notes/watched.md' },
    files: [{ bytes: '# Initial\n', path: '/notes/watched.md' }],
  },
}

export async function bootstrapApplication(): Promise<BootResult> {
  const api = window.markzen
  if (api !== undefined) return bootstrapElectron(api)
  if (!import.meta.env.DEV && import.meta.env.MODE !== 'test') return fatalBoot()

  const fixtureName = new URLSearchParams(window.location.search).get('fixture') ?? 'basic'
  const fixture = fixtures[fixtureName]
  if (!fixture) {
    return { message: `Unknown Markzen fixture: ${fixtureName}`, ok: false, testId: 'fixture-bootstrap-error' }
  }
  const memory = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
  memory.harness.mkdir('/notes')
  for (const file of fixture.files) {
    const pattern = file.generatedPattern ?? 'line\n'
    const content = file.bytes ?? pattern.repeat(Math.ceil((file.generatedBytes ?? 0) / pattern.length)).slice(0, file.generatedBytes)
    await memory.platform.fs.create(memory.harness.path(file.path), new TextEncoder().encode(content))
    if (file.writable === false) memory.harness.setAccess(file.path, { writable: false })
  }
  if (fixture.dialogs) {
    memory.harness.queueDialog(...fixture.dialogs.map((result): DialogResult => {
      if (result.kind === 'confirm') return result
      return result.path ? { kind: result.kind, path: memory.harness.path(result.path) } : { kind: result.kind }
    }))
  }
  const windowId = await memory.platform.window.create()
  const gateway = fixture.externalAfterOpen
    ? new class extends DocumentGateway {
      override async open(id?: string) {
        const outcome = await super.open(id)
        if (outcome.kind === 'opened') {
          const external = fixture.externalAfterOpen!
          setTimeout(() => { void memory.harness.externalWrite(external.path, new TextEncoder().encode(external.bytes)) }, external.delay)
        }
        return outcome
      }
    }(memory.platform)
    : new DocumentGateway(memory.platform)
  return {
    element: createElement(ShellApp, {
      environment: browserEnvironment(),
      documentGateway: gateway,
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
  const tab = await api.document.createTab()
  if (!tab.ok) return fatalBoot()
  const windowPort = electronWindowPort(api)
  return {
    element: createElement(ShellApp, {
      environment: browserEnvironment(),
      documentGateway: new ElectronDocumentGateway(api),
      fixtureName: 'production',
      initialDocuments: [{ id: tab.value, title: '' }],
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
    typeof candidate.document === 'object' &&
    candidate.document !== null &&
    typeof candidate.document.close === 'function' &&
    typeof candidate.document.confirmClose === 'function' &&
    typeof candidate.document.confirmWindowClose === 'function' &&
    typeof candidate.document.completeQuitSaveAll === 'function' &&
    typeof candidate.document.acceptExternal === 'function' &&
    typeof candidate.document.createTab === 'function' &&
    typeof candidate.document.open === 'function' &&
    typeof candidate.document.onCommand === 'function' &&
    typeof candidate.document.onExternalChange === 'function' &&
    typeof candidate.document.overwriteExternal === 'function' &&
    typeof candidate.document.retryCleanup === 'function' &&
    typeof candidate.document.save === 'function' &&
    typeof candidate.document.saveAndRename === 'function' &&
    typeof candidate.document.saveAs === 'function' &&
    typeof candidate.document.updateMenuState === 'function' &&
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
