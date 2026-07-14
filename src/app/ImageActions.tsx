import type { Editor } from '@tiptap/core'
import { NodeSelection, type Selection, type SelectionBookmark } from '@tiptap/pm/state'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

import type { DocumentGatewayPort } from '../documents/gateway'
import type { ImageCandidate } from '../platform/contracts'
import { useOverlaySurface } from './overlays'

export type ImageActionsHandle = {
  readonly openInsertion: (selection: Selection) => void
  readonly openSelected: () => void
}

type Surface = 'insert' | 'metadata'

export const ImageActions = forwardRef<ImageActionsHandle, {
  readonly editor: Editor
  readonly gateway: DocumentGatewayPort
  readonly tabId: string
  readonly onIssue: (message: string) => void
}>(function ImageActions({ editor, gateway, onIssue, tabId }, forwardedRef) {
  const [surface, setSurface] = useState<Surface>()
  const [candidate, setCandidate] = useState<ImageCandidate>()
  const [alt, setAlt] = useState('')
  const [title, setTitle] = useState('')
  const [decorative, setDecorative] = useState(false)
  const [selected, setSelected] = useState(false)
  const bookmark = useRef<SelectionBookmark>(editor.state.selection.getBookmark())
  const attempted = useRef(new Set<string>())
  const popover = useRef<HTMLDivElement>(null)
  const firstControl = useRef<HTMLButtonElement | HTMLInputElement>(null)

  const close = useCallback(() => {
    setSurface(undefined)
    setCandidate(undefined)
    restoreSelection(editor, bookmark.current)
  }, [editor])
  useOverlaySurface('image-actions', Boolean(surface), false, close)

  useEffect(() => {
    if (!surface) return
    requestAnimationFrame(() => firstControl.current?.focus())
    const outside = (event: PointerEvent) => {
      if (event.target instanceof Node && popover.current?.contains(event.target)) return
      close()
    }
    window.addEventListener('pointerdown', outside, true)
    return () => window.removeEventListener('pointerdown', outside, true)
  }, [close, surface])

  const openSelected = useCallback(() => {
    const selection = editor.state.selection
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return
    bookmark.current = selection.getBookmark()
    setCandidate(undefined)
    setAlt(typeof selection.node.attrs.alt === 'string' ? selection.node.attrs.alt : '')
    setTitle(typeof selection.node.attrs.title === 'string' ? selection.node.attrs.title : '')
    setDecorative(selection.node.attrs.decorative === true)
    setSurface('metadata')
  }, [editor])

  useImperativeHandle(forwardedRef, () => ({
    openInsertion(selection) {
      bookmark.current = selection.getBookmark()
      setCandidate(undefined)
      setAlt('')
      setTitle('')
      setDecorative(false)
      setSurface('insert')
    },
    openSelected,
  }), [openSelected])

  useEffect(() => {
    const update = () => {
      const selection = editor.state.selection
      setSelected(selection instanceof NodeSelection && selection.node.type.name === 'image')
    }
    const map = ({ transaction }: { transaction: import('@tiptap/pm/state').Transaction }) => {
      if (surface) bookmark.current = bookmark.current.map(transaction.mapping)
      void resolveImages(editor, gateway, tabId, attempted.current)
    }
    update()
    void resolveImages(editor, gateway, tabId, attempted.current)
    const imageError = (event: Event) => {
      const image = event.target
      if (!(image instanceof HTMLImageElement)) return
      const wrapper = image.closest<HTMLElement>('[data-markzen-image]')
      if (!wrapper) return
      const position = editor.view.posAtDOM(wrapper, 0)
      editor.commands.command(({ state, tr }) => {
        const node = state.doc.nodeAt(position)
        if (!node || node.type.name !== 'image') return false
        tr.setNodeMarkup(position, undefined, { ...node.attrs, assetUrl: null, loadState: 'broken' }).setMeta('addToHistory', false)
        return true
      })
    }
    const editorDom = editor.view.dom
    editorDom.addEventListener('error', imageError, true)
    editor.on('selectionUpdate', update)
    editor.on('transaction', map)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', map)
      editorDom.removeEventListener('error', imageError, true)
    }
  }, [editor, gateway, surface, tabId])

  const fromDisk = async () => {
    const outcome = await gateway.selectImage(tabId)
    if (outcome.kind === 'cancelled') { close(); return }
    if (outcome.kind !== 'candidate') { onIssue('The selected file is not a readable PNG, JPEG, GIF, or WebP within the image limits.'); return }
    setCandidate(outcome.candidate)
    setSurface('metadata')
  }

  const apply = async () => {
    if (!decorative && alt.trim().length === 0) return
    if (candidate) {
      const outcome = await gateway.commitImage(tabId, candidate.candidateId)
      if (outcome.kind !== 'authorized') { onIssue('The image authorization expired before insertion.'); return }
      const selection = resolveSelection(editor, bookmark.current)
      editor.chain().setTextSelection({ from: selection.from, to: selection.to }).insertContent({
        attrs: {
          alt: decorative ? '' : alt.trim(),
          assetId: candidate.candidateId,
          assetUrl: outcome.asset.url,
          decorative,
          internal: candidate.internal,
          src: outcome.asset.source,
          title: title.trim() || null,
        },
        type: 'image',
      }).focus().run()
    } else {
      const selection = resolveSelection(editor, bookmark.current)
      if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return
      editor.commands.command(({ tr }) => {
        tr.setNodeMarkup(selection.from, undefined, { ...selection.node.attrs, alt: decorative ? '' : alt.trim(), decorative, title: title.trim() || null })
        return true
      })
      editor.commands.focus()
    }
    setSurface(undefined)
    setCandidate(undefined)
  }

  const authorize = async () => {
    const selection = editor.state.selection
    if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return
    const source = typeof selection.node.attrs.src === 'string' ? selection.node.attrs.src : ''
    const outcome = await gateway.authorizeImage(tabId, source)
    if (outcome.kind === 'mismatch') { onIssue('The selected file does not match this image reference.'); return }
    if (outcome.kind !== 'authorized') return
    setAssetUrl(editor, selection.from, source, outcome.asset.url)
  }

  return (
    <>
      {selected ? (
        <div className="image-actions" data-testid="image-actions-owner">
          <button aria-label="Image Actions" data-testid="image-actions" onClick={openSelected} type="button">Image Actions</button>
          {editor.state.selection instanceof NodeSelection && !editor.state.selection.node.attrs.assetUrl ? (
            <button data-testid="image-authorize" onClick={() => void authorize()} type="button">Authorize</button>
          ) : null}
        </div>
      ) : null}
      {surface === 'insert' ? (
        <div aria-label="Insert image" className="image-popover" data-testid="image-insert-popover" ref={popover} role="dialog">
          <h2>Insert image</h2>
          <button data-testid="image-from-disk" onClick={() => void fromDisk()} ref={firstControl as React.RefObject<HTMLButtonElement>} type="button">From Disk</button>
          <button data-testid="image-insert-cancel" onClick={close} type="button">Cancel</button>
        </div>
      ) : null}
      {surface === 'metadata' ? (
        <div aria-label="Image metadata" className="image-popover" data-testid="image-metadata-popover" ref={popover} role="dialog">
          <h2>Image metadata</h2>
          <label>Alternative text<input data-testid="image-alt" disabled={decorative} onChange={(event) => setAlt(event.currentTarget.value)} ref={firstControl as React.RefObject<HTMLInputElement>} value={alt} /></label>
          <label><input checked={decorative} data-testid="image-decorative" onChange={(event) => setDecorative(event.currentTarget.checked)} type="checkbox" /> Decorative</label>
          <label>Title (optional)<input data-testid="image-title" onChange={(event) => setTitle(event.currentTarget.value)} value={title} /></label>
          {candidate && !candidate.portable ? <p role="status">This image uses an absolute path and is less portable.</p> : null}
          <button data-testid="image-apply" disabled={!decorative && alt.trim().length === 0} onClick={() => void apply()} type="button">Apply</button>
          <button data-testid="image-metadata-cancel" onClick={close} type="button">Cancel</button>
        </div>
      ) : null}
    </>
  )
})

