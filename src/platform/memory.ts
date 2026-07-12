import {
  asFileKey,
  asDiskVersion,
  asPath,
  asWindowId,
  fail,
  ok,
  type CanonicalPath,
  type DiskVersion,
  type DialogPort,
  type DialogResult,
  type DirectoryEntry,
  type FileRead,
  type FileStat,
  type FileSystemPort,
  type FsFailureCode,
  type ExpectedDiskVersion,
  type Path,
  type Platform,
  type PlatformResult,
  type WindowId,
  type WindowPort,
  type WindowState,
  type WatchPort,
} from './contracts'

type MemoryPlatformOptions = {
  readonly caseSensitive: boolean
  readonly platform: 'posix' | 'win32'
}

type Access = { readable: boolean; writable: boolean }
type FileData = { bytes: Uint8Array }
type Entry =
  | { access: Access; kind: 'directory'; path: string; unavailable: boolean }
  | { access: Access; data: FileData; kind: 'file'; path: string; unavailable: boolean }
  | { access: Access; kind: 'symlink'; path: string; target: string; unavailable: boolean }

type Resolution = {
  readonly entry?: Entry
  readonly path: string
}

type WindowRecord = {
  readonly listeners: Set<(state: WindowState) => void>
  state: WindowState
}

export type MemoryPlatformHarness = {
  externalWrite(path: string, bytes: Uint8Array): Promise<void>
  activeWatchCount(): number
  emitWatch(path: string): void
  failWatch(path: string): void
  fileCount(): number
  hardlink(path: string, target: string): void
  mkdir(path: string): void
  operationCount(): number
  path(value: string): Path
  queueDialog(...results: readonly DialogResult[]): void
  setAccess(path: string, access: Partial<Access>): void
  setUnavailable(path: string, unavailable: boolean): void
  symlink(path: string, target: string): void
  validatePath(value: string): PlatformResult<Path, 'invalid-path'>
  windowIds(): readonly WindowId[]
}

export function createMemoryPlatform(options: MemoryPlatformOptions): {
  readonly harness: MemoryPlatformHarness
  readonly platform: Platform
} {
  const fileSystem = new MemoryFileSystem(options)
  const dialogs = new MemoryDialogPort()
  const watches = new MemoryWatchPort()
  const windowPort = new MemoryWindowPort()
  return {
    harness: {
      externalWrite: async (path, bytes) => {
        const validated = fileSystem.validate(path)
        if (!validated.ok) throw new Error(`Invalid external path: ${path}`)
        const result = await fileSystem.overwrite(validated.value, bytes)
        if (!result.ok) throw new Error(`External write failed: ${result.error.code}`)
        watches.invalidate(validated.value)
      },
      activeWatchCount: () => watches.activeCount(),
      emitWatch: (path) => watches.invalidate(fileSystem.mustPath(path)),
      failWatch: (path) => watches.fail(fileSystem.mustPath(path)),
      fileCount: () => fileSystem.fileCount(),
      hardlink: (path, target) => fileSystem.hardlink(path, target),
      mkdir: (path) => fileSystem.mkdir(path),
      operationCount: () => fileSystem.operationCount,
      queueDialog: (...results) => dialogs.queue(...results),
      path: (value) => {
        const result = fileSystem.validate(value)
        if (!result.ok) throw new Error(`Invalid test path: ${value}`)
        return result.value
      },
      setAccess: (path, access) => fileSystem.setAccess(path, access),
      setUnavailable: (path, unavailable) => fileSystem.setUnavailable(path, unavailable),
      symlink: (path, target) => fileSystem.symlink(path, target),
      validatePath: (value) => fileSystem.validate(value),
      windowIds: () => windowPort.ids(),
    },
    platform: { dialog: dialogs, fs: fileSystem, kind: 'memory', watch: watches, window: windowPort },
  }
}

class MemoryWatchPort implements WatchPort {
  readonly #errors = new Map<string, Set<() => void>>()
  readonly #listeners = new Map<string, Set<() => void>>()

