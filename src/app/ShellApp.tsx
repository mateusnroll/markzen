import { useCallback, useEffect, useState } from 'react'

import type { PlatformName, WindowId, WindowPort, WindowState } from '../platform/contracts'
import type { DocumentGatewayPort } from '../documents/gateway'
import type { DocumentSeed } from './DocumentWorkspace'
import { DocumentWorkspace } from './DocumentWorkspace'

import './shell.css'

export type ShellAppProps = {
  readonly documentGateway: DocumentGatewayPort
  readonly initialDocuments?: readonly DocumentSeed[]
  readonly environment: { readonly forcedColors: boolean; readonly reducedMotion: boolean }
  readonly fileCount?: number
  readonly fixtureName: string
  readonly platformKind?: 'electron' | 'memory'
  readonly platformName: PlatformName
  readonly windowId: WindowId
  readonly windowPort: Pick<WindowPort, 'close' | 'getState' | 'minimize' | 'onState' | 'toggleMaximize'>
}

export function ShellApp({
  documentGateway,
  initialDocuments,
  environment,
  fileCount = 0,
  fixtureName,
  platformKind = 'memory',
  platformName,
  windowId,
  windowPort,
}: ShellAppProps) {
  const [state, setState] = useState<WindowState>({ focused: true, status: 'normal' })
  const [windowStateReady, setWindowStateReady] = useState(false)
  const [closeRequest, setCloseRequest] = useState(0)

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

  return (
    <main
      className="app-shell"
      data-forced-colors={String(environment.forcedColors)}
      data-reduced-motion={String(environment.reducedMotion)}
      data-testid="app-shell"
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
        />
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
    </main>
  )
}
