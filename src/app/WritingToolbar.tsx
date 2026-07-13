import type { ChainedCommands, Editor } from '@tiptap/core'
import type { Selection, SelectionBookmark } from '@tiptap/pm/state'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'

import type { ToolbarMode } from '../platform/contracts'
import { useOverlaySurface } from './overlays'

type InlineMark = 'bold' | 'italic' | 'strike' | 'code'
type MarkState = 'off' | 'mixed' | 'on'

export function WritingToolbar({
  editor,
  mode,
  onOpenLink,
}: {
  readonly editor: Editor
  readonly mode: ToolbarMode
  readonly onOpenLink: (selection: Selection) => void
}) {
  const bookmark = useRef<SelectionBookmark>(editor.state.selection.getBookmark())
  const [expanded, setExpanded] = useState(mode === 'regular')
  const [headingOpen, setHeadingOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const [revision, setRevision] = useState(0)
  const headingTrigger = useRef<HTMLButtonElement>(null)
  const moreTrigger = useRef<HTMLButtonElement>(null)
  const toolbar = useRef<HTMLDivElement>(null)

  const closeHeading = useCallback(() => {
    setHeadingOpen(false)
    requestAnimationFrame(() => headingTrigger.current?.focus())
  }, [])
  const closeMore = useCallback(() => {
    setMoreOpen(false)
    requestAnimationFrame(() => moreTrigger.current?.focus())
  }, [])
  useOverlaySurface('toolbar-heading', headingOpen, false, closeHeading)
  useOverlaySurface('toolbar-more', moreOpen, false, closeMore)

  useEffect(() => {
    setExpanded(mode === 'regular')
    setHeadingOpen(false)
    setMoreOpen(false)
  }, [editor, mode])

  useEffect(() => {
    const updateSelection = () => {
      bookmark.current = editor.state.selection.getBookmark()
      setRevision((value) => value + 1)
    }
    const mapBookmark = ({ transaction }: { transaction: import('@tiptap/pm/state').Transaction }) => {
      bookmark.current = bookmark.current.map(transaction.mapping)
      setRevision((value) => value + 1)
    }
    editor.on('selectionUpdate', updateSelection)
    editor.on('transaction', mapBookmark)
    return () => {
      editor.off('selectionUpdate', updateSelection)
      editor.off('transaction', mapBookmark)
    }
  }, [editor])

  useEffect(() => {
    if (!headingOpen && !moreOpen) return
    const closeMenus = () => { setHeadingOpen(false); setMoreOpen(false) }
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && toolbar.current?.contains(event.target)) return
      closeMenus()
    }
    const pane = toolbar.current?.closest('.document-workspace')?.querySelector('.document-surface')
    window.addEventListener('pointerdown', outside, true)
    pane?.addEventListener('scroll', closeMenus, { passive: true })
    return () => {
      window.removeEventListener('pointerdown', outside, true)
      pane?.removeEventListener('scroll', closeMenus)
    }
  }, [headingOpen, moreOpen])

  const selection = useMemo(() => {
    void revision
    return resolveBookmark(editor, bookmark.current)
  }, [editor, revision])
  const summary = toolbarSummary(selection)
  const markStates = useMemo(() => ({
    bold: markState(selection, 'bold'),
    code: markState(selection, 'code'),
    italic: markState(selection, 'italic'),
    strike: markState(selection, 'strike'),
  }), [selection])
  const availability = useMemo(() => ({
    blockquote: canAt(editor, selection, (chain) => chain.toggleBlockquote()),
    bold: canAt(editor, selection, (chain) => chain.setMark('bold')),
    bulletList: canAt(editor, selection, (chain) => chain.toggleBulletList()),
    code: canAt(editor, selection, (chain) => chain.setMark('code')),
    heading: canAt(editor, selection, (chain) => chain.setHeading({ level: 1 })),
    italic: canAt(editor, selection, (chain) => chain.setMark('italic')),
    link: canAt(editor, selection, (chain) => chain.setLink({ href: 'https://example.com' })),
    orderedList: canAt(editor, selection, (chain) => chain.toggleOrderedList()),
    strike: canAt(editor, selection, (chain) => chain.setMark('strike')),
    taskList: canAt(editor, selection, (chain) => chain.toggleTaskList()),
  }), [editor, selection])

  const withSelection = useCallback((operation: (chain: ReturnType<Editor['chain']>) => ReturnType<Editor['chain']>) => {
    const current = resolveBookmark(editor, bookmark.current)
    const chain = editor.chain().setTextSelection({ from: current.from, to: current.to })
    operation(chain).focus().run()
  }, [editor])

  const toggleMark = useCallback((mark: InlineMark) => {
    const state = markState(resolveBookmark(editor, bookmark.current), mark)
    withSelection((chain) => state === 'on' ? chain.unsetMark(mark) : chain.setMark(mark))
  }, [editor, withSelection])

  const runBlock = useCallback((kind: 'blockquote' | 'bulletList' | 'orderedList' | 'taskList') => {
    withSelection((chain) => {
      if (kind === 'blockquote') return chain.toggleBlockquote()
      if (kind === 'bulletList') return chain.toggleBulletList()
      if (kind === 'orderedList') return chain.toggleOrderedList()
      return chain.toggleTaskList()
    })
    setMoreOpen(false)
  }, [withSelection])

  const runHeading = useCallback((level: 0 | 1 | 2 | 3 | 4) => {
    withSelection((chain) => level === 0 ? chain.setParagraph() : chain.setHeading({ level }))
    setHeadingOpen(false)
  }, [withSelection])

  const openLink = useCallback(() => {
    const current = resolveBookmark(editor, bookmark.current)
    onOpenLink(current)
    setMoreOpen(false)
  }, [editor, onOpenLink])

  if (mode === 'minimal' && !expanded) {
    return (
      <div className="formatting-toolbar formatting-toolbar-minimal" data-testid="formatting-toolbar">
        <button
          aria-label={`Formatting: ${summary}`}
          className="toolbar-summary"
          data-testid="toolbar-summary"
          onClick={() => setExpanded(true)}
          type="button"
        >{summary}</button>
      </div>
    )
  }

  return (
    <div
      aria-label="Formatting"
      className="formatting-toolbar"
      data-testid="formatting-toolbar"
      onKeyDown={handleToolbarKeys}
      role="toolbar"
      ref={toolbar}
    >
      <button aria-description={!availability.bold ? 'Bold is unavailable at this selection.' : undefined} aria-label="Bold" aria-pressed={markStateValue(markStates.bold)} data-testid="format-bold" disabled={!availability.bold} onClick={() => toggleMark('bold')} type="button">Bold</button>
      <button aria-description={!availability.italic ? 'Italic is unavailable at this selection.' : undefined} aria-label="Italic" aria-pressed={markStateValue(markStates.italic)} data-testid="format-italic" disabled={!availability.italic} onClick={() => toggleMark('italic')} type="button">Italic</button>
      <div className="toolbar-popup-owner">
        <button
          aria-expanded={headingOpen}
          aria-haspopup="menu"
          aria-label="Heading"
          aria-description={!availability.heading ? 'Heading is unavailable at this selection.' : undefined}
          data-testid="toolbar-heading"
          disabled={!availability.heading}
          onClick={() => { setHeadingOpen((value) => !value); setMoreOpen(false) }}
          ref={headingTrigger}
          type="button"
        >{summary.startsWith('H') ? summary.split(' · ')[0] : 'Text'}</button>
        {headingOpen ? (
          <div aria-label="Heading level" className="toolbar-menu" data-testid="heading-menu" role="menu">
            <button aria-checked={summary.startsWith('Paragraph')} data-testid="heading-paragraph" onClick={() => runHeading(0)} role="menuitemradio" type="button">Paragraph</button>
            <button aria-checked={summary.startsWith('H1')} data-testid="heading-1" onClick={() => runHeading(1)} role="menuitemradio" type="button">Heading 1</button>
            <button aria-checked={summary.startsWith('H2')} data-testid="heading-2" onClick={() => runHeading(2)} role="menuitemradio" type="button">Heading 2</button>
            <button aria-checked={summary.startsWith('H3')} data-testid="heading-3" onClick={() => runHeading(3)} role="menuitemradio" type="button">Heading 3</button>
            <button aria-checked={summary.startsWith('H4')} data-testid="heading-4" onClick={() => runHeading(4)} role="menuitemradio" type="button">Heading 4</button>
          </div>
        ) : null}
      </div>
      <div className="toolbar-popup-owner">
        <button
          aria-expanded={moreOpen}
          aria-haspopup="menu"
          aria-label="More formatting"
          data-testid="toolbar-more"
          onClick={() => { setMoreOpen((value) => !value); setHeadingOpen(false) }}
          ref={moreTrigger}
          type="button"
        >•••</button>
        {moreOpen ? (
          <div aria-label="More formatting" className="toolbar-menu toolbar-menu-more" data-testid="toolbar-more-menu" role="menu">
            <button aria-checked={markStateValue(markStates.strike)} aria-description={!availability.strike ? 'Strikethrough is unavailable at this selection.' : undefined} data-testid="format-strike" disabled={!availability.strike} onClick={() => toggleMark('strike')} role="menuitemcheckbox" type="button">Strikethrough</button>
            <button aria-checked={markStateValue(markStates.code)} aria-description={!availability.code ? 'Inline code is unavailable at this selection.' : undefined} data-testid="format-code" disabled={!availability.code} onClick={() => toggleMark('code')} role="menuitemcheckbox" type="button">Inline code</button>
            <button aria-description={!availability.bulletList ? 'Bullet list is unavailable at this selection.' : undefined} data-testid="format-bullet-list" disabled={!availability.bulletList} onClick={() => runBlock('bulletList')} role="menuitem" type="button">Bullet list</button>
            <button aria-description={!availability.orderedList ? 'Ordered list is unavailable at this selection.' : undefined} data-testid="format-ordered-list" disabled={!availability.orderedList} onClick={() => runBlock('orderedList')} role="menuitem" type="button">Ordered list</button>
            <button aria-description={!availability.taskList ? 'Task list is unavailable at this selection.' : undefined} data-testid="format-task-list" disabled={!availability.taskList} onClick={() => runBlock('taskList')} role="menuitem" type="button">Task list</button>
            <button aria-description={!availability.blockquote ? 'Blockquote is unavailable at this selection.' : undefined} data-testid="format-blockquote" disabled={!availability.blockquote} onClick={() => runBlock('blockquote')} role="menuitem" type="button">Blockquote</button>
            <button aria-description={!availability.link ? 'Link is unavailable at this selection.' : undefined} data-testid="format-link" disabled={!availability.link} onClick={openLink} role="menuitem" type="button">Link</button>
          </div>
        ) : null}
      </div>
      {mode === 'minimal' ? (
        <button aria-label="Collapse formatting toolbar" data-testid="toolbar-collapse" onClick={() => setExpanded(false)} type="button">−</button>
      ) : null}
    </div>
  )
}

