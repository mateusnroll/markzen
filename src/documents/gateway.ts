import { displayDocumentStem, deriveDocumentFilename, getRecognizedExtension } from './filename'
import { parseDocumentBytes, serializeRichDocument, type DocumentEncoding, type RichDocument } from './markdown'
import { SaveCoordinator } from './save-coordinator'
import { DocumentWatchState, type WatchToken } from './watch-state'
import {
  type DiskVersion,
  type FileKey,
  type Path,
  type Platform,
  type MarkzenApi,
  asTabId,
} from '../platform/contracts'

export type GatewayDocument = {
  readonly diskVersion?: DiskVersion
  readonly document?: RichDocument
  readonly encoding?: DocumentEncoding
  readonly fileKey?: FileKey
  readonly id: string
  readonly path?: Path
  readonly preservation?: { readonly bytes: Uint8Array; readonly display: string; readonly kind: 'bytes' | 'text' }
  readonly revision?: number
  readonly title: string
}

export type SaveInput = GatewayDocument & { readonly documentDirty: boolean; readonly titleDirty: boolean }
export type OpenOutcome = { readonly document: GatewayDocument; readonly kind: 'opened' } | { readonly kind: 'cancelled' | 'error' }
export type SaveOutcome =
  | { readonly document: GatewayDocument; readonly kind: 'saved' }
  | { readonly document: GatewayDocument; readonly kind: 'cleanup-warning'; readonly oldPath: Path }
  | { readonly kind: 'cancelled' | 'collision' | 'conflict' | 'error' | 'missing' | 'rename-decision' | 'unchanged' }
export type ExternalGatewayEvent =
  | { readonly document: GatewayDocument; readonly kind: 'changed' }
  | { readonly id: string; readonly kind: 'missing' }
  | { readonly id: string; readonly kind: 'watch-warning' }

export interface DocumentGatewayPort {
  acceptExternal(document: GatewayDocument): Promise<boolean>
  closeTab(id: string): Promise<void>
  confirmClose(id: string, name: string): Promise<'cancel' | 'discard' | 'save'>
  confirmWindowClose(dirtyNames: readonly string[]): Promise<'cancel' | 'discard' | 'save-all'>
  completeQuitSaveAll(success: boolean): Promise<void>
  createTabId(): Promise<string>
  open(id?: string): Promise<OpenOutcome>
  onCommand(listener: (command: import('../platform/contracts').DocumentCommand) => void): () => void
  onExternalChange(listener: (event: ExternalGatewayEvent) => void): () => void
  overwriteExternal(input: SaveInput, diskVersion: DiskVersion): Promise<SaveOutcome>
  retryCleanup(input: GatewayDocument): Promise<SaveOutcome>
  save(input: SaveInput): Promise<SaveOutcome>
  saveAndRename(input: SaveInput): Promise<SaveOutcome>
  saveAs(input: GatewayDocument): Promise<SaveOutcome>
  updateMenuState(state: import('../platform/contracts').DocumentMenuState): Promise<void>
}

export class DocumentGateway implements DocumentGatewayPort {
  readonly #externalListeners = new Set<(event: ExternalGatewayEvent) => void>()
  readonly #saveCoordinators = new Map<string, SaveCoordinator<() => Promise<SaveOutcome>, SaveOutcome, number>>()
  readonly #watchState = new DocumentWatchState()
  readonly #watchTokens = new Map<string, WatchToken>()
  readonly #watchDisposers = new Map<string, () => void>()
  readonly #cleanupPaths = new Map<string, Path>()

  constructor(readonly platform: Platform) {}

  async closeTab(id: string): Promise<void> {
    this.#watchDisposers.get(id)?.()
    this.#watchDisposers.delete(id)
    this.#watchState.dispose(asTabId(id))
    this.#watchTokens.delete(id)
    this.#saveCoordinators.delete(id)
  }

  async confirmClose(_id: string, name: string): Promise<'cancel' | 'discard' | 'save'> {
    const result = await this.platform.dialog.confirm({
      buttons: ['Save', "Don't Save", 'Cancel'],
      message: `Save changes to ${name}?`,
      title: 'Close Document',
    })
    return !result.ok || result.value === 2 ? 'cancel' : result.value === 0 ? 'save' : 'discard'
  }

