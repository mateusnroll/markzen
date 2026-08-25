import { useEffect, useLayoutEffect, useRef, useState, type ChangeEvent, type CompositionEvent, type KeyboardEvent } from 'react'

import type { FinderQueryOutcome, FinderResultPayload, FinderStatusPayload, TabId } from '../platform/contracts'
import { useOverlaySurface } from './overlays'

type Activation = { readonly ok: true } | { readonly message?: string; readonly ok: false }

export function FileFinderDialog({
  onActivate,
  onClose,
  onQuery,
  rootLabels,
  status,
}: {
  readonly onActivate: (entry: FinderResultPayload, pinned: boolean) => Promise<Activation>
  readonly onClose: () => void
  readonly onQuery: (query: string) => Promise<FinderQueryOutcome>
  readonly rootLabels?: ReadonlyMap<import('../platform/contracts').RootId, string>
  readonly status: FinderStatusPayload
}) {
  const origin = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : undefined)
  const input = useRef<HTMLInputElement>(null)
  const composing = useRef(false)
  const request = useRef(0)
  const queryValue = useRef('')
  const restoreOrigin = useRef(true)
  const [outcome, setOutcome] = useState<FinderQueryOutcome>({ ...status, results: [], total: 0 })
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState<string>()
  const [completedQuery, setCompletedQuery] = useState('')
  useOverlaySurface('file-finder', true, true, close)

  useLayoutEffect(() => { input.current?.focus() }, [])
  useEffect(() => () => {
    if (restoreOrigin.current) requestAnimationFrame(() => origin.current?.isConnected && origin.current.focus())
  }, [])
  useEffect(() => {
    setOutcome((current) => ({ ...current, ...status }))
    if (queryValue.current.trim()) void query(queryValue.current)
  }, [status.generation, status.kind])

  function close(): void { if (origin.current?.isConnected) origin.current.focus(); onClose() }
  async function query(value: string): Promise<void> {
    queryValue.current = value
    const token = ++request.current
    const next = await onQuery(value)
    if (token !== request.current) return
    setOutcome(next)
    setCompletedQuery(value)
    setSelected(0)
    setError(undefined)
  }
  function change(event: ChangeEvent<HTMLInputElement>): void {
    queryValue.current = event.currentTarget.value
    if (!composing.current) void query(event.currentTarget.value)
  }
  function compositionEnd(event: CompositionEvent<HTMLInputElement>): void {
    composing.current = false
    void query(event.currentTarget.value)
  }
  async function activate(pinned: boolean): Promise<void> {
    const entry = outcome.results[selected]
    if (!entry) return
    const result = await onActivate(entry, pinned)
    if (result.ok) { restoreOrigin.current = false; onClose() }
    else if (result.message) setError(result.message)
  }
  function keyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.nativeEvent.isComposing) return
    if (event.key === 'Escape') { event.preventDefault(); close(); return }
    const last = Math.max(0, outcome.results.length - 1)
    let next: number | undefined
    if (event.key === 'ArrowDown') next = selected >= last ? 0 : selected + 1
    else if (event.key === 'ArrowUp') next = selected <= 0 ? last : selected - 1
    else if (event.key === 'Home') next = 0
    else if (event.key === 'End') next = last
    else if (event.key === 'Enter') { event.preventDefault(); void activate(event.ctrlKey || event.metaKey); return }
    if (next === undefined) return
    event.preventDefault()
    setSelected(next)
  }

  const statusText = outcome.kind === 'indexing'
    ? 'Indexing files…'
    : `${outcome.indexedCount?.toLocaleString() ?? outcome.total.toLocaleString()} files indexed${outcome.total > outcome.results.length ? ` · ${outcome.total.toLocaleString()} matches, showing ${outcome.results.length}` : ''}${outcome.kind === 'stale' ? ' · updating…' : ''}${outcome.incompleteRootIds?.length ? ` · ${outcome.incompleteRootIds.length} root incomplete` : ''} · Type a filename or path.`
  return (
    <div aria-label="Go to File" aria-modal="true" className="quick-open" data-testid="file-finder-dialog" onKeyDown={trapTab} role="dialog">
      <input
        aria-activedescendant={outcome.results[selected] ? `file-finder-option-${selected}` : undefined}
        aria-controls="file-finder-results"
        aria-label="Search workspace files"
        data-testid="file-finder-input"
        onChange={change}
        onCompositionEnd={compositionEnd}
        onCompositionStart={() => { composing.current = true }}
        onKeyDown={keyDown}
        placeholder="Go to file…"
        ref={input}
        role="searchbox"
      />
      <div aria-label="Matching files" id="file-finder-results" role="listbox">
        {outcome.results.map((entry, index) => (
          <button
            aria-selected={index === selected}
            aria-posinset={index + 1}
            aria-setsize={outcome.total}
            data-testid="file-finder-result"
            id={`file-finder-option-${index}`}
            key={`${entry.rootId}:${entry.relativePath}`}
            onClick={() => { setSelected(index); void activate(false) }}
            onMouseEnter={() => setSelected(index)}
            role="option"
            type="button"
          >
            <span>{entry.name}</span><small>{`${rootLabels?.get(entry.rootId) ?? String(entry.rootId)}${entry.parentPath ? `/${entry.parentPath}` : ''}`}</small>
          </button>
        ))}
      </div>
      <p aria-live="polite" data-query={completedQuery} data-testid="file-finder-status">{statusText}</p>
      {error ? <p role="alert">{error}</p> : null}
      <div className="quick-open-actions">
        <button data-testid="file-finder-keep-open" disabled={!outcome.results[selected]} onClick={() => { void activate(true) }} type="button">Keep Open</button>
        <button data-testid="file-finder-close" onClick={close} type="button">Close</button>
      </div>
    </div>
  )
}

