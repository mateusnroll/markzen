import { getMarkRange, type Editor } from '@tiptap/core'
import { TextSelection, type Selection, type SelectionBookmark, type Transaction } from '@tiptap/pm/state'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, type CSSProperties, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react'

import type { ExternalOpenResult } from '../platform/contracts'
import { useOverlaySurface } from './overlays'

export type LinkActionsHandle = { openEditor(selection?: Selection): void }

type LinkSurface = {
  readonly anchor?: HTMLElement
  bookmark: SelectionBookmark
  href: string
  readonly kind: 'actions' | 'editor'
}

export const LinkActions = forwardRef<LinkActionsHandle, {
  readonly editor: Editor
  readonly onAnnouncement: (message: string) => void
  readonly onIssue: (message: string) => void
  readonly onOpenExternal: (destination: string) => Promise<ExternalOpenResult>
}>(function LinkActions({ editor, onAnnouncement, onIssue, onOpenExternal }, ref) {
  const [surface, setSurface] = useState<LinkSurface>()
  const [destination, setDestination] = useState('')
  const [position, setPosition] = useState<CSSProperties>({})
  const popover = useRef<HTMLDivElement>(null)
  const surfaceRef = useRef<LinkSurface | undefined>(undefined)
  const openTimer = useRef<number | undefined>(undefined)
  const closeTimer = useRef<number | undefined>(undefined)
  const followMode = useRef(false)
  const mounted = useRef(true)

  surfaceRef.current = surface
  const close = useCallback(() => {
    if (openTimer.current) window.clearTimeout(openTimer.current)
    if (closeTimer.current) window.clearTimeout(closeTimer.current)
    const current = surfaceRef.current
    setSurface(undefined)
    if (!current) return
    requestAnimationFrame(() => {
      if (editor.isDestroyed) return
      const selection = resolve(current.bookmark, editor)
      editor.chain().setTextSelection({ from: selection.from, to: selection.to }).focus().run()
    })
  }, [editor])
  useOverlaySurface('link-surface', Boolean(surface), false, close)

  useEffect(() => {
    mounted.current = true
    return () => {
      mounted.current = false
      if (openTimer.current) window.clearTimeout(openTimer.current)
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
    }
  }, [])

  const showActions = useCallback((anchor: HTMLElement) => {
    const href = anchor.dataset.href ?? ''
    const range = linkRange(editor, editor.view.posAtDOM(anchor, 0))
    if (!range) return
    setSurface({ anchor, bookmark: TextSelection.create(editor.state.doc, range.from, range.to).getBookmark(), href, kind: 'actions' })
    setPosition(positionFor(anchor))
  }, [editor])

  const openEditor = useCallback((requested = editor.state.selection) => {
    const range = editableRange(editor, requested)
    const href = linkHrefAt(editor, range.from) ?? ''
    setDestination(href)
    setSurface({ bookmark: TextSelection.create(editor.state.doc, range.from, range.to).getBookmark(), href, kind: 'editor' })
    setPosition({ left: '50%', top: 64, transform: 'translateX(-50%)' })
  }, [editor])
  useImperativeHandle(ref, () => ({ openEditor }), [openEditor])

  const requestOpen = useCallback(async (href: string) => {
    const result = await onOpenExternal(href)
    if (!mounted.current) return
    if (result.kind === 'unsupported') onIssue('This destination cannot be opened by Markzen.')
    if (result.kind === 'error') onIssue('The system handler could not open this destination.')
    close()
  }, [close, onIssue, onOpenExternal])

  useEffect(() => {
    const dom = editor.view.dom
    const linkFrom = (target: EventTarget | null): HTMLElement | undefined =>
      target instanceof Element ? target.closest<HTMLElement>('[data-markzen-link]') ?? undefined : undefined
    const onFocusIn = (event: FocusEvent) => {
      const link = linkFrom(event.target)
      if (link) showActions(link)
    }
    const onPointerOver = (event: globalThis.PointerEvent) => {
      const link = linkFrom(event.target)
      if (!link) return
      if (closeTimer.current) window.clearTimeout(closeTimer.current)
      openTimer.current = window.setTimeout(() => showActions(link), 300)
    }
    const onPointerOut = (event: globalThis.PointerEvent) => {
      const link = linkFrom(event.target)
      if (!link || (event.relatedTarget instanceof Node && popover.current?.contains(event.relatedTarget))) return
      closeTimer.current = window.setTimeout(close, 150)
    }
    const onClick = (event: MouseEvent) => {
      const link = linkFrom(event.target)
      if (!link) return
      if (event.button !== 0 || event.metaKey || event.ctrlKey) {
        event.preventDefault()
        if (event.button === 0 && (event.metaKey || event.ctrlKey)) void requestOpen(link.dataset.href ?? '')
      }
    }
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && !followMode.current) {
        followMode.current = true
        dom.dataset.followLinks = 'true'
        onAnnouncement('Links can be opened with the platform modifier.')
      }
      const link = linkFrom(event.target)
      if (link && event.key === 'Enter') {
        event.preventDefault()
        void requestOpen(link.dataset.href ?? '')
      } else if (link && event.key === ' ') {
        event.preventDefault()
        showActions(link)
      } else if (modifier && event.key === 'Enter') {
        const href = linkHrefAt(editor, editor.state.selection.from)
        if (href) { event.preventDefault(); void requestOpen(href) }
      } else if (modifier && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        openEditor()
      }
    }
    const clearFollow = () => {
      followMode.current = false
      delete dom.dataset.followLinks
    }
    dom.addEventListener('focusin', onFocusIn, true)
    dom.addEventListener('pointerover', onPointerOver)
    dom.addEventListener('pointerout', onPointerOut)
    dom.addEventListener('click', onClick, true)
    dom.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', clearFollow)
    window.addEventListener('blur', clearFollow)
    return () => {
      dom.removeEventListener('focusin', onFocusIn, true)
      dom.removeEventListener('pointerover', onPointerOver)
      dom.removeEventListener('pointerout', onPointerOut)
      dom.removeEventListener('click', onClick, true)
      dom.removeEventListener('keydown', onKeyDown, true)
      window.removeEventListener('keyup', clearFollow)
      window.removeEventListener('blur', clearFollow)
    }
  }, [close, editor, onAnnouncement, openEditor, requestOpen, showActions])

  useEffect(() => {
    if (!surface) return
    const outside = (event: globalThis.PointerEvent) => {
      if (!(event.target instanceof Node)) return
      if (popover.current?.contains(event.target) || surface.anchor?.contains(event.target)) return
      close()
    }
    window.addEventListener('pointerdown', outside, true)
    return () => window.removeEventListener('pointerdown', outside, true)
  }, [close, surface])

  useEffect(() => {
    if (!surface) return
    const map = ({ transaction }: { transaction: Transaction }) => {
      setSurface((current) => current ? { ...current, bookmark: current.bookmark.map(transaction.mapping) } : current)
      requestAnimationFrame(() => {
        if (surfaceRef.current?.anchor && !surfaceRef.current.anchor.isConnected) close()
      })
    }
    editor.on('transaction', map)
    return () => { editor.off('transaction', map) }
  }, [editor, surface?.kind])

  useEffect(() => {
    if (!surface?.anchor) return
    const reposition = () => {
      if (!surface.anchor?.isConnected) close()
      else setPosition(positionFor(surface.anchor))
    }
    const pane = editor.view.dom.closest('.document-surface')
    pane?.addEventListener('scroll', close, { passive: true })
    window.addEventListener('resize', reposition)
    return () => {
      pane?.removeEventListener('scroll', close)
      window.removeEventListener('resize', reposition)
    }
  }, [close, editor, surface])

  if (!surface) return null

  const keepOpen = () => { if (closeTimer.current) window.clearTimeout(closeTimer.current) }
  const scheduleClose = (event: ReactPointerEvent) => {
    if (event.relatedTarget instanceof Node && surface.anchor?.contains(event.relatedTarget)) return
    closeTimer.current = window.setTimeout(close, 150)
  }

  if (surface.kind === 'editor') {
    const apply = (event: FormEvent) => {
      event.preventDefault()
      const href = destination.trim()
      if (!href) return
      const selection = resolve(surface.bookmark, editor)
      const chain = editor.chain().setTextSelection({ from: selection.from, to: selection.to })
      if (selection.empty) chain.insertContent({ type: 'text', text: href, marks: [{ type: 'link', attrs: { href } }] })
      else chain.setLink({ href })
      chain.focus().run()
      close()
    }
    return (
      <div className="link-surface link-editor" data-testid="link-editor" ref={popover} style={position}>
        <form onSubmit={apply}>
          <label htmlFor="link-destination">Destination</label>
          <input autoFocus data-testid="link-destination" id="link-destination" onChange={(event) => setDestination(event.currentTarget.value)} value={destination} />
          <button aria-describedby={!destination.trim() ? 'link-destination-error' : undefined} data-testid="link-apply" disabled={!destination.trim()} type="submit">Apply</button>
          <button data-testid="link-cancel" onClick={close} type="button">Cancel</button>
          {!destination.trim() ? <span id="link-destination-error">Enter a destination before applying the link.</span> : null}
        </form>
      </div>
    )
  }

  const edit = () => {
    const selection = resolve(surface.bookmark, editor)
    editor.commands.setTextSelection({ from: selection.from, to: selection.to })
    setDestination(surface.href)
    setSurface({ bookmark: selection.getBookmark(), href: surface.href, kind: 'editor' })
  }
  const remove = () => {
    const selection = resolve(surface.bookmark, editor)
    editor.chain().setTextSelection({ from: selection.from, to: selection.to }).unsetLink().focus().run()
    close()
  }
  return (
    <div
      aria-label={`Link actions for ${surface.href}`}
      className="link-surface link-popover"
      data-testid="link-popover"
      onFocus={keepOpen}
      onPointerEnter={keepOpen}
      onPointerLeave={scheduleClose}
      ref={popover}
      role="dialog"
      style={position}
    >
      <p className="link-destination-display">{surface.href}</p>
      <button data-testid="link-open" onClick={() => { void requestOpen(surface.href) }} type="button">Open</button>
      <button data-testid="link-edit" onClick={edit} type="button">Edit</button>
      <button data-testid="link-remove" onClick={remove} type="button">Remove</button>
    </div>
  )
})

