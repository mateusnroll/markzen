import fuzzysort, { type SnapshotKey } from 'fuzzysort'

import type {
  DirectoryEntry,
  FinderQueryOutcome,
  FinderResultPayload,
  FinderStatusPayload,
  PlatformResult,
  RootId,
} from '../platform/contracts'

type FinderEntry = Omit<FinderResultPayload, 'name' | 'parentPath' | 'score'>
type RootSeed = { readonly rootId: RootId }
type Listing = (rootId: RootId, relativePath: string) => Promise<readonly DirectoryEntry[]>

export class WorkspaceFinder {
  private generation = 0
  private incompleteRootIds: readonly RootId[] = []
  private indexedCount = 0
  private kind: FinderStatusPayload['kind'] = 'indexing'
  private snapshot: SnapshotKey<FinderEntry> | undefined
  private rootOrder = new Map<RootId, number>()
  private disposed = false
  private operation = 0

  constructor(private readonly list: Listing, private readonly onStatus?: (status: FinderStatusPayload) => void) {}

  async rebuild(roots: readonly RootSeed[]): Promise<void> {
    const operation = ++this.operation
    this.generation += 1
    this.kind = this.snapshot ? 'stale' : 'indexing'
    this.incompleteRootIds = []
    this.emit()
    const collected: FinderEntry[] = []
    const incomplete: RootId[] = []
    this.rootOrder = new Map(roots.map((root, index) => [root.rootId, index]))
    for (const root of roots) {
      try {
        if (!(await this.scan(root.rootId, '', collected, operation))) return
      } catch {
        incomplete.push(root.rootId)
      }
      if (this.disposed || operation !== this.operation) return
    }
    collected.sort((left, right) => this.compareEntries(left, right))
    const snapshot = fuzzysort.snapshot(collected, { key: (entry) => entry.relativePath })
    if (this.disposed || operation !== this.operation) return
    this.snapshot = snapshot
    this.incompleteRootIds = incomplete
    this.indexedCount = collected.length
    this.kind = 'ready'
    this.emit()
  }

  markStale(rootId: RootId): void {
    if (this.disposed) return
    this.generation += 1
    this.kind = this.snapshot ? 'stale' : 'indexing'
    this.incompleteRootIds = [...new Set([...this.incompleteRootIds, rootId])]
    this.emit()
  }

  query(query: string): FinderQueryOutcome {
    const normalized = query.trim()
    if (!normalized || !this.snapshot || this.disposed) return { ...this.status(), results: [], total: 0 }
    const matched = fuzzysort.go(normalized, this.snapshot, { limit: 100, threshold: 0 })
    const results = matched.map((result) => {
      const entry = result.obj
      const slash = entry.relativePath.lastIndexOf('/')
      return {
        ...entry,
        name: entry.relativePath.slice(slash + 1),
        parentPath: slash < 0 ? '' : entry.relativePath.slice(0, slash),
        score: result.score,
      }
    }).sort((left, right) => right.score - left.score || this.compareEntries(left, right))
    return { ...this.status(), results, total: matched.total }
  }

  status(): FinderStatusPayload {
    return {
      generation: this.generation,
      incompleteRootIds: this.incompleteRootIds,
      indexedCount: this.indexedCount,
      kind: this.kind,
    }
  }

  dispose(): void {
    this.disposed = true
    this.operation += 1
    this.snapshot = undefined
  }

  private async scan(rootId: RootId, relativePath: string, collected: FinderEntry[], operation: number): Promise<boolean> {
    const entries = await this.list(rootId, relativePath)
    if (this.disposed || operation !== this.operation) return false
    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue
      const child = relativePath ? `${relativePath}/${entry.name}` : entry.name
      if (entry.kind === 'directory') {
        if (!(await this.scan(rootId, child, collected, operation))) return false
      }
      else if (entry.kind !== 'directory-symlink') collected.push({ fileKey: entry.fileKey, relativePath: child, rootId })
    }
    return true
  }

  private compareEntries(left: FinderEntry, right: FinderEntry): number {
    return (this.rootOrder.get(left.rootId) ?? 0) - (this.rootOrder.get(right.rootId) ?? 0)
      || compareCodePoints(left.relativePath, right.relativePath)
  }

  private emit(): void {
    this.onStatus?.(this.status())
  }
}

export function validateFinderQueryRequest(value: unknown): PlatformResult<{ readonly query: string }> {
  if (!isRecord(value) || Object.keys(value).length !== 1 || typeof value.query !== 'string' || [...value.query].length > 512) {
    return { error: { code: 'validation' }, ok: false }
  }
  return { ok: true, value: { query: value.query } }
}

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value)
const compareCodePoints = (left: string, right: string): number => left < right ? -1 : left > right ? 1 : 0
