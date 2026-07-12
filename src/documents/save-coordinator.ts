export type SaveOutcome = 'saved' | 'failed' | 'conflict' | 'cancelled'
export type SaveRequest<Snapshot, Revision = number> = { readonly revision: Revision; readonly snapshot: Snapshot }

type Queued<Snapshot, Outcome, Revision> = {
  request: SaveRequest<Snapshot, Revision>
  readonly promise: Promise<Outcome>
  readonly resolve: (outcome: Outcome) => void
}

export class SaveCoordinator<Snapshot, Outcome = SaveOutcome, Revision = number> {
  #active: { readonly promise: Promise<Outcome>; readonly request: SaveRequest<Snapshot, Revision> } | undefined
  #queued: Queued<Snapshot, Outcome, Revision> | undefined

  constructor(
    readonly execute: (request: SaveRequest<Snapshot, Revision>) => Promise<Outcome>,
    readonly canContinue: (outcome: Outcome) => boolean = ((outcome) => outcome === 'saved'),
  ) {}

  save(request: SaveRequest<Snapshot, Revision>): Promise<Outcome> {
    if (!this.#active) return this.#start(request)
    if (this.#active.request.revision === request.revision) return this.#active.promise
    if (this.#queued) {
      this.#queued.request = request
      return this.#queued.promise
    }
    let resolve!: (outcome: Outcome) => void
    const promise = new Promise<Outcome>((done) => { resolve = done })
    this.#queued = { promise, request, resolve }
    return promise
  }

  #start(request: SaveRequest<Snapshot, Revision>): Promise<Outcome> {
    const promise = this.execute(request).then((outcome) => {
      this.#active = undefined
      const queued = this.#queued
      this.#queued = undefined
      if (!queued) return outcome
      if (!this.canContinue(outcome)) {
        queued.resolve(outcome)
        return outcome
      }
      this.#start(queued.request).then(queued.resolve)
      return outcome
    })
    this.#active = { promise, request }
    return promise
  }
}
