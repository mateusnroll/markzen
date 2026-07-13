import { fail, ok, type PlatformResult } from '../platform/contracts'

export class ExternalRequestRegistry<Owner> {
  readonly #requests = new Map<Owner, symbol>()

  begin(owner: Owner): PlatformResult<symbol, 'blocked'> {
    if (this.#requests.has(owner)) return fail('blocked')
    const token = Symbol('external-open')
    this.#requests.set(owner, token)
    return ok(token)
  }

  current(owner: Owner, token: symbol): boolean {
    return this.#requests.get(owner) === token
  }

  dispose(owner: Owner): void {
    this.#requests.delete(owner)
  }

  finish(owner: Owner, token: symbol): void {
    if (this.current(owner, token)) this.#requests.delete(owner)
  }
}
