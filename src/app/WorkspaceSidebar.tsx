import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react'

import type { DirectoryEntry, FileKey, Path, RootId } from '../platform/contracts'
import {
  directoryActivationDecision,
  disambiguateRootLabels,
  filterAndSortEntries,
  isDirectoryGenerationCurrent,
  watcherRefreshDecision,
} from '../workspaces/state'

import './workspace.css'

export type WorkspaceRootSeed = {
  readonly entries: readonly DirectoryEntry[]
  readonly path: Path
  readonly rootId: RootId
}

export type WorkspaceSidebarProps = {
  readonly activeFileKey?: FileKey
  readonly forcedColors: boolean
  readonly invalidation?: { readonly generation: number; readonly path: Path; readonly rootId: RootId }
  readonly onList: (rootId: RootId, path: Path) => Promise<readonly DirectoryEntry[]>
  readonly onOpen: (entry: DirectoryEntry, pinned: boolean, rootId: RootId) => void
  readonly onWidthChange: (width: number) => void
  readonly reducedMotion: boolean
  readonly roots: readonly WorkspaceRootSeed[]
  readonly width: number
}

type DirectoryState = {
  readonly children?: readonly DirectoryEntry[]
  readonly error?: string
  readonly expanded: boolean
  readonly generation: number
  readonly loading: boolean
}

type VisibleRow = {
  readonly depth: number
  readonly entry: DirectoryEntry
  readonly parentPath?: Path
  readonly rootId: RootId
}

const MAX_RENDERED_ROWS = 280