const markStateValue = (state: MarkState): boolean | 'mixed' => state === 'mixed' ? 'mixed' : state === 'on'

function canAt(editor: Editor, selection: Selection, operation: (chain: ChainedCommands) => ChainedCommands): boolean {
  const chain = editor.can().chain().setTextSelection({ from: selection.from, to: selection.to })
  return operation(chain).run()
}

function resolveBookmark(editor: Editor, bookmark: SelectionBookmark): Selection {
  try {
    return bookmark.resolve(editor.state.doc)
  } catch {
    return editor.state.selection
  }
}

function markState(selection: Selection, markName: string): MarkState {
  const mark = selection.$from.doc.type.schema.marks[markName]
  if (!mark) return 'off'
  if (selection.empty) return mark.isInSet(selection.$from.marks()) ? 'on' : 'off'
  let marked = 0
  let unmarked = 0
  selection.$from.doc.nodesBetween(selection.from, selection.to, (node, position) => {
    if (!node.isText) return
    const overlap = Math.max(0, Math.min(position + node.nodeSize, selection.to) - Math.max(position, selection.from))
    if (overlap === 0) return
    if (mark.isInSet(node.marks)) marked += overlap
    else unmarked += overlap
  })
  return marked > 0 && unmarked > 0 ? 'mixed' : marked > 0 ? 'on' : 'off'
}

