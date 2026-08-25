import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type ReactNode,
} from 'react'

import {
  addJsonItem,
  addJsonProperty,
  deleteJsonNode,
  insertJsonItem,
  isValidJsonNumber,
  jsonPreservationMessage,
  jsonRootFromEditor,
  renameJsonProperty,
  replaceJsonValue,
  type JsonProperty,
  type JsonValidation,
  type JsonValue,
} from '../documents/json'
import { getEditorSearch, type TextMatch } from '../search/search'

import './json.css'

const ROW_HEIGHT = 26
const OVERSCAN = 8
const MAX_ROWS = 500
const MAX_PREVIEW = 160

type JsonRow = {
  readonly arrayItem: boolean
  readonly container: boolean
  readonly id: string
  readonly index?: number
  readonly level: number
  readonly name?: string
  readonly parentId?: string
  readonly property?: JsonProperty
  readonly setSize: number
  readonly position: number
  readonly value: JsonValue
}
type Draft = {
  readonly initial: string
  readonly kind: 'boolean' | 'name' | 'number' | 'string' | 'type'
  readonly row: JsonRow
  readonly value: string
}
type JsonViewState = {
  readonly activeId: string
  readonly expanded: ReadonlySet<string>
  readonly scrollLeft: number
  readonly scrollTop: number
}

const viewStates = new WeakMap<Editor, JsonViewState>()
const draftCommitters = new WeakMap<Editor, () => boolean>()

export function commitJsonDraft(editor: Editor): boolean {
  return draftCommitters.get(editor)?.() ?? true
}

