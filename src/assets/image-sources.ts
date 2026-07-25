import type { RasterMime } from './raster'

export const MAX_REMOTE_SOURCE_BYTES = 4_096
export const MAX_ACQUIRED_IMAGE_BYTES = 10 * 1024 * 1024

export type ImageSourceClassification =
  | { readonly kind: 'blocked' }
  | { readonly kind: 'embedded' }
  | { readonly kind: 'local' }
  | { readonly kind: 'remote'; readonly origin: string }

export type EmbeddedImage =
  | { readonly bytes: Uint8Array; readonly mime: RasterMime; readonly ok: true }
  | { readonly ok: false }

export type EmbeddedImageMetadata =
  | { readonly decodedLength: number; readonly mime: RasterMime; readonly ok: true }
  | { readonly ok: false }

const embeddedPattern = /^data:(image\/(?:png|jpeg|gif|webp));base64,([\s\S]*)$/i
const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/

export function classifyImageSource(source: string): ImageSourceClassification {
  if (!source || source.includes('\0')) return { kind: 'blocked' }
  if (/^data:/i.test(source)) return { kind: 'embedded' }
  if (windowsAbsolute(source)) return { kind: 'local' }
  if (source.startsWith('//')) return { kind: 'blocked' }
  if (!/^[a-z][a-z0-9+.-]*:/i.test(source)) return { kind: 'local' }
  if (new TextEncoder().encode(source).byteLength > MAX_REMOTE_SOURCE_BYTES) return { kind: 'blocked' }
  try {
    const url = new URL(source)
    if (url.protocol !== 'https:' || !url.hostname || url.username || url.password) return { kind: 'blocked' }
    return { kind: 'remote', origin: url.origin }
  } catch {
    return { kind: 'blocked' }
  }
}

export function decodeEmbeddedImage(source: string): EmbeddedImage {
  const parsed = parseEmbeddedImage(source)
  if (!parsed.ok) return parsed
  const { decodedLength, mime, payload, unpaddedLength } = parsed
  try {
    const normalized = payload.slice(0, unpaddedLength).padEnd(Math.ceil(unpaddedLength / 4) * 4, '=')
    const decoded = atob(normalized)
    if (decoded.length !== decodedLength) return { ok: false }
    const bytes = new Uint8Array(decoded.length)
    for (let index = 0; index < decoded.length; index += 1) bytes[index] = decoded.charCodeAt(index)
    return { bytes, mime, ok: true }
  } catch {
    return { ok: false }
  }
}

export function inspectEmbeddedImage(source: string): EmbeddedImageMetadata {
  const parsed = parseEmbeddedImage(source)
  return parsed.ok ? { decodedLength: parsed.decodedLength, mime: parsed.mime, ok: true } : parsed
}

function parseEmbeddedImage(source: string):
  | { readonly decodedLength: number; readonly mime: RasterMime; readonly ok: true; readonly payload: string; readonly unpaddedLength: number }
  | { readonly ok: false } {
  const match = embeddedPattern.exec(source)
  if (!match) return { ok: false }
  const mime = match[1]?.toLocaleLowerCase('en-US') as RasterMime | undefined
  const payload = match[2] ?? ''
  if (!mime || !payload || !base64Pattern.test(payload)) return { ok: false }
  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0
  const unpaddedLength = payload.length - padding
  const remainder = unpaddedLength % 4
  if (remainder === 1 || (padding > 0 && payload.length % 4 !== 0)) return { ok: false }
  const last = unpaddedLength ? base64Value(payload[unpaddedLength - 1]!) : 0
  if ((remainder === 2 && (last & 0x0f) !== 0) || (remainder === 3 && (last & 0x03) !== 0)) return { ok: false }
  const decodedLength = Math.floor(unpaddedLength * 6 / 8)
  if (decodedLength === 0 || decodedLength > MAX_ACQUIRED_IMAGE_BYTES) return { ok: false }
  return { decodedLength, mime, ok: true, payload, unpaddedLength }
}

function base64Value(character: string): number {
  const code = character.charCodeAt(0)
  if (code >= 65 && code <= 90) return code - 65
  if (code >= 97 && code <= 122) return code - 71
  if (code >= 48 && code <= 57) return code + 4
  return character === '+' ? 62 : character === '/' ? 63 : -1
}

function windowsAbsolute(source: string): boolean {
  return /^[A-Za-z]:[\\/]/.test(source) || /^\\\\/.test(source)
}