  fail(path: Path): void {
    for (const listener of this.#errors.get(String(path)) ?? []) listener()
  }

  invalidate(path: Path): void {
    const changed = String(path).replaceAll('\\', '/')
    for (const [registered, listeners] of this.#listeners) {
      const root = registered.replaceAll('\\', '/')
      if (changed !== root && !changed.startsWith(root.endsWith('/') ? root : `${root}/`)) continue
      for (const listener of listeners) listener()
    }
  }

  activeCount(): number {
    return [...this.#listeners.values()].reduce((total, listeners) => total + listeners.size, 0)
  }

  subscribe(path: Path, listener: () => void, onError: () => void): () => void {
    const key = String(path)
    const listeners = this.#listeners.get(key) ?? new Set()
    listeners.add(listener)
    this.#listeners.set(key, listeners)
    const errors = this.#errors.get(key) ?? new Set()
    errors.add(onError)
    this.#errors.set(key, errors)
    return () => {
      listeners.delete(listener)
      if (listeners.size === 0) this.#listeners.delete(key)
      errors.delete(onError)
      if (errors.size === 0) this.#errors.delete(key)
    }
  }
}

class MemoryDialogPort implements DialogPort {
  readonly #queue: DialogResult[] = []

  async confirm(): Promise<PlatformResult<number, 'blocked'>> {
    const result = this.#take('confirm')
    return result.ok ? ok(result.value.choice) : result
  }

  async open(): Promise<PlatformResult<Path | undefined, 'blocked'>> {
    const result = this.#take('open')
    return result.ok ? ok(result.value.path) : result
  }

  queue(...results: readonly DialogResult[]): void {
    this.#queue.push(...results)
  }

  async save(): Promise<PlatformResult<Path | undefined, 'blocked'>> {
    const result = this.#take('save')
    return result.ok ? ok(result.value.path) : result
  }

  #take<Kind extends DialogResult['kind']>(kind: Kind): PlatformResult<Extract<DialogResult, { kind: Kind }>, 'blocked'> {
    const next = this.#queue[0]
    if (!next || next.kind !== kind) return fail('blocked')
    this.#queue.shift()
    return ok(next as Extract<DialogResult, { kind: Kind }>)
  }
}

class MemoryFileSystem implements FileSystemPort {
  readonly #caseSensitive: boolean
  readonly #entries = new Map<string, Entry>()
  readonly #platform: 'posix' | 'win32'
  operationCount = 0

  constructor(options: MemoryPlatformOptions) {
    this.#caseSensitive = options.caseSensitive
    this.#platform = options.platform
    const root = options.platform === 'win32' ? 'C:/' : '/'
    this.#entries.set(this.#key(root), directory(root))
  }