export type TabSwitcherEntry = {
  readonly dirty: boolean
  readonly id: TabId
  readonly label: string
  readonly preview: boolean
  readonly secondaryPath?: string
}

export function TabSwitcherDialog({ advanceRequest = 0, onActivate, onClose, releaseToActivate = false, tabs }: {
  readonly advanceRequest?: number
  readonly onActivate: (id: TabId) => boolean | string
  readonly onClose: () => void
  readonly releaseToActivate?: boolean
  readonly tabs: readonly TabSwitcherEntry[]
}) {
  const origin = useRef(document.activeElement instanceof HTMLElement ? document.activeElement : undefined)
  const listbox = useRef<HTMLDivElement>(null)
  const handledAdvance = useRef(advanceRequest)
  const [selected, setSelected] = useState(0)
  const [error, setError] = useState<string>()
  useOverlaySurface('tab-switcher', true, true, onClose)
  const commit = () => {
    const tab = tabs[selected]
    if (!tab) return
    const result = onActivate(tab.id)
    if (result === true) onClose()
    else setError(typeof result === 'string' ? result : 'This tab cannot be activated until the current edit is complete.')
  }
  const commitRef = useRef(commit)
  commitRef.current = commit
  useEffect(() => { listbox.current?.focus() }, [])
  useEffect(() => {
    if (handledAdvance.current === advanceRequest) return
    handledAdvance.current = advanceRequest
    setSelected((current) => current >= tabs.length - 1 ? 0 : current + 1)
  }, [advanceRequest, tabs.length])
  useEffect(() => {
    if (!releaseToActivate) return
    const release = (event: globalThis.KeyboardEvent) => { if (event.key === 'Control') commitRef.current() }
    window.addEventListener('keyup', release, true)
    return () => window.removeEventListener('keyup', release, true)
  })
  useEffect(() => () => { requestAnimationFrame(() => origin.current?.isConnected && origin.current.focus()) }, [])
  function keyDown(event: KeyboardEvent<HTMLDivElement>): void {
    const last = Math.max(0, tabs.length - 1)
    if (event.key === 'ArrowDown' || (event.ctrlKey && event.key === 'Tab' && !event.shiftKey)) setSelected(selected >= last ? 0 : selected + 1)
    else if (event.key === 'ArrowUp' || (event.ctrlKey && event.key === 'Tab' && event.shiftKey)) setSelected(selected <= 0 ? last : selected - 1)
    else if (event.key === 'Home') setSelected(0)
    else if (event.key === 'End') setSelected(last)
    else if (event.key === 'Enter') commit()
    else return
    event.preventDefault()
  }
  return (
    <div aria-label="Switch Tab" aria-modal="true" className="quick-open" onKeyDown={(event) => { keyDown(event); trapTab(event) }} role="dialog">
      <div aria-activedescendant={tabs[selected] ? `tab-switcher-option-${selected}` : undefined} aria-label="Open tabs" ref={listbox} role="listbox" tabIndex={0}>
        {tabs.map((tab, index) => (
          <button aria-posinset={index + 1} aria-selected={index === selected} aria-setsize={tabs.length} data-testid="tab-switcher-result" id={`tab-switcher-option-${index}`} key={tab.id} onClick={() => { setSelected(index); const result = onActivate(tab.id); if (result === true) onClose(); else setError(typeof result === 'string' ? result : 'This tab cannot be activated until the current edit is complete.') }} onMouseEnter={() => setSelected(index)} role="option" type="button">
            <span>{tab.label}{tab.dirty ? ' (unsaved changes)' : ''}</span><small>{[tab.secondaryPath, tab.preview ? 'Preview' : undefined].filter(Boolean).join(' · ')}</small>
          </button>
        ))}
      </div>
      {error ? <p role="alert">{error}</p> : null}
      <div className="quick-open-actions">
        <button data-testid="tab-switcher-activate" disabled={!tabs[selected]} onClick={commit} type="button">Switch</button>
        <button data-testid="tab-switcher-close" onClick={onClose} type="button">Close</button>
      </div>
    </div>
  )
}

function trapTab(event: KeyboardEvent<HTMLElement>): void {
  if (event.key !== 'Tab') return
  const controls = [...event.currentTarget.querySelectorAll<HTMLElement>('input:not([disabled]), button:not([disabled]), [tabindex="0"]')]
  const first = controls[0]
  const last = controls.at(-1)
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