export function JsonTree({
  editor,
  onError,
  onRequestFind,
}: {
  readonly editor: Editor
  readonly onError?: (message: string) => void
  readonly onRequestFind?: () => void
}) {
  const initialRoot = jsonRootFromEditor(editor)
  const prior = viewStates.get(editor)
  const [version, setVersion] = useState(0)
  const [activeId, setActiveId] = useState(prior?.activeId ?? initialRoot.id)
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(
    prior?.expanded ?? new Set(initialRoot.type === 'object' || initialRoot.type === 'array' ? [initialRoot.id] : []),
  )
  const [viewport, setViewport] = useState({
    height: 320,
    scrollLeft: prior?.scrollLeft ?? 0,
    scrollTop: prior?.scrollTop ?? 0,
  })
  const [draft, setDraft] = useState<Draft>()
  const scrollRef = useRef<HTMLDivElement>(null)
  const cancelling = useRef(false)
  const committedDraft = useRef<Draft | undefined>(undefined)
  const root = useMemo(() => jsonRootFromEditor(editor), [editor, version])
  const allRows = useMemo(() => flattenJson(root, expanded), [expanded, root])
  const activeIndex = Math.max(0, allRows.findIndex((row) => row.id === activeId))
  const active = allRows[activeIndex] ?? allRows[0]
  const search = useMemo(() => getEditorSearch(editor), [editor, version])
  const currentMatch = search.matches[search.current]
  const locatedMatch = useMemo(
    () => currentMatch ? locateJsonMatch(editor.state.doc, currentMatch) : undefined,
    [currentMatch?.from, currentMatch?.to, editor, version],
  )

  useEffect(() => {
    const transaction = () => setVersion((value) => value + 1)
    editor.on('transaction', transaction)
    return () => { editor.off('transaction', transaction) }
  }, [editor])

  useEffect(() => {
    viewStates.set(editor, { activeId, expanded, scrollLeft: viewport.scrollLeft, scrollTop: viewport.scrollTop })
  }, [activeId, editor, expanded, viewport.scrollLeft, viewport.scrollTop])

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    scroll.scrollLeft = viewport.scrollLeft
    scroll.scrollTop = viewport.scrollTop
  }, [editor])

  useLayoutEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    const measure = () => {
      const height = scroll.clientHeight || 320
      setViewport((current) => current.height === height ? current : { ...current, height })
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(scroll)
    return () => observer.disconnect()
  }, [editor])

  useEffect(() => {
    if (!locatedMatch) return
    const path = pathToRow(root, locatedMatch.rowId)
    if (path.length > 0) setExpanded((current) => new Set([...current, ...path]))
    setActiveId(locatedMatch.rowId)
    requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(rowSelector(locatedMatch.rowId))?.scrollIntoView({ block: 'nearest' })
    })
  }, [locatedMatch?.rowId, root])

  const report = useCallback((validation: JsonValidation) => {
    if (!validation.ok) onError?.(jsonPreservationMessage(validation.reason))
    return validation.ok
  }, [onError])

  const focusRow = useCallback((id: string) => {
    const focus = () => document.querySelector<HTMLElement>(rowSelector(id))?.focus()
    focus()
    requestAnimationFrame(focus)
  }, [])

  useEffect(() => {
    document.querySelector<HTMLElement>(rowSelector(activeId))?.focus()
  }, [editor])

  const beginDraft = useCallback((row: JsonRow, kind?: Draft['kind']) => {
    const selectedKind = kind ?? (row.property ? 'name' : valueDraftKind(row.value) ?? 'string')
    const value = selectedKind === 'name'
      ? row.name ?? ''
      : selectedKind === 'type'
        ? row.value.type
        : selectedKind === 'number' && row.value.type === 'number'
          ? row.value.lexeme
          : selectedKind === 'boolean' && row.value.type === 'boolean'
            ? String(row.value.value)
            : selectedKind === 'string' && row.value.type === 'string'
              ? row.value.value
              : ''
    cancelling.current = false
    committedDraft.current = undefined
    setActiveId(row.id)
    setDraft({ initial: value, kind: selectedKind, row, value })
    requestAnimationFrame(() => {
      const input = document.querySelector<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        '[data-testid="json-inline-editor"]',
      )
      input?.focus()
      if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
        input.setSelectionRange(value.length, value.length)
      }
    })
  }, [])

  const commitDraft = useCallback((): boolean => {
    if (!draft) return true
    if (committedDraft.current === draft) return true
    if (draft.kind === 'number' && !isValidJsonNumber(draft.value)) return false
    if (draft.kind === 'boolean' && draft.value !== 'true' && draft.value !== 'false') return false
    committedDraft.current = draft
    setDraft(undefined)
    const changesType = draft.kind === 'type'
      ? draft.row.value.type !== draft.value
      : draft.kind !== 'name' && draft.row.value.type !== draft.kind
    if (draft.value === draft.initial && !changesType) {
      focusRow(draft.row.id)
      return true
    }
    const validation = draft.kind === 'name'
      ? renameJsonProperty(editor, draft.row.id, draft.value)
      : draft.kind === 'type'
        ? replaceJsonValue(
            editor,
            draft.row.value.id,
            emptyValue(draft.value as JsonValue['type'], draft.row.value.id),
          )
        : replaceJsonValue(editor, draft.row.value.id, draft.kind === 'number'
          ? { id: draft.row.value.id, lexeme: draft.value, type: 'number' }
          : draft.kind === 'boolean'
            ? { id: draft.row.value.id, type: 'boolean', value: draft.value === 'true' }
            : { id: draft.row.value.id, type: 'string', value: draft.value })
    const accepted = report(validation)
    if (!accepted) {
      committedDraft.current = undefined
      setDraft(draft)
    }
    else focusRow(draft.row.id)
    return accepted
  }, [draft, editor, focusRow, report])

  useEffect(() => {
    draftCommitters.set(editor, commitDraft)
    return () => { draftCommitters.delete(editor) }
  }, [commitDraft, editor])

  const activate = useCallback((row: JsonRow) => {
    if (!commitDraft()) return
    setActiveId(row.id)
    focusRow(row.id)
  }, [commitDraft, focusRow])

  const toggle = useCallback((row: JsonRow, force?: boolean) => {
    if (!row.container) return
    setExpanded((current) => {
      const next = new Set(current)
      const shouldExpand = force ?? !next.has(row.id)
      if (shouldExpand) next.add(row.id)
      else next.delete(row.id)
      return next
    })
  }, [])

  const mutate = useCallback((operation: () => { readonly id?: string; readonly validation: JsonValidation } | JsonValidation) => {
    if (!commitDraft()) return
    const outcome = operation()
    const validation = 'validation' in outcome ? outcome.validation : outcome
    if (!report(validation)) return
    const id = 'id' in outcome ? outcome.id : undefined
    if (id) {
      setExpanded((current) => new Set([...current, active?.id ?? root.id]))
      setActiveId(id)
      requestAnimationFrame(() => focusRow(id))
    }
  }, [active?.id, commitDraft, focusRow, report, root.id])

  const handleKey = useCallback((event: KeyboardEvent<HTMLElement>, row: JsonRow) => {
    const primary = event.metaKey || event.ctrlKey
    const valueKind = valueDraftKind(row.value)
    if (primary && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      onRequestFind?.()
      return
    }
    if (event.key === 'Enter' && event.shiftKey && !row.container) {
      event.preventDefault()
      beginDraft(row, 'type')
      return
    }
    if (event.key === 'F2' && event.shiftKey && row.property) {
      event.preventDefault()
      beginDraft(row, 'name')
      return
    }
    if (event.key === 'Enter' && row.property && row.name === '') {
      event.preventDefault()
      beginDraft(row, 'name')
      return
    }
    if ((event.key === 'Enter' || event.key === ' ') && row.container) {
      event.preventDefault()
      toggle(row)
      return
    }
    if ((event.key === 'Enter' || event.key === 'F2') && valueKind) {
      event.preventDefault()
      beginDraft(row, valueKind)
      return
    }
    if (event.key === 'Delete' && row.parentId) {
      event.preventDefault()
      mutate(() => deleteJsonNode(editor, row.id))
      return
    }
    let next = activeIndex
    if (event.key === 'ArrowUp') next -= 1
    else if (event.key === 'ArrowDown') next += 1
    else if (event.key === 'Home') next = primary ? 0 : 0
    else if (event.key === 'End') next = allRows.length - 1
    else if (event.key === 'PageUp') next -= Math.max(1, Math.floor(viewport.height / ROW_HEIGHT))
    else if (event.key === 'PageDown') next += Math.max(1, Math.floor(viewport.height / ROW_HEIGHT))
    else if (event.key === 'ArrowRight') {
      if (row.container && !expanded.has(row.id)) toggle(row, true)
      else next += 1
    } else if (event.key === 'ArrowLeft') {
      if (row.container && expanded.has(row.id)) toggle(row, false)
      else if (row.parentId) next = allRows.findIndex((candidate) => candidate.id === row.parentId)
    } else return
    event.preventDefault()
    const target = allRows[Math.max(0, Math.min(allRows.length - 1, next))]
    if (target) activate(target)
  }, [activate, activeIndex, allRows, beginDraft, editor, expanded, mutate, onRequestFind, toggle, viewport.height])

  const rowStart = Math.max(0, Math.floor(viewport.scrollTop / ROW_HEIGHT) - OVERSCAN)
  const rowEnd = Math.min(allRows.length, rowStart + MAX_ROWS, Math.ceil((viewport.scrollTop + viewport.height) / ROW_HEIGHT) + OVERSCAN)
  const visible = allRows.slice(rowStart, rowEnd)
  if (active && !visible.some((row) => row.id === active.id)) visible.push(active)
  if (draft && !visible.some((row) => row.id === draft.row.id)) visible.push(draft.row)

  const replaceTypes: JsonValue['type'][] = ['object', 'array', 'string', 'number', 'boolean', 'null']
  return (
    <section className="json-surface">
      <div aria-label="JSON actions" className="json-toolbar" data-testid="json-toolbar" role="toolbar">
        <button
          aria-label="Add property"
          data-testid="json-add-property"
          disabled={active?.value.type !== 'object'}
          onClick={() => { if (active?.value.type === 'object') mutate(() => addJsonProperty(editor, active.value.id)) }}
          type="button"
        ><JsonActionIcon name="property" /></button>
        <button
          aria-label="Add item"
          data-testid="json-add-item"
          disabled={active?.value.type !== 'array'}
          onClick={() => { if (active?.value.type === 'array') mutate(() => addJsonItem(editor, active.value.id)) }}
          type="button"
        ><JsonActionIcon name="item" /></button>
        <button
          aria-label="Insert before"
          data-testid="json-insert-before"
          disabled={!active?.arrayItem}
          onClick={() => { if (active) mutate(() => insertJsonItem(editor, active.value.id, false)) }}
          type="button"
        ><JsonActionIcon name="before" /></button>
        <button
          aria-label="Insert after"
          data-testid="json-insert-after"
          disabled={!active?.arrayItem}
          onClick={() => { if (active) mutate(() => insertJsonItem(editor, active.value.id, true)) }}
          type="button"
        ><JsonActionIcon name="after" /></button>
        <button
          aria-label="Delete"
          data-testid="json-delete"
          disabled={!active?.parentId}
          onClick={() => { if (active) mutate(() => deleteJsonNode(editor, active.id)) }}
          type="button"
        ><JsonActionIcon name="delete" /></button>
      </div>
      <div
        aria-label="JSON structure"
        className="json-tree"
        data-testid="json-tree"
        onScroll={(event) => setViewport({
          height: event.currentTarget.clientHeight || 320,
          scrollLeft: event.currentTarget.scrollLeft,
          scrollTop: event.currentTarget.scrollTop,
        })}
        ref={scrollRef}
        role="tree"
        tabIndex={-1}
      >
        <div className="json-tree-canvas" style={{ height: allRows.length * ROW_HEIGHT }}>
          {visible.map((row) => {
            const selected = row.id === active?.id
            const match = locatedMatch?.rowId === row.id ? locatedMatch : undefined
            const rowDraft = draft?.row.id === row.id ? draft : undefined
            const rowValueKind = valueDraftKind(row.value)
            const emptyName = Boolean(row.property && row.name === '')
            const draftError = rowDraft?.kind === 'number' && !isValidJsonNumber(rowDraft.value)
              ? 'Enter a complete JSON number.'
              : rowDraft?.kind === 'boolean' && rowDraft.value !== 'true' && rowDraft.value !== 'false'
                ? 'Enter true or false.'
                : undefined
            const inlineEditor = rowDraft ? (
              <span
                className="json-inline-shell"
                data-testid="json-inline-shell"
                onDoubleClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
              >
                {rowDraft.kind === 'type' ? (
                  <select
                    aria-label="Change JSON type"
                    data-testid="json-inline-editor"
                    onBlur={() => { if (!cancelling.current) commitDraft() }}
                    onChange={(event) => {
                      const type = event.currentTarget.value as JsonValue['type']
                      mutate(() => replaceJsonValue(editor, row.value.id, emptyValue(type, row.value.id)))
                    }}
                    onKeyDown={(event) => {
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelling.current = true
                        setDraft(undefined)
                        focusRow(row.id)
                      }
                    }}
                    value={rowDraft.value}
                  >
                    {replaceTypes.map((type) => <option key={type} value={type}>{type}</option>)}
                  </select>
                ) : rowDraft.kind === 'string' ? (
                  <textarea
                    aria-label="Edit JSON string"
                    data-testid="json-inline-editor"
                    onBlur={() => { if (!cancelling.current) commitDraft() }}
                    onChange={(event) => setDraft({ ...rowDraft, value: event.currentTarget.value })}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) return
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelling.current = true
                        setDraft(undefined)
                        focusRow(row.id)
                      } else if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
                        event.preventDefault()
                        commitDraft()
                      }
                    }}
                    placeholder={rowDraft.row.value.type === 'null' ? 'Empty value' : undefined}
                    value={rowDraft.value}
                  />
                ) : (
                  <input
                    aria-invalid={Boolean(draftError)}
                    aria-label={
                      rowDraft.kind === 'name'
                        ? 'Rename JSON property'
                        : rowDraft.kind === 'boolean'
                          ? 'Edit JSON boolean'
                          : 'Edit JSON number'
                    }
                    data-testid="json-inline-editor"
                    onBlur={() => { if (!cancelling.current) commitDraft() }}
                    onChange={(event) => setDraft({ ...rowDraft, value: event.currentTarget.value })}
                    onKeyDown={(event) => {
                      if (event.nativeEvent.isComposing) return
                      if (event.key === 'Escape') {
                        event.preventDefault()
                        cancelling.current = true
                        setDraft(undefined)
                        focusRow(row.id)
                      } else if (event.key === 'Enter') {
                        event.preventDefault()
                        commitDraft()
                      }
                    }}
                    value={rowDraft.value}
                  />
                )}
                {draftError ? (
                  <span data-testid="json-inline-error" role="alert">{draftError}</span>
                ) : null}
                {rowDraft.kind === 'type' ? null : (
                  <>
                    <button
                      aria-label="Apply"
                      data-testid="json-apply"
                      disabled={Boolean(draftError)}
                      onClick={commitDraft}
                      type="button"
                    ><span aria-hidden="true">✓</span></button>
                    <button
                      aria-label="Cancel"
                      data-testid="json-cancel"
                      onMouseDown={() => { cancelling.current = true }}
                      onClick={() => { setDraft(undefined); focusRow(row.id) }}
                      type="button"
                    ><span aria-hidden="true">×</span></button>
                  </>
                )}
              </span>
            ) : null
            return (
              <div
                aria-expanded={row.container ? expanded.has(row.id) : undefined}
                aria-keyshortcuts={row.container
                  ? 'Enter Space'
                  : row.property
                    ? 'Enter F2 Shift+Enter Shift+F2'
                    : 'Enter F2 Shift+Enter'}
                aria-level={row.level}
                aria-posinset={row.position}
                aria-selected={selected}
                aria-setsize={row.setSize}
                className={`json-row${selected ? ' json-row-active' : ''}`}
                data-json-row-id={row.id}
                data-testid="json-row"
                key={row.id}
                onKeyDown={(event) => handleKey(event, row)}
                onMouseDown={(event) => handleRowPointer(event, () => activate(row))}
                role="treeitem"
                style={{ height: ROW_HEIGHT, paddingInlineStart: (row.level - 1) * 14, top: allRows.indexOf(row) * ROW_HEIGHT }}
                tabIndex={selected ? 0 : -1}
              >
                {row.container ? (
                  <button
                    aria-label={expanded.has(row.id) ? 'Collapse' : 'Expand'}
                    className="json-disclosure"
                    data-testid="json-disclosure"
                    onClick={() => toggle(row)}
                    tabIndex={-1}
                    type="button"
                  >{expanded.has(row.id) ? '▾' : '▸'}</button>
                ) : <span aria-hidden="true" className="json-disclosure-placeholder" />}
                <span
                  className="json-row-name"
                  data-json-editable={Boolean(row.property)}
                  data-testid="json-row-name"
                  onDoubleClick={(event) => {
                    event.stopPropagation()
                    if (row.property) beginDraft(row, 'name')
                  }}
                  data-json-editing={rowDraft?.kind === 'name'}
                  data-json-placeholder={emptyName}
                >{rowDraft?.kind === 'name' ? inlineEditor : rowLabel(row)}</span>
                {row.container ? (
                  <span className="json-row-container-meta" data-testid="json-row-container-meta">
                    <span aria-hidden="true" className="json-row-container-marker">
                      {row.value.type === 'object' ? '{ }' : '[ ]'}
                    </span>
                    <span>{renderPreview(row, match)}</span>
                  </span>
                ) : (
                  <>
                    <span
                      className="json-row-type"
                      data-json-editable="true"
                      data-json-editing={rowDraft?.kind === 'type'}
                      data-testid="json-row-type"
                      onDoubleClick={(event) => {
                        event.stopPropagation()
                        beginDraft(row, 'type')
                      }}
                    >
                      {rowDraft?.kind === 'type'
                        ? inlineEditor
                        : rowDraft?.kind === 'string' && row.value.type === 'null'
                          ? 'string'
                          : row.value.type}
                    </span>
                    <span
                      className="json-row-preview"
                      data-json-editable={Boolean(rowValueKind)}
                      data-json-editing={Boolean(rowDraft && rowDraft.kind !== 'name' && rowDraft.kind !== 'type')}
                      data-json-placeholder={row.value.type === 'null'}
                      data-testid="json-row-preview"
                      dir="auto"
                      onDoubleClick={(event) => {
                        event.stopPropagation()
                        if (rowValueKind) beginDraft(row, rowValueKind)
                      }}
                    >
                      {rowDraft && rowDraft.kind !== 'name' && rowDraft.kind !== 'type'
                        ? inlineEditor
                        : renderPreview(row, match)}
                    </span>
                  </>
                )}
              </div>
            )
          })}
        </div>
      </div>
    </section>
  )
}