function linkRange(editor: Editor, position: number): { readonly from: number; readonly to: number } | undefined {
  const mark = editor.state.schema.marks.link
  if (!mark) return undefined
  const bounded = Math.max(0, Math.min(position, editor.state.doc.content.size))
  return getMarkRange(editor.state.doc.resolve(bounded), mark) ?? undefined
}

function linkHrefAt(editor: Editor, position: number): string | undefined {
  const range = linkRange(editor, position)
  if (!range) return undefined
  const mark = editor.state.doc.resolve(range.from).marks().find((candidate) => candidate.type.name === 'link')
    ?? editor.state.doc.nodeAt(range.from)?.marks.find((candidate) => candidate.type.name === 'link')
  return typeof mark?.attrs.href === 'string' ? mark.attrs.href : undefined
}

function editableRange(editor: Editor, selection: Selection): { readonly from: number; readonly to: number } {
  const existing = linkRange(editor, selection.from)
  if (existing) return existing
  if (!selection.empty) return { from: selection.from, to: selection.to }
  const parent = selection.$from.parent
  const offset = selection.$from.parentOffset
  const text = parent.textContent
  if (!text || /\s/.test(text[offset] ?? text[offset - 1] ?? ' ')) return { from: selection.from, to: selection.to }
  let start = offset
  let end = offset
  while (start > 0 && !/\s/.test(text[start - 1] ?? ' ')) start -= 1
  while (end < text.length && !/\s/.test(text[end] ?? ' ')) end += 1
  const parentStart = selection.$from.start()
  return { from: parentStart + start, to: parentStart + end }
}

function resolve(bookmark: SelectionBookmark, editor: Editor): Selection {
  try { return bookmark.resolve(editor.state.doc) } catch { return editor.state.selection }
}

function positionFor(anchor: HTMLElement): CSSProperties {
  const rect = anchor.getBoundingClientRect()
  return {
    left: Math.max(8, Math.min(rect.left, window.innerWidth - 320)),
    top: Math.max(8, Math.min(rect.bottom + 6, window.innerHeight - 160)),
  }
}
