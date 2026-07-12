import type { DiskVersion, Path, TabId } from '../platform/contracts'

export type WatchToken = {
  readonly generation: number
  readonly path: Path
  readonly tabId: TabId
}

export type WatchDecision =
  | { readonly kind: 'conflict'; readonly diskVersion: DiskVersion }
  | { readonly kind: 'reload'; readonly diskVersion: DiskVersion }
  | { readonly kind: 'self' | 'stale' | 'warning' }

type WatchRecord = WatchToken & { diskVersion: DiskVersion }

export class DocumentWatchState {
  readonly #records = new Map<TabId, WatchRecord>()
  #sequence = 0

  open(tabId: TabId, path: Path, diskVersion: DiskVersion): WatchToken {
    this.#sequence += 1
    const record = { diskVersion, generation: this.#sequence, path, tabId }
    this.#records.set(tabId, record)
    return token(record)
  }

  repoint(tabId: TabId, path: Path, diskVersion: DiskVersion): WatchToken {
    return this.open(tabId, path, diskVersion)
  }

  accept(value: WatchToken, diskVersion: DiskVersion): boolean {
    const current = this.#current(value)
    if (!current || current.diskVersion === diskVersion) return false
    current.diskVersion = diskVersion
    return true
  }

  invalidate(value: WatchToken, diskVersion: DiskVersion, dirty: boolean): WatchDecision {
    const current = this.#current(value)
    if (!current) return { kind: 'stale' }
    if (current.diskVersion === diskVersion) return { kind: 'self' }
    return dirty ? { diskVersion, kind: 'conflict' } : { diskVersion, kind: 'reload' }
  }

  fail(value: WatchToken): WatchDecision {
    return this.#current(value) ? { kind: 'warning' } : { kind: 'stale' }
  }

  dispose(tabId: TabId): void {
    this.#records.delete(tabId)
  }

  #current(value: WatchToken): WatchRecord | undefined {
    const current = this.#records.get(value.tabId)
    return current?.generation === value.generation && current.path === value.path ? current : undefined
  }
}

const token = ({ generation, path, tabId }: WatchRecord): WatchToken => ({ generation, path, tabId })
