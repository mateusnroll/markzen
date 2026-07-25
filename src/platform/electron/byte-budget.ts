import type { TabId } from '../contracts'

const DEFAULT_TAB_BYTES = 64 * 1024 * 1024
const DEFAULT_APPLICATION_BYTES = 256 * 1024 * 1024

export type ByteLease = {
  readonly release: () => void
  readonly shrink: (bytes: number) => boolean
  readonly tabId: TabId
  readonly value: () => number
}

export class ByteBudget {
  readonly #applicationLimit: number
  readonly #tabLimit: number
  readonly #tabs = new Map<TabId, number>()
  #application = 0

  constructor(options: { readonly applicationBytes?: number; readonly tabBytes?: number } = {}) {
    this.#applicationLimit = options.applicationBytes ?? DEFAULT_APPLICATION_BYTES
    this.#tabLimit = options.tabBytes ?? DEFAULT_TAB_BYTES
  }

  reserve(tabId: TabId, bytes: number): ByteLease | undefined {
    if (!validBytes(bytes) || this.#application + bytes > this.#applicationLimit || (this.#tabs.get(tabId) ?? 0) + bytes > this.#tabLimit) return undefined
    this.#change(tabId, bytes)
    let current = bytes
    let released = false
    return {
      release: () => {
        if (released) return
        released = true
        this.#change(tabId, -current)
        current = 0
      },
      shrink: (next) => {
        if (released || !validBytes(next) || next > current) return false
        const delta = next - current
        this.#change(tabId, delta)
        current = next
        return true
      },
      tabId,
      value: () => current,
    }
  }

  usage(): { readonly application: number; readonly tabs: ReadonlyMap<TabId, number> } {
    return { application: this.#application, tabs: new Map(this.#tabs) }
  }

  #change(tabId: TabId, delta: number): void {
    this.#application += delta
    const next = (this.#tabs.get(tabId) ?? 0) + delta
    if (next === 0) this.#tabs.delete(tabId)
    else this.#tabs.set(tabId, next)
  }
}

function validBytes(bytes: number): boolean {
  return Number.isSafeInteger(bytes) && bytes >= 0
}
