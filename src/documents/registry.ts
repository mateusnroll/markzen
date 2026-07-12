import { fail, ok, type FileKey, type PlatformResult, type TabId, type WindowId } from '../platform/contracts'

export type DocumentOwner = { readonly tabId: TabId; readonly windowId: WindowId }

export class DocumentRegistry {
  readonly #owners = new Map<FileKey, DocumentOwner>()

  constructor(readonly focusOwner: (owner: DocumentOwner) => void) {}

  claim(fileKey: FileKey, owner: DocumentOwner): PlatformResult<void, 'already-open'> {
    const existing = this.#owners.get(fileKey)
    if (existing && !sameOwner(existing, owner)) {
      this.focusOwner(existing)
      return fail('already-open')
    }
    this.#owners.set(fileKey, owner)
    return ok(undefined)
  }

  adopt(oldKey: FileKey, newKey: FileKey, owner: DocumentOwner): PlatformResult<void, 'already-open' | 'ownership'> {
    const oldOwner = this.#owners.get(oldKey)
    if (!oldOwner || !sameOwner(oldOwner, owner)) return fail('ownership')
    const targetOwner = this.#owners.get(newKey)
    if (targetOwner && !sameOwner(targetOwner, owner)) {
      this.focusOwner(targetOwner)
      return fail('already-open')
    }
    this.#owners.delete(oldKey)
    this.#owners.set(newKey, owner)
    return ok(undefined)
  }

  owner(fileKey: FileKey): DocumentOwner | undefined {
    return this.#owners.get(fileKey)
  }

  release(fileKey: FileKey, owner: DocumentOwner): void {
    const existing = this.#owners.get(fileKey)
    if (existing && sameOwner(existing, owner)) this.#owners.delete(fileKey)
  }
}

const sameOwner = (first: DocumentOwner, second: DocumentOwner): boolean =>
  first.tabId === second.tabId && first.windowId === second.windowId
