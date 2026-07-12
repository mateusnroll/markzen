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
