import {
  asRootId,
  fail,
  ok,
  type DirectoryEntry,
  type FileKey,
  type Path,
  type PlatformResult,
  type RootId,
  type WindowId,
} from '../platform/contracts'

export type WorkspaceRoot = {
  readonly fileKey: FileKey
  readonly insertionIndex: number
  readonly path: Path
  readonly rootId: RootId
  readonly windowId: WindowId
}

type RootRecord = WorkspaceRoot & { disposeWatch?: () => void }

export class RootRegistry {
  readonly #roots = new Map<WindowId, RootRecord[]>()
  #sequence = 0

  accept(windowId: WindowId, path: Path, fileKey: FileKey, disposeWatch?: () => void):
    { readonly kind: 'accepted' | 'duplicate'; readonly root: WorkspaceRoot } {
    const roots = this.#roots.get(windowId) ?? []
    const duplicate = roots.find((root) => root.fileKey === fileKey)
    if (duplicate) return { kind: 'duplicate', root: publicRoot(duplicate) }
    this.#sequence += 1
    const root: RootRecord = {
      ...(disposeWatch ? { disposeWatch } : {}),
      fileKey,
      insertionIndex: roots.length,
      path,
      rootId: asRootId(`root-${this.#sequence}`),
      windowId,
    }
    roots.push(root)
    this.#roots.set(windowId, roots)
    return { kind: 'accepted', root: publicRoot(root) }
  }

