import { randomUUID } from 'node:crypto'
import { access, mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises'
import path from 'node:path'

const MAX_SETTINGS_BYTES = 1024 * 1024

export type SettingsFileRead =
  | { readonly kind: 'loaded'; readonly raw: string }
  | { readonly kind: 'missing' | 'oversized' }
  | { readonly code: string; readonly kind: 'error' }

export class SettingsFileStore {
  readonly #file: string

  constructor(readonly directory: string) {
    this.#file = path.join(directory, 'settings.json')
  }

  async quarantineCorrupt(timestamp = Date.now()): Promise<string | undefined> {
    const target = path.join(this.directory, `settings.json.corrupt-${timestamp}`)
    try {
      await rename(this.#file, target)
      return target
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return undefined
      throw error
    }
  }

  async read(): Promise<SettingsFileRead> {
    try {
      const metadata = await stat(this.#file)
      if (!metadata.isFile()) return { code: 'not-file', kind: 'error' }
      if (metadata.size > MAX_SETTINGS_BYTES) return { kind: 'oversized' }
      return { kind: 'loaded', raw: await readFile(this.#file, 'utf8') }
    } catch (error) {
      return hasCode(error, 'ENOENT')
        ? { kind: 'missing' }
        : { code: errorCode(error), kind: 'error' }
    }
  }

  async recover(): Promise<void> {
    let names: string[]
    try {
      names = await readdir(this.directory)
    } catch (error) {
      if (hasCode(error, 'ENOENT')) return
      throw error
    }
    const targetExists = await exists(this.#file)
    for (const name of names) {
      if (!/^settings\.json\.markzen-[A-Za-z0-9-]+\.(tmp|bak)$/.test(name)) continue
      const candidate = path.join(this.directory, name)
      if (name.endsWith('.bak') && !targetExists) await rename(candidate, this.#file)
      else await rm(candidate, { force: true })
    }
  }

  async write(bytes: Uint8Array): Promise<void> {
    await mkdir(this.directory, { recursive: true })
    const nonce = randomUUID()
    const temporary = path.join(this.directory, `settings.json.markzen-${nonce}.tmp`)
    const backup = path.join(this.directory, `settings.json.markzen-${nonce}.bak`)
    let movedExisting = false
    const handle = await open(temporary, 'wx')
    try {
      await handle.writeFile(bytes)
      await handle.sync()
    } finally {
      await handle.close()
    }
    try {
      if (await exists(this.#file)) {
        await rename(this.#file, backup)
        movedExisting = true
      }
      try {
        await rename(temporary, this.#file)
      } catch (error) {
        if (movedExisting) await rename(backup, this.#file)
        throw error
      }
      if (movedExisting) await rm(backup, { force: true })
      await syncDirectory(this.directory)
    } finally {
      await rm(temporary, { force: true }).catch(() => undefined)
    }
  }
}

async function exists(value: string): Promise<boolean> {
  try {
    await access(value)
    return true
  } catch {
    return false
  }
}

async function syncDirectory(directory: string): Promise<void> {
  try {
    const handle = await open(directory, 'r')
    try {
      await handle.sync()
    } finally {
      await handle.close()
    }
  } catch {
    // Directory fsync is unavailable on some supported filesystems after installation.
  }
}

const hasCode = (error: unknown, code: string): boolean =>
  typeof error === 'object' && error !== null && 'code' in error && error.code === code

const errorCode = (error: unknown): string =>
  typeof error === 'object' && error !== null && 'code' in error && typeof error.code === 'string' ? error.code : 'io'
