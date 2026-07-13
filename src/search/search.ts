import { Extension, type Editor } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import { Plugin, PluginKey } from '@tiptap/pm/state'
import { Decoration, DecorationSet } from '@tiptap/pm/view'

export type NormalizedSearchText = {
  readonly ends: readonly number[]
  readonly starts: readonly number[]
  readonly text: string
}

export type TextMatch = { readonly from: number; readonly to: number }

export type SearchPluginState = {
  readonly current: number
  readonly decorations: DecorationSet
  readonly matches: readonly TextMatch[]
  readonly query: string
}

const segmenter = new Intl.Segmenter('und', { granularity: 'grapheme' })
export const searchPluginKey = new PluginKey<SearchPluginState>('markzenSearch')

export const SearchExtension = Extension.create({
  name: 'markzenSearch',
  addProseMirrorPlugins() {
    return [new Plugin<SearchPluginState>({
      key: searchPluginKey,
      state: {
        init: (_, state) => buildSearchState(state.doc, '', 0),
        apply: (transaction, previous) => {
          const requested = transaction.getMeta(searchPluginKey) as { readonly current?: number; readonly query?: string } | undefined
          if (!requested && !transaction.docChanged) return previous
          const previousMatch = previous.matches[previous.current]
          const mappedStart = !requested && previousMatch ? transaction.mapping.map(previousMatch.from, 1) : undefined
          return buildSearchState(
            transaction.doc,
            requested?.query ?? previous.query,
            requested?.current ?? previous.current,
            mappedStart,
          )
        },
      },
      props: {
        decorations: (state) => searchPluginKey.getState(state)?.decorations ?? null,
      },
    })]
  },
})

export function normalizeSearchText(source: string): NormalizedSearchText {
  let text = ''
  const starts: number[] = []
  const ends: number[] = []
  for (const part of segmenter.segment(source)) {
    const folded = part.segment.normalize('NFC').toLowerCase()
    text += folded
    for (let index = 0; index < folded.length; index += 1) {
      starts.push(part.index)
      ends.push(part.index + part.segment.length)
    }
  }
  return { ends, starts, text }
}

export function findTextMatches(source: string, query: string): readonly TextMatch[] {
  const candidate = normalizeSearchText(source)
  const needle = normalizeSearchText(query).text
  if (!needle) return []
  const matches: TextMatch[] = []
  let offset = 0
  while (offset <= candidate.text.length - needle.length) {
    const found = candidate.text.indexOf(needle, offset)
    if (found < 0) break
    const from = candidate.starts[found]
    const to = candidate.ends[found + needle.length - 1]
    if (from !== undefined && to !== undefined) matches.push({ from, to })
    offset = found + needle.length
  }
  return matches
}

export function setEditorSearch(editor: Editor, query: string, current = 0): SearchPluginState {
  editor.view.dispatch(editor.state.tr.setMeta(searchPluginKey, { current, query }))
  return getEditorSearch(editor)
}

export function getEditorSearch(editor: Editor): SearchPluginState {
  return searchPluginKey.getState(editor.state) ?? buildSearchState(editor.state.doc, '', 0)
}

function buildSearchState(document: ProseMirrorNode, query: string, requestedCurrent: number, preferredStart?: number): SearchPluginState {
  const matches: TextMatch[] = []
  if (query) document.descendants((node, position) => {
    if (!node.isTextblock) return true
    const text = node.textBetween(0, node.content.size, '', '')
    for (const match of findTextMatches(text, query)) {
      matches.push({ from: position + 1 + match.from, to: position + 1 + match.to })
    }
    return false
  })
  const current = matches.length === 0
    ? 0
    : preferredStart === undefined
      ? Math.max(0, Math.min(requestedCurrent, matches.length - 1))
      : Math.max(0, matches.findIndex((match) => match.from >= preferredStart))
  const decorations = DecorationSet.create(document, matches.map((match, index) => Decoration.inline(match.from, match.to, {
    'aria-current': index === current ? 'true' : 'false',
    class: index === current ? 'search-match search-match-current' : 'search-match',
  })))
  return { current, decorations, matches, query }
}