type JsonActionIconName = 'after' | 'before' | 'delete' | 'item' | 'property'

function JsonActionIcon({ name }: { readonly name: JsonActionIconName }) {
  return (
    <svg aria-hidden="true" className="toolbar-icon json-action-icon" data-testid="json-action-icon" viewBox="0 0 24 24">
      {name === 'property' ? <path d="M8 3c-2 0-3 1-3 3v3c0 2-1 3-3 3 2 0 3 1 3 3v3c0 2 1 3 3 3M16 3c2 0 3 1 3 3v3c0 2 1 3 3 3-2 0-3 1-3 3v3c0 2-1 3-3 3M9 12h6M12 9v6" /> : null}
      {name === 'item' ? <path d="M8 4H5v16h3M16 4h3v16h-3M9 12h6M12 9v6" /> : null}
      {name === 'before' ? <path d="M15 4v16M5 12h7M8.5 8.5 5 12l3.5 3.5" /> : null}
      {name === 'after' ? <path d="M9 4v16M19 12h-7m3.5-3.5L19 12l-3.5 3.5" /> : null}
      {name === 'delete' ? <path d="M4 7h16M9 7V4h6v3m3 0-1 13H7L6 7m4 4v5m4-5v5" /> : null}
    </svg>
  )
}

function valueDraftKind(value: JsonValue): Exclude<Draft['kind'], 'name' | 'type'> | undefined {
  if (value.type === 'boolean' || value.type === 'number' || value.type === 'string') return value.type
  if (value.type === 'null') return 'string'
  return undefined
}

