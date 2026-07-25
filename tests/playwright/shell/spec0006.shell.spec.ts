import { expect, test, type Page } from '@playwright/test'

import { callMain, launchMarkzen, quitMarkzen } from './helpers'

const embedded = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

test('AC3: remote acquisition rejects an unowned tab before starting network work', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    const before = await callMain<number>(app, 'getRemoteRequestCountForShellTest')
    const result = await page.evaluate(async () => {
      const api = (window as typeof window & {
        markzen?: {
          asset: {
            loadRemote(tabId: string, assetId: string, source: string, generation: number): Promise<unknown>
          }
        }
      }).markzen
      if (!api) throw new Error('Missing preload API')
      return api.asset.loadRemote('forged-tab', 'asset-1', 'https://example.com/image.png', 1)
    })
    expect(result).toMatchObject({ error: { code: 'ownership' }, ok: false })
    expect(await callMain<number>(app, 'getRemoteRequestCountForShellTest')).toBe(before)
  } finally {
    await quitMarkzen(app)
  }
})

test('AC13 AC20 AC23: packaged CSP permits only validated revocable image bearers', async () => {
  const app = await launchMarkzen()
  try {
    const page = await app.firstWindow()
    const csp = await app.evaluate(async ({ net }) => (await net.fetch('markzen://app/')).headers.get('content-security-policy'))
    expect(csp?.split('; ').find((directive) => directive.startsWith('img-src '))).toBe("img-src 'self' markzen-asset:")
    expect(csp).not.toContain('data:')
    expect(csp).not.toContain('https:')

    const issuer = await page.getByTestId('window-id').textContent()
    if (!issuer) throw new Error('Expected issuer window')
    const issued = await callMain<{ token: string; url: string }>(app, 'issueEmbeddedAssetForShellTest', [issuer, embedded])
    expect(await loadImage(page, issued.url)).toBe(true)
    expect(await page.evaluate(async (source) => {
      try { await fetch(source); return false } catch { return true }
    }, issued.url)).toBe(true)
    expect(await loadImage(page, embedded)).toBe(false)
    await callMain(app, 'revokeAssetForShellTest', [issued.token])
    expect(await app.evaluate(async ({ net }, url) => (await net.fetch(url)).status, issued.url)).toBe(404)
  } finally {
    await quitMarkzen(app)
  }
})

async function loadImage(page: Page, source: string): Promise<boolean> {
  return page.evaluate((url) => new Promise<boolean>((resolve) => {
    const image = document.createElement('img')
    image.onload = () => { image.remove(); resolve(true) }
    image.onerror = () => { image.remove(); resolve(false) }
    image.src = url
    document.body.append(image)
  }), source)
}
