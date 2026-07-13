import { createElement } from 'react'

import { ShellApp } from './ShellApp'
import { DocumentGateway, ElectronDocumentGateway } from '../documents/gateway'
import {
  MARKZEN_API_VERSION,
  type MarkzenApi,
  type WindowPort,
  asRootId,
} from '../platform/contracts'
import { createMemoryPlatform } from '../platform/memory'
import type { DialogResult } from '../platform/contracts'

type BootResult =
  | { readonly ok: true; readonly element: React.ReactElement }
  | { readonly ok: false; readonly message: string; readonly testId: 'fatal-shell-error' | 'fixture-bootstrap-error' }

type Fixture = {
  readonly directories?: readonly string[]
  readonly dialogs?: readonly ({ readonly kind: 'open' | 'save'; readonly path?: string } | { readonly choice: number; readonly kind: 'confirm' })[]
  readonly externalAfterOpen?: { readonly bytes: string; readonly delay: number; readonly path: string }
  readonly generatedWorkspace?: { readonly entriesPerRoot: number; readonly roots: number }
  readonly files: readonly {
    readonly bytes?: string
    readonly generatedBytes?: number
    readonly generatedPattern?: string
    readonly path: string
    readonly writable?: boolean
  }[]
  readonly workspaceRoots?: readonly string[]
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
  'workspace-basic': {
    directories: ['/notes/nested', '/second'],
    files: [
      { bytes: '# Alpha\n', path: '/notes/alpha.md' },
      { bytes: '# Beta\n', path: '/notes/beta.md' },
      { bytes: '# Nested\n', path: '/notes/nested/deep.markdown' },
      { bytes: 'image', path: '/notes/image.png' },
      { bytes: '# Other\n', path: '/second/other.txt' },
    ],
    workspaceRoots: ['/notes', '/second'],
  },
  'workspace-performance-10k': {
    files: [],
    generatedWorkspace: { entriesPerRoot: 10_000, roots: 1 },
  },
  'workspace-performance-20k': {
    files: [],
    generatedWorkspace: { entriesPerRoot: 1_000, roots: 20 },
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
  for (const directory of fixture.directories ?? []) memory.harness.mkdir(directory)
  const generatedRootPaths: string[] = []
  if (fixture.generatedWorkspace) {
    for (let rootIndex = 0; rootIndex < fixture.generatedWorkspace.roots; rootIndex += 1) {
      const rootPath = `/generated-${rootIndex}`
      generatedRootPaths.push(rootPath)
      memory.harness.mkdir(rootPath)
      for (let entryIndex = 0; entryIndex < fixture.generatedWorkspace.entriesPerRoot; entryIndex += 1) {
        await memory.platform.fs.create(memory.harness.path(`${rootPath}/file-${entryIndex}.md`), new Uint8Array())
      }
    }
  }
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
  const workspaceRoots = await Promise.all([...(fixture.workspaceRoots ?? []), ...generatedRootPaths].map(async (path, index) => {
    const listed = await memory.platform.fs.list(memory.harness.path(path))
    if (!listed.ok) throw new Error(`Could not list fixture root: ${path}`)
    return { entries: listed.value, path: memory.harness.path(path), rootId: asRootId(`fixture-root-${index + 1}`) }
  }))
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
      ...(workspaceRoots.length ? {
        workspace: {
          onList: async (_rootId: import('../platform/contracts').RootId, path: import('../platform/contracts').Path) => {
            const listed = await memory.platform.fs.list(path)
            if (!listed.ok) throw new Error(listed.error.code)
            return listed.value
          },
          onWidthChange: () => undefined,
          roots: workspaceRoots,
          width: 240,
        },
      } : {}),
    }),
    ok: true,
  }
}

