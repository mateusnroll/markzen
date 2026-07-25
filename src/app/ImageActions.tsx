import type { Editor } from '@tiptap/core'
import { NodeSelection, type Selection, type SelectionBookmark } from '@tiptap/pm/state'
import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react'

import { classifyImageSource } from '../assets/image-sources'
import type { DocumentGatewayPort } from '../documents/gateway'
import type { ImageCandidate } from '../platform/contracts'
import { useOverlaySurface } from './overlays'

export type ImageActionsHandle = {
  readonly openInsertion: (selection: Selection) => void
  readonly openSelected: () => void
}

type Surface = 'insert' | 'metadata'
type RuntimeEntry = {
  generation: number
  readonly kind: 'blocked' | 'embedded' | 'local' | 'remote'
  readonly source: string
  state: 'blocked' | 'error' | 'loaded' | 'loading' | 'remote'
  url?: string
}

const imageRuntimes = new WeakMap<Editor, Map<string, RuntimeEntry>>()

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
  const runtime = useRef(runtimeFor(editor))
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
      void syncImages(editor, gateway, tabId, runtime.current)
    }
    update()
    void syncImages(editor, gateway, tabId, runtime.current)
    const imageError = (event: Event) => {
      const image = event.target
      if (!(image instanceof HTMLImageElement)) return
      const wrapper = image.closest<HTMLElement>('[data-markzen-image]')
      if (!wrapper) return
      const position = editor.view.posAtDOM(wrapper, 0)
      const current = editor.state.doc.nodeAt(position)
      const assetId = typeof current?.attrs.assetId === 'string' ? current.attrs.assetId : ''
      const entry = runtime.current.get(assetId)
      if (entry) {
        entry.generation += 1
        entry.state = 'blocked'
        void gateway.revokeImage(tabId, assetId, entry.source, entry.generation, entry.url)
        delete entry.url
      }
      editor.commands.command(({ state, tr }) => {
        const node = state.doc.nodeAt(position)
        if (!node || node.type.name !== 'image') return false
        tr.setNodeMarkup(position, undefined, { ...node.attrs, assetUrl: null, loadState: 'broken' }).setMeta('addToHistory', false)
        return true
      })
    }
    const remoteAction = (event: Event) => {
      const target = event.target
      if (!(target instanceof Element)) return
      const button = target.closest<HTMLButtonElement>('[data-image-remote-action]')
      const wrapper = button?.closest<HTMLElement>('[data-markzen-image]')
      if (!button || !wrapper) return
      event.preventDefault()
      const position = editor.view.posAtDOM(wrapper, 0)
      void loadRemoteImage(editor, gateway, tabId, position, runtime.current)
    }
    const editorDom = editor.view.dom
    editorDom.addEventListener('error', imageError, true)
    editorDom.addEventListener('click', remoteAction)
    editor.on('selectionUpdate', update)
    editor.on('transaction', map)
    return () => {
      editor.off('selectionUpdate', update)
      editor.off('transaction', map)
      editorDom.removeEventListener('error', imageError, true)
      editorDom.removeEventListener('click', remoteAction)
    }
  }, [editor, gateway, surface, tabId])

  useEffect(() => () => {
    queueMicrotask(() => {
      if (!editor.isDestroyed) return
      for (const [assetId, entry] of runtime.current) {
        entry.generation += 1
        void gateway.revokeImage(tabId, assetId, entry.source, entry.generation, entry.url)
      }
      runtime.current.clear()
    })
  }, [editor, gateway, tabId])

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
    const assetId = typeof selection.node.attrs.assetId === 'string' ? selection.node.attrs.assetId : ''
    const entry = runtime.current.get(assetId)
    if (entry) {
      entry.state = 'loaded'
      entry.url = outcome.asset.url
    }
    setImageState(editor, assetId, source, { assetUrl: outcome.asset.url, loadState: 'loaded', sourceKind: 'local' })
  }

  return (
    <>
      {selected ? (
        <div className="image-actions" data-testid="image-actions-owner">
          <button aria-label="Image Actions" data-testid="image-actions" onClick={openSelected} type="button">Image Actions</button>
          {editor.state.selection instanceof NodeSelection
            && !editor.state.selection.node.attrs.assetUrl
            && classifyImageSource(String(editor.state.selection.node.attrs.src ?? '')).kind === 'local' ? (
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

async function syncImages(editor: Editor, gateway: DocumentGatewayPort, tabId: string, runtime: Map<string, RuntimeEntry>): Promise<void> {
  await Promise.resolve()
  if (editor.isDestroyed) return
  const live = new Set<string>()
  const entries: Array<{ readonly assetId: string; readonly source: string }> = []
  editor.state.doc.descendants((node) => {
    if (node.type.name !== 'image') return
    const source = typeof node.attrs.src === 'string' ? node.attrs.src : ''
    const assetId = typeof node.attrs.assetId === 'string' ? node.attrs.assetId : ''
    if (!source || !assetId) return
    live.add(assetId)
    const existing = runtime.get(assetId)
    if (existing && existing.source !== source) {
      existing.generation += 1
      void gateway.revokeImage(tabId, assetId, existing.source, existing.generation, existing.url)
      runtime.delete(assetId)
    }
    if (existing?.url && node.attrs.assetUrl !== existing.url) {
      existing.generation += 1
      void gateway.revokeImage(tabId, assetId, existing.source, existing.generation, existing.url)
      runtime.delete(assetId)
    }
    if (!runtime.has(assetId) && typeof node.attrs.assetUrl === 'string') {
      const kind = classifyImageSource(source).kind
      runtime.set(assetId, {
        generation: 0,
        kind: kind === 'remote' || kind === 'embedded' || kind === 'local' ? kind : 'blocked',
        source,
        state: 'loaded',
        url: node.attrs.assetUrl,
      })
    }
    if (!runtime.has(assetId)) entries.push({ assetId, source })
  })
  for (const [assetId, entry] of runtime) {
    if (live.has(assetId)) continue
    entry.generation += 1
    void gateway.revokeImage(tabId, assetId, entry.source, entry.generation, entry.url)
    runtime.delete(assetId)
  }
  for (const entry of entries) {
    const classification = classifyImageSource(entry.source)
    if (classification.kind === 'remote') {
      runtime.set(entry.assetId, { generation: 0, kind: 'remote', source: entry.source, state: 'remote' })
      setImageState(editor, entry.assetId, entry.source, { assetUrl: null, loadState: 'remote', origin: classification.origin, sourceKind: 'remote' })
      continue
    }
    if (classification.kind === 'embedded') {
      const state: RuntimeEntry = { generation: 1, kind: 'embedded', source: entry.source, state: 'loading' }
      runtime.set(entry.assetId, state)
      setImageState(editor, entry.assetId, entry.source, { assetUrl: null, loadState: 'loading', origin: null, sourceKind: 'embedded' })
      const outcome = await gateway.resolveEmbeddedImage(tabId, entry.assetId, entry.source, state.generation)
      applyOutcome(editor, gateway, tabId, entry.assetId, entry.source, state.generation, outcome, runtime)
      continue
    }
    if (classification.kind === 'local') {
      const state: RuntimeEntry = { generation: 0, kind: 'local', source: entry.source, state: 'blocked' }
      runtime.set(entry.assetId, state)
      const outcome = await gateway.resolveImage(tabId, entry.source)
      if (outcome.kind === 'authorized') {
        state.state = 'loaded'
        state.url = outcome.asset.url
        setImageState(editor, entry.assetId, entry.source, { assetUrl: outcome.asset.url, loadState: 'loaded', origin: null, sourceKind: 'local' })
      } else {
        setImageState(editor, entry.assetId, entry.source, { assetUrl: null, loadState: 'blocked', origin: null, sourceKind: 'local' })
      }
      continue
    }
    runtime.set(entry.assetId, { generation: 0, kind: 'blocked', source: entry.source, state: 'blocked' })
    setImageState(editor, entry.assetId, entry.source, { assetUrl: null, loadState: 'blocked', origin: null, sourceKind: 'blocked' })
  }
}

async function loadRemoteImage(
  editor: Editor,
  gateway: DocumentGatewayPort,
  tabId: string,
  position: number,
  runtime: Map<string, RuntimeEntry>,
): Promise<void> {
  const node = editor.state.doc.nodeAt(position)
  const assetId = typeof node?.attrs.assetId === 'string' ? node.attrs.assetId : ''
  const source = typeof node?.attrs.src === 'string' ? node.attrs.src : ''
  const entry = runtime.get(assetId)
  if (!entry || entry.kind !== 'remote' || entry.source !== source || entry.state === 'loading') return
  entry.generation += 1
  entry.state = 'loading'
  setImageState(editor, assetId, source, { assetUrl: null, loadState: 'loading', sourceKind: 'remote' })
  const outcome = await gateway.loadRemoteImage(tabId, assetId, source, entry.generation)
  applyOutcome(editor, gateway, tabId, assetId, source, entry.generation, outcome, runtime)
}

function applyOutcome(
  editor: Editor,
  gateway: DocumentGatewayPort,
  tabId: string,
  assetId: string,
  source: string,
  generation: number,
  outcome: Awaited<ReturnType<DocumentGatewayPort['loadRemoteImage']>>,
  runtime: Map<string, RuntimeEntry>,
): void {
  if (editor.isDestroyed) {
    if (outcome.kind === 'authorized') void gateway.revokeImage(tabId, assetId, source, generation + 1, outcome.asset.url)
    return
  }
  const entry = runtime.get(assetId)
  const position = imagePosition(editor, assetId, source)
  if (!entry || entry.generation !== generation || entry.source !== source || position === undefined) {
    if (outcome.kind === 'authorized') void gateway.revokeImage(tabId, assetId, source, generation + 1, outcome.asset.url)
    return
  }
  if (outcome.kind === 'authorized') {
    entry.state = 'loaded'
    entry.url = outcome.asset.url
    setImageState(editor, assetId, source, { assetUrl: outcome.asset.url, loadState: 'loaded' })
    return
  }
  if (outcome.kind === 'retryable' || outcome.kind === 'error') {
    entry.state = 'error'
    setImageState(editor, assetId, source, { assetUrl: null, loadState: 'error' })
    return
  }
  if (outcome.kind === 'blocked') {
    entry.state = 'blocked'
    setImageState(editor, assetId, source, { assetUrl: null, loadState: 'blocked' })
  }
}

function setImageState(editor: Editor, assetId: string, source: string, attrs: Record<string, unknown>): void {
  const position = imagePosition(editor, assetId, source)
  if (position === undefined) return
  editor.commands.command(({ state, tr }) => {
    const node = state.doc.nodeAt(position)
    if (!node || node.type.name !== 'image' || node.attrs.src !== source || node.attrs.assetId !== assetId) return false
    tr.setNodeMarkup(position, undefined, { ...node.attrs, ...attrs }).setMeta('addToHistory', false)
    return true
  })
}

function imagePosition(editor: Editor, assetId: string, source: string): number | undefined {
  let result: number | undefined
  editor.state.doc.descendants((node, position) => {
    if (result === undefined && node.type.name === 'image' && node.attrs.assetId === assetId && node.attrs.src === source) result = position
  })
  return result
}

function runtimeFor(editor: Editor): Map<string, RuntimeEntry> {
  const existing = imageRuntimes.get(editor)
  if (existing) return existing
  const created = new Map<string, RuntimeEntry>()
  imageRuntimes.set(editor, created)
  return created
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
