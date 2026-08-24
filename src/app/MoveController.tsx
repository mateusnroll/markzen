import type { Editor } from '@tiptap/core'
import type { SelectionBookmark, Transaction } from '@tiptap/pm/state'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

import {
  applyStructuralMove,
  createStructuralMovePlan,
  imageMoveGapAtPosition,
  structuralMoveSourceDescription,
  type StructuralMoveKind,
  type StructuralMovePlan,
} from '../documents/reordering'
import { useOverlaySurface } from './overlays'
import { IMAGE_RUNTIME_TRANSACTION_META } from './ImageActions'

export type MoveControllerHandle = {
  readonly start: (kind: StructuralMoveKind) => void
  readonly startPointer: (kind: StructuralMoveKind, event: React.PointerEvent<HTMLButtonElement>) => void
}

type Session = {
  readonly bookmark: SelectionBookmark
  readonly direct: boolean
  readonly plan: StructuralMovePlan
  readonly validPointerTarget: boolean
  readonly gap: number
}

type PendingPointer = {
  active: boolean
  readonly bookmark: SelectionBookmark
  readonly element: HTMLButtonElement
  readonly plan: StructuralMovePlan
  readonly pointerId: number
  readonly startX: number
  readonly startY: number
}

const DRAG_THRESHOLD = 4

