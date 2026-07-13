import {
  createHash,
} from 'node:crypto'
import {
  open,
  readdir,
  readFile,
  realpath,
  rename,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import nodePath from 'node:path'

import {
  asFileKey,
  asDiskVersion,
  asPath,
  fail,
  ok,
  type CanonicalPath,
  type DiskVersion,
  type DirectoryEntry,
  type FileRead,
  type FileStat,
  type FileSystemPort,
  type FsFailureCode,
  type ExpectedDiskVersion,
  type Path,
  type PlatformResult,
} from '../contracts'

export class RealFileSystem implements FileSystemPort {
  async atomicReplace(
    path: Path,
    bytes: Uint8Array,
    expected: ExpectedDiskVersion,
  ): Promise<PlatformResult<FileRead, FsFailureCode | 'conflict'>> {
    const validated = validateRealPath(String(path))
    if (!validated.ok) return validated
    const nonce = `${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`
    const temporary = `${validated.value}.markzen-${nonce}.tmp`
    const backup = `${validated.value}.markzen-${nonce}.bak`
    let targetMoved = false
    try {
      await writeFile(temporary, bytes, { flag: 'wx' })
      const observed = await this.read(validated.value)
      if (expected === 'missing') {
        if (observed.ok || observed.error.code !== 'not-found') return fail(observed.ok ? 'conflict' : observed.error.code)
      } else if (!observed.ok || observed.value.diskVersion !== expected) {
        return fail(observed.ok ? 'conflict' : observed.error.code)
      }
      if (observed.ok) {
        await rename(validated.value, backup)
        targetMoved = true
      }
      try {
        await rename(temporary, validated.value)
      } catch (error) {
        if (targetMoved) await rename(backup, validated.value)
        throw error
      }
      if (targetMoved) await rm(backup, { force: true })
      return this.read(validated.value)
    } catch (error) {
      return fail(mapError(error))
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined)
    }
  }

  async canonicalize(path: Path): Promise<PlatformResult<CanonicalPath, FsFailureCode>> {
    const validated = validateRealPath(String(path))
    if (!validated.ok) return validated
    try {
      const canonical = await realpath(validated.value)
      return ok({ fileKey: asFileKey(await fileKey(canonical)), path: asPath(canonical) })
    } catch (error) {
      if (!hasCode(error, 'ENOENT')) return fail(mapError(error))
      const parent = nodePath.dirname(validated.value)
      if (parent === validated.value) return fail('not-found')
      try {
        const canonicalParent = await realpath(parent)
        const candidate = nodePath.basename(validated.value)
        const canonical = nodePath.join(canonicalParent, candidate)
        return ok({ fileKey: asFileKey(await fileKey(canonical, canonicalParent)), path: asPath(canonical) })
      } catch (parentError) {
        return fail(mapError(parentError))
      }
    }
  }

  async create(path: Path, bytes: Uint8Array): Promise<PlatformResult<void, FsFailureCode>> {
    const validated = validateRealPath(String(path))
    if (!validated.ok) return validated
    try {
      await writeFile(validated.value, bytes, { flag: 'wx' })
      return ok(undefined)
    } catch (error) {
      return fail(mapError(error))
    }
  }

  async list(path: Path): Promise<PlatformResult<readonly DirectoryEntry[], FsFailureCode>> {
    const validated = validateRealPath(String(path))
    if (!validated.ok) return validated
    const canonicalParent = await this.canonicalize(validated.value)
    if (!canonicalParent.ok) return canonicalParent
    try {
      const parentMetadata = await stat(canonicalParent.value.path)
      if (!parentMetadata.isDirectory()) return fail('not-directory')
      const children = await readdir(validated.value, { withFileTypes: true })
      const parentCaseSensitive = await isCaseSensitive(String(canonicalParent.value.path))
      const entries: DirectoryEntry[] = []
      for (const child of children) {
        const logicalPath = nodePath.join(validated.value, child.name)
        if (child.isSymbolicLink()) {
          try {
            const canonicalTarget = await realpath(logicalPath)
            const metadata = await stat(canonicalTarget)
            if (!metadata.isDirectory() && !metadata.isFile()) continue
            entries.push({
              fileKey: asFileKey(await fileKey(canonicalTarget)),
              kind: metadata.isDirectory() ? 'directory-symlink' : 'file-symlink',
              name: child.name,
              path: asPath(logicalPath),
            })
          } catch {
            continue
          }
          continue
        }
        if (!child.isDirectory() && !child.isFile()) continue
        const canonicalChild = nodePath.join(String(canonicalParent.value.path), child.name)
        entries.push({
          fileKey: asFileKey(parentCaseSensitive ? canonicalChild : canonicalChild.toLocaleLowerCase('en-US')),
          kind: child.isDirectory() ? 'directory' : 'file',
          name: child.name,
          path: asPath(logicalPath),
        })
      }
      return ok(entries)
    } catch (error) {
      return fail(mapError(error))
    }
  }

  async move(
    source: Path,
    target: Path,
    expected: DiskVersion,
  ): Promise<PlatformResult<FileRead, FsFailureCode | 'conflict'>> {
    const sourcePath = validateRealPath(String(source))
    if (!sourcePath.ok) return sourcePath
    const targetPath = validateRealPath(String(target))
    if (!targetPath.ok) return targetPath
    const observed = await this.read(sourcePath.value)
    if (!observed.ok) return observed
    if (observed.value.diskVersion !== expected) return fail('conflict')
    const targetCanonical = await this.canonicalize(targetPath.value)
    if (!targetCanonical.ok && targetCanonical.error.code !== 'not-found') return targetCanonical
    if (targetCanonical.ok && targetCanonical.value.fileKey !== observed.value.fileKey) return fail('already-exists')
    try {
      if (targetCanonical.ok && sourcePath.value.toLocaleLowerCase('en-US') === targetPath.value.toLocaleLowerCase('en-US')) {
        const temporary = asPath(`${sourcePath.value}.markzen-case-${process.pid}-${Date.now()}`)
        await rename(sourcePath.value, temporary)
        try {
          await rename(temporary, targetPath.value)
        } catch (error) {
          await rename(temporary, sourcePath.value)
          throw error
        }
      } else {
        await rename(sourcePath.value, targetPath.value)
      }
      return this.read(targetPath.value)
    } catch (error) {
      return fail(mapError(error))
    }
  }

  async overwrite(path: Path, bytes: Uint8Array): Promise<PlatformResult<void, FsFailureCode>> {
    const validated = validateRealPath(String(path))
    if (!validated.ok) return validated
    try {
      const handle = await open(validated.value, 'r+')
      try {
        await handle.writeFile(bytes)
        await handle.truncate(bytes.byteLength)
      } finally {
        await handle.close()
      }
      return ok(undefined)
    } catch (error) {
      return fail(mapError(error))
    }
  }

  async read(path: Path): Promise<PlatformResult<FileRead, FsFailureCode>> {
    const canonical = await this.canonicalize(path)
    if (!canonical.ok) return canonical
    try {
      const metadata = await stat(canonical.value.path)
      if (!metadata.isFile()) return fail('not-file')
      const bytes = new Uint8Array(await readFile(canonical.value.path))
      return ok({ ...canonical.value, bytes, diskVersion: asDiskVersion(createHash('sha256').update(bytes).digest('hex')) })
    } catch (error) {
      return fail(mapError(error))
    }
  }

  async remove(path: Path): Promise<PlatformResult<void, FsFailureCode>> {
    const validated = validateRealPath(String(path))
    if (!validated.ok) return validated
    try {
      await rm(validated.value, { recursive: false })
      return ok(undefined)
    } catch (error) {
      return fail(mapError(error))
    }
  }

  async stat(path: Path): Promise<PlatformResult<FileStat, FsFailureCode>> {
    const canonical = await this.canonicalize(path)
    if (!canonical.ok) return canonical
    try {
      const metadata = await stat(canonical.value.path)
      if (!metadata.isFile() && !metadata.isDirectory()) return fail('io')
      return ok({
        fileKey: canonical.value.fileKey,
        kind: metadata.isFile() ? 'file' : 'directory',
        size: metadata.isFile() ? metadata.size : 0,
      })
    } catch (error) {
      return fail(mapError(error))
    }
  }
}

