import { Fragment, type Node as ProseMirrorNode, type ResolvedPos } from '@tiptap/pm/model'
import { NodeSelection, TextSelection, type EditorState, type Transaction } from '@tiptap/pm/state'

export type StructuralMoveKind = 'column' | 'image' | 'row'

export type StructuralMoveGap = {
  readonly label: string
  readonly position: number
}

type TableMovePlan = {
  readonly currentGap: number
  readonly document: ProseMirrorNode
  readonly gaps: readonly StructuralMoveGap[]
  readonly kind: 'column' | 'row'
  readonly sourceColumn: number
  readonly sourceRow: number
  readonly tablePosition: number
}

type ImageMovePlan = {
  readonly assetId: string
  readonly currentGap: number
  readonly document: ProseMirrorNode
  readonly gaps: readonly StructuralMoveGap[]
  readonly kind: 'image'
  readonly source: string
  readonly sourcePosition: number
}

export type StructuralMovePlan = ImageMovePlan | TableMovePlan

export function createStructuralMovePlan(state: EditorState, kind: StructuralMoveKind): StructuralMovePlan | undefined {
  if (kind === 'image') return imagePlan(state)
  const context = tableContext(state)
  if (!context) return undefined
  if (kind === 'row') {
    const dataRows = context.table.childCount - 1
    if (context.row === 0 || dataRows < 2) return undefined
    return {
      currentGap: context.row - 1,
      document: state.doc,
      gaps: Array.from({ length: dataRows }, (_, index) => ({ label: rowGapLabel(index, dataRows), position: index })),
      kind,
      sourceColumn: context.column,
      sourceRow: context.row,
      tablePosition: context.tablePosition,
    }
  }
  const columns = context.table.firstChild?.childCount ?? 0
  if (columns < 2) return undefined
  return {
    currentGap: context.column,
    document: state.doc,
    gaps: Array.from({ length: columns }, (_, index) => ({ label: columnGapLabel(index, columns), position: index })),
    kind,
    sourceColumn: context.column,
    sourceRow: context.row,
    tablePosition: context.tablePosition,
  }
}

export function applyStructuralMove(state: EditorState, plan: StructuralMovePlan, gapIndex: number): Transaction | undefined {
  if (!Number.isInteger(gapIndex) || gapIndex < 0 || gapIndex >= plan.gaps.length || gapIndex === plan.currentGap) return undefined
  if (plan.kind === 'image') return moveImage(state, plan, gapIndex)
  if (state.doc !== plan.document) return undefined
  const table = state.doc.nodeAt(plan.tablePosition)
  if (!table || table.type.name !== 'table') return undefined
  return plan.kind === 'row' ? moveRow(state, table, plan, gapIndex) : moveColumn(state, table, plan, gapIndex)
}

export function structuralMoveSourceDescription(plan: StructuralMovePlan): string {
  if (plan.kind === 'image') return 'image'
  if (plan.kind === 'row') return `data row ${plan.sourceRow} of ${plan.gaps.length}`
  return `column ${plan.sourceColumn + 1} of ${plan.gaps.length}`
}

export function imageMoveGapAtPosition(state: EditorState, plan: StructuralMovePlan, position: number): number | undefined {
  if (plan.kind !== 'image') return undefined
  const sourcePosition = currentImagePosition(state.doc, plan)
  if (sourcePosition === undefined || position < 0 || position > state.doc.content.size) return undefined
  const sourceNode = state.doc.nodeAt(sourcePosition)
  if (!sourceNode || sourceNode.type.name !== 'image') return undefined
  const removal = state.tr.delete(sourcePosition, sourcePosition + sourceNode.nodeSize)
  const mapped = removal.mapping.map(position, position <= sourcePosition ? -1 : 1)
  const exact = plan.gaps.findIndex((gap) => gap.position === mapped)
  if (exact >= 0) return exact
  let closest: number | undefined
  let distance = Number.POSITIVE_INFINITY
  for (let index = 0; index < plan.gaps.length; index += 1) {
    const difference = Math.abs((plan.gaps[index]?.position ?? 0) - mapped)
    if (difference < distance) { closest = index; distance = difference }
  }
  return closest
}

function tableContext(state: EditorState): { readonly column: number; readonly row: number; readonly table: ProseMirrorNode; readonly tablePosition: number } | undefined {
  const { $from } = state.selection
  let rowDepth = -1
  for (let depth = $from.depth; depth > 0; depth -= 1) {
    const name = $from.node(depth).type.name
    if (rowDepth < 0 && name === 'tableRow') rowDepth = depth
    if (name !== 'table' || rowDepth < 0) continue
    return {
      column: $from.index(rowDepth),
      row: $from.index(depth),
      table: $from.node(depth),
      tablePosition: $from.before(depth),
    }
  }
  return undefined
}

function imagePlan(state: EditorState): ImageMovePlan | undefined {
  const selection = state.selection
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return undefined
  const assetId = typeof selection.node.attrs.assetId === 'string' ? selection.node.attrs.assetId : ''
  const source = typeof selection.node.attrs.src === 'string' ? selection.node.attrs.src : ''
  const removal = state.tr.delete(selection.from, selection.to)
  const gaps = inlineGaps(removal.doc, selection.node.type)
  const currentPosition = removal.mapping.map(selection.from, -1)
  const currentGap = gaps.findIndex((gap) => gap.position === currentPosition)
  if (gaps.length < 2 || currentGap < 0) return undefined
  return {
    assetId,
    currentGap,
    document: state.doc,
    gaps,
    kind: 'image',
    source,
    sourcePosition: selection.from,
  }
}