  async atomicReplace(
    path: Path,
    bytes: Uint8Array,
    expected: ExpectedDiskVersion,
  ): Promise<PlatformResult<FileRead, FsFailureCode | 'conflict'>> {
    const prepared = this.#prepareLeaf(path)
    if (!prepared.ok) return prepared
    const existing = prepared.value.existing
    if (existing && existing.kind !== 'file') return fail('not-file')
    if (existing?.unavailable) return fail('unavailable')
    if (existing && !existing.access.writable) return fail('permission-denied')
    if (expected === 'missing' && existing) return fail('conflict')
    if (expected !== 'missing' && !existing) return fail('not-found')
    if (expected !== 'missing' && existing && asDiskVersion(version(existing.data.bytes)) !== expected) return fail('conflict')
    this.operationCount += 1
    this.#entries.set(this.#key(prepared.value.path), file(prepared.value.path, bytes))
    return this.read(asPath(this.#external(prepared.value.path)))
  }

  async canonicalize(path: Path): Promise<PlatformResult<CanonicalPath, FsFailureCode>> {
    const validated = this.validate(String(path))
    if (!validated.ok) return validated
    const resolved = this.#resolve(this.#internal(validated.value), true)
    if (!resolved.ok) return resolved
    return ok({ fileKey: asFileKey(this.#key(resolved.value.path)), path: asPath(this.#external(resolved.value.path)) })
  }

  async create(path: Path, bytes: Uint8Array): Promise<PlatformResult<void, FsFailureCode>> {
    const prepared = this.#prepareLeaf(path)
    if (!prepared.ok) return prepared
    this.operationCount += 1
    if (prepared.value.existing) return fail('already-exists')
    if (!prepared.value.parent.access.writable) return fail('permission-denied')
    this.#entries.set(this.#key(prepared.value.path), file(prepared.value.path, bytes))
    return ok(undefined)
  }

  async list(path: Path): Promise<PlatformResult<readonly DirectoryEntry[], FsFailureCode>> {
    const resolved = this.#resolveValidated(path, false)
    if (!resolved.ok) return resolved
    const directoryEntry = resolved.value.entry
    if (!directoryEntry) return fail('not-found')
    if (directoryEntry.unavailable) return fail('unavailable')
    if (directoryEntry.kind !== 'directory') return fail('not-directory')
    if (!directoryEntry.access.readable) return fail('permission-denied')
    const parent = resolved.value.path
    const prefix = parent.endsWith('/') ? parent : `${parent}/`
    const values: DirectoryEntry[] = []
    for (const candidate of this.#entries.values()) {
      if (!candidate.path.startsWith(prefix)) continue
      const suffix = candidate.path.slice(prefix.length)
      if (!suffix || suffix.includes('/')) continue
      if (candidate.kind === 'symlink') {
        const target = this.#resolve(candidate.target, false)
        if (!target.ok || !target.value.entry) continue
        const targetEntry = target.value.entry
        const targetKind = targetEntry.kind === 'directory' ? 'directory-symlink' : 'file-symlink'
        values.push({
          fileKey: asFileKey(this.#key(target.value.path)),
          kind: targetKind,
          name: suffix,
          path: asPath(this.#external(candidate.path)),
        })
      } else {
        values.push({
          fileKey: asFileKey(this.#key(candidate.path)),
          kind: candidate.kind,
          name: suffix,
          path: asPath(this.#external(candidate.path)),
        })
      }
    }
    this.operationCount += 1
    return ok(values)
  }

  fileCount(): number {
    return [...this.#entries.values()].filter((entry) => entry.kind === 'file').length
  }

  hardlink(path: string, target: string): void {
    const targetResolution = this.#resolve(this.#internal(this.#mustValidate(target)), false)
    if (!targetResolution.ok || targetResolution.value.entry?.kind !== 'file') throw new Error('Hard-link target must be a file')
    const linkPath = this.#internal(this.#mustValidate(path))
    this.#entries.set(this.#key(linkPath), {
      access: { ...targetResolution.value.entry.access },
      data: targetResolution.value.entry.data,
      kind: 'file',
      path: linkPath,
      unavailable: false,
    })
  }

  async move(
    source: Path,
    target: Path,
    expected: DiskVersion,
  ): Promise<PlatformResult<FileRead, FsFailureCode | 'conflict'>> {
    const resolved = this.#resolveValidated(source, false)
    if (!resolved.ok) return resolved
    const entry = resolved.value.entry
    if (!entry) return fail('not-found')
    if (entry.kind !== 'file') return fail('not-file')
    if (entry.unavailable) return fail('unavailable')
    if (!entry.access.writable) return fail('permission-denied')
    if (asDiskVersion(version(entry.data.bytes)) !== expected) return fail('conflict')
    const targetLeaf = this.#prepareLeaf(target)
    if (!targetLeaf.ok) return targetLeaf
    const sameKey = this.#key(resolved.value.path) === this.#key(targetLeaf.value.path)
    if (targetLeaf.value.existing && !sameKey) return fail('already-exists')
    this.operationCount += 1
    this.#entries.delete(this.#key(resolved.value.path))
    entry.path = targetLeaf.value.path
    this.#entries.set(this.#key(targetLeaf.value.path), entry)
    return this.read(asPath(this.#external(targetLeaf.value.path)))
  }

  mkdir(path: string): void {
    const internal = this.#internal(this.#mustValidate(path))
    if (this.#entries.has(this.#key(internal))) return
    const parent = parentPath(internal)
    if (parent && !this.#entries.has(this.#key(parent))) this.mkdir(this.#external(parent))
    this.#entries.set(this.#key(internal), directory(internal))
  }

  async overwrite(path: Path, bytes: Uint8Array): Promise<PlatformResult<void, FsFailureCode>> {
    const resolved = this.#resolveValidated(path, false)
    if (!resolved.ok) return resolved
    this.operationCount += 1
    const entry = resolved.value.entry
    if (!entry) return fail('not-found')
    if (entry.unavailable) return fail('unavailable')
    if (entry.kind !== 'file') return fail('not-file')
    if (!entry.access.writable) return fail('permission-denied')
    entry.data.bytes = bytes.slice()
    return ok(undefined)
  }

  async read(path: Path): Promise<PlatformResult<FileRead, FsFailureCode>> {
    const resolved = this.#resolveValidated(path, false)
    if (!resolved.ok) return resolved
    const entry = resolved.value.entry
    if (!entry) return fail('not-found')
    if (entry.unavailable) return fail('unavailable')
    if (entry.kind !== 'file') return fail('not-file')
    if (!entry.access.readable) return fail('permission-denied')
    return ok({
      bytes: entry.data.bytes.slice(),
      diskVersion: asDiskVersion(version(entry.data.bytes)),
      fileKey: asFileKey(this.#key(resolved.value.path)),
      path: asPath(this.#external(resolved.value.path)),
    })
  }

  async remove(path: Path): Promise<PlatformResult<void, FsFailureCode>> {
    const resolved = this.#resolveValidated(path, false)
    if (!resolved.ok) return resolved
    this.operationCount += 1
    const entry = resolved.value.entry
    if (!entry) return fail('not-found')
    if (entry.unavailable) return fail('unavailable')
    if (!entry.access.writable) return fail('permission-denied')
    if (entry.kind === 'directory' && this.#hasChildren(resolved.value.path)) return fail('not-empty')
    this.#entries.delete(this.#key(resolved.value.path))
    return ok(undefined)
  }

  setAccess(path: string, access: Partial<Access>): void {
    const entry = this.#entries.get(this.#key(this.#internal(this.#mustValidate(path))))
    if (!entry) throw new Error(`Missing entry: ${path}`)
    entry.access = { ...entry.access, ...access }
  }

  setUnavailable(path: string, unavailable: boolean): void {
    const entry = this.#entries.get(this.#key(this.#internal(this.#mustValidate(path))))
    if (!entry) throw new Error(`Missing entry: ${path}`)
    entry.unavailable = unavailable
  }

  async stat(path: Path): Promise<PlatformResult<FileStat, FsFailureCode>> {
    const resolved = this.#resolveValidated(path, false)
    if (!resolved.ok) return resolved
    const entry = resolved.value.entry
    if (!entry) return fail('not-found')
    if (entry.unavailable) return fail('unavailable')
    if (!entry.access.readable) return fail('permission-denied')
    if (entry.kind === 'symlink') return fail('io')
    return ok({
      fileKey: asFileKey(this.#key(resolved.value.path)),
      kind: entry.kind,
      size: entry.kind === 'file' ? entry.data.bytes.byteLength : 0,
    })
  }

  symlink(path: string, target: string): void {
    const internal = this.#internal(this.#mustValidate(path))
    this.#entries.set(this.#key(internal), {
      access: { readable: true, writable: true },
      kind: 'symlink',
      path: internal,
      target: this.#internal(this.#mustValidate(target)),
      unavailable: false,
    })
  }

  validate(value: string): PlatformResult<Path, 'invalid-path'> {
    if (value.includes('\0')) return fail('invalid-path')
    if (this.#platform === 'posix') {
      if (!value.startsWith('/')) return fail('invalid-path')
      return ok(asPath(cleanSeparators(value, '/')))
    }
    if (!/^[A-Za-z]:[\\/]/.test(value)) return fail('invalid-path')
    return ok(asPath(cleanSeparators(value.replaceAll('/', '\\'), '\\')))
  }

  mustPath(value: string): Path {
    return this.#mustValidate(value)
  }

  #external(value: string): string {
    return this.#platform === 'win32' ? value.replaceAll('/', '\\') : value
  }

  #hasChildren(path: string): boolean {
    const prefix = path.endsWith('/') ? path : `${path}/`
    return [...this.#entries.values()].some((entry) => entry.path.startsWith(prefix))
  }

  #internal(value: Path): string {
    return String(value).replaceAll('\\', '/')
  }

  #key(value: string): string {
    return this.#caseSensitive ? value : value.toLocaleLowerCase('en-US')
  }

  #mustValidate(value: string): Path {
    const result = this.validate(value)
    if (!result.ok) throw new Error(`Invalid path: ${value}`)
    return result.value
  }

  #prepareLeaf(path: Path): PlatformResult<{ existing?: Entry; parent: Extract<Entry, { kind: 'directory' }>; path: string }, FsFailureCode> {
    const validated = this.validate(String(path))
    if (!validated.ok) return validated
    const internal = this.#internal(validated.value)
    const parent = parentPath(internal)
    if (!parent) return fail('invalid-path')
    const parentResolution = this.#resolve(parent, false)
    if (!parentResolution.ok) return parentResolution
    const parentEntry = parentResolution.value.entry
    if (!parentEntry) return fail('not-found')
    if (parentEntry.kind !== 'directory') return fail('not-directory')
    const leaf = finalSegment(internal)
    if (leaf === '.' || leaf === '..' || leaf.length === 0) return fail('invalid-path')
    const canonicalLeaf = joinPath(parentResolution.value.path, leaf)
    const existing = this.#entries.get(this.#key(canonicalLeaf))
    return ok({ ...(existing ? { existing } : {}), parent: parentEntry, path: canonicalLeaf })
  }

  #resolve(path: string, allowMissingLeaf: boolean, depth = 0): PlatformResult<Resolution, FsFailureCode> {
    if (depth > 32) return fail('io')
    const { root, segments } = splitAbsolute(path)
    let current = root
    for (let index = 0; index < segments.length; index += 1) {
      const segment = segments[index]
      if (segment === undefined) return fail('io')
      if (segment === '.' || segment === '') continue
      if (segment === '..') {
        current = parentPath(current) ?? root
        continue
      }
      const candidate = joinPath(current, segment)
      const entry = this.#entries.get(this.#key(candidate))
      const last = index === segments.length - 1
      if (!entry) {
        if (allowMissingLeaf && last) return ok({ path: candidate })
        return fail('not-found')
      }
      if (entry.unavailable) return fail('unavailable')
      if (entry.kind === 'symlink') {
        const suffix = segments.slice(index + 1).join('/')
        return this.#resolve(suffix ? joinPath(entry.target, suffix) : entry.target, allowMissingLeaf, depth + 1)
      }
      if (!last && entry.kind !== 'directory') return fail('not-directory')
      current = entry.path
    }
    const entry = this.#entries.get(this.#key(current))
    return ok({ ...(entry ? { entry } : {}), path: current })
  }

  #resolveValidated(path: Path, allowMissingLeaf: boolean): PlatformResult<Resolution, FsFailureCode> {
    const validated = this.validate(String(path))
    return validated.ok ? this.#resolve(this.#internal(validated.value), allowMissingLeaf) : validated
  }
}

class MemoryWindowPort implements WindowPort {
  readonly #windows = new Map<WindowId, WindowRecord>()
  #sequence = 0

  async close(windowId: WindowId): Promise<PlatformResult<void>> {
    const record = this.#windows.get(windowId)
    if (!record) return fail('ownership')
    record.state = { focused: false, status: 'closed' }
    this.#emit(record)
    this.#windows.delete(windowId)
    return ok(undefined)
  }

  async create(): Promise<WindowId> {
    this.#sequence += 1
    for (const record of this.#windows.values()) record.state = { ...record.state, focused: false }
    const id = asWindowId(`window-${this.#sequence}`)
    this.#windows.set(id, { listeners: new Set(), state: { focused: true, status: 'normal' } })
    return id
  }

  async focus(windowId: WindowId): Promise<PlatformResult<void>> {
    const record = this.#windows.get(windowId)
    if (!record) return fail('ownership')
    for (const candidate of this.#windows.values()) candidate.state = { ...candidate.state, focused: candidate === record }
    this.#emit(record)
    return ok(undefined)
  }

  async getState(windowId: WindowId): Promise<PlatformResult<WindowState>> {
    const record = this.#windows.get(windowId)
    return record ? ok({ ...record.state }) : fail('ownership')
  }

  ids(): readonly WindowId[] {
    return [...this.#windows.keys()]
  }

  async minimize(windowId: WindowId): Promise<PlatformResult<void>> {
    const record = this.#windows.get(windowId)
    if (!record) return fail('ownership')
    record.state = { focused: false, status: 'minimized' }
    this.#emit(record)
    return ok(undefined)
  }

  onState(windowId: WindowId, listener: (state: WindowState) => void): () => void {
    const record = this.#windows.get(windowId)
    if (!record) return () => undefined
    record.listeners.add(listener)
    return () => record.listeners.delete(listener)
  }

  async toggleMaximize(windowId: WindowId): Promise<PlatformResult<void>> {
    const record = this.#windows.get(windowId)
    if (!record) return fail('ownership')
    record.state = { focused: true, status: record.state.status === 'maximized' ? 'normal' : 'maximized' }
    this.#emit(record)
    return ok(undefined)
  }

  #emit(record: WindowRecord): void {
    for (const listener of record.listeners) listener({ ...record.state })
  }
}

const cleanSeparators = (value: string, separator: '/' | '\\'): string => {
  const escaped = separator === '/' ? /\/{2,}/g : /\\{2,}/g
  const cleaned = value.replace(escaped, separator)
  if (cleaned.length <= 3) return cleaned
  return cleaned.endsWith(separator) ? cleaned.slice(0, -1) : cleaned
}

const directory = (path: string): Extract<Entry, { kind: 'directory' }> => ({
  access: { readable: true, writable: true },
  kind: 'directory',
  path,
  unavailable: false,
})

const file = (path: string, bytes: Uint8Array): Extract<Entry, { kind: 'file' }> => ({
  access: { readable: true, writable: true },
  data: { bytes: bytes.slice() },
  kind: 'file',
  path,
  unavailable: false,
})

const finalSegment = (path: string): string => path.slice(path.lastIndexOf('/') + 1)

const joinPath = (parent: string, child: string): string => (parent.endsWith('/') ? `${parent}${child}` : `${parent}/${child}`)

const parentPath = (path: string): string | undefined => {
  const { root } = splitAbsolute(path)
  if (path === root) return undefined
  const index = path.lastIndexOf('/')
  return index <= root.length - 1 ? root : path.slice(0, index)
}

const splitAbsolute = (path: string): { root: string; segments: string[] } => {
  if (/^[A-Za-z]:\//.test(path)) return { root: path.slice(0, 3), segments: path.slice(3).split('/') }
  return { root: '/', segments: path.slice(1).split('/') }
}

const version = (bytes: Uint8Array): string => {
  let hash = 2_166_136_261
  for (const byte of bytes) hash = Math.imul(hash ^ byte, 16_777_619)
  return `${bytes.byteLength}:${(hash >>> 0).toString(16)}`
}