export function validateRealPath(value: string): PlatformResult<Path, 'invalid-path'> {
  if (value.includes('\0') || !nodePath.isAbsolute(value)) return fail('invalid-path')
  return ok(asPath(stripTrailingSeparator(value)))
}

async function fileKey(canonicalPath: string, caseParent = nodePath.dirname(canonicalPath)): Promise<string> {
  return (await isCaseSensitive(caseParent)) ? canonicalPath : canonicalPath.toLocaleLowerCase('en-US')
}

async function isCaseSensitive(directory: string): Promise<boolean> {
  const basename = nodePath.basename(directory)
  const toggled = toggleFirstLetter(basename)
  if (toggled === basename) return process.platform !== 'win32' && process.platform !== 'darwin'
  const candidate = nodePath.join(nodePath.dirname(directory), toggled)
  try {
    return (await realpath(candidate)) !== (await realpath(directory))
  } catch (error) {
    if (hasCode(error, 'ENOENT')) return true
    return process.platform !== 'win32' && process.platform !== 'darwin'
  }
}

function mapError(error: unknown): FsFailureCode {
  if (hasCode(error, 'ENOENT')) return 'not-found'
  if (hasCode(error, 'EEXIST')) return 'already-exists'
  if (hasCode(error, 'EACCES') || hasCode(error, 'EPERM') || hasCode(error, 'EROFS')) return 'permission-denied'
  if (hasCode(error, 'ENOTDIR')) return 'not-directory'
  if (hasCode(error, 'EISDIR')) return 'not-file'
  if (hasCode(error, 'ENOTEMPTY') || hasCode(error, 'EEXIST')) return 'not-empty'
  if (hasCode(error, 'EBUSY') || hasCode(error, 'ENODEV')) return 'unavailable'
  return 'io'
}

function hasCode(error: unknown, code: string): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === code
}

function stripTrailingSeparator(value: string): string {
  const root = nodePath.parse(value).root
  return value.length > root.length && value.endsWith(nodePath.sep) ? value.slice(0, -1) : value
}

function toggleFirstLetter(value: string): string {
  const index = value.search(/[A-Za-z]/)
  if (index < 0) return value
  const letter = value[index]
  if (!letter) return value
  const toggled = letter === letter.toLocaleLowerCase('en-US') ? letter.toLocaleUpperCase('en-US') : letter.toLocaleLowerCase('en-US')
  return `${value.slice(0, index)}${toggled}${value.slice(index + 1)}`
}
