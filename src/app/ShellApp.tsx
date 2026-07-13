import { useCallback, useEffect, useRef, useState } from 'react'

import type {
  DirectoryEntry,
  EffectiveTheme,
  ExternalOpenResult,
  Path,
  PlatformName,
  PlatformResult,
  RootId,
  SettingsPatch,
  SettingsSnapshotPayload,
  WindowId,
  WindowPort,
  WindowState,
  WorkspaceEventPayload,
} from '../platform/contracts'
import type { DocumentGatewayPort } from '../documents/gateway'
import { shouldApplySettings } from '../settings/settings'
import type { DocumentSeed } from './DocumentWorkspace'
import { DocumentWorkspace } from './DocumentWorkspace'
import { OverlayProvider } from './overlays'
import { SettingsDialog } from './SettingsDialog'

import './shell.css'

export type ShellAppProps = {
  readonly documentGateway: DocumentGatewayPort
  readonly initialDocuments?: readonly DocumentSeed[]
  readonly environment: { readonly forcedColors: boolean; readonly reducedMotion: boolean }
  readonly fileCount?: number
  readonly fixtureName: string
  readonly platformKind?: 'electron' | 'memory'
  readonly platformName: PlatformName
  readonly onOpenExternal?: (destination: string) => Promise<ExternalOpenResult>
  readonly settings?: {
    readonly appearance: EffectiveTheme
    readonly onAppearance: (listener: (appearance: EffectiveTheme) => void) => () => void
    readonly onPatch: (patch: SettingsPatch) => Promise<PlatformResult<SettingsSnapshotPayload>>
    readonly onRetry: () => void
    readonly onSnapshot: (listener: (snapshot: SettingsSnapshotPayload) => void) => () => void
    readonly onWarning: (listener: (message?: string) => void) => () => void
    readonly snapshot: SettingsSnapshotPayload
    readonly warning?: string
  }
  readonly windowId: WindowId
  readonly windowPort: Pick<WindowPort, 'close' | 'getState' | 'minimize' | 'onState' | 'toggleMaximize'>
  readonly workspace?: {
    readonly onList: (rootId: RootId, path: Path) => Promise<readonly DirectoryEntry[]>
    readonly onEvent?: (listener: (event: WorkspaceEventPayload) => void) => () => void
    readonly onRetryRoot?: (rootId: RootId) => Promise<boolean>
    readonly onWidthChange: (width: number) => void
    readonly roots: import('./WorkspaceSidebar').WorkspaceRootSeed[]
    readonly width: number
  }
}

