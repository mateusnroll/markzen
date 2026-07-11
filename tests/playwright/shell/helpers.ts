import { readdir } from 'node:fs/promises'
import { once } from 'node:events'
import path from 'node:path'

import { _electron, type ElectronApplication } from '@playwright/test'

export async function launchMarkzen(): Promise<ElectronApplication> {
  return _electron.launch({ executablePath: await findPackagedExecutable() })
}

export async function quitMarkzen(electronApp: ElectronApplication): Promise<void> {
  const child = electronApp.process()
  const exited = once(child, 'exit')
  child.kill('SIGKILL')
  await exited
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