function flattenJson(root: JsonValue, expanded: ReadonlySet<string>): JsonRow[] {
  const rows: JsonRow[] = []
  const visitValue = (
    value: JsonValue,
    id: string,
    level: number,
    position: number,
    setSize: number,
    parentId?: string,
    property?: JsonProperty,
    index?: number,
  ) => {
    const container = value.type === 'object' || value.type === 'array'
    rows.push({
      arrayItem: index !== undefined,
      container,
      id,
      ...(index !== undefined ? { index } : {}),
      level,
      ...(property ? { name: property.name, property } : {}),
      ...(parentId ? { parentId } : {}),
      position,
      setSize,
      value,
    })
    if (!container || !expanded.has(id)) return
    if (value.type === 'object') {
      value.properties.forEach((child, childIndex) => {
        visitValue(child.value, child.id, level + 1, childIndex + 1, value.properties.length, id, child)
      })
    } else {
      value.items.forEach((child, childIndex) => {
        visitValue(child, child.id, level + 1, childIndex + 1, value.items.length, id, undefined, childIndex)
      })
    }
  }
  visitValue(root, root.id, 1, 1, 1)
  return rows
}

function rowLabel(row: JsonRow): string {
  if (row.property) return visibleControls(row.property.name || '(empty name)')
  if (row.index !== undefined) return String(row.index + 1)
  return 'Root'
}