  async confirmWindowClose(dirtyNames: readonly string[]): Promise<'cancel' | 'discard' | 'save-all'> {
    const subject = dirtyNames.length === 1 ? dirtyNames[0] : `${dirtyNames.length} files`
    const result = await this.platform.dialog.confirm({
      buttons: ['Save All', "Don't Save", 'Cancel'],
      message: `Save changes to ${subject}?`,
      title: 'Close Window',
    })
    return !result.ok || result.value === 2 ? 'cancel' : result.value === 0 ? 'save-all' : 'discard'
  }

  async completeQuitSaveAll(): Promise<void> {}

  async acceptExternal(document: GatewayDocument): Promise<boolean> {
    const token = this.#watchTokens.get(document.id)
    return Boolean(token && document.diskVersion && this.#watchState.accept(token, document.diskVersion))
  }

  async createTabId(): Promise<string> {
    return `memory-${Date.now()}-${Math.random().toString(16).slice(2)}`
  }

  async open(id?: string): Promise<OpenOutcome> {
    const selected = await this.platform.dialog.open({ extensions: ['md', 'markdown', 'txt'], title: 'Open Markdown Document' })
    if (!selected.ok) return { kind: 'error' }
    return selected.value ? this.openPath(selected.value, id ?? `file-${Date.now()}`) : { kind: 'cancelled' }
  }

  onCommand(): () => void {
    return () => undefined
  }

  onExternalChange(listener: (event: ExternalGatewayEvent) => void): () => void {
    this.#externalListeners.add(listener)
    return () => this.#externalListeners.delete(listener)
  }

  async overwriteExternal(input: SaveInput, diskVersion: DiskVersion): Promise<SaveOutcome> {
    return this.#coordinate(input, async () => this.#overwriteExternal(input, diskVersion))
  }

  async #overwriteExternal(input: SaveInput, diskVersion: DiskVersion): Promise<SaveOutcome> {
    if (!input.path || !input.document) return { kind: 'error' }
    const bytes = serializeRichDocument(input.document, input.encoding ?? { bom: false, newline: 'lf' })
    const replaced = await this.platform.fs.atomicReplace(input.path, bytes, diskVersion)
    return replaced.ok ? this.#saved(input, replaced.value) : failure(replaced.error.code)
  }

  async retryCleanup(input: GatewayDocument): Promise<SaveOutcome> {
    return this.#coordinate(input, async () => this.#retryCleanup(input))
  }

