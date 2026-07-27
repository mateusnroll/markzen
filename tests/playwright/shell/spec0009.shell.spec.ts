import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { callMain, launchMarkzen, quitMarkzen } from './helpers'

type MenuItem = { readonly accelerator?: string; readonly label?: string; readonly submenu?: readonly MenuItem[] }

test('AC1 AC3 AC63: native New CSV is accelerator-free and routes only to the focused CSV owner', async () => {
  const app = await launchMarkzen()
  try {
    const menu = await callMain<readonly MenuItem[]>(app, 'getApplicationMenuSnapshot', [process.platform])
    const item = flatten(menu).find((candidate) => candidate.label === 'New CSV')
    expect(item).toBeDefined()
    expect(item?.accelerator).toBeUndefined()
    const page = await app.firstWindow()
    const windowId = await page.getByTestId('window-id').textContent()
    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'new-csv'])
    await expect(page.getByTestId('csv-grid')).toBeVisible()
    await expect.poll(() => app.evaluate(({ Menu }) => ({
      copy: Menu.getApplicationMenu()?.getMenuItemById('markzen-copy')?.enabled,
      saveAs: Menu.getApplicationMenu()?.getMenuItemById('markzen-save-as')?.enabled,
    }))).toMatchObject({ saveAs: true })
  } finally {
    await quitMarkzen(app)
  }
})

test('AC4 AC8 AC69: packaged dialogs accept CSV, save as CSV, and reject transfer above 32 MiB before ownership', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-csv-'))
  const source = path.join(directory, 'people.csv')
  const target = path.join(directory, 'copy.csv')
  await writeFile(source, 'name,note\rAda,hello\r')
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
    await expect(page.getByTestId('csv-grid')).toBeVisible()
    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'save-as'])
    await expect.poll(async () => readFile(target, 'utf8').catch(() => '')).toBe('name,note\rAda,hello\r')

    const filters = await callMain<unknown>(app, 'getDocumentDialogSnapshot', ['csv'])
    expect(JSON.stringify(filters)).toContain('csv')
    expect(await callMain(app, 'validateDocumentTransferForShellTest', [32 * 1_048_576 + 1])).toMatchObject({ ok: false })
  } finally {
    await quitMarkzen(app)
    await rm(directory, { force: true, recursive: true })
  }
})

test('AC62 AC73: packaged preload stays closed and forged CSV owners are rejected', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    const surface = await page.evaluate(() => ({
      document: Object.keys(window.markzen?.document ?? {}).sort(),
      root: Object.keys(window.markzen ?? {}).sort(),
    }))
    expect(surface.root).not.toContain('fs')
    expect(surface.root).not.toContain('clipboard')
    expect(surface.document).not.toContain('invoke')
    expect(await callMain(app, 'forgeCsvIntentForShellTest')).toMatchObject({ ok: false, error: { code: 'ownership' } })
  } finally {
    await quitMarkzen(app)
  }
})

const flatten = (items: readonly MenuItem[]): MenuItem[] => items.flatMap((item) => [item, ...flatten(item.submenu ?? [])])
