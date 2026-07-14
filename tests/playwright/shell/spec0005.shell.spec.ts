import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { expect, test, type Page } from '@playwright/test'

import { callMain, launchMarkzen, quitMarkzen } from './helpers'

test('AC18 AC36-AC41: image-only bearer possession loads one fresh validated raster and revokes with its issuer', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-assets-'))
  const raster = path.join(directory, 'image.png')
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64')
  await writeFile(raster, png)
  const app = await launchMarkzen()
  try {
    const first = await app.firstWindow()
    const issuer = await first.getByTestId('window-id').textContent()
    if (!issuer) throw new Error('Expected issuer window')
    const url = await callMain<string>(app, 'issueAssetForShellTest', [issuer, raster])
    const secondPromise = app.waitForEvent('window')
    await callMain(app, 'createMarkzenWindow')
    const second = await secondPromise
    await expect(second.getByTestId('app-shell')).toBeVisible()
    expect(await loadImage(second, url)).toBe(true)
    expect(await second.evaluate(async (source) => {
      try { await fetch(source); return false } catch { return true }
    }, url)).toBe(true)
    expect(await loadImage(second, `${url}altered`)).toBe(false)
    await first.close()
    await second.reload()
    await expect(second.getByTestId('app-shell')).toBeVisible()
    expect(await loadImage(second, url)).toBe(false)
  } finally {
    await quitMarkzen(app)
    await rm(directory, { force: true, recursive: true })
  }
})

async function loadImage(page: Page, source: string): Promise<boolean> {
  return page.evaluate((url) => new Promise<boolean>((resolve) => {
    const image = document.createElement('img')
    image.onload = () => resolve(true)
    image.onerror = () => resolve(false)
    image.src = url
    document.body.append(image)
  }), source)
}
