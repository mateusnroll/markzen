declare const pathBrand: unique symbol
declare const fileKeyBrand: unique symbol
declare const windowIdBrand: unique symbol
declare const diskVersionBrand: unique symbol
declare const tabIdBrand: unique symbol

export type Path = string & { readonly [pathBrand]: true }
export type FileKey = string & { readonly [fileKeyBrand]: true }
export type WindowId = string & { readonly [windowIdBrand]: true }
export type DiskVersion = string & { readonly [diskVersionBrand]: true }
export type TabId = string & { readonly [tabIdBrand]: true }

export type FsFailureCode =
  | 'invalid-path'
  | 'not-found'
  | 'already-exists'
  | 'not-file'
  | 'not-directory'
  | 'permission-denied'
  | 'not-empty'
  | 'unavailable'
  | 'io'

export type CapabilityFailureCode = 'validation' | 'sender' | 'ownership'
export type DocumentFailureCode = 'already-open' | 'blocked' | 'cancelled' | 'conflict' | 'stale' | 'watch-unavailable'
export type PlatformFailureCode = FsFailureCode | CapabilityFailureCode | DocumentFailureCode

export type PlatformResult<T, Code extends PlatformFailureCode = PlatformFailureCode> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly error: { readonly code: Code } }

export const ok = <T>(value: T): { readonly ok: true; readonly value: T } => ({ ok: true, value })
export const fail = <Code extends PlatformFailureCode>(code: Code): { readonly error: { readonly code: Code }; readonly ok: false } => ({
  error: { code },
  ok: false,
})

export const asPath = (value: string): Path => value as Path
export const asFileKey = (value: string): FileKey => value as FileKey
export const asWindowId = (value: string): WindowId => value as WindowId
export const asDiskVersion = (value: string): DiskVersion => value as DiskVersion
export const asTabId = (value: string): TabId => value as TabId

export type FileStat = {
  readonly fileKey: FileKey
  readonly kind: 'file' | 'directory'
  readonly size: number
}

export type CanonicalPath = {
  readonly fileKey: FileKey
  readonly path: Path
}

export type FileRead = CanonicalPath & {
  readonly bytes: Uint8Array
  readonly diskVersion: DiskVersion
}

export type ExpectedDiskVersion = DiskVersion | 'missing'

export interface FileSystemPort {
  atomicReplace(path: Path, bytes: Uint8Array, expected: ExpectedDiskVersion): Promise<PlatformResult<FileRead, FsFailureCode | 'conflict'>>
  canonicalize(path: Path): Promise<PlatformResult<CanonicalPath, FsFailureCode>>
  create(path: Path, bytes: Uint8Array): Promise<PlatformResult<void, FsFailureCode>>
  move(source: Path, target: Path, expected: DiskVersion): Promise<PlatformResult<FileRead, FsFailureCode | 'conflict'>>
  overwrite(path: Path, bytes: Uint8Array): Promise<PlatformResult<void, FsFailureCode>>
  read(path: Path): Promise<PlatformResult<FileRead, FsFailureCode>>
  remove(path: Path): Promise<PlatformResult<void, FsFailureCode>>
  stat(path: Path): Promise<PlatformResult<FileStat, FsFailureCode>>
}

export type OpenDialogOptions = {
  readonly extensions: readonly ['md', 'markdown', 'txt']
  readonly title: 'Open Markdown Document'
}

export type SaveDialogOptions = {
  readonly confirmationLabel: 'Save As'
  readonly defaultName: string
  readonly message: 'A new document will be created from the current tab.'
  readonly title: 'Save Current Tab As'
}

export type ConfirmationDialogOptions = {
  readonly buttons: readonly string[]
  readonly message: string
  readonly title: string
}

export type DialogResult =
  | { readonly kind: 'open'; readonly path?: Path }
  | { readonly kind: 'save'; readonly path?: Path }
  | { readonly choice: number; readonly kind: 'confirm' }

export interface DialogPort {
  confirm(options: ConfirmationDialogOptions): Promise<PlatformResult<number, 'blocked'>>
  open(options: OpenDialogOptions): Promise<PlatformResult<Path | undefined, 'blocked'>>
  save(options: SaveDialogOptions): Promise<PlatformResult<Path | undefined, 'blocked'>>
}

export interface WatchPort {
  subscribe(path: Path, listener: () => void, onError: () => void): () => void
}

export type WindowStatus = 'normal' | 'minimized' | 'maximized' | 'closed'
export type WindowState = {
  readonly focused: boolean
  readonly status: WindowStatus
}