  activeWatchCount(): number {
    return [...this.#roots.values()].flat().filter((root) => root.disposeWatch).length
  }

  attachWatch(windowId: WindowId, rootId: RootId, disposeWatch: () => void): PlatformResult<void, 'ownership'> {
    const root = this.#roots.get(windowId)?.find((candidate) => candidate.rootId === rootId)
    if (!root) return fail('ownership')
    root.disposeWatch?.()
    root.disposeWatch = disposeWatch
    return ok(undefined)
  }

  authorize(windowId: WindowId, rootId: RootId): PlatformResult<WorkspaceRoot, 'ownership'> {
    const root = this.#roots.get(windowId)?.find((candidate) => candidate.rootId === rootId)
    return root ? ok(publicRoot(root)) : fail('ownership')
  }

  disposeWindow(windowId: WindowId): void {
    const roots = this.#roots.get(windowId) ?? []
    this.#roots.delete(windowId)
    for (const root of roots) root.disposeWatch?.()
  }

  get(windowId: WindowId, rootId: RootId): WorkspaceRoot | undefined {
    const root = this.#roots.get(windowId)?.find((candidate) => candidate.rootId === rootId)
    return root ? publicRoot(root) : undefined
  }

  values(windowId: WindowId): readonly WorkspaceRoot[] {
    return (this.#roots.get(windowId) ?? []).map(publicRoot)
  }

}

const publicRoot = (root: RootRecord): WorkspaceRoot => ({
  fileKey: root.fileKey,
  insertionIndex: root.insertionIndex,
  path: root.path,
  rootId: root.rootId,
  windowId: root.windowId,
})

export function disambiguateRootLabels(paths: readonly string[]): readonly string[] {
  const separated = paths.map(pathSegments)
  return separated.map((segments, index) => {
    for (let count = 1; count <= segments.length; count += 1) {
      const suffix = segments.slice(-count).join('/')
      const unique = separated.every((other, otherIndex) => otherIndex === index || other.slice(-count).join('/') !== suffix)
      if (unique) return suffix
    }
    return segments.join('/')
  })
}

const collator = new Intl.Collator('en-US', { numeric: false, sensitivity: 'base', usage: 'sort' })

export function filterAndSortEntries(entries: readonly DirectoryEntry[]): readonly DirectoryEntry[] {
  return entries
    .filter((entry) => !entry.name.startsWith('.'))
    .toSorted((first, second) => {
      const firstDirectory = first.kind === 'directory' || first.kind === 'directory-symlink'
      const secondDirectory = second.kind === 'directory' || second.kind === 'directory-symlink'
      if (firstDirectory !== secondDirectory) return firstDirectory ? -1 : 1
      return collator.compare(first.name, second.name) || codePointCompare(first.name, second.name)
    })
}

export const directoryActivationDecision = (value: { readonly expanded: boolean; readonly loaded: boolean }): 'collapse' | 'load' | 'reopen' =>
  value.expanded ? 'collapse' : value.loaded ? 'reopen' : 'load'

export const isDirectoryGenerationCurrent = (current: number | undefined, expected: number): boolean => current === expected

export class WorkspaceWatchBatcher {
  static isVisibleInvalidation(path: string): boolean {
    return !pathSegments(path).some((segment) => segment.startsWith('.'))
  }

  #maxTimer: ReturnType<typeof setTimeout> | undefined
  #trailingTimer: ReturnType<typeof setTimeout> | undefined
  #disposed = false

  constructor(readonly flush: () => void) {}

  dispose(): void {
    this.#disposed = true
    if (this.#maxTimer) clearTimeout(this.#maxTimer)
    if (this.#trailingTimer) clearTimeout(this.#trailingTimer)
    this.#maxTimer = undefined
    this.#trailingTimer = undefined
  }

  invalidate(): void {
    if (this.#disposed) return
    if (this.#trailingTimer) clearTimeout(this.#trailingTimer)
    this.#trailingTimer = setTimeout(() => this.#emit(), 300)
    this.#maxTimer ??= setTimeout(() => this.#emit(), 750)
  }


  #emit(): void {
    if (this.#disposed) return
    if (this.#maxTimer) clearTimeout(this.#maxTimer)
    if (this.#trailingTimer) clearTimeout(this.#trailingTimer)
    this.#maxTimer = undefined
    this.#trailingTimer = undefined
    this.flush()
  }
}

export function watcherRefreshDecision(value: { readonly expanded: boolean; readonly loaded: boolean }): 'refresh' | 'stale' | 'ignore' {
  if (!value.loaded) return 'ignore'
  return value.expanded ? 'refresh' : 'stale'
}

export function insertPinnedBeforePreview<T extends { readonly id: string; readonly preview: boolean }>(
  tabs: readonly T[],
  tab: T,
): readonly T[] {
  const existing = tabs.findIndex((candidate) => candidate.id === tab.id)
  if (existing >= 0) return tabs.map((candidate, index) => index === existing ? tab : candidate)
  const preview = tabs.findIndex((candidate) => candidate.preview)
  return preview < 0 ? [...tabs, tab] : [...tabs.slice(0, preview), tab, ...tabs.slice(preview)]
}

export function preparePreviewReplacement(preview: { readonly dirty: boolean; readonly id: string } | undefined): {
  readonly pinExisting: boolean
  readonly reusableId?: string
} {
  if (!preview) return { pinExisting: false }
  return preview.dirty ? { pinExisting: true } : { pinExisting: false, reusableId: preview.id }
}

export function selectContainingRoot<T extends Pick<WorkspaceRoot, 'fileKey' | 'insertionIndex' | 'path' | 'rootId'>>(
  roots: readonly T[],
  candidate: Path,
): T | undefined {
  const value = normalize(String(candidate))
  return roots
    .filter((root) => contains(String(root.fileKey), value))
    .toSorted((first, second) => depth(String(second.fileKey)) - depth(String(first.fileKey)) || first.insertionIndex - second.insertionIndex)[0]
}

const pathSegments = (value: string): readonly string[] => normalize(value).split('/').filter(Boolean)
const normalize = (value: string): string => value.replaceAll('\\', '/').replace(/\/$/, '')
const depth = (value: string): number => pathSegments(value).length
const contains = (parent: string, candidate: string): boolean => {
  const parentSegments = pathSegments(parent)
  const candidateSegments = pathSegments(candidate)
  return parentSegments.length <= candidateSegments.length && parentSegments.every((segment, index) => segment === candidateSegments[index])
}
const codePointCompare = (first: string, second: string): number => first < second ? -1 : first > second ? 1 : 0