function inlineGaps(document: ProseMirrorNode, imageType: import('@tiptap/pm/model').NodeType): readonly StructuralMoveGap[] {
  const gaps: StructuralMoveGap[] = []
  for (let position = 0; position <= document.content.size; position += 1) {
    const resolved = document.resolve(position)
    if (!resolved.parent.inlineContent || !resolved.parent.canReplaceWith(resolved.index(), resolved.index(), imageType)) continue
    gaps.push({ label: imageGapLabel(resolved), position })
  }
  return gaps
}

function moveRow(state: EditorState, table: ProseMirrorNode, plan: TableMovePlan, gapIndex: number): Transaction | undefined {
  if (plan.sourceRow <= 0 || plan.sourceRow >= table.childCount) return undefined
  const rows = table.content.content.slice()
  const [source] = rows.splice(plan.sourceRow, 1)
  if (!source) return undefined
  const targetRow = gapIndex + 1
  rows.splice(targetRow, 0, source)
  const replacement = table.type.create(table.attrs, Fragment.fromArray(rows), table.marks)
  const transaction = state.tr.replaceWith(plan.tablePosition, plan.tablePosition + table.nodeSize, replacement)
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(cellTextPosition(replacement, plan.tablePosition, targetRow, plan.sourceColumn))))
  return transaction
}

function moveColumn(state: EditorState, table: ProseMirrorNode, plan: TableMovePlan, gapIndex: number): Transaction | undefined {
  if (table.childCount === 0 || plan.sourceColumn < 0 || plan.sourceColumn >= table.child(0).childCount) return undefined
  const rows: ProseMirrorNode[] = []
  for (let rowIndex = 0; rowIndex < table.childCount; rowIndex += 1) {
    const row = table.child(rowIndex)
    const cells = row.content.content.slice()
    const [source] = cells.splice(plan.sourceColumn, 1)
    if (!source) return undefined
    cells.splice(gapIndex, 0, source)
    rows.push(row.type.create(row.attrs, Fragment.fromArray(cells), row.marks))
  }
  const replacement = table.type.create(table.attrs, Fragment.fromArray(rows), table.marks)
  const transaction = state.tr.replaceWith(plan.tablePosition, plan.tablePosition + table.nodeSize, replacement)
  transaction.setSelection(TextSelection.near(transaction.doc.resolve(cellTextPosition(replacement, plan.tablePosition, plan.sourceRow, gapIndex))))
  return transaction
}

function moveImage(state: EditorState, plan: ImageMovePlan, gapIndex: number): Transaction | undefined {
  const sourcePosition = currentImagePosition(state.doc, plan)
  if (sourcePosition === undefined) return undefined
  const sourceNode = state.doc.nodeAt(sourcePosition)
  if (!sourceNode || sourceNode.type.name !== 'image') return undefined
  const transaction = state.tr.delete(sourcePosition, sourcePosition + sourceNode.nodeSize)
  const gap = plan.gaps[gapIndex]
  if (!gap || gap.position > transaction.doc.content.size) return undefined
  const resolved = transaction.doc.resolve(gap.position)
  if (!resolved.parent.inlineContent || !resolved.parent.canReplaceWith(resolved.index(), resolved.index(), sourceNode.type)) return undefined
  transaction.insert(gap.position, sourceNode)
  transaction.setSelection(NodeSelection.create(transaction.doc, gap.position))
  return transaction
}

function currentImagePosition(document: ProseMirrorNode, plan: ImageMovePlan): number | undefined {
  if (document === plan.document) return plan.sourcePosition
  let found: number | undefined
  document.descendants((node, position) => {
    if (found !== undefined || node.type.name !== 'image') return
    if (node.attrs.assetId === plan.assetId && node.attrs.src === plan.source) found = position
  })
  return found
}

function cellTextPosition(table: ProseMirrorNode, tablePosition: number, rowIndex: number, columnIndex: number): number {
  let rowPosition = tablePosition + 1
  for (let index = 0; index < rowIndex; index += 1) rowPosition += table.child(index).nodeSize
  const row = table.child(rowIndex)
  let cellPosition = rowPosition + 1
  for (let index = 0; index < columnIndex; index += 1) cellPosition += row.child(index).nodeSize
  return cellPosition + 1
}

function rowGapLabel(index: number, count: number): string {
  if (index === 0) return 'First data-row position'
  if (index === count - 1) return 'Last data-row position'
  return `Data-row position ${index + 1} of ${count}`
}

function columnGapLabel(index: number, count: number): string {
  if (index === 0) return 'First column position'
  if (index === count - 1) return 'Last column position'
  return `Column position ${index + 1} of ${count}`
}

function imageGapLabel(position: ResolvedPos): string {
  const inTable = ancestor(position, 'table')
  const inList = ancestor(position, 'listItem')
  const inQuote = ancestor(position, 'blockquote')
  const context = inTable ? 'table' : inList ? 'list' : inQuote ? 'blockquote' : position.parent.type.name
  return `${context} inline position ${position.parentOffset + 1}`
}

function ancestor(position: ResolvedPos, name: string): boolean {
  for (let depth = position.depth; depth > 0; depth -= 1) if (position.node(depth).type.name === name) return true
  return false
}
