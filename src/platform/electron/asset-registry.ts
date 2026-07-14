import { randomBytes } from 'node:crypto'

import { MAX_RASTER_BYTES, validateRaster, type RasterInfo } from '../../assets/raster'
import type { FileKey, Path, TabId, WindowId } from '../contracts'
import { RealFileSystem } from './real-fs'

type Grant = {
  readonly fileKey: FileKey
  readonly issuer: WindowId
  readonly path: Path
  readonly tabId: TabId
}

export type AssetRead = RasterInfo & { readonly bytes: Uint8Array }

export class AssetRegistry {
  readonly #grants = new Map<string, Grant>()

  issue(grant: Grant): string {
    const token = randomBytes(32).toString('base64url')
    this.#grants.set(token, grant)
    return token
  }

  revoke(token: string): void {
    this.#grants.delete(token)
  }

  revokeIssuer(issuer: WindowId): void {
    for (const [token, grant] of this.#grants) if (grant.issuer === issuer) this.#grants.delete(token)
  }

  revokeTab(tabId: TabId): void {
    for (const [token, grant] of this.#grants) if (grant.tabId === tabId) this.#grants.delete(token)
  }

  async read(token: string): Promise<AssetRead | undefined> {
    const grant = this.#grants.get(token)
    if (!grant) return undefined
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