export function WorkspaceSidebar({
  activeFileKey,
  forcedColors,
  invalidation,
  onList,
  onOpen,
  onWidthChange,
  reducedMotion,
  roots,
  width,
}: WorkspaceSidebarProps) {
  const [expandedRoots, setExpandedRoots] = useState<ReadonlySet<RootId>>(() => new Set(roots.map((root) => root.rootId)))
  const [directories, setDirectories] = useState<ReadonlyMap<Path, DirectoryState>>(() => new Map())
  const [focusedPath, setFocusedPath] = useState<Path | undefined>(() => roots[0]?.entries[0]?.path)
  const [renderStart, setRenderStart] = useState(0)
  const [preferredWidth, setPreferredWidth] = useState(() => clampStored(width))
  const [viewportWidth, setViewportWidth] = useState(() => window.innerWidth)
  const [announcement, setAnnouncement] = useState('')
  const clickTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const pendingWidth = useRef<number | undefined>(undefined)
  const widthFrame = useRef<number | undefined>(undefined)
  const labels = useMemo(() => disambiguateRootLabels(roots.map((root) => String(root.path))), [roots])

  useEffect(() => setPreferredWidth(clampStored(width)), [width])
  useEffect(() => {
    const resize = () => setViewportWidth(window.innerWidth)
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [])
  useEffect(() => () => {
    if (clickTimer.current) clearTimeout(clickTimer.current)
    if (widthFrame.current) cancelAnimationFrame(widthFrame.current)
  }, [])
  useEffect(() => {
    if (!invalidation) return
    const state = directories.get(invalidation.path)
    const decision = watcherRefreshDecision({ expanded: Boolean(state?.expanded), loaded: Boolean(state?.children) })
    if (decision === 'ignore') return
    if (decision === 'stale') {
      setDirectories((value) => replaceDirectory(value, invalidation.path, {
        expanded: false,
        generation: (state?.generation ?? 0) + 1,
        loading: false,
      }))
      return
    }
    const generation = (state?.generation ?? 0) + 1
    setDirectories((value) => replaceDirectory(value, invalidation.path, { ...state!, generation, loading: true }))
    void onList(invalidation.rootId, invalidation.path).then((children) => {
      setDirectories((value) => isDirectoryGenerationCurrent(value.get(invalidation.path)?.generation, generation)
        ? replaceDirectory(value, invalidation.path, {
          children: filterAndSortEntries(children),
          expanded: true,
          generation,
          loading: false,
        })
        : value)
      setAnnouncement('Workspace folder refreshed.')
    }).catch(() => {
      setDirectories((value) => isDirectoryGenerationCurrent(value.get(invalidation.path)?.generation, generation)
        ? replaceDirectory(value, invalidation.path, {
          error: 'This folder could not be refreshed. Activate it to Retry.',
          expanded: true,
          generation,
          loading: false,
        })
        : value)
    })
  }, [invalidation?.generation])

  const rows = useMemo(() => flattenRows(roots, expandedRoots, directories), [directories, expandedRoots, roots])
  const focusedIndex = rows.findIndex((row) => row.entry.path === focusedPath)
  const renderedRows = useMemo(() => {
    const slice = rows.slice(renderStart, renderStart + MAX_RENDERED_ROWS)
    const focused = focusedIndex >= 0 ? rows[focusedIndex] : undefined
    return focused && !slice.includes(focused) ? [...slice.slice(0, MAX_RENDERED_ROWS - 1), focused] : slice
  }, [focusedIndex, renderStart, rows])
  const effectiveWidth = Math.min(preferredWidth, Math.max(96, viewportWidth - 160))

  useEffect(() => {
    if (rows.length === 0) {
      setFocusedPath(undefined)
      return
    }
    if (focusedIndex < 0) setFocusedPath(rows[0]?.entry.path)
  }, [focusedIndex, rows])

  const focusRow = useCallback((index: number) => {
    const bounded = Math.max(0, Math.min(rows.length - 1, index))
    const row = rows[bounded]
    if (!row) return
    setFocusedPath(row.entry.path)
    if (bounded < renderStart || bounded >= renderStart + MAX_RENDERED_ROWS) {
      setRenderStart(Math.max(0, bounded - Math.floor(MAX_RENDERED_ROWS / 2)))
    }
    requestAnimationFrame(() => document.querySelector<HTMLElement>(`[data-workspace-path="${CSS.escape(String(row.entry.path))}"]`)?.focus())
  }, [renderStart, rows])

  const toggleDirectory = useCallback((row: VisibleRow) => {
    if (row.entry.kind !== 'directory') return
    const current = directories.get(row.entry.path) ?? { expanded: false, generation: 0, loading: false }
    const load = () => {
      const generation = current.generation + 1
      setDirectories((value) => replaceDirectory(value, row.entry.path, { expanded: true, generation, loading: true }))
      setAnnouncement(`Loading ${row.entry.name}.`)
      void onList(row.rootId, row.entry.path).then((children) => {
        setDirectories((value) => isDirectoryGenerationCurrent(value.get(row.entry.path)?.generation, generation)
          ? replaceDirectory(value, row.entry.path, {
            children: filterAndSortEntries(children),
            expanded: true,
            generation,
            loading: false,
          })
          : value)
        setAnnouncement(`Loaded ${row.entry.name}.`)
      }).catch(() => {
        setDirectories((value) => isDirectoryGenerationCurrent(value.get(row.entry.path)?.generation, generation)
          ? replaceDirectory(value, row.entry.path, {
            error: 'This folder could not be read. Activate it to Retry.',
            expanded: true,
            generation,
            loading: false,
          })
          : value)
        setAnnouncement(`${row.entry.name} could not be read. Activate it to Retry.`)
      })
    }
    if (current.error) {
      load()
      return
    }
    const decision = directoryActivationDecision({ expanded: current.expanded, loaded: Boolean(current.children) })
    if (decision === 'collapse') {
      setDirectories((value) => replaceDirectory(value, row.entry.path, {
        ...current,
        expanded: false,
        generation: current.generation + 1,
        loading: false,
      }))
      return
    }
    if (decision === 'reopen') {
      setDirectories((value) => replaceDirectory(value, row.entry.path, { ...current, expanded: true }))
      return
    }
    load()
  }, [directories, onList])

  const activate = useCallback((row: VisibleRow, pinned: boolean) => {
    if (row.entry.kind === 'directory') {
      toggleDirectory(row)
      return
    }
    if (row.entry.kind === 'directory-symlink' || !recognized(row.entry.name)) return
    onOpen(row.entry, pinned, row.rootId)
  }, [onOpen, toggleDirectory])

  const handleRowKey = useCallback((event: KeyboardEvent<HTMLButtonElement>, row: VisibleRow) => {
    const index = rows.findIndex((candidate) => candidate.entry.path === row.entry.path)
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Home' || event.key === 'End') {
      event.preventDefault()
      focusRow(event.key === 'ArrowDown' ? index + 1 : event.key === 'ArrowUp' ? index - 1 : event.key === 'Home' ? 0 : rows.length - 1)
      return
    }
    if (event.key === 'ArrowRight' && row.entry.kind === 'directory') {
      event.preventDefault()
      const state = directories.get(row.entry.path)
      if (!state?.expanded) toggleDirectory(row)
      else focusRow(index + 1)
      return
    }
    if (event.key === 'ArrowLeft') {
      const state = directories.get(row.entry.path)
      if (row.entry.kind === 'directory' && state?.expanded) {
        event.preventDefault()
        toggleDirectory(row)
      } else if (row.parentPath) {
        event.preventDefault()
        focusRow(rows.findIndex((candidate) => candidate.entry.path === row.parentPath))
      }
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && event.currentTarget.getAttribute('aria-disabled') !== 'true') {
      event.preventDefault()
      activate(row, event.ctrlKey || event.metaKey)
      return
    }
    if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
      const prefix = event.key.toLocaleLowerCase('en-US')
      const siblings = rows.filter((candidate) =>
        candidate.rootId === row.rootId && candidate.parentPath === row.parentPath &&
        candidate.entry.name.toLocaleLowerCase('en-US').startsWith(prefix))
      const after = siblings.find((candidate) => rows.indexOf(candidate) > index)
      const sibling = after ?? siblings[0]
      if (sibling) {
        event.preventDefault()
        focusRow(rows.indexOf(sibling))
      }
    }
  }, [activate, directories, focusRow, rows, toggleDirectory])

  const commitWidth = useCallback((next: number) => {
    const clamped = clampStored(next)
    setPreferredWidth(clamped)
    onWidthChange(clamped)
  }, [onWidthChange])

  const schedulePointerWidth = useCallback((next: number) => {
    const clamped = clampStored(next)
    pendingWidth.current = clamped
    setPreferredWidth(clamped)
    if (widthFrame.current) return
    widthFrame.current = requestAnimationFrame(() => {
      widthFrame.current = undefined
      const pending = pendingWidth.current
      pendingWidth.current = undefined
      if (pending !== undefined) onWidthChange(pending)
    })
  }, [onWidthChange])

  const beginResize = useCallback((event: ReactPointerEvent<HTMLElement>) => {
    event.preventDefault()
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    const move = (pointer: PointerEvent) => schedulePointerWidth(pointer.clientX)
    const finish = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('blur', finish)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', finish)
    window.addEventListener('pointercancel', finish)
    window.addEventListener('blur', finish)
  }, [schedulePointerWidth])

  return (
    <aside
      className="workspace-sidebar"
      data-forced-colors={String(forcedColors)}
      data-reduced-motion={String(reducedMotion)}
      data-testid="workspace-sidebar"
      style={{ width: effectiveWidth }}
    >
      <div className="workspace-tree-scroll" onScroll={(event) => setRenderStart(Math.max(0, Math.floor(event.currentTarget.scrollTop / 28)))}>
        {roots.map((root, rootIndex) => {
          const expanded = expandedRoots.has(root.rootId)
          const rootRows = renderedRows.filter((row) => row.rootId === root.rootId)
          return (
            <section className="workspace-root" data-root-id={root.rootId} key={root.rootId}>
              <button
                aria-expanded={expanded}
                aria-label={`${labels[rootIndex] ?? root.path}, ${root.path}`}
                className="workspace-root-header"
                data-testid="workspace-root-header"
                onClick={() => setExpandedRoots((value) => {
                  const next = new Set(value)
                  if (next.has(root.rootId)) next.delete(root.rootId)
                  else next.add(root.rootId)
                  return next
                })}
                title={root.path}
                type="button"
              >{labels[rootIndex] ?? root.path}</button>
              {expanded ? (
                <div aria-label={`${labels[rootIndex] ?? root.path} files`} className="workspace-tree" role="tree">
                  {rootRows.map((row) => {
                    const directory = directories.get(row.entry.path)
                    const isDirectory = row.entry.kind === 'directory'
                    const disabled = row.entry.kind === 'directory-symlink' || (!isDirectory && !recognized(row.entry.name))
                    const errorId = directory?.error ? `workspace-row-error-${safeId(row.entry.path)}` : undefined
                    const linkedId = row.entry.kind === 'directory-symlink' ? `workspace-linked-folder-${safeId(row.entry.path)}` : undefined
                    return (
                      <button
                        aria-busy={directory?.loading || undefined}
                        aria-current={row.entry.fileKey === activeFileKey ? 'page' : undefined}
                        aria-describedby={[errorId, linkedId].filter(Boolean).join(' ') || undefined}
                        aria-disabled={disabled || undefined}
                        aria-expanded={isDirectory ? Boolean(directory?.expanded) : undefined}
                        aria-label={row.entry.name}
                        aria-level={row.depth}
                        className="workspace-tree-row"
                        data-kind={row.entry.kind}
                        data-testid="workspace-tree-row"
                        data-workspace-path={row.entry.path}
                        key={`${root.rootId}:${row.entry.path}`}
                        onClick={() => {
                          if (isDirectory) {
                            toggleDirectory(row)
                            return
                          }
                          if (disabled) return
                          if (clickTimer.current) clearTimeout(clickTimer.current)
                          clickTimer.current = setTimeout(() => activate(row, false), 180)
                        }}
                        onDoubleClick={() => {
                          if (clickTimer.current) clearTimeout(clickTimer.current)
                          clickTimer.current = undefined
                          if (!disabled) activate(row, true)
                        }}
                        onFocus={() => setFocusedPath(row.entry.path)}
                        onKeyDown={(event) => handleRowKey(event, row)}
                        role="treeitem"
                        style={{ paddingInlineStart: 12 + (row.depth - 1) * 16 }}
                        tabIndex={row.entry.path === focusedPath ? 0 : -1}
                        type="button"
                      >
                        <span aria-hidden="true" className="workspace-tree-icon">{icon(row.entry.kind, directory?.expanded)}</span>
                        <span className="workspace-tree-label">{row.entry.name}</span>
                        {directory?.loading ? <span aria-hidden="true">…</span> : null}
                        {directory?.error ? <span className="workspace-row-error" id={errorId}>{directory.error}</span> : null}
                        {linkedId ? <span className="workspace-assistive" id={linkedId}>Linked folder. Add its target as a workspace root to browse it.</span> : null}
                      </button>
                    )
                  })}
                </div>
              ) : null}
            </section>
          )
        })}
      </div>
      <div
        aria-label="Resize sidebar"
        aria-orientation="vertical"
        aria-valuemax={Math.min(480, Math.max(160, viewportWidth - 160))}
        aria-valuemin={Math.min(160, effectiveWidth)}
        aria-valuenow={effectiveWidth}
        className="workspace-splitter"
        data-testid="workspace-splitter"
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
          event.preventDefault()
          const step = event.shiftKey ? 40 : 10
          commitWidth(event.key === 'Home' ? 160 : event.key === 'End' ? 480 : preferredWidth + (event.key === 'ArrowLeft' ? -step : step))
        }}
        onPointerDown={beginResize}
        role="separator"
        tabIndex={0}
      />
      <p aria-live="polite" className="workspace-assistive" data-testid="workspace-tree-announcement">{announcement}</p>
    </aside>
  )
}

