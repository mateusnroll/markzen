import { Extension, type Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey, TextSelection, type EditorState, type Selection, type Transaction } from '@tiptap/pm/state'
import { Decoration, DecorationSet, type EditorView } from '@tiptap/pm/view'

type NestedRange = { readonly from: number; readonly node: ProseMirrorNode; readonly to: number }
type NestedSection = { readonly item: ProseMirrorNode; readonly itemPosition: number; readonly ranges: readonly NestedRange[] }
type NestedListState = { readonly collapsed: ReadonlySet<number>; readonly decorations: DecorationSet }
type NestedListIntent = { readonly kind: 'reveal'; readonly position: number } | { readonly kind: 'toggle'; readonly position: number }

const listNames = new Set(['bulletList', 'orderedList', 'taskList'])
const nestedListPluginKey = new PluginKey<NestedListState>('markzenNestedLists')

export const NestedListExtension = Extension.create({
  name: 'markzenNestedLists',
  addProseMirrorPlugins() {
    return [nestedListPlugin()]
  },
})

export function revealNestedListPosition(editor: Editor, position: number | undefined): void {
  if (position === undefined) return
  const state = nestedListPluginKey.getState(editor.state)
  if (!state || !positionIsHidden(editor.state.doc, state.collapsed, position)) return
  editor.view.dispatch(editor.state.tr.setMeta(nestedListPluginKey, { kind: 'reveal', position } satisfies NestedListIntent))
}

function nestedListPlugin(): Plugin<NestedListState> {
  return new Plugin<NestedListState>({
    key: nestedListPluginKey,
    filterTransaction: (transaction, state) => {
      const nestedState = nestedListPluginKey.getState(state)
      const presentationSelection = transaction.selectionSet && Boolean(nestedState && selectionTouchesCollapsed(state.doc, nestedState.collapsed, transaction.selection.from, transaction.selection.to))
      if (transaction.getMeta(nestedListPluginKey) || presentationSelection) transaction.setMeta('skipTrailingNode', true)
      return true
    },
    state: {
      init: (_, state) => nestedListState(state.doc, new Set()),
      apply: (transaction, previous, oldState, newState) => applyNestedListState(transaction, previous, oldState, newState),
    },
    props: {
      decorations: (state) => nestedListPluginKey.getState(state)?.decorations ?? null,
    },
    view: (view) => focusRecoveryView(view),
  })
}

function applyNestedListState(transaction: Transaction, previous: NestedListState, oldState: EditorState, newState: EditorState): NestedListState {
  const intent = transaction.getMeta(nestedListPluginKey) as NestedListIntent | undefined
  if (!transaction.docChanged && !transaction.selectionSet && !intent) return previous

  const oldSections = sectionMap(oldState.doc)
  const newSections = sectionMap(newState.doc)
  const collapsed = new Set<number>()
  for (const oldPosition of previous.collapsed) {
    const mapped = transaction.mapping.mapResult(oldPosition, 1)
    const oldSection = oldSections.get(oldPosition)
    const newSection = newSections.get(mapped.pos)
    if (mapped.deleted || !oldSection || !newSection) continue
    if (transaction.docChanged && !nestedContentEqual(oldSection, newSection)) continue
    collapsed.add(mapped.pos)
  }

  if (transaction.selectionSet) revealSelection(newState, collapsed)
  if (intent?.kind === 'reveal') revealPosition(newState.doc, collapsed, intent.position)
  if (intent?.kind === 'toggle' && newSections.has(intent.position)) {
    if (collapsed.has(intent.position)) collapsed.delete(intent.position)
    else collapsed.add(intent.position)
  }
  return nestedListState(newState.doc, collapsed, newSections)
}

function nestedListState(document: ProseMirrorNode, collapsed: ReadonlySet<number>, sections = sectionMap(document)): NestedListState {
  const decorations: Decoration[] = []
  for (const section of sections.values()) {
    const isCollapsed = collapsed.has(section.itemPosition)
    decorations.push(Decoration.node(section.itemPosition, section.itemPosition + section.item.nodeSize, {
      'data-nested-list-parent': '',
    }))
    for (const range of section.ranges) {
      decorations.push(Decoration.node(range.from, range.to, {
        class: `nested-list-section${isCollapsed ? ' nested-list-section-collapsed' : ''}`,
        'data-nested-list': '',
        'data-testid': 'nested-list-section',
        ...(isCollapsed ? { hidden: '' } : {}),
      }))
    }
    decorations.push(Decoration.widget(
      section.itemPosition + 1,
      (view, getPosition) => disclosureButton(view, getPosition, !isCollapsed),
      {
        ignoreSelection: true,
        key: `nested-list-toggle-${section.itemPosition}-${isCollapsed ? 'collapsed' : 'expanded'}`,
        side: -1,
        stopEvent: () => true,
      },
    ))
  }
  return { collapsed, decorations: DecorationSet.create(document, decorations) }
}

