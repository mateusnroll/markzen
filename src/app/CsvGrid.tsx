import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from 'react'

import {
  csvColumnLabel,
  csvPreservationMessage,
  csvRowsFromEditor,
  parseClipboardText,
  replaceCsvRows,
  serializeClipboardMatrix,
  validateCsvEditorRows,
} from '../documents/csv'
import { getEditorSearch, type TextMatch } from '../search/search'

import './csv.css'

type Coordinate = { readonly column: number; readonly row: number }
type Selection = { readonly anchor: Coordinate; readonly active: Coordinate }
type Viewport = { readonly height: number; readonly scrollLeft: number; readonly scrollTop: number; readonly width: number }
type GridViewState = { readonly selection: Selection; readonly viewport: Viewport }

export type CsvGridProps = {
  readonly editor: Editor
  readonly header: boolean
  readonly onError?: (message: string) => void
  readonly onHeaderChange: (header: boolean) => void
  readonly onRequestFind?: () => void
}

const ROW_HEIGHT = 32
const COLUMN_WIDTH = 180
const ROW_NUMBER_WIDTH = 52
const OVERSCAN = 2
const MAX_PREVIEW = 160
const gridViewStates = new WeakMap<Editor, GridViewState>()
export function CsvGrid({
  editor,
  header,
  onError,
  onHeaderChange,
  onRequestFind,
}: CsvGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const cancellingEdit = useRef(false)
  const [version, setVersion] = useState(0)
  const rows = useMemo(() => csvRowsFromEditor(editor), [editor, version])
  const rowCount = Math.max(1, rows.length)
  const columnCount = Math.max(1, rows[0]?.length ?? 1)
  const [selection, setSelection] = useState<Selection>(() => gridViewStates.get(editor)?.selection ?? ({
    active: { column: 0, row: 0 },
    anchor: { column: 0, row: 0 },
  }))
  const [editing, setEditing] = useState<{ readonly coordinate: Coordinate; readonly initial: string; readonly value: string }>()
  const [viewport, setViewport] = useState<Viewport>(() => gridViewStates.get(editor)?.viewport ?? (
    { height: 320, scrollLeft: 0, scrollTop: 0, width: 640 }
  ))
  const [announcement, setAnnouncement] = useState('')
  const [searchVersion, setSearchVersion] = useState(0)
  const searchSelection = useRef<{ active: boolean; prior?: Selection }>({ active: false })
  const search = useMemo(() => getEditorSearch(editor), [editor, searchVersion, version])
  const currentSearchMatch = search.matches[search.current]
  const currentSearchCell = currentSearchMatch ? locateCsvMatch(editor, currentSearchMatch) : undefined

  useEffect(() => {
    const transaction = () => {
      setSearchVersion((value) => value + 1)
      setVersion((value) => value + 1)
    }
    editor.on('transaction', transaction)
    return () => { editor.off('transaction', transaction) }
  }, [editor])

  useEffect(() => {
    gridViewStates.set(editor, { selection, viewport })
  }, [editor, selection, viewport])

  useEffect(() => {
    const scroll = scrollRef.current
    if (!scroll) return
    scroll.scrollLeft = viewport.scrollLeft
    scroll.scrollTop = viewport.scrollTop
  }, [editor])

  const emit = useCallback((nextRows: string[][]): boolean => {
    const validation = validateCsvEditorRows(editor, nextRows)
    if (!validation.ok) {
      onError?.(csvPreservationMessage(validation.reason))
      setAnnouncement(csvPreservationMessage(validation.reason))
      return false
    }
    if (!replaceCsvRows(editor, nextRows)) return false
    setVersion((value) => value + 1)
    return true
  }, [editor, onError])
  const editingRef = useRef(editing)
  editingRef.current = editing

  useEffect(() => () => {
    const draft = editingRef.current
    if (!draft || draft.value === draft.initial || editor.isDestroyed) return
    const nextRows = cloneRows(csvRowsFromEditor(editor))
    nextRows[draft.coordinate.row]![draft.coordinate.column] = draft.value
    if (validateCsvEditorRows(editor, nextRows).ok) replaceCsvRows(editor, nextRows)
  }, [editor])

  const focusCell = useCallback((coordinate: Coordinate) => {
    const focus = () => document.querySelector<HTMLElement>(cellSelector(coordinate))?.focus()
    focus()
    requestAnimationFrame(focus)
  }, [])

  const reveal = useCallback((coordinate: Coordinate) => {
    const scroll = scrollRef.current
    if (!scroll) return
    const top = coordinate.row * ROW_HEIGHT
    const left = coordinate.column * COLUMN_WIDTH
    const behavior: ScrollBehavior = 'auto'
    if (top < scroll.scrollTop) scroll.scrollTo({ behavior, top })
    else if (top + ROW_HEIGHT > scroll.scrollTop + scroll.clientHeight) {
      scroll.scrollTo({ behavior, top: top + ROW_HEIGHT - scroll.clientHeight })
    }
    if (left < scroll.scrollLeft) scroll.scrollTo({ behavior, left })
    else if (left + COLUMN_WIDTH > scroll.scrollLeft + scroll.clientWidth) {
      scroll.scrollTo({ behavior, left: left + COLUMN_WIDTH - scroll.clientWidth })
    }
  }, [])

  const activate = useCallback((coordinate: Coordinate, extend = false) => {
    const bounded = {
      column: Math.max(0, Math.min(columnCount - 1, coordinate.column)),
      row: Math.max(0, Math.min(rowCount - 1, coordinate.row)),
    }
    setSelection((current) => ({ active: bounded, anchor: extend ? current.anchor : bounded }))
    reveal(bounded)
    focusCell(bounded)
  }, [columnCount, focusCell, reveal, rowCount])

  useEffect(() => {
    if (search.query && currentSearchCell) {
      if (!searchSelection.current.active) {
        searchSelection.current = { active: true, prior: selection }
      }
      const coordinate = { column: currentSearchCell.column, row: currentSearchCell.row }
      setSelection({ active: coordinate, anchor: coordinate })
      reveal(coordinate)
      return
    }
    if (!search.query && searchSelection.current.active) {
      const prior = searchSelection.current.prior
      searchSelection.current = { active: false }
      if (prior) {
        setSelection(prior)
        reveal(prior.active)
      }
    }
  }, [currentSearchCell?.column, currentSearchCell?.row, reveal, search.query])

  const commitEdit = useCallback((): boolean => {
    if (!editing) return false
    const draft = editing
    setEditing(undefined)
    if (draft.value === draft.initial) {
      focusCell(draft.coordinate)
      return false
    }
    const nextRows = csvRowsFromEditor(editor)
    nextRows[draft.coordinate.row]![draft.coordinate.column] = draft.value
    const changed = emit(nextRows)
    focusCell(draft.coordinate)
    return changed
  }, [editing, editor, emit, focusCell])

  const beginEdit = useCallback((coordinate: Coordinate, replacement?: string) => {
    cancellingEdit.current = false
    const value = rows[coordinate.row]?.[coordinate.column] ?? ''
    setSelection({ active: coordinate, anchor: coordinate })
    setEditing({ coordinate, initial: value, value: replacement ?? value })
    requestAnimationFrame(() => {
      const textarea = document.querySelector<HTMLTextAreaElement>('[data-testid="csv-cell-editor"]')
      textarea?.focus()
      if (replacement === undefined) textarea?.setSelectionRange(value.length, value.length)
      else textarea?.select()
    })
  }, [rows])

  const mutate = useCallback((operation: (rows: string[][], active: Coordinate) => { active: Coordinate; rows: string[][] }) => {
    commitEdit()
    const result = operation(csvRowsFromEditor(editor), selection.active)
    if (!emit(result.rows)) return
    setSelection({ active: result.active, anchor: result.active })
    reveal(result.active)
    focusCell(result.active)
  }, [commitEdit, editor, emit, focusCell, reveal, selection.active])

  const handleKey = useCallback((event: KeyboardEvent<HTMLElement>, coordinate: Coordinate) => {
    const primary = event.ctrlKey || event.metaKey
    if (primary && event.key.toLowerCase() === 'f') {
      event.preventDefault()
      commitEdit()
      onRequestFind?.()
      return
    }
    if (primary && event.key.toLowerCase() === 'a') {
      event.preventDefault()
      setSelection({ anchor: { column: 0, row: 0 }, active: { column: columnCount - 1, row: rowCount - 1 } })
      return
    }
    if (primary && event.key.toLowerCase() === 'z') {
      event.preventDefault()
      if (event.shiftKey) editor.commands.redo()
      else editor.commands.undo()
      return
    }
    if (event.key === 'Enter' || event.key === 'F2') {
      event.preventDefault()
      beginEdit(coordinate)
      return
    }
    if (event.key.length === 1 && !primary && !event.altKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      beginEdit(coordinate, event.key)
      return
    }
    if (event.key === 'Delete' || event.key === 'Backspace') {
      event.preventDefault()
      mutate((current) => {
        forEachSelected(selection, (row, column) => { current[row]![column] = '' })
        return { active: selection.active, rows: current }
      })
      return
    }
    let next: Coordinate | undefined
    if (event.key === 'ArrowLeft') next = { ...coordinate, column: coordinate.column - 1 }
    if (event.key === 'ArrowRight') next = { ...coordinate, column: coordinate.column + 1 }
    if (event.key === 'ArrowUp') next = { ...coordinate, row: coordinate.row - 1 }
    if (event.key === 'ArrowDown') next = { ...coordinate, row: coordinate.row + 1 }
    if (event.key === 'Home') next = primary ? { column: 0, row: 0 } : { column: 0, row: coordinate.row }
    if (event.key === 'End') next = primary ? { column: columnCount - 1, row: rowCount - 1 } : { column: columnCount - 1, row: coordinate.row }
    if (event.key === 'PageUp') next = { ...coordinate, row: coordinate.row - Math.max(1, Math.floor(viewport.height / ROW_HEIGHT)) }
    if (event.key === 'PageDown') next = { ...coordinate, row: coordinate.row + Math.max(1, Math.floor(viewport.height / ROW_HEIGHT)) }
    if (event.key === 'Tab') {
      const index = coordinate.row * columnCount + coordinate.column + (event.shiftKey ? -1 : 1)
      if (index < 0 || index >= rowCount * columnCount) return
      next = { column: index % columnCount, row: Math.floor(index / columnCount) }
    }
    if (!next) return
    event.preventDefault()
    activate(next, event.shiftKey && event.key !== 'Tab')
  }, [activate, beginEdit, columnCount, commitEdit, editor.commands, mutate, onRequestFind, rowCount, selection, viewport.height])

  const copy = useCallback((event: ClipboardEvent<HTMLElement>, cut: boolean) => {
    try {
      const matrix = selectedRows(rows, selection)
      event.clipboardData.setData('text/plain', serializeClipboardMatrix(matrix))
      event.preventDefault()
      if (cut) mutate((current) => {
        forEachSelected(selection, (row, column) => { current[row]![column] = '' })
        return { active: selection.active, rows: current }
      })
    } catch {
      const message = 'Clipboard access failed. CSV data was not changed.'
      onError?.(message)
      setAnnouncement(message)
    }
  }, [mutate, onError, rows, selection])

  const paste = useCallback((event: ClipboardEvent<HTMLElement>) => {
    const parsed = parseClipboardText(event.clipboardData.getData('text/plain'))
    if (!parsed.ok) {
      event.preventDefault()
      const message = `Paste rejected: ${csvPreservationMessage(parsed.reason)}`
      onError?.(message)
      setAnnouncement(message)
      return
    }
    event.preventDefault()
    mutate((current) => {
      const bounds = selectionBounds(selection)
      const active = { column: bounds.left, row: bounds.top }
      const requiredRows = active.row + parsed.rows.length
      const requiredColumns = active.column + (parsed.rows[0]?.length ?? 1)
      const width = Math.max(current[0]?.length ?? 1, requiredColumns)
      while (current.length < requiredRows) current.push(Array.from({ length: width }, () => ''))
      for (const row of current) while (row.length < width) row.push('')
      parsed.rows.forEach((sourceRow, rowOffset) => sourceRow.forEach((field, columnOffset) => {
        current[active.row + rowOffset]![active.column + columnOffset] = field
      }))
      return { active, rows: current }
    })
  }, [mutate, onError, selection])

  const rowStart = Math.max(0, Math.floor(viewport.scrollTop / ROW_HEIGHT) - OVERSCAN)
  const rowEnd = Math.min(rowCount, Math.ceil((viewport.scrollTop + viewport.height) / ROW_HEIGHT) + OVERSCAN)
  const columnStart = Math.max(0, Math.floor(viewport.scrollLeft / COLUMN_WIDTH) - OVERSCAN)
  const columnEnd = Math.min(columnCount, Math.ceil((viewport.scrollLeft + viewport.width) / COLUMN_WIDTH) + OVERSCAN)
  const coordinates = visibleCoordinates(rowStart, rowEnd, columnStart, columnEnd, selection.active, header, editing?.coordinate)
  const coordinateRows = [...new Set(coordinates.map((coordinate) => coordinate.row))]

  return (
    <section className="csv-surface">
      <div aria-label="CSV actions" className="csv-toolbar" data-testid="csv-toolbar" role="toolbar">
        <button
          aria-pressed={header}
          data-testid="csv-header-toggle"
          onClick={() => { commitEdit(); onHeaderChange(!header) }}
          type="button"
        >
          Header row
        </button>
        <button data-testid="csv-add-row-above" onClick={() => mutate(insertRow(-1))} type="button">Add row above</button>
        <button data-testid="csv-add-row-below" onClick={() => mutate(insertRow(1))} type="button">Add row below</button>
        <button data-testid="csv-add-column-before" onClick={() => mutate(insertColumn(-1))} type="button">Add column before</button>
        <button data-testid="csv-add-column-after" onClick={() => mutate(insertColumn(1))} type="button">Add column after</button>
        <button data-testid="csv-delete-row" onClick={() => mutate(deleteRow)} type="button">Delete row</button>
        <button data-testid="csv-delete-column" onClick={() => mutate(deleteColumn)} type="button">Delete column</button>
      </div>
      <div className="csv-grid-shell">
        <div aria-hidden="true" className="csv-column-labels" data-testid="csv-column-labels">
          {Array.from({ length: columnCount }, (_, column) => (
            <span
              aria-hidden="true"
              className="csv-column-letter"
              data-testid="csv-column-letter"
              key={column}
              style={{ left: ROW_NUMBER_WIDTH + column * COLUMN_WIDTH, width: COLUMN_WIDTH }}
            >
              {csvColumnLabel(column)}
            </span>
          ))}
        </div>
        <div
          aria-colcount={columnCount}
          aria-label="CSV data"
          aria-rowcount={rowCount}
          className="csv-grid-scroll"
          data-testid="csv-grid"
          onScroll={(event) => setViewport({
            height: event.currentTarget.clientHeight || 320,
            scrollLeft: event.currentTarget.scrollLeft,
            scrollTop: event.currentTarget.scrollTop,
            width: event.currentTarget.clientWidth || 640,
          })}
          ref={scrollRef}
          role="grid"
          tabIndex={-1}
        >
          <div
            className="csv-grid-canvas"
            data-testid="csv-grid-canvas"
            style={{ height: rowCount * ROW_HEIGHT, width: columnCount * COLUMN_WIDTH }}
          >
            {coordinateRows.map((row) => (
              <div
                aria-rowindex={row + 1}
                className="csv-aria-row"
                key={row}
                role="row"
              >
                {coordinates.filter((coordinate) => coordinate.row === row).map(({ column }) => {
                  const coordinate = { column, row }
                  const value = rows[row]?.[column] ?? ''
                  const active = sameCoordinate(selection.active, coordinate)
                  const selected = coordinateSelected(selection, coordinate)
                  const headerName = header && row > 0 ? rows[0]?.[column] : undefined
                  const columnName = headerName ? boundedPreview(headerName) : csvColumnLabel(column)
                  const preview = boundedPreview(value)
                  const searchRange = currentSearchCell?.row === row && currentSearchCell.column === column
                    ? currentSearchCell
                    : undefined
                  return (
                    <div
                  aria-colindex={column + 1}
                  aria-label={`Row ${row + 1}, column ${column + 1}, ${columnName}: ${preview}`}
                  aria-rowindex={row + 1}
                  aria-selected={selected}
                  className={`csv-cell${active ? ' csv-cell-active' : ''}`}
                  data-csv-column={column}
                  data-csv-row={row}
                  data-testid="csv-cell"
                  key={column}
                  onClick={(event) => {
                    commitEdit()
                    activate(coordinate, event.shiftKey)
                  }}
                  onCopy={(event) => copy(event, false)}
                  onCut={(event) => copy(event, true)}
                  onDoubleClick={() => beginEdit(coordinate)}
                  onKeyDown={(event) => handleKey(event, coordinate)}
                  onPaste={paste}
                  role={header && row === 0 ? 'columnheader' : 'gridcell'}
                  style={{
                    height: ROW_HEIGHT,
                    left: column * COLUMN_WIDTH,
                    top: header && row === 0 ? viewport.scrollTop : row * ROW_HEIGHT,
                    width: COLUMN_WIDTH,
                    ...(header && row === 0 ? { zIndex: 3 } : {}),
                  }}
                  tabIndex={active ? 0 : -1}
                    >
                      {searchRange ? (
                        <>
                          {displayValue(value.slice(0, searchRange.from))}
                          <mark className="search-match search-match-current">{displayValue(value.slice(searchRange.from, searchRange.to))}</mark>
                          {displayValue(value.slice(searchRange.to))}
                        </>
                      ) : displayValue(value)}
                      {editing && sameCoordinate(editing.coordinate, coordinate) ? (
                        <textarea
                      aria-label={`Edit row ${row + 1}, column ${column + 1}`}
                      className="csv-cell-editor"
                      data-testid="csv-cell-editor"
                      maxLength={1_048_576}
                      onBlur={() => {
                        if (cancellingEdit.current) {
                          cancellingEdit.current = false
                          return
                        }
                        commitEdit()
                      }}
                      onChange={(event) => setEditing({ ...editing, value: event.currentTarget.value })}
                      onKeyDown={(event) => {
                        if (event.nativeEvent.isComposing) return
                        if (event.key === 'Escape') {
                          event.preventDefault()
                          cancellingEdit.current = true
                          setEditing(undefined)
                          focusCell(coordinate)
                        } else if (event.key === 'Enter' && !event.altKey) {
                          event.preventDefault()
                          commitEdit()
                        } else if (event.key === 'Enter' && event.altKey) {
                          event.preventDefault()
                          setEditing({ ...editing, value: `${editing.value}\n` })
                        } else if (event.key === 'Tab') {
                          event.preventDefault()
                          commitEdit()
                          const index = row * columnCount + column + (event.shiftKey ? -1 : 1)
                          if (index >= 0 && index < rowCount * columnCount) {
                            activate({ column: index % columnCount, row: Math.floor(index / columnCount) })
                          }
                        }
                      }}
                      value={editing.value}
                        />
                      ) : null}
                    </div>
                  )
                })}
              </div>
            ))}
            {Array.from({ length: Math.min(rowCount, rowEnd - rowStart) }, (_, offset) => {
              const row = rowStart + offset
              return (
                <span
                  aria-hidden="true"
                  className="csv-row-number"
                  data-testid="csv-row-number"
                  key={row}
                  style={{ height: ROW_HEIGHT, left: -ROW_NUMBER_WIDTH, top: row * ROW_HEIGHT, width: ROW_NUMBER_WIDTH }}
                >
                  {row + 1}
                </span>
              )
            })}
          </div>
        </div>
      </div>
      <div aria-live="polite" className="visually-hidden">{announcement}</div>
    </section>
  )
}

