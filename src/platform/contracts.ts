declare const pathBrand: unique symbol
declare const fileKeyBrand: unique symbol
declare const windowIdBrand: unique symbol

export type Path = string & { readonly [pathBrand]: true }
export type FileKey = string & { readonly [fileKeyBrand]: true }
export type WindowId = string & { readonly [windowIdBrand]: true }

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
export type PlatformFailureCode = FsFailureCode | CapabilityFailureCode

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
}

export interface FileSystemPort {
  canonicalize(path: Path): Promise<PlatformResult<CanonicalPath, FsFailureCode>>
  create(path: Path, bytes: Uint8Array): Promise<PlatformResult<void, FsFailureCode>>
  overwrite(path: Path, bytes: Uint8Array): Promise<PlatformResult<void, FsFailureCode>>
  read(path: Path): Promise<PlatformResult<FileRead, FsFailureCode>>
  remove(path: Path): Promise<PlatformResult<void, FsFailureCode>>
  stat(path: Path): Promise<PlatformResult<FileStat, FsFailureCode>>
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
  readonly fs: FileSystemPort
  readonly kind: 'electron' | 'memory'
  readonly window: WindowPort
}

export type PlatformName = 'darwin' | 'linux' | 'win32'

export const MARKZEN_API_VERSION = 1 as const

export type BootstrapPayload = {
  readonly platformName: PlatformName
  readonly state: WindowState
  readonly windowId: WindowId
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
  readonly version: typeof MARKZEN_API_VERSION
  readonly window: MarkzenWindowCapability
}
