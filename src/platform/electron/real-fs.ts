import {
  readFile,
  realpath,
  rm,
  stat,
  writeFile,
} from 'node:fs/promises'
import nodePath from 'node:path'

import {
  asFileKey,
  asPath,
  fail,
  ok,
  type CanonicalPath,
  type FileRead,
  type FileStat,
  type FileSystemPort,
  type FsFailureCode,
  type Path,
  type PlatformResult,
} from '../contracts'

export class RealFileSystem implements FileSystemPort {
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

  async overwrite(path: Path, bytes: Uint8Array): Promise<PlatformResult<void, FsFailureCode>> {
    const validated = validateRealPath(String(path))
    if (!validated.ok) return validated
    try {
      await writeFile(validated.value, bytes, { flag: 'r+' })
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
      return ok({ ...canonical.value, bytes: new Uint8Array(await readFile(canonical.value.path)) })
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
