import { readFile } from 'node:fs/promises'
import { describe, expect, test, vi } from 'vitest'

import { classifyImageSource, decodeEmbeddedImage, MAX_ACQUIRED_IMAGE_BYTES } from '../../src/assets/image-sources'
import { validateRaster } from '../../src/assets/raster'
import { asTabId, asWindowId } from '../../src/platform/contracts'
import { AssetRegistry } from '../../src/platform/electron/asset-registry'
import { ByteBudget } from '../../src/platform/electron/byte-budget'
import {
  ImageAcquisitionService,
  isGloballyReachable,
  type RemoteImageResponse,
  type RemoteImageTransport,
} from '../../src/platform/electron/image-acquisition'

const png = (width = 1, height = 1): Uint8Array => {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return bytes
}

const owner = (overrides: Partial<Parameters<ImageAcquisitionService['acquireRemote']>[0]> = {}) => ({
  assetId: 'asset-1',
  generation: 1,
  issuer: asWindowId('window-1'),
  source: 'https://images.example/cat.png',
  tabId: asTabId('tab-1'),
  ...overrides,
})

const response = (
  overrides: Partial<RemoteImageResponse> = {},
): RemoteImageResponse => ({
  body: chunks(png()),
  headers: { 'content-encoding': 'identity', 'content-length': '24', 'content-type': 'image/png' },
  status: 200,
  ...overrides,
})

const chunks = async function* (...values: Uint8Array[]): AsyncIterable<Uint8Array> {
  for (const value of values) yield value
}

function service(options: {
  readonly budget?: ByteBudget
  readonly deadlineMs?: number
  readonly resolve?: (hostname: string) => Promise<readonly { readonly address: string; readonly family: 4 | 6 }[]>
  readonly transport?: RemoteImageTransport
} = {}): { readonly registry: AssetRegistry; readonly service: ImageAcquisitionService } {
  const budget = options.budget ?? new ByteBudget()
  const registry = new AssetRegistry(budget)
  return {
    registry,
    service: new ImageAcquisitionService({
      ...(options.deadlineMs === undefined ? {} : { deadlineMs: options.deadlineMs }),
      registry,
      resolve: options.resolve ?? (async () => [{ address: '93.184.216.34', family: 4 }]),
      transport: options.transport ?? { get: async () => response() },
    }),
  }
}

describe('spec 0006 image source policy', () => {
  test('AC4: only bounded credential-free HTTPS, local paths, and strict embedded candidates classify', () => {
    expect(classifyImageSource('https://example.com/a.png')).toEqual({ kind: 'remote', origin: 'https://example.com' })
    expect(classifyImageSource('notes/a.png')).toEqual({ kind: 'local' })
    expect(classifyImageSource('data:image/png;base64,iVBORw0KGgo=')).toEqual({ kind: 'embedded' })
    for (const blocked of [
      'http://example.com/a.png',
      '//example.com/a.png',
      'https://user@example.com/a.png',
      'file:///tmp/a.png',
      'javascript:alert(1)',
      'blob:https://example.com/id',
      'custom:thing',
      `https://example.com/${'x'.repeat(4096)}`,
    ]) expect(classifyImageSource(blocked)).toEqual({ kind: 'blocked' })
  })

  test('AC21-AC22: strict base64 embedded raster decoding preserves MIME and enforces syntax and size', () => {
    const source = `DATA:IMAGE/PNG;BASE64,${Buffer.from(png()).toString('base64')}`
    expect(decodeEmbeddedImage(source)).toMatchObject({ mime: 'image/png', ok: true })
    for (const blocked of [
      'data:image/svg+xml;base64,PHN2Zy8+',
      'data:image/png,abc',
      'data:image/png;charset=utf-8;base64,abc',
      'data:image/png;base64,a',
      'data:image/png;base64,ab-c',
      'data:image/png;base64,ab%2B',
      'data:image/png;base64,ab c',
    ]) expect(decodeEmbeddedImage(blocked)).toEqual({ ok: false })
    const tooLarge = `data:image/png;base64,${'A'.repeat(Math.ceil((MAX_ACQUIRED_IMAGE_BYTES + 1) / 3) * 4)}`
    expect(decodeEmbeddedImage(tooLarge)).toEqual({ ok: false })
  })

  test('AC24: remote and embedded source strings remain exact through canonical serialization helpers', () => {
    const remote = 'https://例え.example/a (1).png?x=1#fragment'
    const embedded = `data:image/png;base64,${Buffer.from(png()).toString('base64')}`
    expect(classifyImageSource(remote)).toMatchObject({ kind: 'remote' })
    expect(decodeEmbeddedImage(embedded)).toMatchObject({ ok: true })
    expect(remote).toBe('https://例え.example/a (1).png?x=1#fragment')
    expect(embedded).toContain('data:image/png;base64,')
  })
})