export function ShellApp({
  documentGateway,
  initialDocuments,
  environment,
  fileCount = 0,
  fixtureName,
  platformKind = 'memory',
  platformName,
  onOpenExternal,
  settings,
  windowId,
  windowPort,
  workspace,
}: ShellAppProps) {
  const [state, setState] = useState<WindowState>({ focused: true, status: 'normal' })
  const [windowStateReady, setWindowStateReady] = useState(false)
  const [closeRequest, setCloseRequest] = useState(0)
  const [workspaceRoots, setWorkspaceRoots] = useState(() => workspace?.roots ?? [])
  const [sidebarWidth, setSidebarWidth] = useState(workspace?.width ?? 240)
  const [settingsWarning, setSettingsWarning] = useState(settings?.warning)
  const [settingsSnapshot, setSettingsSnapshot] = useState<SettingsSnapshotPayload>(settings?.snapshot ?? {
    revision: 0,
    schemaVersion: 1,
    sidebarWidth: workspace?.width ?? 240,
    theme: 'system',
    toolbarMode: 'minimal',
  })
  const [appearance, setAppearance] = useState<EffectiveTheme>(settings?.appearance ?? 'light')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsOrigin = useRef<HTMLElement | undefined>(undefined)
  const [workspaceIssue, setWorkspaceIssue] = useState<{ readonly message: string; readonly rootId: RootId }>()
  const [workspaceInvalidation, setWorkspaceInvalidation] = useState<{ readonly generation: number; readonly path: Path; readonly rootId: RootId }>()
  const appliedSettingsRevision = useRef(settings?.snapshot.revision ?? 0)

  useEffect(() => settings?.onSnapshot((snapshot) => {
    if (!shouldApplySettings(snapshot, appliedSettingsRevision.current)) return
    appliedSettingsRevision.current = snapshot.revision
    setSettingsSnapshot(snapshot)
    setSidebarWidth(snapshot.sidebarWidth)
  }), [settings])
  useEffect(() => settings?.onAppearance(setAppearance), [settings])
  useEffect(() => workspace?.onEvent?.((event) => {
    if (event.kind === 'root-added') {
      setWorkspaceRoots((current) => current.some((root) => root.rootId === event.root.rootId)
        ? current
        : [...current, event.root])
      return
    }
    if (event.kind === 'root-error' || event.kind === 'watch-warning') {
      setWorkspaceIssue({
        message: event.kind === 'root-error' ? 'A workspace root is unavailable.' : 'Live folder updates are unavailable. Manual browsing still works.',
        rootId: event.rootId,
      })
      return
    }
    if (event.kind !== 'invalidated' && event.kind !== 'root-recovered') return
    const root = workspaceRoots.find((candidate) => candidate.rootId === event.rootId)
    if (!root) return
    const invalidatedPath = event.relativePath
      ? `${String(root.path).replace(/[\\/]$/, '')}/${event.relativePath}` as Path
      : root.path
    setWorkspaceInvalidation({ generation: event.generation, path: invalidatedPath, rootId: root.rootId })
    if (event.relativePath) return
    void workspace.onList(root.rootId, root.path).then((entries) => {
      setWorkspaceRoots((current) => current.map((candidate) => candidate.rootId === root.rootId ? { ...candidate, entries } : candidate))
    })
  }), [workspace, workspaceRoots])
  useEffect(() => settings?.onWarning(setSettingsWarning), [settings])

  const openSettings = useCallback(() => {
    if (!settingsOpen) settingsOrigin.current = document.activeElement instanceof HTMLElement ? document.activeElement : undefined
    setSettingsOpen(true)
    requestAnimationFrame(() => document.querySelector<HTMLElement>('[data-testid="settings-dialog"] select')?.focus())
  }, [settingsOpen])

  const closeSettings = useCallback(() => {
    setSettingsOpen(false)
    requestAnimationFrame(() => { if (settingsOrigin.current?.isConnected) settingsOrigin.current.focus() })
  }, [])

  const patchSettings = useCallback(async (patch: SettingsPatch): Promise<PlatformResult<SettingsSnapshotPayload>> => {
    if (!settings) return { error: { code: 'unavailable' }, ok: false }
    const result = await settings.onPatch(patch)
    if (result.ok && shouldApplySettings(result.value, appliedSettingsRevision.current)) {
      appliedSettingsRevision.current = result.value.revision
      setSettingsSnapshot(result.value)
      setSidebarWidth(result.value.sidebarWidth)
    }
    return result
  }, [settings])

  useEffect(() => {
    let mounted = true
    let eventReceived = false
    const dispose = windowPort.onState(windowId, (nextState) => {
      eventReceived = true
      setState(nextState)
    })
    void windowPort.getState(windowId).then((result) => {
      if (!mounted) return
      if (result.ok && !eventReceived) setState(result.value)
      setWindowStateReady(true)
    })
    return () => {
      mounted = false
      dispose()
    }
  }, [windowId, windowPort])

  const run = useCallback((operation: () => Promise<unknown>) => {
    void operation()
  }, [])

  const windowControls = platformName === 'darwin' ? null : (
    <div className="window-controls" data-testid="window-controls">
      <button
        aria-label="Minimize window"
        className="window-control"
        data-testid="window-minimize"
        onClick={() => run(() => windowPort.minimize(windowId))}
        type="button"
      >
        <span aria-hidden="true">—</span>
      </button>
      <button
        aria-label={state.status === 'maximized' ? 'Restore window' : 'Maximize window'}
        aria-pressed={state.status === 'maximized'}
        className="window-control"
        data-testid="window-maximize"
        onClick={() => run(() => windowPort.toggleMaximize(windowId))}
        type="button"
      >
        <span aria-hidden="true">{state.status === 'maximized' ? '❐' : '□'}</span>
      </button>
      <button
        aria-label="Close window"
        className="window-control window-close"
        data-testid="window-close"
        onClick={() => setCloseRequest((value) => value + 1)}
        type="button"
      >
        <span aria-hidden="true">×</span>
      </button>
    </div>
  )

  const effectiveTheme = settingsSnapshot.theme === 'system' ? appearance : settingsSnapshot.theme

  return (
    <OverlayProvider>
    <main
      className="app-shell"
      data-forced-colors={String(environment.forcedColors)}
      data-reduced-motion={String(environment.reducedMotion)}
      data-testid="app-shell"
      data-theme={effectiveTheme}
      data-window-state-ready={String(windowStateReady)}
      data-window-status={state.status}
    >
      <header className="titlebar" data-platform={platformName} data-testid="titlebar">
        <div className="window-drag-region" data-testid="window-drag-region">
          <span className="app-name">Markzen</span>
        </div>
        {windowControls}
      </header>
      <section aria-label="Document workspace" className="shell-content" data-testid="shell-content">
        <DocumentWorkspace
          closeRequest={closeRequest}
          gateway={documentGateway}
          {...(initialDocuments ? { initialTabs: initialDocuments } : {})}
          onCloseWindow={() => run(() => windowPort.close(windowId))}
          {...(onOpenExternal ? { onOpenExternal } : {})}
          onSettingsRequest={openSettings}
          toolbarMode={settingsSnapshot.toolbarMode}
          {...(workspace ? { workspace: {
            ...environment,
            ...(workspaceInvalidation ? { invalidation: workspaceInvalidation } : {}),
            onList: workspace.onList,
            onWidthChange: (width: number) => {
              setSidebarWidth(width)
              workspace.onWidthChange(width)
            },
            roots: workspaceRoots,
            width: sidebarWidth,
          } } : {})}
        />
        {settingsWarning ? (
          <aside className="settings-warning" data-testid="settings-warning" role="status">
            <span>{settingsWarning}</span>
            <button data-testid="settings-retry" onClick={settings?.onRetry} type="button">Retry</button>
          </aside>
        ) : null}
        {workspaceIssue ? (
          <aside className="settings-warning" data-testid="workspace-warning" role="status">
            <span>{workspaceIssue.message}</span>
            <button
              data-testid="workspace-root-retry"
              onClick={() => { void workspace?.onRetryRoot?.(workspaceIssue.rootId).then((success) => {
                if (success) setWorkspaceIssue(undefined)
              }) }}
              type="button"
            >Retry</button>
          </aside>
        ) : null}
        <dl className="shell-diagnostics" aria-label="Runtime diagnostics">
          <dt>Platform</dt>
          <dd data-testid="platform-kind">{platformKind}</dd>
          <dt>Fixture</dt>
          <dd data-testid="fixture-name">{fixtureName}</dd>
          <dt>Files</dt>
          <dd data-testid="fixture-file-count">{fileCount}</dd>
          <dt>Window</dt>
          <dd data-testid="window-id">{windowId}</dd>
        </dl>
      </section>
      {settingsOpen && settings ? (
        <SettingsDialog onClose={closeSettings} onPatch={patchSettings} snapshot={settingsSnapshot} />
      ) : null}
    </main>
    </OverlayProvider>
  )
}
