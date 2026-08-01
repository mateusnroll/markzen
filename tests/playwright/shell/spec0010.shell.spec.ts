import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { callMain, launchMarkzen, quitMarkzen } from './helpers'

type MenuItem = { readonly accelerator?: string; readonly label?: string; readonly submenu?: readonly MenuItem[] }

test('AC1 AC3 AC68: native New JSON is accelerator-free and routes to the focused JSON owner', async () => {
  const app = await launchMarkzen()
  try {
    const menu = await callMain<readonly MenuItem[]>(app, 'getApplicationMenuSnapshot', [process.platform])
    const item = flatten(menu).find((candidate) => candidate.label === 'New JSON')
    expect(item).toBeDefined()
    expect(item?.accelerator).toBeUndefined()
    const page = await app.firstWindow()
    const windowId = await page.getByTestId('window-id').textContent()
    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'new-json'])
    await expect(page.getByTestId('json-tree')).toBeVisible()
  } finally {
    await quitMarkzen(app)
  }
})

test('AC4 AC8 AC21-AC22: packaged dialogs accept JSON, copy exact bytes, and enforce the transfer ceiling', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-json-'))
  const source = path.join(directory, 'data.json')
  const target = path.join(directory, 'copy.json')
  const bytes = '{  "number": 1e3 }\r'
  await writeFile(source, bytes)
  const app = await launchMarkzen()
  try {
    await app.evaluate(({ dialog }, paths) => {
      Object.defineProperty(dialog, 'showOpenDialog', {
        configurable: true,
        value: async () => ({ canceled: false, filePaths: [paths.source] }),
      })
      Object.defineProperty(dialog, 'showSaveDialog', {
        configurable: true,
        value: async () => ({ canceled: false, filePath: paths.target }),
      })
    }, { source, target })
    const page = await app.firstWindow()
    const windowId = await page.getByTestId('window-id').textContent()
    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'open'])
    await expect(page.getByTestId('json-tree')).toBeVisible()
    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'save-as'])
    await expect.poll(async () => readFile(target, 'utf8').catch(() => '')).toBe(bytes)
    expect(JSON.stringify(await callMain(app, 'getDocumentDialogSnapshot', ['json']))).toContain('json')
    expect(await callMain(app, 'validateDocumentTransferForShellTest', [32 * 1_048_576 + 1])).toMatchObject({ ok: false })
  } finally {
    await quitMarkzen(app)
    await rm(directory, { force: true, recursive: true })
  }
})

test('AC66-AC67: preload remains closed and forged JSON owners are rejected', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    const surface = await page.evaluate(() => Object.keys(window.markzen?.document ?? {}).sort())
    expect(surface).not.toContain('invoke')
    expect(await callMain(app, 'forgeDocumentIntentForShellTest')).toMatchObject({ ok: false, error: { code: 'ownership' } })
  } finally {
    await quitMarkzen(app)
  }
})

const flatten = (items: readonly MenuItem[]): MenuItem[] => items.flatMap((item) => [item, ...flatten(item.submenu ?? [])])