function flattenRows(
  roots: readonly WorkspaceRootSeed[],
  expandedRoots: ReadonlySet<RootId>,
  directories: ReadonlyMap<Path, DirectoryState>,
): readonly VisibleRow[] {
  const rows: VisibleRow[] = []
  const visit = (rootId: RootId, entries: readonly DirectoryEntry[], depth: number, parentPath?: Path) => {
    for (const entry of filterAndSortEntries(entries)) {
      rows.push({ depth, entry, ...(parentPath ? { parentPath } : {}), rootId })
      const state = directories.get(entry.path)
      if (entry.kind === 'directory' && state?.expanded && state.children) visit(rootId, state.children, depth + 1, entry.path)
    }
  }
  for (const root of roots) if (expandedRoots.has(root.rootId)) visit(root.rootId, root.entries, 1)
  return rows
}

const replaceDirectory = (value: ReadonlyMap<Path, DirectoryState>, path: Path, state: DirectoryState): ReadonlyMap<Path, DirectoryState> => {
  const next = new Map(value)
  next.set(path, state)
  return next
}

const recognized = (name: string): boolean => /\.(md|markdown|txt)$/i.test(name)
const clampStored = (value: number): number => Math.round(Math.min(480, Math.max(160, value)))
const safeId = (path: Path): string => String(path).replace(/[^A-Za-z0-9_-]/g, '-')
const icon = (kind: DirectoryEntry['kind'], expanded?: boolean): string =>
  kind === 'directory' ? (expanded ? '▾' : '▸') : kind === 'directory-symlink' ? '↗' : '·'