async function bootstrapElectron(api: MarkzenApi): Promise<BootResult> {
  if (!isMarkzenApi(api)) return fatalBoot()
  const boot = await api.bootstrap()
  if (!boot.ok) return fatalBoot()
  const tab = boot.value.kind === 'single-file' ? await api.document.createTab() : undefined
  if (tab && !tab.ok) return fatalBoot()
  const windowPort = electronWindowPort(api)
  const roots = boot.value.roots
  const rootPaths = new Map(roots.map((root) => [root.rootId, root.path]))
  let workspaceGeneration = 0
  return {
    element: createElement(ShellApp, {
      environment: browserEnvironment(),
      documentGateway: new ElectronDocumentGateway(api),
      fixtureName: 'production',
      ...(tab?.ok ? { initialDocuments: [{ id: tab.value, title: '' }] } : {}),
      platformKind: 'electron',
      platformName: boot.value.platformName,
      settings: {
        onRetry: () => { void api.settings.retry() },
        onWarning: (listener: (message?: string) => void) => api.settings.onWarning(listener),
        ...(boot.value.settingsWarning ? { warning: boot.value.settingsWarning } : {}),
      },
      windowId: boot.value.windowId,
      windowPort,
      ...(boot.value.kind === 'workspace' ? {
        workspace: {
          onList: async (rootId: import('../platform/contracts').RootId, path: import('../platform/contracts').Path) => {
            const rootPath = rootPaths.get(rootId)
            if (!rootPath) throw new Error('Unknown workspace root')
            workspaceGeneration += 1
            const result = await api.workspace.list(rootId, relativeLogicalPath(rootPath, path), workspaceGeneration)
            if (!result.ok) throw new Error(result.error.code)
            return result.value
          },
          onEvent: (listener: (event: import('../platform/contracts').WorkspaceEventPayload) => void) => api.workspace.onEvent((event) => {
            if (event.kind === 'root-added') rootPaths.set(event.root.rootId, event.root.path)
            listener(event)
          }),
          onSettings: (listener: (snapshot: import('../platform/contracts').SettingsSnapshotPayload) => void) => api.settings.onSnapshot(listener),
          onRetryRoot: async (rootId: import('../platform/contracts').RootId) => {
            workspaceGeneration += 1
            const retried = await api.workspace.retryRoot(rootId, workspaceGeneration)
            return retried.ok && (retried.value.kind === 'added' || retried.value.kind === 'duplicate')
          },
          onWidthChange: (sidebarWidth: number) => { void api.settings.patch({ sidebarWidth }) },
          roots: roots.map((root) => ({ entries: root.entries, path: root.path, rootId: root.rootId })),
          revision: boot.value.settings.revision,
          width: boot.value.settings.sidebarWidth,
        },
      } : {}),
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
    typeof candidate.settings === 'object' &&
    candidate.settings !== null &&
    typeof candidate.settings.onSnapshot === 'function' &&
    typeof candidate.settings.onWarning === 'function' &&
    typeof candidate.settings.patch === 'function' &&
    typeof candidate.settings.retry === 'function' &&
    typeof candidate.window === 'object' &&
    candidate.window !== null &&
    typeof candidate.window.close === 'function' &&
    typeof candidate.window.getState === 'function' &&
    typeof candidate.window.minimize === 'function' &&
    typeof candidate.window.onState === 'function' &&
    typeof candidate.window.toggleMaximize === 'function' &&
    typeof candidate.workspace === 'object' &&
    candidate.workspace !== null &&
    typeof candidate.workspace.addFolder === 'function' &&
    typeof candidate.workspace.list === 'function' &&
    typeof candidate.workspace.onEvent === 'function' &&
    typeof candidate.workspace.open === 'function' &&
    typeof candidate.workspace.retryRoot === 'function'
  )
}

const relativeLogicalPath = (root: string, child: string): string => {
  const normalizedRoot = root.replaceAll('\\', '/').replace(/\/$/, '')
  const normalizedChild = child.replaceAll('\\', '/')
  return normalizedChild === normalizedRoot ? '' : normalizedChild.slice(normalizedRoot.length + 1)
}

export const createFatalElement = (result: Extract<BootResult, { ok: false }>): React.ReactElement => {
  return createElement('main', { 'data-testid': result.testId, role: 'alert' }, result.message)
}
