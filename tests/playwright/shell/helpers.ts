import { mkdtemp, readdir, rm } from 'node:fs/promises'
import { once } from 'node:events'
import os from 'node:os'
import path from 'node:path'

import { _electron, type ElectronApplication } from '@playwright/test'

const profiles = new WeakMap<ElectronApplication, string>()
const launchAttempts = 3
const launchTimeout = 15_000

export async function launchMarkzen(): Promise<ElectronApplication> {
  const executablePath = await findPackagedExecutable()
  let lastError: unknown
  for (let attempt = 1; attempt <= launchAttempts; attempt += 1) {
    const profile = await mkdtemp(path.join(os.tmpdir(), 'markzen-shell-'))
    try {
      const electronApp = await _electron.launch({
        args: [`--user-data-dir=${profile}`],
        executablePath,
        timeout: launchTimeout,
      })
      profiles.set(electronApp, profile)
      const actualProfile = await electronApp.evaluate(({ app }) => app.getPath('userData'))
      if (!samePath(actualProfile, profile)) {
        await quitMarkzen(electronApp)
        throw new Error(`Electron used unexpected user-data directory: ${actualProfile}`)
      }
      return electronApp
    } catch (error) {
      lastError = error
      const message = error instanceof Error ? error.message : String(error)
      process.stderr.write(`[shell] Electron launch attempt ${attempt}/${launchAttempts} failed: ${message}\n`)
      await removeProfile(profile)
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Electron failed to launch')
}

export async function quitMarkzen(electronApp: ElectronApplication): Promise<void> {
  const child = electronApp.process()
  const profile = profiles.get(electronApp)
  profiles.delete(electronApp)
  try {
    if (child.exitCode !== null) return
    const exited = once(child, 'exit')
    try {
      await electronApp.evaluate(({ app }) => app.quit())
      await withTimeout(exited, 5_000)
    } catch {
      if (child.exitCode === null) child.kill('SIGKILL')
      await exited
    }
  } finally {
    if (profile) await removeProfile(profile)
  }
}

export async function callMain<T>(
  electronApp: ElectronApplication,
  exportName: string,
  args: readonly unknown[] = [],
): Promise<T> {
  return electronApp.evaluate(
    async ({ app }, payload) => {
      const instrumentedApp = app as typeof app & { markzenShellHarness?: Record<string, unknown> }
      const candidate = instrumentedApp.markzenShellHarness?.[payload.exportName]
      if (typeof candidate !== 'function') throw new Error(`Missing main export: ${payload.exportName}`)
      return candidate(...payload.args)
    },
    { exportName, args: [...args] },
  ) as Promise<T>
}

export async function findPackagedExecutable(): Promise<string> {
  const release = path.resolve('release')
  const entries = await readdir(release, { withFileTypes: true })
  for (const entry of entries) {
    if (!entry.isDirectory()) continue
    const root = path.join(release, entry.name)
    const candidates =
      process.platform === 'darwin'
        ? [path.join(root, 'Markzen.app', 'Contents', 'MacOS', 'Markzen')]
        : process.platform === 'win32'
          ? [path.join(root, 'Markzen.exe')]
          : [path.join(root, 'markzen'), path.join(root, 'Markzen')]
    for (const candidate of candidates) {
      try {
        await import('node:fs/promises').then(({ access }) => access(candidate))
        return candidate
      } catch {
        // Continue searching electron-builder output directories.
      }
    }
  }
  throw new Error(`Could not find packaged Markzen executable under ${release}`)
}

async function removeProfile(profile: string): Promise<void> {
  await rm(profile, { force: true, maxRetries: 5, recursive: true, retryDelay: 100 })
}

function samePath(first: string, second: string): boolean {
  const normalizedFirst = path.resolve(first)
  const normalizedSecond = path.resolve(second)
  return process.platform === 'win32'
    ? normalizedFirst.toLocaleLowerCase('en-US') === normalizedSecond.toLocaleLowerCase('en-US')
    : normalizedFirst === normalizedSecond
}

async function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error(`Timed out after ${milliseconds}ms`)), milliseconds)
    promise.then(
      (value) => {
        clearTimeout(timeout)
        resolve(value)
      },
      (error: unknown) => {
        clearTimeout(timeout)
        reject(error instanceof Error ? error : new Error(String(error)))
      },
    )
  })
}
