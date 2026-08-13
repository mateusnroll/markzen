import { displayDocumentStem, deriveDocumentFilename, getRecognizedExtension } from './filename'
import { parseDocumentBytes, serializeRichDocument, type DocumentEncoding, type RichDocument } from './markdown'
import { csvPreservationMessage, parseCsvBytes, serializeCsvDocument, type CsvDocument } from './csv'
import { jsonPreservationMessage, parseJsonBytes, serializeJsonDocument, type JsonDocument } from './json'
import { classifyDocumentName, GENERIC_TEXT_EXTENSIONS, RASTER_EXTENSIONS, rasterDisplayMetadata, SPECIALIZED_DOCUMENT_EXTENSIONS, type RasterDisplayMetadata } from './file-types'
import { parseTextBytes, serializeTextDocument, textPreservationMessage, TEXT_TRANSFER_MAX_BYTES, type TextDocument } from './text'
import { decodeEmbeddedImage, MAX_ACQUIRED_IMAGE_BYTES } from '../assets/image-sources'
import { validateRaster } from '../assets/raster'
import { SaveCoordinator } from './save-coordinator'
import { DocumentWatchState, type WatchToken } from './watch-state'
import {
  type DiskVersion,
  type FileKey,
  type Path,
  type Platform,
  type MarkzenApi,
  type RootId,
  asTabId,
  type ImageIntentOutcome,
  type ImageCandidate,
} from '../platform/contracts'

export type GatewayDocument = {
  readonly assetsRevoked?: boolean
  readonly diskVersion?: DiskVersion
  readonly document?: RichDocument
  readonly csv?: CsvDocument
  readonly json?: JsonDocument
  readonly text?: TextDocument
  readonly language?: string
  readonly managedExtension?: string
  readonly raster?: RasterDisplayMetadata & { readonly url: string }
  readonly limitation?: string
  readonly encoding?: DocumentEncoding
  readonly fileKey?: FileKey
  readonly id: string
  readonly kind?: 'csv' | 'external' | 'json' | 'markdown' | 'raster' | 'text'
  readonly path?: Path
  readonly preservation?: { readonly bytes: Uint8Array; readonly display: string; readonly kind: 'bytes' | 'text' }
  readonly revision?: number
  readonly secondaryPath?: string
  readonly sourceRebases?: readonly import('../platform/contracts').SourceRebase[]
  readonly title: string
}

export type SaveInput = GatewayDocument & { readonly documentDirty: boolean; readonly titleDirty: boolean }
export type OpenOutcome = { readonly document: GatewayDocument; readonly kind: 'opened' } | { readonly kind: 'cancelled' | 'collision' | 'error' }
export type WorkspaceOpenInput = {
  readonly fileKey: FileKey
  readonly generation: number
  readonly id: string
  readonly path: Path
  readonly relativePath: string
  readonly rootId: RootId
}
export type SaveOutcome =
  | { readonly document: GatewayDocument; readonly kind: 'saved' }
  | { readonly document: GatewayDocument; readonly kind: 'cleanup-warning'; readonly oldPath: Path }
  | { readonly kind: 'cancelled' | 'collision' | 'conflict' | 'error' | 'missing' | 'rename-decision' | 'unchanged' }
export type ExternalGatewayEvent =
  | { readonly document: GatewayDocument; readonly kind: 'changed' }
  | { readonly id: string; readonly kind: 'missing' }
  | { readonly id: string; readonly kind: 'watch-warning' }