const insertRow = (offset: -1 | 1) => (rows: string[][], active: Coordinate) => {
  const index = active.row + (offset > 0 ? 1 : 0)
  rows.splice(index, 0, Array.from({ length: rows[0]?.length ?? 1 }, () => ''))
  return { active: { column: active.column, row: index }, rows }
}

const insertColumn = (offset: -1 | 1) => (rows: string[][], active: Coordinate) => {
  const index = active.column + (offset > 0 ? 1 : 0)
  for (const row of rows) row.splice(index, 0, '')
  return { active: { column: index, row: active.row }, rows }
}

const deleteRow = (rows: string[][], active: Coordinate) => {
  if (rows.length === 1) rows[0] = Array.from({ length: rows[0]?.length ?? 1 }, () => '')
  else rows.splice(active.row, 1)
  return { active: { column: active.column, row: Math.min(active.row, rows.length - 1) }, rows }
}

const deleteColumn = (rows: string[][], active: Coordinate) => {
  if ((rows[0]?.length ?? 1) === 1) for (const row of rows) row[0] = ''
  else for (const row of rows) row.splice(active.column, 1)
  return { active: { column: Math.min(active.column, (rows[0]?.length ?? 1) - 1), row: active.row }, rows }
}

function selectedRows(rows: readonly (readonly string[])[], selection: Selection): string[][] {
  const bounds = selectionBounds(selection)
  return rows.slice(bounds.top, bounds.bottom + 1).map((row) => row.slice(bounds.left, bounds.right + 1))
}

