import { mkdtemp, readFile, realpath, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { callMain, launchMarkzen, quitMarkzen } from './helpers'

test('AC7 AC23 AC40-AC41 AC52-AC57 AC61 AC65: packaged Open filters, raster bearer, external no-read handoff, and menu routing stay main-owned', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-other-files-'))
  const textPath = path.join(directory, 'example.ts')
  const rasterPath = path.join(directory, 'study.png')
  const externalPath = path.join(directory, 'archive.zip')
  await writeFile(textPath, 'export const answer = 42\n')
  await writeFile(rasterPath, await readFile('examples/stoic-workspace/assets/stoic-study.png'))
  await writeFile(externalPath, Uint8Array.from([0x50, 0x4b, 0x03, 0x04]))
  const app = await launchMarkzen()
  try {
    await app.evaluate(({ dialog, shell }, values) => {
      let open = 0
      Object.defineProperty(dialog, 'showOpenDialog', {
        configurable: true,
        value: async () => ({ canceled: false, filePaths: [values.paths[open++]] }),
      })
      Object.defineProperty(dialog, 'showMessageBox', {
        configurable: true,
        value: async () => ({ checkboxChecked: false, response: 0 }),
      })
      Object.defineProperty(shell, 'openPath', {
        configurable: true,
        value: async (target: string) => {
          ;(globalThis as typeof globalThis & { openedPaths?: string[] }).openedPaths ??= []
          ;(globalThis as typeof globalThis & { openedPaths: string[] }).openedPaths.push(target)
          return ''
        },
      })
    }, { paths: [textPath, rasterPath, externalPath] })
    const page = await app.firstWindow()
    const windowId = await page.getByTestId('window-id').textContent()

    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'open'])
    await expect(page.getByTestId('text-editor-content')).toBeVisible()
    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'open'])
    await expect(page.getByTestId('raster-image')).toBeVisible()
    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'open'])
    await expect(page.getByTestId('external-limitation')).toBeVisible()
    await page.getByRole('button', { name: 'Open in Default App' }).click()
    await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { openedPaths?: string[] }).openedPaths ?? [])).toEqual([await realpath(externalPath)])

    const filters = JSON.stringify(await callMain(app, 'getDocumentDialogSnapshot', ['text']))
    expect(filters).toContain('All Files')
    expect(filters).toContain('ts')
    const registrations = await callMain<readonly { readonly kind: string; readonly watched: boolean }[]>(app, 'getDocumentRegistrationKindsForShellTest')
    expect(registrations).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'text', watched: true }),
      expect.objectContaining({ kind: 'raster', watched: true }),
      expect.objectContaining({ kind: 'external', watched: false }),
    ]))
  } finally {
    await quitMarkzen(app)
    await rm(directory, { force: true, recursive: true })
  }
})

test('AC47-AC48 AC57 AC63-AC64 AC68: altered asset tokens and forged view-only mutation or handoff intents are denied', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    expect(await callMain(app, 'forgeViewOnlyIntentsForShellTest')).toMatchObject({
      asset: { ok: false },
      handoff: { ok: false },
      save: { ok: false },
    })
    const surface = await page.evaluate(() => Object.keys(window.markzen?.document ?? {}).sort())
    expect(surface).toContain('openInDefaultApp')
    expect(surface).not.toContain('openPath')
    expect(surface).not.toContain('filesystem')
  } finally {
    await quitMarkzen(app)
  }
})