export interface DocumentGatewayPort {
  authorizeImage(id: string, source: string): Promise<ImageIntentOutcome>
  acceptExternal(document: GatewayDocument): Promise<boolean>
  closeTab(id: string): Promise<void>
  confirmClose(id: string, name: string): Promise<'cancel' | 'discard' | 'save'>
  confirmWindowClose(dirtyNames: readonly string[]): Promise<'cancel' | 'discard' | 'save-all'>
  commitImage(id: string, candidateId: string): Promise<ImageIntentOutcome>
  loadRemoteImage(id: string, assetId: string, source: string, generation: number): Promise<ImageIntentOutcome>
  completeQuitSaveAll(success: boolean): Promise<void>
  createTabId(kind?: 'csv' | 'json' | 'markdown'): Promise<string>
  open(id?: string): Promise<OpenOutcome>
  openInDefaultApp(id: string): Promise<import('../platform/contracts').ExternalOpenResult>
  openWorkspace(input: WorkspaceOpenInput): Promise<OpenOutcome>
  onCommand(listener: (command: import('../platform/contracts').RendererCommand) => void): () => void
  onExternalChange(listener: (event: ExternalGatewayEvent) => void): () => void
  overwriteExternal(input: SaveInput, diskVersion: DiskVersion): Promise<SaveOutcome>
  retryCleanup(input: GatewayDocument): Promise<SaveOutcome>
  resolveEmbeddedImage(id: string, assetId: string, source: string, generation: number): Promise<ImageIntentOutcome>
  resolveImage(id: string, source: string): Promise<ImageIntentOutcome>
  revokeImage(id: string, assetId: string, source: string, generation: number, url?: string): Promise<void>
  save(input: SaveInput): Promise<SaveOutcome>
  saveAndRename(input: SaveInput): Promise<SaveOutcome>
  saveAs(input: GatewayDocument): Promise<SaveOutcome>
  selectImage(id: string): Promise<ImageIntentOutcome>
  updateMenuState(state: import('../platform/contracts').DocumentMenuState): Promise<void>
}

export class DocumentGateway implements DocumentGatewayPort {
  readonly #externalListeners = new Set<(event: ExternalGatewayEvent) => void>()
  readonly #saveCoordinators = new Map<string, SaveCoordinator<() => Promise<SaveOutcome>, SaveOutcome, number>>()
  readonly #watchState = new DocumentWatchState()
  readonly #watchTokens = new Map<string, WatchToken>()
  readonly #watchDisposers = new Map<string, () => void>()
  readonly #cleanupPaths = new Map<string, Path>()
  readonly #documents = new Map<string, GatewayDocument>()
  readonly #imageCandidates = new Map<string, { readonly candidate: ImageCandidate; readonly fileKey: FileKey; readonly path: Path }>()
  readonly #imageGrants = new Map<string, FileKey>()
  readonly #assetUrls = new Map<string, Set<string>>()

  constructor(readonly platform: Platform) {}

  async openInDefaultApp(id: string): Promise<import('../platform/contracts').ExternalOpenResult> {
    void id
    return { kind: 'unsupported' }
  }

