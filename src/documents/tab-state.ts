export type TabBaselineState = {
  readonly baselineTitle: string
  readonly contentDirty: boolean
  readonly revision: number
  readonly title: string
}

export function createTabBaseline(title: string): TabBaselineState {
  return { baselineTitle: title, contentDirty: false, revision: 0, title }
}

export function editTabDocument<State extends TabBaselineState>(state: State, equalsBaseline: boolean): State {
  return { ...state, contentDirty: !equalsBaseline, revision: state.revision + 1 }
}

export function editTabTitle<State extends TabBaselineState>(state: State, title: string): State {
  return { ...state, title }
}

export function revertTabTitle<State extends TabBaselineState>(state: State): State {
  return { ...state, title: state.baselineTitle }
}

export function acceptTabBaseline<State extends TabBaselineState>(state: State, title: string): State {
  return { ...state, baselineTitle: title, contentDirty: false, title }
}

export function isTabDirty(state: TabBaselineState): boolean {
  return state.contentDirty || state.title !== state.baselineTitle
}

export function isDocumentCompletionCurrent(
  captured: { readonly generation: number; readonly kind: 'csv' | 'json' | 'markdown'; readonly owner: string; readonly revision: number },
  current: { readonly generation: number; readonly kind: 'csv' | 'json' | 'markdown'; readonly owner: string; readonly revision: number },
): boolean {
  return captured.owner === current.owner
    && captured.kind === current.kind
    && captured.generation === current.generation
    && captured.revision === current.revision
}