export interface WindowPort {
  close(windowId: WindowId): Promise<PlatformResult<void>>
  create(): Promise<WindowId>
  focus(windowId: WindowId): Promise<PlatformResult<void>>
  getState(windowId: WindowId): Promise<PlatformResult<WindowState>>
  minimize(windowId: WindowId): Promise<PlatformResult<void>>
  onState(windowId: WindowId, listener: (state: WindowState) => void): () => void
  toggleMaximize(windowId: WindowId): Promise<PlatformResult<void>>
}

export interface Platform {
  readonly dialog: DialogPort
  readonly fs: FileSystemPort
  readonly kind: 'electron' | 'memory'
  readonly watch: WatchPort
  readonly window: WindowPort
}

export type PlatformName = 'darwin' | 'linux' | 'win32'

export const MARKZEN_API_VERSION = 1 as const

export type BootstrapPayload = {
  readonly platformName: PlatformName
  readonly state: WindowState
  readonly windowId: WindowId
}

export type DocumentFilePayload = FileRead & { readonly tabId: TabId }
export type DocumentIntentOutcome =
  | { readonly file: DocumentFilePayload; readonly kind: 'opened' | 'saved' }
  | { readonly file: DocumentFilePayload; readonly kind: 'cleanup-warning'; readonly oldPath: Path }
  | { readonly kind: 'cancelled' | 'collision' | 'conflict' | 'error' | 'missing' | 'rename-decision' | 'unchanged' }

export type DocumentWriteRequest = {
  readonly bytes: Uint8Array
  readonly documentDirty: boolean
  readonly generation: number
  readonly tabId: TabId
  readonly title: string
  readonly titleDirty: boolean
}
export type DocumentCommand = 'close-tab' | 'close-window' | 'new' | 'open' | 'save' | 'save-all' | 'save-all-for-quit' | 'save-as'
export type DocumentMenuState = {
  readonly activeTabId?: TabId
  readonly tabs: readonly {
    readonly dirty: boolean
    readonly preservation: boolean
    readonly tabId: TabId
    readonly title: string
    readonly titleValid: boolean
  }[]
}
export type DocumentExternalEvent =
  | { readonly file: DocumentFilePayload; readonly kind: 'changed' }
  | { readonly kind: 'missing' | 'watch-warning'; readonly tabId: TabId }

export interface MarkzenDocumentCapability {
  acceptExternal(tabId: TabId, generation: number, diskVersion: DiskVersion): Promise<PlatformResult<void>>
  close(tabId: TabId, generation: number): Promise<PlatformResult<void>>
  confirmClose(tabId: TabId, generation: number, name: string): Promise<PlatformResult<'cancel' | 'discard' | 'save'>>
  confirmWindowClose(dirtyNames: readonly string[]): Promise<PlatformResult<'cancel' | 'discard' | 'save-all'>>
  completeQuitSaveAll(success: boolean): Promise<PlatformResult<void>>
  createTab(): Promise<PlatformResult<TabId>>
  open(tabId: TabId, generation: number): Promise<PlatformResult<DocumentIntentOutcome>>
  onCommand(listener: (command: DocumentCommand) => void): () => void
  onExternalChange(listener: (event: DocumentExternalEvent) => void): () => void
  overwriteExternal(request: DocumentWriteRequest & { readonly diskVersion: DiskVersion }): Promise<PlatformResult<DocumentIntentOutcome>>
  retryCleanup(tabId: TabId, generation: number): Promise<PlatformResult<DocumentIntentOutcome>>
  save(request: DocumentWriteRequest): Promise<PlatformResult<DocumentIntentOutcome>>
  saveAndRename(request: DocumentWriteRequest): Promise<PlatformResult<DocumentIntentOutcome>>
  saveAs(request: DocumentWriteRequest): Promise<PlatformResult<DocumentIntentOutcome>>
  updateMenuState(state: DocumentMenuState): Promise<PlatformResult<void>>
}

export interface MarkzenWindowCapability {
  close(): Promise<PlatformResult<void>>
  getState(): Promise<PlatformResult<WindowState>>
  minimize(): Promise<PlatformResult<void>>
  onState(listener: (state: WindowState) => void): () => void
  toggleMaximize(): Promise<PlatformResult<void>>
}

export interface MarkzenApi {
  readonly bootstrap: () => Promise<PlatformResult<BootstrapPayload>>
  readonly document: MarkzenDocumentCapability
  readonly version: typeof MARKZEN_API_VERSION
  readonly window: MarkzenWindowCapability
}