function renderPreview(row: JsonRow, match?: { readonly from: number; readonly to: number }): ReactNode {
  const source = scalarPreview(row.value)
  if (!source) return row.value.type === 'object'
    ? `${row.value.properties.length} ${row.value.properties.length === 1 ? 'property' : 'properties'}`
    : row.value.type === 'array'
      ? `${row.value.items.length} ${row.value.items.length === 1 ? 'item' : 'items'}`
      : ''
  if (!match) return boundedPreview(source)
  const start = Math.max(0, match.from - Math.floor(MAX_PREVIEW / 2))
  const excerpt = source.slice(start, start + MAX_PREVIEW)
  const from = Math.max(0, match.from - start)
  const to = Math.max(from, match.to - start)
  return (
    <>
      {start > 0 ? '…' : ''}
      {visibleControls(excerpt.slice(0, from))}
      <mark className="search-match search-match-current">{visibleControls(excerpt.slice(from, to))}</mark>
      {visibleControls(excerpt.slice(to))}
      {start + MAX_PREVIEW < source.length ? '…' : ''}
    </>
  )
}

function scalarPreview(value: JsonValue): string {
  if (value.type === 'string') return value.value
  if (value.type === 'number') return value.lexeme
  if (value.type === 'boolean') return String(value.value)
  if (value.type === 'null') return 'null'
  return ''
}