function disclosureButton(view: EditorView, getPosition: () => number | undefined, expanded: boolean): HTMLButtonElement {
  const button = document.createElement('button')
  button.className = 'nested-list-toggle'
  button.contentEditable = 'false'
  button.dataset.testid = 'nested-list-toggle'
  button.setAttribute('aria-expanded', String(expanded))
  button.setAttribute('aria-label', 'Nested items')
  button.type = 'button'
  const icon = document.createElement('span')
  icon.ariaHidden = 'true'
  icon.textContent = expanded ? '▾' : '▸'
  button.append(icon)
  const position = getPosition()
  if (position !== undefined) button.dataset.nestedListPosition = String(position - 1)
  button.addEventListener('mousedown', (event) => {
    event.preventDefault()
    event.stopPropagation()
  })
  button.addEventListener('click', (event) => {
    event.preventDefault()
    event.stopPropagation()
    const widgetPosition = getPosition()
    if (widgetPosition === undefined) return
    const itemPosition = widgetPosition - 1
    const section = sectionMap(view.state.doc).get(itemPosition)
    if (!section) return
    let transaction = view.state.tr
    const state = nestedListPluginKey.getState(view.state)
    if (!state?.collapsed.has(itemPosition) && selectionIntersects(section.ranges, transaction.selection.from, transaction.selection.to)) {
      transaction = transaction.setSelection(parentCaret(view.state.doc, section))
    }
    view.dispatch(transaction
      .setMeta('skipTrailingNode', true)
      .setMeta(nestedListPluginKey, { kind: 'toggle', position: itemPosition } satisfies NestedListIntent))
    requestAnimationFrame(() => view.dom.querySelector<HTMLButtonElement>(`[data-nested-list-position="${itemPosition}"]`)?.focus())
  })
  return button
}

function sectionMap(document: ProseMirrorNode): ReadonlyMap<number, NestedSection> {
  const sections = new Map<number, NestedSection>()
  document.descendants((node, position) => {
    if (node.type.name !== 'listItem' && node.type.name !== 'taskItem') return true
    const ranges: NestedRange[] = []
    node.forEach((child, offset) => {
      if (!listNames.has(child.type.name)) return
      const from = position + 1 + offset
      ranges.push({ from, node: child, to: from + child.nodeSize })
    })
    if (ranges.length > 0) sections.set(position, { item: node, itemPosition: position, ranges })
    return true
  })
  return sections
}

function nestedContentEqual(before: NestedSection, after: NestedSection): boolean {
  return before.ranges.length === after.ranges.length && before.ranges.every((range, index) => range.node.eq(after.ranges[index]!.node))
}

function revealSelection(state: EditorState, collapsed: Set<number>): void {
  if (collapsed.size === 0) return
  for (const [position, section] of sectionMap(state.doc)) {
    if (collapsed.has(position) && selectionIntersects(section.ranges, state.selection.from, state.selection.to)) collapsed.delete(position)
  }
}

function revealPosition(document: ProseMirrorNode, collapsed: Set<number>, position: number): void {
  for (const [itemPosition, section] of sectionMap(document)) {
    if (collapsed.has(itemPosition) && section.ranges.some((range) => position >= range.from && position < range.to)) collapsed.delete(itemPosition)
  }
}

function positionIsHidden(document: ProseMirrorNode, collapsed: ReadonlySet<number>, position: number): boolean {
  for (const [itemPosition, section] of sectionMap(document)) {
    if (collapsed.has(itemPosition) && section.ranges.some((range) => position >= range.from && position < range.to)) return true
  }
  return false
}

function selectionTouchesCollapsed(document: ProseMirrorNode, collapsed: ReadonlySet<number>, from: number, to: number): boolean {
  for (const [itemPosition, section] of sectionMap(document)) {
    if (collapsed.has(itemPosition) && selectionIntersects(section.ranges, from, to)) return true
  }
  return false
}

function selectionIntersects(ranges: readonly NestedRange[], from: number, to: number): boolean {
  return ranges.some((range) => from === to ? from >= range.from && from < range.to : from < range.to && to > range.from)
}

function parentCaret(document: ProseMirrorNode, section: NestedSection): Selection {
  const leading = section.item.firstChild
  const position = leading?.isTextblock ? section.itemPosition + 2 + leading.content.size : section.itemPosition + 1
  return TextSelection.near(document.resolve(Math.min(position, document.content.size)), -1)
}

function focusRecoveryView(view: EditorView): { readonly destroy: () => void; readonly update: (view: EditorView, previous: EditorState) => void } {
  let focusedItem: ProseMirrorNode | undefined
  let focusedPosition: number | undefined
  const rememberFocus = (event: FocusEvent) => {
    const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-nested-list-position]') : null
    const parsed = target ? Number(target.dataset.nestedListPosition) : Number.NaN
    focusedPosition = Number.isInteger(parsed) ? parsed : undefined
    focusedItem = focusedPosition === undefined ? undefined : view.state.doc.nodeAt(focusedPosition) ?? undefined
  }
  view.dom.addEventListener('focusin', rememberFocus)
  return {
    destroy: () => view.dom.removeEventListener('focusin', rememberFocus),
    update: (current, previous) => {
      if (focusedPosition === undefined || previous.doc.eq(current.state.doc)) return
      const activeToggle = document.activeElement instanceof Element ? document.activeElement.closest<HTMLElement>('[data-nested-list-position]') : null
      const activePosition = activeToggle ? Number(activeToggle.dataset.nestedListPosition) : Number.NaN
      if (Number.isInteger(activePosition) && current.state.doc.nodeAt(activePosition) === focusedItem) {
        focusedPosition = activePosition
        return
      }
      const position = Math.min(focusedPosition, current.state.doc.content.size)
      focusedItem = undefined
      focusedPosition = undefined
      requestAnimationFrame(() => {
        if (current.isDestroyed || !current.dom.isConnected) return
        const state = current.state
        const resolved = state.doc.resolve(Math.min(position, state.doc.content.size))
        current.dispatch(state.tr
          .setSelection(TextSelection.near(resolved, -1))
          .setMeta('skipTrailingNode', true))
        current.focus()
      })
    },
  }
}
