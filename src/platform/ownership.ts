export type OwnerToken<Owner> = {
  readonly generation: number
  readonly owner: Owner
}

type OwnerRecord = {
  readonly disposers: Set<() => void>
  generation: number
}

export class OwnerRegistry<Owner> {
  readonly #owners = new Map<Owner, OwnerRecord>()

  advance(owner: Owner): void {
    const record = this.#owners.get(owner)
    if (record) record.generation += 1
  }

  capture(owner: Owner): OwnerToken<Owner> {
    const record = this.#owners.get(owner)
    if (!record) throw new Error('Cannot capture a disposed owner')
    return { generation: record.generation, owner }
  }

  dispose(owner: Owner): void {
    const record = this.#owners.get(owner)
    if (!record) return
    this.#owners.delete(owner)
    record.generation += 1
    for (const dispose of record.disposers) {
      try {
        dispose()
      } catch {
        // Disposal is best-effort and idempotent; one failure cannot retain siblings.
      }
    }
    record.disposers.clear()
  }

  isCurrent(token: OwnerToken<Owner>): boolean {
    const record = this.#owners.get(token.owner)
    return record !== undefined && record.generation === token.generation
  }

  isLive(owner: Owner): boolean {
    return this.#owners.has(owner)
  }

  open(owner: Owner): void {
    if (this.#owners.has(owner)) throw new Error('Owner is already live')
    this.#owners.set(owner, { disposers: new Set(), generation: 0 })
  }

  track(owner: Owner, disposer: () => void): () => void {
    const record = this.#owners.get(owner)
    if (!record) {
      disposer()
      return () => undefined
    }
    record.disposers.add(disposer)
    return () => record.disposers.delete(disposer)
  }
}