async function resolveImages(editor: Editor, gateway: DocumentGatewayPort, tabId: string, pending: Set<string>): Promise<void> {
  const entries: Array<{ readonly position: number; readonly source: string }> = []
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== 'image' || node.attrs.assetUrl) return
    const source = typeof node.attrs.src === 'string' ? node.attrs.src : ''
    const key = `${typeof node.attrs.assetId === 'string' ? node.attrs.assetId : position}:${source}`
    if (source && !pending.has(key)) entries.push({ position, source })
  })
  for (const entry of entries) {
    const node = editor.state.doc.nodeAt(entry.position)
    const key = `${typeof node?.attrs.assetId === 'string' ? node.attrs.assetId : entry.position}:${entry.source}`
    pending.add(key)
    const outcome = await gateway.resolveImage(tabId, entry.source)
    if (outcome.kind === 'authorized') setAssetUrl(editor, entry.position, entry.source, outcome.asset.url)
  }
}

function setAssetUrl(editor: Editor, position: number, source: string, url: string): void {
  editor.commands.command(({ state, tr }) => {
    const node = state.doc.nodeAt(position)
    if (!node || node.type.name !== 'image' || node.attrs.src !== source) return false
    tr.setNodeMarkup(position, undefined, { ...node.attrs, assetUrl: url, loadState: 'loaded' }).setMeta('addToHistory', false)
    return true
  })
}

function resolveSelection(editor: Editor, bookmark: SelectionBookmark): Selection {
  try { return bookmark.resolve(editor.state.doc) } catch { return editor.state.selection }
}

function restoreSelection(editor: Editor, bookmark: SelectionBookmark): void {
  const selection = resolveSelection(editor, bookmark)
  editor.chain().setTextSelection({ from: selection.from, to: selection.to }).focus().run()
}

export function imageKeyboardHandler(editor: Editor, openSelected: () => void, event: KeyboardEvent): boolean {
  const selection = editor.state.selection
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== 'image') return false
  if (event.key === 'Enter' || event.key === ' ') { openSelected(); return true }
  if (event.key !== 'Escape') return false
  const position = Math.min(selection.to, editor.state.doc.content.size)
  editor.chain().setTextSelection(position).focus().run()
  return true
}
