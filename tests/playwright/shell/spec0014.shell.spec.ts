import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test } from '@playwright/test'

import { callMain, launchMarkzen, quitMarkzen } from './helpers'

type MenuItem = { readonly accelerator?: string; readonly label?: string; readonly submenu?: readonly MenuItem[] }

test('AC1 AC2 AC27 AC30 AC37 AC38: native commands and the bounded workspace query stay owner-scoped', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-finder-'))
  await mkdir(path.join(directory, 'nested'))
  await writeFile(path.join(directory, 'nested', 'Guide.md'), '# Guide\n')
  const app = await launchMarkzen()
  try {
    const menu = await callMain<readonly MenuItem[]>(app, 'getApplicationMenuSnapshot', [process.platform])
    const items = flatten(menu)
    expect(items.find((item) => item.label === 'Go to File…')?.accelerator).toBe('CmdOrCtrl+P')
    expect(items.find((item) => item.label === 'Switch Tab…')?.accelerator).toBe('Ctrl+Tab')

    const created = app.waitForEvent('window')
    await callMain(app, 'createMarkzenWindow', ['workspace', directory])
    const workspace = await created
    await expect.poll(async () => workspace.evaluate(async () => window.markzen?.workspace.queryFiles('guide'))).toMatchObject({
      ok: true,
      value: { results: [{ name: 'Guide.md', relativePath: 'nested/Guide.md' }], total: 1 },
    })
    expect(await workspace.evaluate(async () => window.markzen?.workspace.queryFiles('x'.repeat(513)))).toEqual({ error: { code: 'validation' }, ok: false })
    const surface = await workspace.evaluate(() => Object.keys(window.markzen?.workspace ?? {}).sort())
    expect(surface).toEqual(['addFolder', 'list', 'onEvent', 'open', 'queryFiles', 'retryRoot'])

    const windowId = await workspace.getByTestId('window-id').textContent()
    if (!windowId) throw new Error('Expected a workspace window ID')
    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'new'])
    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'new'])
    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'new'])
    await expect(workspace.getByTestId('document-tab')).toHaveCount(3)
    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'switch-tab'])
    const switcher = workspace.getByRole('dialog', { name: 'Switch Tab' })
    await expect(switcher).toBeVisible()
    await expect(switcher.getByRole('option', { selected: true })).toHaveAttribute('aria-posinset', '1')
    await callMain(app, 'dispatchApplicationCommandForShellTest', [windowId, 'switch-tab'])
    await expect(switcher.getByRole('option', { selected: true })).toHaveAttribute('aria-posinset', '2')
  } finally {
    await quitMarkzen(app)
    await rm(directory, { force: true, recursive: true })
  }
})

const flatten = (items: readonly MenuItem[]): MenuItem[] => items.flatMap((item) => [item, ...flatten(item.submenu ?? [])])