  async #retryCleanup(input: GatewayDocument): Promise<SaveOutcome> {
    const oldPath = this.#cleanupPaths.get(input.id)
    if (!oldPath) return { kind: 'unchanged' }
    const removed = await this.platform.fs.remove(oldPath)
    if (!removed.ok) return { document: input, kind: 'cleanup-warning', oldPath }
    this.#cleanupPaths.delete(input.id)
    return { document: input, kind: 'saved' }
  }

  async openPath(path: Path, id: string): Promise<OpenOutcome> {
    const outcome = await this.#readPath(path, id)
    if (outcome.kind === 'opened') this.#watchDocument(outcome.document)
    return outcome
  }

  async #readPath(path: Path, id: string): Promise<OpenOutcome> {
    const read = await this.platform.fs.read(path)
    if (!read.ok) return { kind: 'error' }
    const parsed = parseDocumentBytes(read.value.bytes)
    const title = displayDocumentStem(basename(read.value.path))
    const identity = { diskVersion: read.value.diskVersion, fileKey: read.value.fileKey, id, path: read.value.path, title }
    const outcome: OpenOutcome = parsed.mode === 'rich' ? {
      document: { ...identity, document: parsed.document, encoding: parsed.encoding }, kind: 'opened',
    } : {
      document: {
        ...identity,
        preservation: {
          bytes: parsed.bytes,
          display: parsed.mode === 'preserve-bytes' ? parsed.escaped : parsed.text,
          kind: parsed.mode === 'preserve-bytes' ? 'bytes' : 'text',
        },
      },
      kind: 'opened',
    }
    return outcome
  }

  async save(input: SaveInput): Promise<SaveOutcome> {
    return this.#coordinate(input, async () => this.#save(input))
  }

  async #save(input: SaveInput): Promise<SaveOutcome> {
    if (!input.documentDirty && !input.titleDirty) return { kind: 'unchanged' }
    if (!input.path || !input.diskVersion) return this.#saveAs(input)
    const originalName = basename(input.path)
    const targetName = deriveDocumentFilename(input.title, getRecognizedExtension(originalName))
    const titleChanged = targetName !== originalName
    if (titleChanged && input.documentDirty) return { kind: 'rename-decision' }
    if (titleChanged) {
      const moved = await this.platform.fs.move(input.path, join(dirname(input.path), targetName), input.diskVersion)
      return moved.ok ? this.#saved(input, moved.value) : failure(moved.error.code)
    }
    if (!input.document) return { kind: 'unchanged' }
    const bytes = serializeRichDocument(input.document, input.encoding ?? { bom: false, newline: 'lf' })
    const replaced = await this.platform.fs.atomicReplace(input.path, bytes, input.diskVersion)
    return replaced.ok ? this.#saved(input, replaced.value) : failure(replaced.error.code)
  }

  async saveAndRename(input: SaveInput): Promise<SaveOutcome> {
    return this.#coordinate(input, async () => this.#saveAndRename(input))
  }

  async #saveAndRename(input: SaveInput): Promise<SaveOutcome> {
    if (!input.path || !input.diskVersion || !input.document) return { kind: 'error' }
    const latest = await this.platform.fs.read(input.path)
    if (!latest.ok) return failure(latest.error.code)
    if (latest.value.diskVersion !== input.diskVersion) return { kind: 'conflict' }
    const targetName = deriveDocumentFilename(input.title, getRecognizedExtension(basename(input.path)))
    const target = join(dirname(input.path), targetName)
    const bytes = serializeRichDocument(input.document, input.encoding ?? { bom: false, newline: 'lf' })
    const written = await this.platform.fs.atomicReplace(target, bytes, 'missing')
    if (!written.ok) return failure(written.error.code)
    const removed = await this.platform.fs.remove(input.path)
    if (!removed.ok) {
      const document = this.adopt(input, written.value)
      this.#cleanupPaths.set(input.id, input.path)
      this.#watchDocument(document)
      return { document, kind: 'cleanup-warning', oldPath: input.path }
    }
    return this.#saved(input, written.value)
  }

  async saveAs(input: GatewayDocument): Promise<SaveOutcome> {
    return this.#coordinate(input, async () => this.#saveAs(input))
  }

  async #saveAs(input: GatewayDocument): Promise<SaveOutcome> {
    const selected = await this.platform.dialog.save({
      confirmationLabel: 'Save As',
      defaultName: deriveDocumentFilename(input.title, undefined),
      message: 'A new document will be created from the current tab.',
      title: 'Save Current Tab As',
    })
    if (!selected.ok) return { kind: 'error' }
    if (!selected.value) return { kind: 'cancelled' }
    const existing = await this.platform.fs.read(selected.value)
    let expected: DiskVersion | 'missing' = 'missing'
    if (existing.ok) {
      if (input.fileKey === existing.value.fileKey && input.path === existing.value.path) {
        if (!input.diskVersion) return { kind: 'missing' }
        const samePath = await this.platform.fs.atomicReplace(input.path, input.preservation?.bytes ?? (
          input.document ? serializeRichDocument(input.document, input.encoding ?? { bom: false, newline: 'lf' }) : new Uint8Array()
        ), input.diskVersion)
        return samePath.ok ? this.#saved(input, samePath.value) : failure(samePath.error.code)
      }
      if (input.fileKey === existing.value.fileKey) return { kind: 'collision' }
      const confirmed = await this.platform.dialog.confirm({
        buttons: ['Replace', 'Cancel'],
        message: 'A file already exists at this location.',
        title: 'Replace Existing File?',
      })
      if (!confirmed.ok || confirmed.value !== 0) return { kind: 'cancelled' }
      expected = existing.value.diskVersion
    } else if (existing.error.code !== 'not-found') return { kind: 'error' }
    const bytes = input.preservation?.bytes ?? (input.document ? serializeRichDocument(input.document, input.encoding ?? { bom: false, newline: 'lf' }) : new Uint8Array())
    const replaced = await this.platform.fs.atomicReplace(selected.value, bytes, expected)
    return replaced.ok ? this.#saved(input, replaced.value) : failure(replaced.error.code)
  }

  async updateMenuState(): Promise<void> {}

  #adoptTitle(path: Path): string {
    return displayDocumentStem(basename(path))
  }

  adopt(input: GatewayDocument, read: { readonly diskVersion: DiskVersion; readonly fileKey: FileKey; readonly path: Path }): GatewayDocument {
    return { ...input, diskVersion: read.diskVersion, fileKey: read.fileKey, path: read.path, title: this.#adoptTitle(read.path) }
  }

  #saved(input: GatewayDocument, read: { readonly diskVersion: DiskVersion; readonly fileKey: FileKey; readonly path: Path }): SaveOutcome {
    const document = this.adopt(input, read)
    this.#watchDocument(document)
    return { document, kind: 'saved' }
  }

  #watchDocument(document: GatewayDocument): void {
    if (!document.path || !document.diskVersion) return
    this.#watchDisposers.get(document.id)?.()
    const token = this.#watchState.repoint(asTabId(document.id), document.path, document.diskVersion)
    this.#watchTokens.set(document.id, token)
    const dispose = this.platform.watch.subscribe(document.path, () => {
      void this.#readPath(document.path!, document.id).then((outcome) => {
        if (outcome.kind !== 'opened' || !outcome.document.diskVersion) return
        const decision = this.#watchState.invalidate(token, outcome.document.diskVersion, false)
        if (decision.kind !== 'reload') return
        for (const listener of this.#externalListeners) listener({ document: outcome.document, kind: 'changed' })
      })
    }, () => {
      if (this.#watchState.fail(token).kind !== 'warning') return
      for (const listener of this.#externalListeners) listener({ id: document.id, kind: 'watch-warning' })
    })
    this.#watchDisposers.set(document.id, dispose)
  }

  #coordinate(input: GatewayDocument, operation: () => Promise<SaveOutcome>): Promise<SaveOutcome> {
    let coordinator = this.#saveCoordinators.get(input.id)
    if (!coordinator) {
      coordinator = new SaveCoordinator(
        ({ snapshot }) => snapshot(),
        (outcome) => outcome.kind === 'saved' || outcome.kind === 'cleanup-warning' || outcome.kind === 'unchanged',
      )
      this.#saveCoordinators.set(input.id, coordinator)
    }
    return coordinator.save({ revision: input.revision ?? 0, snapshot: operation })
  }
}

