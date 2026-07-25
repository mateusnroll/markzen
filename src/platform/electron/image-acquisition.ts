import { lookup } from 'node:dns/promises'
import https from 'node:https'
import { BlockList, isIP, type LookupFunction } from 'node:net'

import { classifyImageSource, decodeEmbeddedImage, inspectEmbeddedImage, MAX_ACQUIRED_IMAGE_BYTES } from '../../assets/image-sources'
import { validateRaster, type RasterMime } from '../../assets/raster'
import type { TabId, WindowId } from '../contracts'
import type { AssetRegistry } from './asset-registry'
import type { ByteLease } from './byte-budget'

const MAX_REMOTE_REQUESTS = 4
const REMOTE_DEADLINE_MS = 30_000

export type AcquisitionOwner = {
  readonly assetId: string
  readonly generation: number
  readonly issuer: WindowId
  readonly source: string
  readonly tabId: TabId
}

export type AcquisitionOutcome =
  | { readonly asset: { readonly source: string; readonly url: string }; readonly kind: 'authorized'; readonly token: string }
  | { readonly kind: 'blocked' | 'retryable' | 'stale' }

export type ResolvedAddress = { readonly address: string; readonly family: 4 | 6 }
export type RemoteImageRequest = {
  readonly address: ResolvedAddress
  readonly method: 'GET'
  readonly signal: AbortSignal
  readonly url: string
}
export type RemoteImageResponse = {
  readonly body: AsyncIterable<Uint8Array>
  readonly cancel?: () => void
  readonly headers: Readonly<Record<string, string | undefined>>
  readonly status: number
}
export interface RemoteImageTransport {
  get(request: RemoteImageRequest): Promise<RemoteImageResponse>
}

type Operation = {
  readonly assetId: string
  readonly controller: AbortController
  readonly generation: number
  readonly issuer: WindowId
  readonly source: string
  readonly tabId: TabId
}

export class ImageAcquisitionService {
  readonly #deadlineMs: number
  readonly #generations = new Map<string, number>()
  readonly #operations = new Map<string, Operation>()
  readonly #registry: AssetRegistry
  readonly #resolve: (hostname: string) => Promise<readonly ResolvedAddress[]>
  readonly #transport: RemoteImageTransport
  #inFlight = 0
  #requestCount = 0

  constructor(options: {
    readonly deadlineMs?: number
    readonly registry: AssetRegistry
    readonly resolve?: (hostname: string) => Promise<readonly ResolvedAddress[]>
    readonly transport?: RemoteImageTransport
  }) {
    this.#deadlineMs = options.deadlineMs ?? REMOTE_DEADLINE_MS
    this.#registry = options.registry
    this.#resolve = options.resolve ?? resolvePublicAddresses
    this.#transport = options.transport ?? new NodeRemoteImageTransport()
  }

  requestCount(): number {
    return this.#requestCount
  }