export const MoveController = forwardRef<MoveControllerHandle, {
  readonly editor: Editor
  readonly onAnnouncement: (message: string) => void
  readonly onBeforeCommit: () => void
}>(function MoveController({ editor, onAnnouncement, onBeforeCommit }, forwardedRef) {
  const [session, setSession] = useState<Session>()
  const sessionRef = useRef(session)
  sessionRef.current = session
  const pendingPointer = useRef<PendingPointer | undefined>(undefined)
  const controller = useRef<HTMLDivElement>(null)

  const clearIndicators = useCallback(() => {
    if (editor.isDestroyed) return
    for (const element of editor.view.dom.querySelectorAll<HTMLElement>('[data-move-source], [data-move-target]')) {
      element.removeAttribute('data-move-source')
      element.removeAttribute('data-move-target')
    }
  }, [editor])

  const restore = useCallback((current: Session) => {
    if (editor.isDestroyed) return
    try {
      const selection = current.bookmark.resolve(editor.state.doc)
      editor.view.dispatch(editor.state.tr.setSelection(selection).setMeta('addToHistory', false))
      editor.commands.focus()
    } catch {
      editor.commands.focus()
    }
  }, [editor])

  const close = useCallback((outcome: 'cancelled' | 'invalid' | 'no-op', restoreFocus = true) => {
    const current = sessionRef.current
    pendingPointer.current = undefined
    clearIndicators()
    setSession(undefined)
    sessionRef.current = undefined
    if (!current) return
    if (restoreFocus) requestAnimationFrame(() => restore(current))
    const source = structuralMoveSourceDescription(current.plan)
    onAnnouncement(outcome === 'invalid' ? `Move ${source} cancelled because the document changed.` : outcome === 'no-op' ? `${source} stayed in its current position.` : `Move ${source} cancelled.`)
  }, [clearIndicators, onAnnouncement, restore])
  useOverlaySurface('structural-move', Boolean(session), false, () => close('cancelled'))

  const mark = useCallback((current: Session) => {
    if (editor.isDestroyed) return
    clearIndicators()
    const { plan } = current
    if (plan.kind === 'image') {
      const image = imageElement(editor, plan)
      image?.setAttribute('data-move-source', '')
      const target = imageTargetElement(editor, plan, current.gap)
      target?.setAttribute('data-move-target', '')
      return
    }
    const table = tableElement(editor, plan.tablePosition)
    if (!table) return
    if (plan.kind === 'row') {
      const rows = [...table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr, :scope > tr')]
      rows[plan.sourceRow]?.setAttribute('data-move-source', '')
      const remaining = rows.slice(1).filter((_, index) => index !== plan.sourceRow - 1)
      const target = remaining[current.gap] ?? remaining.at(-1)
      target?.setAttribute('data-move-target', current.gap >= remaining.length ? 'after' : 'before')
      return
    }
    const rows = [...table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr, :scope > tr')]
    for (const row of rows) row.children.item(plan.sourceColumn)?.setAttribute('data-move-source', '')
    const headerCells = rows[0] ? [...rows[0].children] as HTMLElement[] : []
    const remaining = headerCells.filter((_, index) => index !== plan.sourceColumn)
    const target = remaining[current.gap] ?? remaining.at(-1)
    const targetColumn = target ? headerCells.indexOf(target) : -1
    for (const row of rows) row.children.item(targetColumn)?.setAttribute('data-move-target', current.gap >= remaining.length ? 'after' : 'before')
  }, [clearIndicators, editor])

  const updateSession = useCallback((current: Session) => {
    sessionRef.current = current
    setSession(current)
    requestAnimationFrame(() => { if (!editor.isDestroyed) mark(current) })
    const source = structuralMoveSourceDescription(current.plan)
    const target = current.plan.gaps[current.gap]?.label ?? 'No legal position'
    onAnnouncement(`Moving ${source}. Candidate: ${target}.`)
  }, [mark, onAnnouncement])

  const start = useCallback((kind: StructuralMoveKind) => {
    const plan = createStructuralMovePlan(editor.state, kind)
    if (!plan) {
      onAnnouncement(`This ${kind} has no alternative position.`)
      return
    }
    const current: Session = {
      bookmark: editor.state.selection.getBookmark(),
      direct: false,
      gap: plan.currentGap,
      plan,
      validPointerTarget: true,
    }
    updateSession(current)
    requestAnimationFrame(() => { if (!editor.isDestroyed) controller.current?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus() })
  }, [editor, onAnnouncement, updateSession])

  const startPointer = useCallback((kind: StructuralMoveKind, event: React.PointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0 || event.pointerType === 'touch') return
    const plan = createStructuralMovePlan(editor.state, kind)
    if (!plan) return
    event.preventDefault()
    try { event.currentTarget.setPointerCapture(event.pointerId) } catch { /* Synthetic test pointers may not be capturable. */ }
    pendingPointer.current = {
      active: false,
      bookmark: editor.state.selection.getBookmark(),
      element: event.currentTarget,
      plan,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
    }
  }, [editor])

  useImperativeHandle(forwardedRef, () => ({ start, startPointer }), [start, startPointer])

  const place = useCallback(() => {
    const current = sessionRef.current
    if (!current) return
    const transaction = applyStructuralMove(editor.state, current.plan, current.gap)
    if (!transaction) { close('no-op'); return }
    clearIndicators()
    setSession(undefined)
    sessionRef.current = undefined
    pendingPointer.current = undefined
    onBeforeCommit()
    transaction.setMeta('structuralMove', true)
    editor.view.dispatch(transaction)
    editor.commands.focus()
    onAnnouncement(`Moved ${structuralMoveSourceDescription(current.plan)} to ${current.plan.gaps[current.gap]?.label ?? 'the selected position'}.`)
  }, [clearIndicators, close, editor, onAnnouncement, onBeforeCommit])

  const choose = useCallback((gap: number) => {
    const current = sessionRef.current
    if (!current || gap < 0 || gap >= current.plan.gaps.length) return
    updateSession({ ...current, gap, validPointerTarget: true })
  }, [updateSession])

  useEffect(() => {
    const transaction = ({ transaction }: { transaction: Transaction }) => {
      const current = sessionRef.current
      if (!current || transaction.getMeta('structuralMove') === true || !transaction.docChanged) return
      if (transaction.getMeta(IMAGE_RUNTIME_TRANSACTION_META) === true) {
        if (current.plan.kind !== 'image') {
          const next = { ...current, plan: { ...current.plan, document: transaction.doc } }
          sessionRef.current = next
          setSession(next)
        }
        return
      }
      close('invalid')
    }
    const selection = () => {
      const current = sessionRef.current
      if (!current || current.plan.kind !== 'image' || current.direct) return
      const gap = imageMoveGapAtPosition(editor.state, current.plan, editor.state.selection.from)
      if (gap !== undefined && gap !== current.gap) choose(gap)
    }
    editor.on('transaction', transaction)
    editor.on('selectionUpdate', selection)
    return () => {
      editor.off('transaction', transaction)
      editor.off('selectionUpdate', selection)
    }
  }, [choose, close, editor])

  useEffect(() => {
    const pointerMove = (event: PointerEvent) => {
      const pending = pendingPointer.current
      if (!pending || event.pointerId !== pending.pointerId) return
      if (!pending.active && Math.hypot(event.clientX - pending.startX, event.clientY - pending.startY) < DRAG_THRESHOLD) return
      if (!pending.active) {
        pending.active = true
        updateSession({ bookmark: pending.bookmark, direct: true, gap: pending.plan.currentGap, plan: pending.plan, validPointerTarget: false })
      }
      const current = sessionRef.current
      if (!current) return
      const gap = pointerGap(editor, current.plan, event.clientX, event.clientY)
      updateSession({ ...current, ...(gap === undefined ? {} : { gap }), validPointerTarget: gap !== undefined })
      if (gap !== undefined) autoScroll(editor.view.dom, event.clientY)
    }
    const pointerUp = (event: PointerEvent) => {
      const pending = pendingPointer.current
      if (!pending || event.pointerId !== pending.pointerId) return
      pendingPointer.current = undefined
      try { pending.element.releasePointerCapture(event.pointerId) } catch { /* The browser may already have released capture. */ }
      const current = sessionRef.current
      if (!pending.active || !current) return
      if (current.validPointerTarget) place()
      else close('cancelled')
    }
    const pointerCancel = (event: PointerEvent) => {
      if (pendingPointer.current?.pointerId !== event.pointerId) return
      pendingPointer.current = undefined
      close('cancelled')
    }
    const blur = () => close('cancelled', false)
    window.addEventListener('pointermove', pointerMove)
    window.addEventListener('pointerup', pointerUp)
    window.addEventListener('pointercancel', pointerCancel)
    window.addEventListener('lostpointercapture', pointerCancel)
    window.addEventListener('blur', blur)
    return () => {
      window.removeEventListener('pointermove', pointerMove)
      window.removeEventListener('pointerup', pointerUp)
      window.removeEventListener('pointercancel', pointerCancel)
      window.removeEventListener('lostpointercapture', pointerCancel)
      window.removeEventListener('blur', blur)
    }
  }, [close, editor, place, updateSession])

  useEffect(() => {
    if (!session) return
    const preventInput = (event: Event) => event.preventDefault()
    const preventEditingKeys = (event: KeyboardEvent) => {
      if (event.key === 'Escape') return
      if (event.key.length === 1 || ['Backspace', 'Delete', 'Enter'].includes(event.key)) event.preventDefault()
    }
    editor.view.dom.addEventListener('beforeinput', preventInput)
    editor.view.dom.addEventListener('keydown', preventEditingKeys)
    return () => {
      editor.view.dom.removeEventListener('beforeinput', preventInput)
      editor.view.dom.removeEventListener('keydown', preventEditingKeys)
    }
  }, [editor, session])

  useEffect(() => () => {
    const current = sessionRef.current
    pendingPointer.current = undefined
    clearIndicators()
    if (current) onAnnouncement(`Move ${structuralMoveSourceDescription(current.plan)} cancelled because the tab changed.`)
  }, [clearIndicators, onAnnouncement])

  if (!session) return null
  const target = session.plan.gaps[session.gap]
  return (
    <div aria-label="Move content" className="move-controller" data-testid="move-controller" ref={controller} role="toolbar">
      <p data-testid="move-description">Move {structuralMoveSourceDescription(session.plan)}. Choose an insertion position, then Place Here.</p>
      <p data-testid="move-status">Candidate: {target?.label ?? 'No legal position'}.</p>
      <div className="move-controls">
        <button data-testid="move-first" disabled={session.gap === 0} onClick={() => choose(0)} type="button">First</button>
        <button data-testid="move-previous" disabled={session.gap === 0} onClick={() => choose(session.gap - 1)} type="button">Previous</button>
        <button data-testid="move-next" disabled={session.gap === session.plan.gaps.length - 1} onClick={() => choose(session.gap + 1)} type="button">Next</button>
        <button data-testid="move-last" disabled={session.gap === session.plan.gaps.length - 1} onClick={() => choose(session.plan.gaps.length - 1)} type="button">Last</button>
        <button data-testid="move-place" onClick={place} type="button">Place Here</button>
        <button data-testid="move-cancel" onClick={() => close('cancelled')} type="button">Cancel</button>
      </div>
    </div>
  )
})

function tableElement(editor: Editor, position: number): HTMLTableElement | undefined {
  const dom = editor.view.nodeDOM(position)
  if (!(dom instanceof Element)) return undefined
  return (dom.matches('table') ? dom : dom.querySelector('table')) as HTMLTableElement | null ?? undefined
}

function imageElement(editor: Editor, plan: StructuralMovePlan): HTMLElement | undefined {
  if (plan.kind !== 'image') return undefined
  let found: HTMLElement | undefined
  for (const element of editor.view.dom.querySelectorAll<HTMLElement>('[data-markzen-image]')) {
    const position = editor.view.posAtDOM(element, 0)
    const node = editor.state.doc.nodeAt(position)
    if (node?.attrs.assetId === plan.assetId && node.attrs.src === plan.source) { found = element; break }
  }
  return found
}

function imageTargetElement(editor: Editor, plan: StructuralMovePlan, gapIndex: number): HTMLElement | undefined {
  if (plan.kind !== 'image') return undefined
  const gap = plan.gaps[gapIndex]
  if (!gap) return undefined
  const source = imageElement(editor, plan)
  const sourcePosition = source ? editor.view.posAtDOM(source, 0) : plan.sourcePosition
  const removal = editor.state.tr.delete(sourcePosition, sourcePosition + 1)
  const position = removal.mapping.invert().map(gap.position, 1)
  const dom = editor.view.domAtPos(Math.min(position, editor.state.doc.content.size)).node
  const element = dom instanceof Element ? dom : dom.parentElement
  return element?.closest<HTMLElement>('p, h1, h2, h3, h4, h5, h6, td, th') ?? undefined
}

function pointerGap(editor: Editor, plan: StructuralMovePlan, x: number, y: number): number | undefined {
  if (plan.kind === 'image') {
    const position = editor.view.posAtCoords({ left: x, top: y })?.pos
    return position === undefined ? undefined : imageMoveGapAtPosition(editor.state, plan, position)
  }
  const table = tableElement(editor, plan.tablePosition)
  const target = document.elementFromPoint(x, y)
  if (!table || !(target instanceof Element) || !table.contains(target)) return undefined
  if (plan.kind === 'row') {
    const row = target.closest<HTMLTableRowElement>('tr')
    const rows = [...table.querySelectorAll<HTMLTableRowElement>(':scope > tbody > tr, :scope > tr')]
    const rowIndex = row ? rows.indexOf(row) : -1
    if (!row || rowIndex < 0) return undefined
    const dataIndex = Math.max(0, rowIndex - 1)
    const boundary = rowIndex === 0 || y < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2 ? dataIndex : dataIndex + 1
    return clamp(boundary <= plan.sourceRow - 1 ? boundary : boundary - 1, 0, plan.gaps.length - 1)
  }
  const cell = target.closest<HTMLTableCellElement>('th,td')
  if (!cell) return undefined
  const index = cell.cellIndex
  const rectangle = cell.getBoundingClientRect()
  const rtl = getComputedStyle(table).direction === 'rtl'
  const before = rtl ? x > rectangle.left + rectangle.width / 2 : x < rectangle.left + rectangle.width / 2
  const boundary = index + (before ? 0 : 1)
  return clamp(boundary <= plan.sourceColumn ? boundary : boundary - 1, 0, plan.gaps.length - 1)
}

function autoScroll(editor: HTMLElement, pointerY: number): void {
  const scroll = editor.closest<HTMLElement>('.document-surface') ?? editor.parentElement
  if (!scroll) return
  const rectangle = scroll.getBoundingClientRect()
  const edge = 32
  if (pointerY < rectangle.top + edge) scroll.scrollBy({ top: -24 })
  else if (pointerY > rectangle.bottom - edge) scroll.scrollBy({ top: 24 })
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}
