import { randomBytes } from 'node:crypto'

import { MAX_RASTER_BYTES, validateRaster, type RasterInfo } from '../../assets/raster'
import type { FileKey, Path, TabId, WindowId } from '../contracts'
import { ByteBudget, type ByteLease } from './byte-budget'
import { RealFileSystem } from './real-fs'

type FileGrant = {
  readonly fileKey: FileKey
  readonly issuer: WindowId
  readonly kind: 'file'
  readonly path: Path
  readonly tabId: TabId
}

type ByteGrant = {
  readonly assetId: string
  readonly bytes: Uint8Array
  readonly generation: number
  readonly issuer: WindowId
  readonly kind: 'bytes'
  readonly lease: ByteLease
  readonly mime: RasterInfo['mime']
  readonly source: string
  readonly tabId: TabId
}

type Grant = ByteGrant | FileGrant
type ByteGrantInput = Omit<ByteGrant, 'kind' | 'lease'>

export type AssetRead = RasterInfo & { readonly bytes: Uint8Array }

export class AssetRegistry {
  readonly #grants = new Map<string, Grant>()

  constructor(readonly budget: ByteBudget = new ByteBudget()) {}

  issue(grant: Omit<FileGrant, 'kind'>): string {
    const token = randomBytes(32).toString('base64url')
    this.#grants.set(token, { ...grant, kind: 'file' })
    return token
  }

  issueBytes(grant: ByteGrantInput, lease: ByteLease): string {
    if (lease.tabId !== grant.tabId || lease.value() !== grant.bytes.byteLength) throw new Error('Byte grant lease mismatch')
    const token = randomBytes(32).toString('base64url')
    this.#grants.set(token, { ...grant, kind: 'bytes', lease })
    return token
  }

  revoke(token: string): void {
    const grant = this.#grants.get(token)
    if (!grant) return
    this.#grants.delete(token)
    if (grant.kind === 'bytes') grant.lease.release()
  }

  revokeIssuer(issuer: WindowId): void {
    for (const [token, grant] of this.#grants) if (grant.issuer === issuer) this.revoke(token)
  }

  revokeTab(tabId: TabId): void {
    for (const [token, grant] of this.#grants) if (grant.tabId === tabId) this.revoke(token)
  }

  revokeNode(issuer: WindowId, tabId: TabId, assetId: string): void {
    for (const [token, grant] of this.#grants) {
      if (grant.kind === 'bytes' && grant.issuer === issuer && grant.tabId === tabId && grant.assetId === assetId) this.revoke(token)
    }
  }

  async read(token: string): Promise<AssetRead | undefined> {
    const grant = this.#grants.get(token)
    if (!grant) return undefined
    if (grant.kind === 'bytes') {
      const validated = validateRaster(grant.bytes, { expectedMime: grant.mime, maxBytes: MAX_RASTER_BYTES })
      return validated.ok ? { ...validated.info, bytes: grant.bytes.slice() } : undefined
    }
    const fs = new RealFileSystem()
    const metadata = await fs.stat(grant.path)
    if (!metadata.ok || metadata.value.fileKey !== grant.fileKey || metadata.value.kind !== 'file' || metadata.value.size > MAX_RASTER_BYTES) return undefined
    const read = await fs.read(grant.path)
    if (!read.ok || read.value.fileKey !== grant.fileKey) return undefined
    const validated = validateRaster(read.value.bytes, String(grant.path))
    if (!validated.ok) return undefined
    return { ...validated.info, bytes: read.value.bytes }
  }
}

export const assetRegistry = new AssetRegistry()