export class ElectronDocumentGateway implements DocumentGatewayPort {
  constructor(readonly api: MarkzenApi) {}

  async closeTab(id: string): Promise<void> {
    await this.api.document.close(asTabId(id), 0)
  }

  async confirmClose(id: string, name: string): Promise<'cancel' | 'discard' | 'save'> {
    const result = await this.api.document.confirmClose(asTabId(id), 0, name)
    return result.ok ? result.value : 'cancel'
  }

  async confirmWindowClose(dirtyNames: readonly string[]): Promise<'cancel' | 'discard' | 'save-all'> {
    const result = await this.api.document.confirmWindowClose(dirtyNames)
    return result.ok ? result.value : 'cancel'
  }

  async completeQuitSaveAll(success: boolean): Promise<void> {
    await this.api.document.completeQuitSaveAll(success)
  }

  async acceptExternal(document: GatewayDocument): Promise<boolean> {
    if (!document.diskVersion) return false
    const result = await this.api.document.acceptExternal(asTabId(document.id), 0, document.diskVersion)
    return result.ok
  }

  async createTabId(): Promise<string> {
    const result = await this.api.document.createTab()
    if (!result.ok) throw new Error('Could not create a document tab')
    return result.value
  }

  async open(id?: string): Promise<OpenOutcome> {
    if (!id) return { kind: 'error' }
    const result = await this.api.document.open(asTabId(id), 0)
    if (!result.ok || result.value.kind === 'error') return { kind: 'error' }
    if (result.value.kind !== 'opened') return { kind: 'cancelled' }
    return parseRemoteFile(result.value.file)
  }

  onCommand(listener: (command: import('../platform/contracts').DocumentCommand) => void): () => void {
    return this.api.document.onCommand(listener)
  }

  onExternalChange(listener: (event: ExternalGatewayEvent) => void): () => void {
    return this.api.document.onExternalChange((event) => {
      if (event.kind === 'changed') {
        const parsed = parseRemoteFile(event.file)
        if (parsed.kind === 'opened') listener({ document: parsed.document, kind: 'changed' })
      } else listener({ id: event.tabId, kind: event.kind })
    })
  }