function boundedPreview(value: string): string {
  const points = [...value]
  return visibleControls(points.length <= MAX_PREVIEW ? value : `${points.slice(0, MAX_PREVIEW - 1).join('')}…`)
}

function visibleControls(value: string): string {
  return [...value].map((character) => {
    if (character === '\r') return '␍'
    if (character === '\n') return '↵'
    if (character === '\t') return '⇥'
    const point = character.codePointAt(0)!
    return point < 0x20 || point === 0x7f ? `\\u${point.toString(16).padStart(4, '0')}` : character
  }).join('')
}

function locateJsonMatch(
  document: ProseMirrorNode,
  match: TextMatch,
): { readonly from: number; readonly rowId: string; readonly to: number } | undefined {
  let result: { readonly from: number; readonly rowId: string; readonly to: number } | undefined
  document.descendants((node, position, parent) => {
    if (result || !node.isTextblock) return !result
    const start = position + 1
    const end = start + node.content.size
    if (match.from < start || match.to > end) return true
    const rowId = parent?.type.name === 'jsonProperty' ? String(parent.attrs.id) : String(node.attrs.id)
    result = { from: match.from - start, rowId, to: match.to - start }
    return false
  })
  return result
}

function pathToRow(root: JsonValue, target: string): string[] {
  const visit = (value: JsonValue, rowId: string, path: readonly string[]): string[] | undefined => {
    if (rowId === target) return [...path]
    if (value.type === 'object') {
      for (const property of value.properties) {
        const found = visit(property.value, property.id, [...path, rowId])
        if (found) return found
      }
    } else if (value.type === 'array') {
      for (const item of value.items) {
        const found = visit(item, item.id, [...path, rowId])
        if (found) return found
      }
    }
    return undefined
  }
  return visit(root, root.id, []) ?? []
}

function emptyValue(type: JsonValue['type'], id: string): JsonValue {
  switch (type) {
    case 'object': return { id, properties: [], type }
    case 'array': return { id, items: [], type }
    case 'string': return { id, type, value: '' }
    case 'number': return { id, lexeme: '0', type }
    case 'boolean': return { id, type, value: false }
    case 'null': return { id, type }
  }
}

function handleRowPointer(event: MouseEvent<HTMLElement>, activate: () => void): void {
  if (event.button !== 0 || event.target instanceof Element && event.target.closest('button, input, select, textarea')) return
  event.preventDefault()
  activate()
}

function rowSelector(id: string): string {
  return `[data-json-row-id="${CSS.escape(id)}"]`
}