function forEachSelected(selection: Selection, callback: (row: number, column: number) => void): void {
  const bounds = selectionBounds(selection)
  for (let row = bounds.top; row <= bounds.bottom; row += 1) {
    for (let column = bounds.left; column <= bounds.right; column += 1) callback(row, column)
  }
}

function coordinateSelected(selection: Selection, coordinate: Coordinate): boolean {
  const bounds = selectionBounds(selection)
  return coordinate.row >= bounds.top && coordinate.row <= bounds.bottom
    && coordinate.column >= bounds.left && coordinate.column <= bounds.right
}

function selectionBounds(selection: Selection) {
  return {
    bottom: Math.max(selection.anchor.row, selection.active.row),
    left: Math.min(selection.anchor.column, selection.active.column),
    right: Math.max(selection.anchor.column, selection.active.column),
    top: Math.min(selection.anchor.row, selection.active.row),
  }
}

function visibleCoordinates(
  rowStart: number,
  rowEnd: number,
  columnStart: number,
  columnEnd: number,
  active: Coordinate,
  header: boolean,
  editing?: Coordinate,
): Coordinate[] {
  const values = new Map<string, Coordinate>()
  values.set(`${active.row}:${active.column}`, active)
  if (editing) values.set(`${editing.row}:${editing.column}`, editing)
  if (header) {
    for (let column = columnStart; column < columnEnd && values.size < 600; column += 1) {
      values.set(`0:${column}`, { column, row: 0 })
    }
  }
  for (let row = rowStart; row < rowEnd; row += 1) {
    for (let column = columnStart; column < columnEnd && values.size < 600; column += 1) {
      values.set(`${row}:${column}`, { column, row })
    }
  }
  return [...values.values()].toSorted((first, second) => first.row - second.row || first.column - second.column)
}