  async acquireRemote(owner: AcquisitionOwner): Promise<AcquisitionOutcome> {
    const classification = classifyImageSource(owner.source)
    if (classification.kind !== 'remote') return { kind: 'blocked' }
    const operation = this.#begin(owner)
    if (!operation) return { kind: 'stale' }
    if (this.#inFlight >= MAX_REMOTE_REQUESTS) {
      this.#finish(owner, operation)
      return { kind: 'retryable' }
    }
    const lease = this.#registry.budget.reserve(owner.tabId, MAX_ACQUIRED_IMAGE_BYTES)
    if (!lease) {
      this.#finish(owner, operation)
      return { kind: 'retryable' }
    }
    this.#inFlight += 1
    this.#requestCount += 1
    const timeout = setTimeout(() => operation.controller.abort(), this.#deadlineMs)
    let transferred = false
    try {
      const url = new URL(owner.source)
      const literal = literalAddress(url.hostname)
      const addresses = literal
        ? [literal]
        : await abortable(this.#resolve(url.hostname), operation.controller.signal)
      if (!this.#current(owner, operation)) return { kind: 'stale' }
      if (addresses.length === 0) return { kind: 'retryable' }
      if (addresses.some((address) => !isGloballyReachable(address.address))) return { kind: 'blocked' }
      const remote = await abortable(this.#transport.get({
        address: addresses[0]!,
        method: 'GET',
        signal: operation.controller.signal,
        url: url.href,
      }), operation.controller.signal)
      if (!this.#current(owner, operation)) return { kind: 'stale' }
      if (remote.status !== 200) {
        remote.cancel?.()
        return { kind: 'retryable' }
      }
      const contentEncoding = header(remote.headers, 'content-encoding')
      if (contentEncoding && contentEncoding.toLocaleLowerCase('en-US') !== 'identity') {
        remote.cancel?.()
        return { kind: 'blocked' }
      }
      const contentLength = header(remote.headers, 'content-length')
      if (contentLength && (!/^\d+$/.test(contentLength) || Number(contentLength) > MAX_ACQUIRED_IMAGE_BYTES)) {
        remote.cancel?.()
        return { kind: 'blocked' }
      }
      const mime = mimeEssence(header(remote.headers, 'content-type'))
      if (!mime) {
        remote.cancel?.()
        return { kind: 'blocked' }
      }
      const bytes = await abortable(readBounded(remote.body, operation.controller.signal), operation.controller.signal)
      if (!bytes) {
        remote.cancel?.()
        return { kind: 'blocked' }
      }
      if (!this.#current(owner, operation)) return { kind: 'stale' }
      const validated = validateRaster(bytes, { expectedMime: mime, maxBytes: MAX_ACQUIRED_IMAGE_BYTES })
      if (!validated.ok || !lease.shrink(bytes.byteLength)) return { kind: 'blocked' }
      const token = this.#registry.issueBytes({
        assetId: owner.assetId,
        bytes,
        generation: owner.generation,
        issuer: owner.issuer,
        mime: validated.info.mime,
        source: owner.source,
        tabId: owner.tabId,
      }, lease)
      transferred = true
      return { asset: { source: owner.source, url: `markzen-asset://${token}` }, kind: 'authorized', token }
    } catch {
      return this.#owns(owner, operation) ? { kind: 'retryable' } : { kind: 'stale' }
    } finally {
      clearTimeout(timeout)
      if (!transferred) lease.release()
      this.#inFlight -= 1
      this.#finish(owner, operation)
    }
  }

  async acquireEmbedded(owner: AcquisitionOwner): Promise<AcquisitionOutcome> {
    if (classifyImageSource(owner.source).kind !== 'embedded') return { kind: 'blocked' }
    const operation = this.#begin(owner)
    if (!operation) return { kind: 'stale' }
    let lease: ByteLease | undefined
    let transferred = false
    try {
      const metadata = inspectEmbeddedImage(owner.source)
      if (!metadata.ok) return { kind: 'blocked' }
      lease = this.#registry.budget.reserve(owner.tabId, metadata.decodedLength)
      if (!lease) return { kind: 'retryable' }
      const decoded = decodeEmbeddedImage(owner.source)
      if (!decoded.ok) return { kind: 'blocked' }
      const validated = validateRaster(decoded.bytes, { expectedMime: decoded.mime, maxBytes: MAX_ACQUIRED_IMAGE_BYTES })
      if (!validated.ok || !this.#current(owner, operation)) return validated.ok ? { kind: 'stale' } : { kind: 'blocked' }
      const token = this.#registry.issueBytes({
        assetId: owner.assetId,
        bytes: decoded.bytes,
        generation: owner.generation,
        issuer: owner.issuer,
        mime: validated.info.mime,
        source: owner.source,
        tabId: owner.tabId,
      }, lease)
      transferred = true
      return { asset: { source: owner.source, url: `markzen-asset://${token}` }, kind: 'authorized', token }
    } finally {
      if (!transferred) lease?.release()
      this.#finish(owner, operation)
    }
  }

  cancel(owner: AcquisitionOwner): void {
    const key = ownerKey(owner)
    const current = this.#generations.get(key) ?? -1
    if (owner.generation < current) return
    this.#generations.set(key, owner.generation)
    this.#operations.get(key)?.controller.abort()
    this.#operations.delete(key)
    this.#registry.revokeNode(owner.issuer, owner.tabId, owner.assetId)
  }