  async overwriteExternal(input: SaveInput, diskVersion: DiskVersion): Promise<SaveOutcome> {
    const bytes = input.document ? serializeRichDocument(input.document, input.encoding ?? { bom: false, newline: 'lf' }) : input.preservation?.bytes ?? new Uint8Array()
    const result = await this.api.document.overwriteExternal({
      bytes,
      diskVersion,
      documentDirty: input.documentDirty,
      generation: 0,
      tabId: asTabId(input.id),
      title: input.title,
      titleDirty: input.titleDirty,
    })
    return remoteSaveOutcome(input, result)
  }

  async retryCleanup(input: GatewayDocument): Promise<SaveOutcome> {
    const result = await this.api.document.retryCleanup(asTabId(input.id), 0)
    return remoteSaveOutcome(input, result)
  }

  async save(input: SaveInput): Promise<SaveOutcome> {
    const bytes = input.preservation?.bytes ?? (input.document ? serializeRichDocument(input.document, input.encoding ?? { bom: false, newline: 'lf' }) : new Uint8Array())
    const result = await this.api.document.save({
      bytes,
      documentDirty: input.documentDirty,
      generation: 0,
      tabId: asTabId(input.id),
      title: input.title,
      titleDirty: input.titleDirty,
    })
    return remoteSaveOutcome(input, result)
  }

  async saveAndRename(input: SaveInput): Promise<SaveOutcome> {
    const bytes = input.document ? serializeRichDocument(input.document, input.encoding ?? { bom: false, newline: 'lf' }) : new Uint8Array()
    const result = await this.api.document.saveAndRename({
      bytes,
      documentDirty: input.documentDirty,
      generation: 0,
      tabId: asTabId(input.id),
      title: input.title,
      titleDirty: input.titleDirty,
    })
    return remoteSaveOutcome(input, result)
  }

  async saveAs(input: GatewayDocument): Promise<SaveOutcome> {
    const bytes = input.preservation?.bytes ?? (input.document ? serializeRichDocument(input.document, input.encoding ?? { bom: false, newline: 'lf' }) : new Uint8Array())
    const result = await this.api.document.saveAs({
      bytes,
      documentDirty: true,
      generation: 0,
      tabId: asTabId(input.id),
      title: input.title,
      titleDirty: true,
    })
    return remoteSaveOutcome(input, result)
  }

  async updateMenuState(state: import('../platform/contracts').DocumentMenuState): Promise<void> {
    await this.api.document.updateMenuState(state)
  }
}

function parseRemoteFile(file: import('../platform/contracts').DocumentFilePayload): OpenOutcome {
  const parsed = parseDocumentBytes(file.bytes)
  const identity = { diskVersion: file.diskVersion, fileKey: file.fileKey, id: file.tabId, path: file.path, title: displayDocumentStem(basename(file.path)) }
  if (parsed.mode === 'rich') return { document: { ...identity, document: parsed.document, encoding: parsed.encoding }, kind: 'opened' }
  return { document: { ...identity, preservation: {
    bytes: parsed.bytes,
    display: parsed.mode === 'preserve-bytes' ? parsed.escaped : parsed.text,
    kind: parsed.mode === 'preserve-bytes' ? 'bytes' : 'text',
  } }, kind: 'opened' }
}

function remoteSaveOutcome(
  input: GatewayDocument,
  result: Awaited<ReturnType<MarkzenApi['document']['save']>>,
): SaveOutcome {
  if (!result.ok) return { kind: 'error' }
  if (result.value.kind === 'saved' || result.value.kind === 'cleanup-warning') {
    const document = {
      ...input,
      diskVersion: result.value.file.diskVersion,
      fileKey: result.value.file.fileKey,
      path: result.value.file.path,
      title: displayDocumentStem(basename(result.value.file.path)),
    }
    return result.value.kind === 'cleanup-warning'
      ? { document, kind: 'cleanup-warning', oldPath: result.value.oldPath }
      : { document, kind: 'saved' }
  }
  return { kind: result.value.kind === 'opened' ? 'error' : result.value.kind }
}

const failure = (code: string): SaveOutcome => ({ kind: code === 'conflict' ? 'conflict' : code === 'not-found' ? 'missing' : code === 'already-exists' ? 'collision' : 'error' })
const basename = (path: Path): string => String(path).split(/[\\/]/).at(-1) ?? ''
const dirname = (path: Path): Path => String(path).slice(0, Math.max(String(path).lastIndexOf('/'), String(path).lastIndexOf('\\'))) as Path
const join = (parent: Path, name: string): Path => `${parent}${String(parent).includes('\\') ? '\\' : '/'}${name}` as Path