function boundedPreview(value: string): string {
  const normalized = displayValue(value)
  return normalized.length <= MAX_PREVIEW ? normalized : `${normalized.slice(0, MAX_PREVIEW - 1)}…`
}

function displayValue(value: string): string {
  return value.replaceAll(/\r\n|\r|\n/g, '↵')
}

function locateCsvMatch(editor: Editor, match: TextMatch): (Coordinate & { readonly from: number; readonly to: number }) | undefined {
  let found: (Coordinate & { readonly from: number; readonly to: number }) | undefined
  let row = -1
  editor.state.doc.descendants((node, position, parent, index) => {
    if (found) return false
    if (node.type.name === 'csvRecord' && parent?.type.name === 'doc') {
      row = index
      return true
    }
    if (node.type.name !== 'csvField' || parent?.type.name !== 'csvRecord') return true
    const start = position + 1
    const end = start + node.content.size
    if (match.from >= start && match.to <= end) {
      found = { column: index, from: match.from - start, row, to: match.to - start }
    }
    return false
  })
  return found
}

function sameCoordinate(first: Coordinate, second: Coordinate): boolean {
  return first.row === second.row && first.column === second.column
}

function cloneRows(rows: readonly (readonly string[])[]): string[][] {
  return rows.map((row) => [...row])
}

function cellSelector(coordinate: Coordinate): string {
  return `[data-csv-row="${coordinate.row}"][data-csv-column="${coordinate.column}"]`
}