  cancelTab(tabId: TabId): void {
    for (const operation of this.#operations.values()) {
      if (operation.tabId === tabId) operation.controller.abort()
    }
    for (const key of this.#operations.keys()) {
      if (this.#operations.get(key)?.tabId === tabId) this.#operations.delete(key)
    }
    for (const key of this.#generations.keys()) {
      if (key.includes(`:${tabId}:`)) this.#generations.delete(key)
    }
    this.#registry.revokeTab(tabId)
  }

  cancelIssuer(issuer: WindowId): void {
    for (const operation of this.#operations.values()) {
      if (operation.issuer === issuer) operation.controller.abort()
    }
    for (const key of this.#operations.keys()) {
      if (this.#operations.get(key)?.issuer === issuer) this.#operations.delete(key)
    }
    for (const key of this.#generations.keys()) {
      if (key.startsWith(`${issuer}:`)) this.#generations.delete(key)
    }
    this.#registry.revokeIssuer(issuer)
  }

  #begin(owner: AcquisitionOwner): Operation | undefined {
    const key = ownerKey(owner)
    const current = this.#generations.get(key)
    if (current !== undefined && owner.generation <= current) return undefined
    this.#operations.get(key)?.controller.abort()
    this.#registry.revokeNode(owner.issuer, owner.tabId, owner.assetId)
    const operation = {
      assetId: owner.assetId,
      controller: new AbortController(),
      generation: owner.generation,
      issuer: owner.issuer,
      source: owner.source,
      tabId: owner.tabId,
    }
    this.#generations.set(key, owner.generation)
    this.#operations.set(key, operation)
    return operation
  }

  #current(owner: AcquisitionOwner, operation: Operation): boolean {
    return !operation.controller.signal.aborted && this.#owns(owner, operation)
  }

  #owns(owner: AcquisitionOwner, operation: Operation): boolean {
    return this.#operations.get(ownerKey(owner)) === operation
      && this.#generations.get(ownerKey(owner)) === owner.generation
      && operation.source === owner.source
  }

  #finish(owner: AcquisitionOwner, operation: Operation): void {
    const key = ownerKey(owner)
    if (this.#operations.get(key) === operation) this.#operations.delete(key)
  }
}

export class NodeRemoteImageTransport implements RemoteImageTransport {
  async get(input: RemoteImageRequest): Promise<RemoteImageResponse> {
    return new Promise((resolve, reject) => {
      const url = new URL(input.url)
      const pinnedLookup: LookupFunction = (_hostname, options, callback) => {
        if (options.all) callback(null, [input.address])
        else callback(null, input.address.address, input.address.family)
      }
      const request = https.request(url, {
        agent: false,
        headers: { Accept: 'image/png,image/jpeg,image/gif,image/webp' },
        lookup: pinnedLookup,
        method: input.method,
        signal: input.signal,
      }, (incoming) => {
        const headers: Record<string, string | undefined> = {}
        for (const [name, value] of Object.entries(incoming.headers)) {
          if (typeof value === 'string') headers[name] = value
          else if (Array.isArray(value)) headers[name] = value.join(', ')
        }
        resolve({
          body: incoming,
          cancel: () => incoming.destroy(),
          headers,
          status: incoming.statusCode ?? 0,
        })
      })
      request.once('error', reject)
      request.end()
    })
  }
}

export function isGloballyReachable(address: string): boolean {
  const mapped = mappedIpv4(address)
  if (mapped) return isGloballyReachable(mapped)
  const family = isIP(address)
  if (family === 4) return !blockedIpv4Addresses.check(address, 'ipv4')
  if (family === 6) {
    if (globalSpecialAddresses.check(address, 'ipv6')) return true
    return globalIpv6Addresses.check(address, 'ipv6') && !blockedIpv6Addresses.check(address, 'ipv6')
  }
  return false
}

async function resolvePublicAddresses(hostname: string): Promise<readonly ResolvedAddress[]> {
  const values = await lookup(hostname, { all: true, verbatim: true })
  return values.flatMap((value) => value.family === 4 || value.family === 6
    ? [{ address: value.address, family: value.family }]
    : [])
}

function literalAddress(hostname: string): ResolvedAddress | undefined {
  const address = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
  const family = isIP(address)
  return family === 4 || family === 6 ? { address, family } : undefined
}

