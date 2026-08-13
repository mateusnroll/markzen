import { mkdtemp, readFile, realpath, rm, truncate, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { callMain, launchMarkzen, quitMarkzen } from './helpers'

test('AC6-AC7 AC23 AC40-AC41 AC52-AC57 AC61 AC65: packaged fallback probing, raster bearer, handoff, and menu routing stay main-owned', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-other-files-'))
  const textPath = path.join(directory, 'example.ts')
  const fallbackTextPath = path.join(directory, 'references.bib')
  const rasterPath = path.join(directory, 'study.png')
  const externalPath = path.join(directory, 'archive.zip')
  const overLimitPath = path.join(directory, 'huge.unknown')
  await writeFile(textPath, 'export const answer = 42\n')
  await writeFile(fallbackTextPath, '@book{meditations, title={Meditations}}\n')
  await writeFile(rasterPath, await readFile('examples/stoic-workspace/assets/stoic-study.png'))
  await writeFile(externalPath, Uint8Array.from([0x41, 0xff]))
  await writeFile(overLimitPath, new Uint8Array())
  await truncate(overLimitPath, 32 * 1_048_576 + 1)
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
    }, { paths: [textPath, fallbackTextPath, rasterPath, externalPath, overLimitPath] })
    const page = await app.firstWindow()
    const windowId = await page.getByTestId('window-id').textContent()

    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'open'])
    await expect(page.getByTestId('text-editor-content')).toBeVisible()
    expect(await page.getByTestId('text-editor-content').evaluate((editor) => editor.querySelector('.hljs-keyword')?.textContent)).toBe('export')
    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'open'])
    await expect(page.getByTestId('text-language-label')).toHaveText('Plain text')
    await expect(page.getByTestId('text-editor-content')).toContainText('@book{meditations')
    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'open'])
    await expect(page.getByTestId('raster-image')).toBeVisible()
    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'open'])
    await expect(page.getByTestId('external-limitation')).toBeVisible()
    await page.getByRole('button', { name: 'Open in Default App' }).click()
    await expect.poll(() => app.evaluate(() => (globalThis as typeof globalThis & { openedPaths?: string[] }).openedPaths ?? [])).toEqual([await realpath(externalPath)])
    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'open'])
    await expect(page.getByTestId('external-limitation')).toContainText('too large')

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
