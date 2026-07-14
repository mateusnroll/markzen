import type { Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { TextSelection } from '@tiptap/pm/state'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useOverlaySurface } from './overlays'

type TableContext = {
  readonly columns: number
  readonly header: boolean
  readonly row: number
  readonly rows: number
}

export function TableActions({ editor }: { readonly editor: Editor }) {
  const [open, setOpen] = useState(false)
  const [hovered, setHovered] = useState(false)
  const [revision, setRevision] = useState(0)
  const trigger = useRef<HTMLButtonElement>(null)
  const context = useMemo(() => {
    void revision
    return tableContext(editor)
  }, [editor, revision])
  const visible = Boolean(context) || hovered || open

  const close = useCallback(() => {
    setOpen(false)
    requestAnimationFrame(() => trigger.current?.focus())
  }, [])
  useOverlaySurface('table-actions', open, false, close)

  useEffect(() => {
    const refresh = () => setRevision((value) => value + 1)
    const root = editor.view.dom
    const over = (event: Event) => setHovered(event.target instanceof Element && Boolean(event.target.closest('table')))
    const out = (event: MouseEvent) => {
      if (event.relatedTarget instanceof Element && event.relatedTarget.closest('table')) return
      setHovered(false)
    }
    editor.on('selectionUpdate', refresh)
    editor.on('transaction', refresh)
    root.addEventListener('mouseover', over)
    root.addEventListener('mouseout', out)
    return () => {
      editor.off('selectionUpdate', refresh)
      editor.off('transaction', refresh)
      root.removeEventListener('mouseover', over)
      root.removeEventListener('mouseout', out)
    }
  }, [editor])

  useEffect(() => {
    if (context || hovered) return
    setOpen(false)
  }, [context, hovered])

  if (!visible) return null
  const current = context ?? { columns: 0, header: false, row: 0, rows: 0 }
  const description = current.rows > 0
    ? `Row ${current.row} of ${current.rows}, column ${columnIndex(editor)} of ${current.columns}${current.header ? ', header row' : ''}.`
    : 'Move the editor selection into a table to use these actions.'

  const run = (command: 'addColumn' | 'addRow' | 'deleteColumn' | 'deleteRow' | 'deleteTable') => {
    if (!context) return
    if (command === 'addRow') appendRow(editor)
    else if (command === 'addColumn') appendColumn(editor)
    else if (command === 'deleteColumn') {
      if (context.columns === 1) replaceTableWithParagraph(editor)
      else editor.chain().focus().deleteColumn().run()
    } else if (command === 'deleteRow') {
      if (!context.header) editor.chain().focus().deleteRow().run()
    } else replaceTableWithParagraph(editor)
    setOpen(false)
  }

  return (
    <div className="table-actions" data-testid="table-actions-owner">
      <button
        aria-describedby="table-actions-context"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label="Table Actions"
        data-testid="table-actions"
        disabled={!context}
        onClick={() => setOpen((value) => !value)}
        ref={trigger}
        type="button"
      >Table Actions</button>
      <span className="visually-hidden" data-testid="table-actions-context" id="table-actions-context">{description}</span>
      {open ? (
        <div aria-label="Table Actions" className="toolbar-menu table-actions-menu" data-testid="table-actions-menu" role="menu">
          <p aria-live="polite">{description}</p>
          <button data-testid="table-add-row" onClick={() => run('addRow')} role="menuitem" type="button">Add Row</button>
          <button data-testid="table-add-column" onClick={() => run('addColumn')} role="menuitem" type="button">Add Column</button>
          <button aria-description={current.header ? 'The header row cannot be deleted.' : undefined} data-testid="table-delete-row" disabled={current.header} onClick={() => run('deleteRow')} role="menuitem" type="button">Delete Row</button>
          <button data-testid="table-delete-column" onClick={() => run('deleteColumn')} role="menuitem" type="button">Delete Column</button>
          <button data-testid="table-delete-table" onClick={() => run('deleteTable')} role="menuitem" type="button">Delete Table</button>
        </div>
      ) : null}
    </div>
  )
}

function tableContext(editor: Editor): TableContext | undefined {
  const { $from } = editor.state.selection
  let tableDepth = -1
  let rowDepth = -1
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name
    if (rowDepth < 0 && name === 'tableRow') rowDepth = depth
    if (name === 'table') { tableDepth = depth; break }
  }
  if (tableDepth < 0 || rowDepth < 0) return undefined
  const table = $from.node(tableDepth)
  const row = $from.index(tableDepth) + 1
  return {
    columns: table.childCount > 0 ? table.child(0).childCount : 0,
    header: row === 1,
    row,
    rows: table.childCount,
  }
}

function columnIndex(editor: Editor): number {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'tableRow') return $from.index(depth) + 1
  }
  return 0
}

function appendRow(editor: Editor): void {
  const found = selectedTable(editor)
  if (!found) return
  const previous = found.node.child(found.node.childCount - 1)
  const paragraph = editor.schema.nodes.paragraph
  const cell = editor.schema.nodes.tableCell
  const row = editor.schema.nodes.tableRow
  if (!paragraph || !cell || !row) return
  const cells = Array.from({ length: previous.childCount }, (_, index) => cell.create({ ...previous.child(index).attrs }, paragraph.create()))
  const inserted = row.create(null, cells)
  const position = found.position + found.node.nodeSize - 1
  const transaction = editor.state.tr.insert(position, inserted)
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(position + 2)))
  editor.view.dispatch(transaction)
  editor.commands.focus()
}

function appendColumn(editor: Editor): void {
  const position = lastCellPosition(editor.state.doc, editor.state.selection.$from, true)
  if (position === undefined) return
  editor.chain().setTextSelection(position).addColumnAfter().focus().run()
}

function lastCellPosition(document: ProseMirrorNode, $from: import('@tiptap/pm/model').ResolvedPos, lastColumn: boolean): number | undefined {
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name !== 'table') continue
    const table = $from.node(depth)
    const tableStart = $from.before(depth) + 1
    const rowIndex = lastColumn ? Math.max(0, $from.index(depth)) : table.childCount - 1
    const row = table.child(rowIndex)
    let rowStart = tableStart
    for (let index = 0; index < rowIndex; index += 1) rowStart += table.child(index).nodeSize
    let cellStart = rowStart + 1
    const cellIndex = lastColumn ? row.childCount - 1 : 0
    for (let index = 0; index < cellIndex; index += 1) cellStart += row.child(index).nodeSize
    return Math.min(cellStart + 2, document.content.size)
  }
  return undefined
}

function selectedTable(editor: Editor): { readonly node: ProseMirrorNode; readonly position: number } | undefined {
  const { $from } = editor.state.selection
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    if ($from.node(depth).type.name === 'table') return { node: $from.node(depth), position: $from.before(depth) }
  }
  return undefined
}

function replaceTableWithParagraph(editor: Editor): void {
  const found = selectedTable(editor)
  const paragraph = editor.schema.nodes.paragraph
  if (!found || !paragraph) return
  const transaction = editor.state.tr.replaceWith(found.position, found.position + found.node.nodeSize, paragraph.create())
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(Math.min(found.position + 1, transaction.doc.content.size))))
  editor.view.dispatch(transaction)
  editor.commands.focus()
}