function ownerKey(owner: Pick<AcquisitionOwner, 'assetId' | 'issuer' | 'tabId'>): string {
  return `${owner.issuer}:${owner.tabId}:${owner.assetId}`
}

function header(headers: Readonly<Record<string, string | undefined>>, name: string): string | undefined {
  const matching = Object.keys(headers).find((key) => key.toLocaleLowerCase('en-US') === name)
  return headers[name] ?? (matching ? headers[matching] : undefined)
}

function mimeEssence(value: string | undefined): RasterMime | undefined {
  const essence = value?.split(';', 1)[0]?.trim().toLocaleLowerCase('en-US')
  return essence === 'image/png' || essence === 'image/jpeg' || essence === 'image/gif' || essence === 'image/webp'
    ? essence
    : undefined
}

async function readBounded(body: AsyncIterable<Uint8Array>, signal: AbortSignal): Promise<Uint8Array | undefined> {
  const chunks: Uint8Array[] = []
  let total = 0
  for await (const chunk of body) {
    if (signal.aborted) throw new Error('Aborted')
    total += chunk.byteLength
    if (total > MAX_ACQUIRED_IMAGE_BYTES) return undefined
    chunks.push(chunk)
  }
  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }
  return bytes
}

async function abortable<T>(pending: Promise<T>, signal: AbortSignal): Promise<T> {
  if (signal.aborted) throw new Error('Aborted')
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new Error('Aborted'))
    signal.addEventListener('abort', abort, { once: true })
    void pending.then(
      (value) => { signal.removeEventListener('abort', abort); resolve(value) },
      (error: unknown) => { signal.removeEventListener('abort', abort); reject(error) },
    )
  })
}

function mappedIpv4(address: string): string | undefined {
  const dotted = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(address)?.[1]
  if (dotted && isIP(dotted) === 4) return dotted
  const hexadecimal = /^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i.exec(address)
  if (!hexadecimal) return undefined
  const high = Number.parseInt(hexadecimal[1]!, 16)
  const low = Number.parseInt(hexadecimal[2]!, 16)
  return `${high >>> 8}.${high & 0xff}.${low >>> 8}.${low & 0xff}`
}

const blockedIpv4Addresses = new BlockList()
for (const [network, prefix] of [
  ['0.0.0.0', 8],
  ['10.0.0.0', 8],
  ['100.64.0.0', 10],
  ['127.0.0.0', 8],
  ['169.254.0.0', 16],
  ['172.16.0.0', 12],
  ['192.0.0.0', 29],
  ['192.0.0.8', 32],
  ['192.0.0.170', 31],
  ['192.0.2.0', 24],
  ['192.88.99.0', 24],
  ['192.168.0.0', 16],
  ['198.18.0.0', 15],
  ['198.51.100.0', 24],
  ['203.0.113.0', 24],
  ['224.0.0.0', 4],
  ['240.0.0.0', 4],
] as const) blockedIpv4Addresses.addSubnet(network, prefix, 'ipv4')

const blockedIpv6Addresses = new BlockList()
for (const [network, prefix] of [
  ['::', 128],
  ['::1', 128],
  ['::ffff:0:0', 96],
  ['64:ff9b:1::', 48],
  ['100::', 64],
  ['100:0:0:1::', 64],
  ['2001::', 23],
  ['2001:db8::', 32],
  ['2002::', 16],
  ['3fff::', 20],
  ['5f00::', 16],
  ['fc00::', 7],
  ['fe80::', 10],
  ['fec0::', 10],
  ['ff00::', 8],
] as const) blockedIpv6Addresses.addSubnet(network, prefix, 'ipv6')

const globalIpv6Addresses = new BlockList()
globalIpv6Addresses.addSubnet('2000::', 3, 'ipv6')

const globalSpecialAddresses = new BlockList()
for (const [network, prefix] of [
  ['64:ff9b::', 96],
  ['2001:1::1', 128],
  ['2001:1::2', 128],
  ['2001:1::3', 128],
  ['2001:3::', 32],
  ['2001:4:112::', 48],
  ['2001:20::', 28],
  ['2001:30::', 28],
] as const) globalSpecialAddresses.addSubnet(network, prefix, 'ipv6')