  async authorizeImage(id: string, source: string): Promise<ImageIntentOutcome> {
    const target = await this.#readImageSource(id, source)
    if (!target) return { kind: 'blocked' }
    const selected = await this.platform.dialog.image()
    if (!selected.ok || !selected.value) return { kind: 'cancelled' }
    const read = await this.platform.fs.read(selected.value)
    if (!read.ok || read.value.fileKey !== target.fileKey) return { kind: 'mismatch' }
    if (!validateRaster(read.value.bytes, String(read.value.path)).ok) return { kind: 'error' }
    this.#imageGrants.set(`${id}:${source}`, read.value.fileKey)
    return { asset: { source, url: this.#assetUrl(id, read.value.bytes, String(read.value.path)) }, kind: 'authorized' }
  }

  async commitImage(id: string, candidateId: string): Promise<ImageIntentOutcome> {
    const value = this.#imageCandidates.get(candidateId)
    this.#imageCandidates.delete(candidateId)
    if (!value) return { kind: 'error' }
    const read = await this.platform.fs.read(value.path)
    if (!read.ok || read.value.fileKey !== value.fileKey || !validateRaster(read.value.bytes, String(read.value.path)).ok) return { kind: 'error' }
    this.#imageGrants.set(`${id}:${value.candidate.source}`, value.fileKey)
    return { asset: { source: value.candidate.source, url: this.#assetUrl(id, read.value.bytes, String(read.value.path)) }, kind: 'authorized' }
  }

  async loadRemoteImage(_id: string, _assetId: string, _source: string, _generation: number): Promise<ImageIntentOutcome> {
    void _id; void _assetId; void _source; void _generation
    return { kind: 'retryable' }
  }

  async resolveImage(id: string, source: string): Promise<ImageIntentOutcome> {
    const read = await this.#readImageSource(id, source)
    if (!read) return { kind: 'blocked' }
    const document = this.#documents.get(id)
    const scope = document?.path ? await this.platform.fs.canonicalize(this.platform.paths.directory(document.path)) : undefined
    const explicitlyGranted = this.#imageGrants.get(`${id}:${source}`) === read.fileKey
    if (!explicitlyGranted && (!scope?.ok || !this.platform.paths.contains(scope.value.path, read.path))) return { kind: 'blocked' }
    return { asset: { source, url: this.#assetUrl(id, read.bytes, String(read.path)) }, kind: 'authorized' }
  }

  async resolveEmbeddedImage(id: string, _assetId: string, source: string, _generation: number): Promise<ImageIntentOutcome> {
    void _generation
    const decoded = decodeEmbeddedImage(source)
    if (!decoded.ok || !validateRaster(decoded.bytes, { expectedMime: decoded.mime, maxBytes: MAX_ACQUIRED_IMAGE_BYTES }).ok) return { kind: 'blocked' }
    return { asset: { source, url: this.#assetUrl(id, decoded.bytes, `embedded.${decoded.mime.slice('image/'.length)}`) }, kind: 'authorized' }
  }

  async revokeImage(id: string, _assetId: string, _source: string, _generation: number, url?: string): Promise<void> {
    if (!url) return
    URL.revokeObjectURL(url)
    this.#assetUrls.get(id)?.delete(url)
  }

  async selectImage(id: string): Promise<ImageIntentOutcome> {
    const selected = await this.platform.dialog.image()
    if (!selected.ok || !selected.value) return { kind: 'cancelled' }
    const read = await this.platform.fs.read(selected.value)
    if (!read.ok || !validateRaster(read.value.bytes, String(read.value.path)).ok) return { kind: 'error' }
    const document = this.#documents.get(id)
    const relative = this.platform.paths.relative(document?.path, read.value.path)
    const candidateId = `memory-image-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const candidate = { candidateId, internal: !document?.path, name: basename(read.value.path), portable: relative.portable, source: relative.source }
    this.#imageCandidates.set(candidateId, { candidate, fileKey: read.value.fileKey, path: read.value.path })
    return { candidate, kind: 'candidate' }
  }

  async closeTab(id: string): Promise<void> {
    for (const url of this.#assetUrls.get(id) ?? []) URL.revokeObjectURL(url)
    this.#assetUrls.delete(id)
    this.#documents.delete(id)
    for (const key of this.#imageGrants.keys()) if (key.startsWith(`${id}:`)) this.#imageGrants.delete(key)
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
    const selected = await this.platform.dialog.open({
      extensions: [...SPECIALIZED_DOCUMENT_EXTENSIONS, ...GENERIC_TEXT_EXTENSIONS, ...RASTER_EXTENSIONS, '*'],
      title: 'Open Markzen Document',
    })
    if (!selected.ok) return { kind: 'error' }
    return selected.value ? this.openPath(selected.value, id ?? `file-${Date.now()}`) : { kind: 'cancelled' }
  }

  async openWorkspace(input: WorkspaceOpenInput): Promise<OpenOutcome> {
    return this.openPath(input.path, input.id)
  }

  onCommand(listener: (command: import('../platform/contracts').RendererCommand) => void): () => void {
    void listener
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
    if (!input.path || (!input.document && !input.csv && !input.json && !input.text)) return { kind: 'error' }
    const bytes = gatewayBytes(input)
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
    if (outcome.kind === 'opened') {
      this.#documents.set(id, outcome.document)
      this.#watchDocument(outcome.document)
    }
    return outcome
  }

  async #readPath(path: Path, id: string): Promise<OpenOutcome> {
    const classification = classifyDocumentName(basename(path))
    if (classification.kind === 'external') {
      const stat = await this.platform.fs.stat(path)
      if (!stat.ok || stat.value.kind !== 'file') return { kind: 'error' }
      if (stat.value.size > TEXT_TRANSFER_MAX_BYTES) {
        const canonical = await this.platform.fs.canonicalize(path)
        if (!canonical.ok || canonical.value.fileKey !== stat.value.fileKey) return { kind: 'error' }
        return externalCandidate(id, canonical.value, 'This file is too large for Markzen. Open it in the default app instead.')
      }
    }
    const read = await this.platform.fs.read(path)
    if (!read.ok) return { kind: 'error' }
    const filename = basename(read.value.path)
    const textExtension = classification.kind === 'text' && classification.managedExtension
      ? filename.slice(-classification.managedExtension.length)
      : undefined
    const title = classification.kind === 'raster'
      ? filename
      : classification.kind === 'text'
        ? textExtension ? filename.slice(0, -textExtension.length) : filename
        : displayDocumentStem(filename)
    const identity = { diskVersion: read.value.diskVersion, fileKey: read.value.fileKey, id, path: read.value.path, title }
    if (classification.kind === 'external') {
      const parsed = parseTextBytes(read.value.bytes)
      return parsed.mode === 'editable'
        ? { document: { ...identity, kind: 'text', language: 'Plain text', text: parsed.document, title: filename }, kind: 'opened' }
        : externalCandidate(id, read.value, `${textPreservationMessage(parsed.reason)} Open it in the default app instead.`)
    }
    if (classification.kind === 'raster') {
      const validation = validateRaster(read.value.bytes, String(read.value.path))
      if (!validation.ok) return { document: {
        fileKey: read.value.fileKey,
        id,
        kind: 'external',
        limitation: 'Markzen could not safely preview this raster image.',
        path: read.value.path,
        title: basename(read.value.path),
      }, kind: 'opened' }
      return { document: {
        ...identity,
        kind: 'raster',
        raster: { ...rasterDisplayMetadata(validation.info), url: this.#assetUrl(id, read.value.bytes, String(read.value.path)) },
      }, kind: 'opened' }
    }
    if (classification.kind === 'csv') {
      const parsed = parseCsvBytes(read.value.bytes)
      return parsed.mode === 'editable'
        ? { document: { ...identity, csv: parsed.document, kind: 'csv' }, kind: 'opened' }
        : {
          document: {
            ...identity,
            kind: 'csv',
            preservation: {
              bytes: parsed.bytes,
              display: `${csvPreservationMessage(parsed.reason)} Its original bytes are preserved.`,
              kind: 'text',
            },
          },
          kind: 'opened',
        }
    }
    if (classification.kind === 'json') {
      const parsed = parseJsonBytes(read.value.bytes)
      return parsed.mode === 'editable'
        ? { document: { ...identity, json: parsed.document, kind: 'json' }, kind: 'opened' }
        : {
          document: {
            ...identity,
            kind: 'json',
            preservation: {
              bytes: parsed.bytes,
              display: `${jsonPreservationMessage(parsed.reason, parsed.location)} Its original bytes are preserved.`,
              kind: 'text',
            },
          },
          kind: 'opened',
        }
    }
    if (classification.kind === 'text') {
      const parsed = parseTextBytes(read.value.bytes)
      const textIdentity = {
        ...identity,
        kind: 'text' as const,
        language: classification.language,
        ...(textExtension ? { managedExtension: textExtension } : {}),
      }
      return parsed.mode === 'editable'
        ? { document: { ...textIdentity, text: parsed.document }, kind: 'opened' }
        : { document: { ...textIdentity, preservation: {
          bytes: parsed.bytes,
          display: textPreservationMessage(parsed.reason),
          kind: 'text',
        } }, kind: 'opened' }
    }
    const parsed = parseDocumentBytes(read.value.bytes)
    const outcome: OpenOutcome = parsed.mode === 'rich' ? {
      document: { ...identity, document: parsed.document, encoding: parsed.encoding, kind: 'markdown' }, kind: 'opened',
    } : {
      document: {
        ...identity,
        kind: 'markdown',
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
    const targetName = deriveDocumentFilename(input.title, input.kind === 'text' ? input.managedExtension : getRecognizedExtension(originalName), input.kind)
    const titleChanged = targetName !== originalName
    if (titleChanged && input.documentDirty) return { kind: 'rename-decision' }
    if (titleChanged) {
      const moved = await this.platform.fs.move(input.path, join(dirname(input.path), targetName), input.diskVersion)
      return moved.ok ? this.#saved(input, moved.value) : failure(moved.error.code)
    }
    if (!input.document && !input.csv && !input.json && !input.text) return { kind: 'unchanged' }
    const bytes = gatewayBytes(input)
    const replaced = await this.platform.fs.atomicReplace(input.path, bytes, input.diskVersion)
    return replaced.ok ? this.#saved(input, replaced.value) : failure(replaced.error.code)
  }

  async saveAndRename(input: SaveInput): Promise<SaveOutcome> {
    return this.#coordinate(input, async () => this.#saveAndRename(input))
  }

  async #saveAndRename(input: SaveInput): Promise<SaveOutcome> {
    if (!input.path || !input.diskVersion || (!input.document && !input.csv && !input.json && !input.text)) return { kind: 'error' }
    const latest = await this.platform.fs.read(input.path)
    if (!latest.ok) return failure(latest.error.code)
    if (latest.value.diskVersion !== input.diskVersion) return { kind: 'conflict' }
    const targetName = deriveDocumentFilename(input.title, input.kind === 'text' ? input.managedExtension : getRecognizedExtension(basename(input.path)), input.kind)
    const target = join(dirname(input.path), targetName)
    const bytes = gatewayBytes(input)
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
      defaultName: deriveDocumentFilename(input.title, input.kind === 'text' ? input.managedExtension : undefined, input.kind),
      message: 'A new document will be created from the current tab.',
      title: 'Save Current Tab As',
    })
    if (!selected.ok) return { kind: 'error' }
    if (!selected.value) return { kind: 'cancelled' }
    const rebased = input.document ? rebaseMemoryDocument(input.document, input.path, selected.value, this.platform.paths) : undefined
    const savedInput: GatewayDocument = rebased
      ? { ...input, assetsRevoked: true, document: rebased.document, sourceRebases: rebased.sourceRebases }
      : input
    const existing = await this.platform.fs.read(selected.value)
    let expected: DiskVersion | 'missing' = 'missing'
    if (existing.ok) {
      if (input.fileKey === existing.value.fileKey && input.path === existing.value.path) {
        if (!input.diskVersion) return { kind: 'missing' }
        const samePath = await this.platform.fs.atomicReplace(input.path, gatewayBytes(savedInput), input.diskVersion)
        return samePath.ok ? this.#saved(savedInput, samePath.value) : failure(samePath.error.code)
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
    const bytes = gatewayBytes(savedInput)
    const replaced = await this.platform.fs.atomicReplace(selected.value, bytes, expected)
    return replaced.ok ? this.#saved(savedInput, replaced.value) : failure(replaced.error.code)
  }

  async updateMenuState(): Promise<void> {}

  #adoptTitle(path: Path): string {
    return displayDocumentStem(basename(path))
  }

  adopt(input: GatewayDocument, read: { readonly diskVersion: DiskVersion; readonly fileKey: FileKey; readonly path: Path }): GatewayDocument {
    const filename = basename(read.path)
    const title = input.kind === 'text' && input.managedExtension && filename.toLowerCase().endsWith(input.managedExtension.toLowerCase())
      ? filename.slice(0, -input.managedExtension.length)
      : this.#adoptTitle(read.path)
    return { ...input, diskVersion: read.diskVersion, fileKey: read.fileKey, path: read.path, title }
  }

  #saved(input: GatewayDocument, read: { readonly diskVersion: DiskVersion; readonly fileKey: FileKey; readonly path: Path }): SaveOutcome {
    const document = this.adopt(input, read)
    this.#documents.set(input.id, document)
    this.#watchDocument(document)
    return { document, kind: 'saved' }
  }

  async #readImageSource(id: string, source: string): Promise<import('../platform/contracts').FileRead | undefined> {
    const document = this.#documents.get(id)
    if (!document?.path) return undefined
    const resolved = this.platform.paths.resolve(document.path, source)
    if (!resolved.ok) return undefined
    const read = await this.platform.fs.read(resolved.value)
    return read.ok && validateRaster(read.value.bytes, String(read.value.path)).ok ? read.value : undefined
  }

  #assetUrl(id: string, bytes: Uint8Array, path: string): string {
    const validation = validateRaster(bytes, path)
    if (!validation.ok) throw new Error('Invalid memory raster')
    const body = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const url = URL.createObjectURL(new Blob([body], { type: validation.info.mime }))
    const urls = this.#assetUrls.get(id) ?? new Set<string>()
    urls.add(url)
    this.#assetUrls.set(id, urls)
    return url
  }

  #watchDocument(document: GatewayDocument): void {
    if (!document.path || !document.diskVersion || document.kind === 'external') return
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

function externalCandidate(
  id: string,
  file: { readonly fileKey: FileKey; readonly path: Path },
  limitation: string,
): OpenOutcome {
  return { document: {
    fileKey: file.fileKey,
    id,
    kind: 'external',
    limitation,
    path: file.path,
    title: basename(file.path),
  }, kind: 'opened' }
}

export class ElectronDocumentGateway implements DocumentGatewayPort {
  constructor(readonly api: MarkzenApi) {}

  async authorizeImage(id: string, source: string): Promise<ImageIntentOutcome> {
    const result = await this.api.asset.authorize(asTabId(id), 0, source)
    return result.ok ? result.value : { kind: 'error' }
  }

  async commitImage(id: string, candidateId: string): Promise<ImageIntentOutcome> {
    const result = await this.api.asset.commit(asTabId(id), 0, candidateId)
    return result.ok ? result.value : { kind: 'error' }
  }

  async loadRemoteImage(id: string, assetId: string, source: string, generation: number): Promise<ImageIntentOutcome> {
    const result = await this.api.asset.loadRemote(asTabId(id), assetId, source, generation)
    return result.ok ? result.value : { kind: 'error' }
  }

  async resolveImage(id: string, source: string): Promise<ImageIntentOutcome> {
    const result = await this.api.asset.resolve(asTabId(id), 0, source)
    return result.ok ? result.value : { kind: 'error' }
  }

  async resolveEmbeddedImage(id: string, assetId: string, source: string, generation: number): Promise<ImageIntentOutcome> {
    const result = await this.api.asset.resolveEmbedded(asTabId(id), assetId, source, generation)
    return result.ok ? result.value : { kind: 'blocked' }
  }

  async revokeImage(id: string, assetId: string, source: string, generation: number, url?: string): Promise<void> {
    void url
    await this.api.asset.revoke(asTabId(id), assetId, source, generation)
  }

  async selectImage(id: string): Promise<ImageIntentOutcome> {
    const result = await this.api.asset.select(asTabId(id), 0)
    return result.ok ? result.value : { kind: 'error' }
  }

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

  async createTabId(kind: 'csv' | 'json' | 'markdown' = 'markdown'): Promise<string> {
    const result = await this.api.document.createTab(kind)
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

  async openInDefaultApp(id: string): Promise<import('../platform/contracts').ExternalOpenResult> {
    const result = await this.api.document.openInDefaultApp(asTabId(id), 0)
    return result.ok ? result.value : { kind: 'error' }
  }

  async openWorkspace(_input: WorkspaceOpenInput): Promise<OpenOutcome> {
    const result = await this.api.workspace.open(
      asTabId(_input.id),
      _input.rootId,
      _input.relativePath,
      _input.fileKey,
      _input.generation,
    )
    if (!result.ok) return { kind: 'error' }
    if (result.value.kind === 'collision') return { kind: 'collision' }
    if (result.value.kind !== 'opened') return { kind: 'error' }
    return parseRemoteFile(result.value.file)
  }

  onCommand(listener: (command: import('../platform/contracts').RendererCommand) => void): () => void {
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
    const bytes = gatewayBytes(input)
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
    const bytes = gatewayBytes(input)
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
    const bytes = gatewayBytes(input)
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
    const bytes = gatewayBytes(input)
    const result = await this.api.document.saveAs({
      bytes,
      documentDirty: true,
      generation: 0,
      tabId: asTabId(input.id),
      title: input.title,
      titleDirty: true,
      ...(input.document ? { encoding: input.encoding ?? { bom: false, newline: 'lf' }, model: input.document } : {}),
    })
    return remoteSaveOutcome(input, result)
  }

  async updateMenuState(state: import('../platform/contracts').DocumentMenuState): Promise<void> {
    await this.api.document.updateMenuState(state)
  }
}

function parseRemoteFile(file: import('../platform/contracts').DocumentFilePayload): OpenOutcome {
  const baseIdentity = {
    fileKey: file.fileKey,
    id: file.tabId,
    path: file.path,
    ...(file.secondaryPath ? { secondaryPath: file.secondaryPath } : {}),
  }
  const kind = file.kind
  if (kind === 'external') return { document: {
    ...baseIdentity,
    kind,
    limitation: file.limitation,
    title: basename(file.path),
  }, kind: 'opened' }
  if (kind === 'raster') return { document: {
    ...baseIdentity,
    diskVersion: file.diskVersion,
    kind,
    raster: file.raster,
    title: basename(file.path),
  }, kind: 'opened' }
  const identity = {
    ...baseIdentity,
    diskVersion: file.diskVersion,
    title: kind === 'text' && file.managedExtension
      ? basename(file.path).slice(0, -file.managedExtension.length)
      : displayDocumentStem(basename(file.path)),
  }
  if (kind === 'csv') {
    const parsed = parseCsvBytes(file.bytes)
    if (parsed.mode === 'editable') return { document: { ...identity, csv: parsed.document, kind }, kind: 'opened' }
    return { document: { ...identity, kind, preservation: {
      bytes: parsed.bytes,
      display: `${csvPreservationMessage(parsed.reason)} Its original bytes are preserved.`,
      kind: 'text',
    } }, kind: 'opened' }
  }
  if (kind === 'json') {
    const parsed = parseJsonBytes(file.bytes)
    if (parsed.mode === 'editable') return { document: { ...identity, json: parsed.document, kind }, kind: 'opened' }
    return { document: { ...identity, kind, preservation: {
      bytes: parsed.bytes,
      display: `${jsonPreservationMessage(parsed.reason, parsed.location)} Its original bytes are preserved.`,
      kind: 'text',
    } }, kind: 'opened' }
  }
  if (kind === 'text') {
    const parsed = parseTextBytes(file.bytes)
    const textIdentity = {
      ...identity,
      kind,
      language: file.language ?? 'Plain text',
      ...(file.managedExtension ? { managedExtension: file.managedExtension } : {}),
    }
    if (parsed.mode === 'editable') return { document: { ...textIdentity, text: parsed.document }, kind: 'opened' }
    return { document: { ...textIdentity, preservation: {
      bytes: parsed.bytes,
      display: textPreservationMessage(parsed.reason),
      kind: 'text',
    } }, kind: 'opened' }
  }
  const parsed = parseDocumentBytes(file.bytes)
  if (parsed.mode === 'rich') return { document: { ...identity, document: parsed.document, encoding: parsed.encoding, kind }, kind: 'opened' }
  return { document: { ...identity, kind, preservation: {
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
    if (result.value.file.kind === 'external' || result.value.file.kind === 'raster') return { kind: 'error' }
    const document = {
      ...input,
      diskVersion: result.value.file.diskVersion,
      fileKey: result.value.file.fileKey,
      path: result.value.file.path,
      ...(result.value.file.rebasedDocument ? { document: result.value.file.rebasedDocument as RichDocument } : {}),
      ...(result.value.file.assetsRevoked ? { assetsRevoked: true } : {}),
      ...(result.value.file.sourceRebases ? { sourceRebases: result.value.file.sourceRebases } : {}),
      ...(result.value.file.secondaryPath ? { secondaryPath: result.value.file.secondaryPath } : {}),
      ...(input.kind ? { kind: input.kind } : {}),
      title: displayDocumentStem(basename(result.value.file.path)),
    }
    return result.value.kind === 'cleanup-warning'
      ? { document, kind: 'cleanup-warning', oldPath: result.value.oldPath }
      : { document, kind: 'saved' }
  }
  return { kind: result.value.kind === 'opened' ? 'error' : result.value.kind }
}

const failure = (code: string): SaveOutcome => ({ kind: code === 'conflict' ? 'conflict' : code === 'not-found' ? 'missing' : code === 'already-exists' ? 'collision' : 'error' })

function gatewayBytes(document: GatewayDocument): Uint8Array {
  if (document.preservation?.bytes) return document.preservation.bytes
  if (document.csv) return serializeCsvDocument(document.csv)
  if (document.json) return serializeJsonDocument(document.json)
  if (document.text) return serializeTextDocument(document.text)
  if (document.document) return serializeRichDocument(document.document, document.encoding ?? { bom: false, newline: 'lf' })
  return new Uint8Array()
}

const basename = (path: Path): string => String(path).split(/[\\/]/).at(-1) ?? ''
const dirname = (path: Path): Path => String(path).slice(0, Math.max(String(path).lastIndexOf('/'), String(path).lastIndexOf('\\'))) as Path
const join = (parent: Path, name: string): Path => `${parent}${String(parent).includes('\\') ? '\\' : '/'}${name}` as Path

function rebaseMemoryDocument(
  document: RichDocument,
  oldPath: Path | undefined,
  newPath: Path,
  paths: import('../platform/contracts').PathPort,
): { readonly document: RichDocument; readonly sourceRebases: readonly import('../platform/contracts').SourceRebase[] } {
  const sourceRebases: import('../platform/contracts').SourceRebase[] = []
  const visit = (node: import('./markdown').RichNode): import('./markdown').RichNode => {
    const content = node.content?.map(visit)
    if (node.type !== 'image') return { ...node, ...(content ? { content } : {}) }
    const source = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
    const rebased = paths.rebase(source, node.attrs?.internal === true, oldPath, newPath)
    if (!rebased || rebased.source === source) return { ...node, attrs: { ...node.attrs, assetUrl: null, internal: false }, ...(content ? { content } : {}) }
    sourceRebases.push({ ...(typeof node.attrs?.assetId === 'string' ? { assetId: node.attrs.assetId } : {}), from: source, to: rebased.source })
    return { ...node, attrs: { ...node.attrs, assetUrl: null, internal: false, src: rebased.source }, ...(content ? { content } : {}) }
  }
  return { document: visit(document) as RichDocument, sourceRebases }
}
