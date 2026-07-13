import type { Editor } from '@tiptap/core'
import { useCallback, useEffect, useRef, useState, type CompositionEvent, type KeyboardEvent } from 'react'

import { getEditorSearch, setEditorSearch, type SearchPluginState } from '../search/search'
import { useOverlaySurface } from './overlays'

export function SearchPanel({
  editor,
  onClose,
  request,
}: {
  readonly editor: Editor
  readonly onClose: () => void
  readonly request: number
}) {
  const [query, setQuery] = useState('')
  const [state, setState] = useState<SearchPluginState>(() => getEditorSearch(editor))
  const input = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  const composing = useRef(false)
  const close = useCallback(() => {
    generation.current += 1
    setEditorSearch(editor, '', 0)
    onClose()
  }, [editor, onClose])
  useOverlaySurface('search-panel', true, false, close)

  useEffect(() => {
    input.current?.focus()
    input.current?.select()
  }, [request])

  useEffect(() => {
    const refresh = () => {
      const current = getEditorSearch(editor)
      if (current.query) setState(current)
    }
    editor.on('transaction', refresh)
    return () => { editor.off('transaction', refresh) }
  }, [editor])

  useEffect(() => () => {
    generation.current += 1
    if (!editor.isDestroyed) setEditorSearch(editor, '', 0)
  }, [editor])

  const schedule = useCallback((value: string) => {
    setQuery(value)
    const captured = ++generation.current
    if (!value) {
      setState(setEditorSearch(editor, '', 0))
      return
    }
    window.setTimeout(() => {
      if (generation.current !== captured || composing.current) return
      const next = setEditorSearch(editor, value, 0)
      setState(next)
      scrollCurrent()
    }, 150)
  }, [editor])

  const navigate = useCallback((offset: number) => {
    if (state.matches.length === 0) return
    const current = (state.current + offset + state.matches.length) % state.matches.length
    const next = setEditorSearch(editor, query, current)
    setState(next)
    scrollCurrent()
  }, [editor, query, state.current, state.matches.length])

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (composing.current || event.nativeEvent.isComposing) return
    if (event.key === 'Escape') {
      event.preventDefault()
      close()
    } else if (event.key === 'Enter') {
      event.preventDefault()
      navigate(event.shiftKey ? -1 : 1)
    }
  }

  const handleCompositionEnd = (event: CompositionEvent<HTMLInputElement>) => {
    composing.current = false
    schedule(event.currentTarget.value)
  }

  const status = !query || state.query !== query
    ? 'No results'
    : state.matches.length === 0
      ? 'No results'
      : `${state.current + 1} of ${state.matches.length}`

  return (
    <section aria-label="Find in document" className="search-panel" data-testid="search-panel">
      <label htmlFor="document-search">Find</label>
      <input
        data-testid="search-input"
        id="document-search"
        onChange={(event) => { if (!composing.current) schedule(event.currentTarget.value) }}
        onCompositionEnd={handleCompositionEnd}
        onCompositionStart={() => { composing.current = true; generation.current += 1 }}
        onKeyDown={handleKeyDown}
        ref={input}
        type="search"
        value={query}
      />
      <span aria-live="polite" data-testid="search-status">{status}</span>
      <button aria-label="Previous result" data-testid="search-previous" disabled={state.matches.length === 0} onClick={() => navigate(-1)} type="button">↑</button>
      <button aria-label="Next result" data-testid="search-next" disabled={state.matches.length === 0} onClick={() => navigate(1)} type="button">↓</button>
      <button aria-label="Close Find" data-testid="search-close" onClick={close} type="button">×</button>
    </section>
  )
}

function scrollCurrent(): void {
  requestAnimationFrame(() => document.querySelector('.search-match-current')?.scrollIntoView({ block: 'center' }))
}