function toolbarSummary(selection: Selection): string {
  const blocks = new Set<string>()
  const size = selection.$from.doc.content.size
  const from = Math.min(selection.from, size)
  const to = Math.min(size, Math.max(selection.to, from < size ? from + 1 : from))
  if (to > from) selection.$from.doc.nodesBetween(from, to, (node) => {
    if (node.isTextblock) blocks.add(node.type.name === 'heading' ? `H${String(node.attrs.level)}` : blockLabel(node.type.name))
  })
  if (blocks.size === 0) blocks.add(selection.$from.parent.type.name === 'heading' ? `H${String(selection.$from.parent.attrs.level)}` : blockLabel(selection.$from.parent.type.name))
  const block = blocks.size === 1 ? [...blocks][0] ?? 'Paragraph' : 'Mixed'
  const contexts = ancestorContext(selection)
  const marks = (['bold', 'italic', 'strike', 'code'] as const)
    .filter((mark) => markState(selection, mark) !== 'off')
    .map((mark) => markState(selection, mark) === 'mixed' ? `Mixed ${mark}` : markLabel(mark))
  return [block, ...contexts, ...marks].join(' · ')
}

function ancestorContext(selection: Selection): string[] {
  const labels: string[] = []
  for (let depth = 1; depth <= selection.$from.depth; depth += 1) {
    const name = selection.$from.node(depth).type.name
    if (name === 'bulletList') labels.push('Bullet list')
    if (name === 'orderedList') labels.push('Ordered list')
    if (name === 'taskList') labels.push('Task list')
    if (name === 'blockquote') labels.push('Blockquote')
  }
  return labels
}

const blockLabel = (name: string): string => name === 'codeBlock' ? 'Code block' : name === 'paragraph' ? 'Paragraph' : name
const markLabel = (name: InlineMark): string => name === 'code' ? 'Inline code' : name[0]?.toUpperCase() + name.slice(1)

function handleToolbarKeys(event: KeyboardEvent<HTMLDivElement>): void {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return
  const buttons = [...event.currentTarget.querySelectorAll<HTMLButtonElement>(':scope > button, :scope > .toolbar-popup-owner > button')]
    .filter((button) => !button.disabled)
  if (buttons.length === 0) return
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement)
  const next = event.key === 'Home'
    ? buttons[0]
    : event.key === 'End'
      ? buttons.at(-1)
      : buttons[(index + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length]
  if (!next) return
  event.preventDefault()
  next.focus()
}