describe('spec 0006 remote acquisition policy', () => {
  test('AC8-AC9: the captured Cataas fixture passes MIME, signature, and raster bounds', async () => {
    const bytes = new Uint8Array(await readFile(new URL('../fixtures/remote-images/cataas-cat.png', import.meta.url)))
    expect(validateRaster(bytes, { expectedMime: 'image/png', maxBytes: MAX_ACQUIRED_IMAGE_BYTES })).toEqual({
      info: { frames: 1, height: 96, mime: 'image/png', width: 96 },
      ok: true,
    })
  })

  test('AC5: mixed or non-global DNS answers stop before transport', async () => {
    const get = vi.fn<RemoteImageTransport['get']>()
    const value = service({
      resolve: async () => [
        { address: '93.184.216.34', family: 4 },
        { address: '127.0.0.1', family: 4 },
      ],
      transport: { get },
    })
    await expect(value.service.acquireRemote(owner())).resolves.toEqual({ kind: 'blocked' })
    expect(get).not.toHaveBeenCalled()
    for (const address of ['0.0.0.0', '10.0.0.1', '100.64.0.1', '127.0.0.1', '169.254.1.1', '172.16.0.1', '192.0.0.8', '192.168.0.1', '198.18.0.1', '224.0.0.1', '::', '::1', '::ffff:127.0.0.1', 'fc00::1', 'fe80::1', 'ff00::1', '2001:2::1', '2001:db8::1', '3fff::1', '5f00::1', '4000::1']) {
      expect(isGloballyReachable(address)).toBe(false)
    }
    expect(isGloballyReachable('93.184.216.34')).toBe(true)
    expect(isGloballyReachable('192.0.0.9')).toBe(true)
    expect(isGloballyReachable('64:ff9b::c000:201')).toBe(true)
    expect(isGloballyReachable('2001:3::1')).toBe(true)
    expect(isGloballyReachable('2606:2800:220:1:248:1893:25c8:1946')).toBe(true)

    const resolve = vi.fn(async () => [{ address: '93.184.216.34', family: 4 as const }])
    const literal = service({ resolve })
    await expect(literal.service.acquireRemote(owner({ source: 'https://[::1]/cat.png' }))).resolves.toEqual({ kind: 'blocked' })
    expect(resolve).not.toHaveBeenCalled()
  })

  test('AC6: a public answer is pinned into one credential-free bodyless GET', async () => {
    const get = vi.fn<RemoteImageTransport['get']>().mockResolvedValue(response())
    const value = service({ transport: { get } })
    await expect(value.service.acquireRemote(owner())).resolves.toMatchObject({ kind: 'authorized' })
    expect(get).toHaveBeenCalledTimes(1)
    expect(get.mock.calls[0]?.[0]).toMatchObject({
      address: { address: '93.184.216.34', family: 4 },
      method: 'GET',
      url: 'https://images.example/cat.png',
    })
  })

  test('AC7-AC11: status, encoding, declared/streamed size, MIME, content, transport, and deadline failures are typed', async () => {
    let bodyRead = false
    const cancel = vi.fn()
    const unreadBody = {
      async *[Symbol.asyncIterator](): AsyncIterator<Uint8Array> {
        bodyRead = true
        yield png()
      },
    }
    for (const result of [
      response({ status: 302, headers: { location: 'https://private.example/secret' }, body: unreadBody, cancel }),
      response({ status: 404, body: chunks() }),
    ]) {
      const value = service({ transport: { get: async () => result } })
      await expect(value.service.acquireRemote(owner())).resolves.toEqual({ kind: 'retryable' })
    }
    expect(bodyRead).toBe(false)
    expect(cancel).toHaveBeenCalledOnce()
    for (const result of [
      response({ headers: { 'content-encoding': 'gzip', 'content-type': 'image/png' } }),
      response({ headers: { 'content-length': String(MAX_ACQUIRED_IMAGE_BYTES + 1), 'content-type': 'image/png' } }),
      response({ headers: { 'content-type': 'image/jpeg' } }),
      response({ body: chunks(new TextEncoder().encode('<svg/>')), headers: { 'content-type': 'image/svg+xml' } }),
    ]) {
      const value = service({ transport: { get: async () => result } })
      await expect(value.service.acquireRemote(owner())).resolves.toEqual({ kind: 'blocked' })
    }
    const streamed = service({ transport: { get: async () => response({
      body: chunks(new Uint8Array(MAX_ACQUIRED_IMAGE_BYTES), new Uint8Array(1)),
      headers: { 'content-encoding': 'identity', 'content-type': 'image/png' },
    }) } })
    await expect(streamed.service.acquireRemote(owner())).resolves.toEqual({ kind: 'blocked' })
    const failed = service({ transport: { get: async () => { throw new Error('secret') } } })
    await expect(failed.service.acquireRemote(owner())).resolves.toEqual({ kind: 'retryable' })
    const timedOut = service({
      deadlineMs: 5,
      resolve: () => new Promise(() => undefined),
    })
    await expect(timedOut.service.acquireRemote(owner())).resolves.toEqual({ kind: 'retryable' })
  })

  test('AC12 AC16 AC19-AC20: current per-node generations issue independent revocable byte-backed tokens', async () => {
    const value = service()
    const first = await value.service.acquireRemote(owner())
    const second = await value.service.acquireRemote(owner({ assetId: 'asset-2' }))
    expect(first.kind).toBe('authorized')
    expect(second.kind).toBe('authorized')
    if (first.kind !== 'authorized' || second.kind !== 'authorized') throw new Error('Expected tokens')
    expect(first.asset.url).not.toBe(second.asset.url)
    expect(await value.registry.read(first.token)).toMatchObject({ mime: 'image/png' })
    value.service.cancel(owner({ generation: 2 }))
    expect(await value.registry.read(first.token)).toBeUndefined()
    expect(await value.registry.read(second.token)).toMatchObject({ mime: 'image/png' })
    await expect(value.service.acquireRemote(owner())).resolves.toEqual({ kind: 'stale' })
  })

  test('AC16: superseding a pending operation aborts it and prevents late token issuance', async () => {
    let resolveTransport!: (value: RemoteImageResponse) => void
    const value = service({
      transport: { get: () => new Promise((resolve) => { resolveTransport = resolve }) },
    })
    const pending = value.service.acquireRemote(owner())
    await vi.waitFor(() => expect(resolveTransport).toBeTypeOf('function'))
    value.service.cancel(owner({ generation: 2 }))
    resolveTransport(response())
    await expect(pending).resolves.toEqual({ kind: 'stale' })
  })

  test('AC17: a fifth concurrent remote request is rejected without queuing', async () => {
    const releases: Array<() => void> = []
    const transport: RemoteImageTransport = {
      get: () => new Promise((resolve) => releases.push(() => resolve(response()))),
    }
    const value = service({ transport })
    const pending = [1, 2, 3, 4].map((index) => value.service.acquireRemote(owner({ assetId: `asset-${index}` })))
    await vi.waitFor(() => expect(releases).toHaveLength(4))
    await expect(value.service.acquireRemote(owner({ assetId: 'asset-5' }))).resolves.toEqual({ kind: 'retryable' })
    for (const release of releases) release()
    await Promise.all(pending)
  })

  test('AC18: per-tab and application byte budgets reserve, transfer, and release exactly once', async () => {
    const budget = new ByteBudget({ applicationBytes: 20, tabBytes: 12 })
    const registry = new AssetRegistry(budget)
    const lease = budget.reserve(asTabId('tab-1'), 10)
    expect(lease).toBeDefined()
    if (!lease) throw new Error('Expected lease')
    lease.shrink(8)
    const token = registry.issueBytes({
      assetId: 'asset-1',
      bytes: new Uint8Array(8),
      generation: 1,
      issuer: asWindowId('window-1'),
      mime: 'image/png',
      source: 'data:image/png;base64,AA==',
      tabId: asTabId('tab-1'),
    }, lease)
    expect(budget.usage()).toEqual({ application: 8, tabs: new Map([[asTabId('tab-1'), 8]]) })
    expect(budget.reserve(asTabId('tab-1'), 5)).toBeUndefined()
    registry.revoke(token)
    registry.revoke(token)
    expect(budget.usage()).toEqual({ application: 0, tabs: new Map() })
  })

  test('AC21-AC22: embedded acquisition uses the same owner, budget, raster, token, and denial boundary', async () => {
    const value = service()
    const source = `data:image/png;base64,${Buffer.from(png()).toString('base64')}`
    const accepted = await value.service.acquireEmbedded(owner({ source }))
    expect(accepted).toMatchObject({ kind: 'authorized' })
    if (accepted.kind !== 'authorized') throw new Error('Expected embedded token')
    expect(await value.registry.read(accepted.token)).toMatchObject({ mime: 'image/png' })
    await expect(value.service.acquireEmbedded(owner({ assetId: 'bad', source: 'data:image/svg+xml;base64,PHN2Zy8+' }))).resolves.toEqual({ kind: 'blocked' })
  })

  test('AC18 AC21: embedded payload budget is reserved before base64 decoding', async () => {
    const budget = new ByteBudget({ applicationBytes: 20, tabBytes: 20 })
    const value = service({ budget })
    const source = `data:image/png;base64,${Buffer.from(png()).toString('base64')}`
    const decode = vi.spyOn(globalThis, 'atob')
    await expect(value.service.acquireEmbedded(owner({ source }))).resolves.toEqual({ kind: 'retryable' })
    expect(decode).not.toHaveBeenCalled()
    decode.mockRestore()
  })
})
