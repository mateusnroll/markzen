export const MAX_RASTER_BYTES = 25 * 1024 * 1024
export const MAX_RASTER_AXIS = 16_384
export const MAX_RASTER_PIXELS = 40_000_000

export type RasterMime = 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp'
export type RasterInfo = {
  readonly height: number
  readonly mime: RasterMime
  readonly width: number
}

export type RasterValidation =
  | { readonly info: RasterInfo; readonly ok: true }
  | { readonly ok: false; readonly reason: 'dimensions' | 'signature' | 'size' }

export function validateRaster(bytes: Uint8Array, filename?: string): RasterValidation {
  if (bytes.byteLength === 0 || bytes.byteLength > MAX_RASTER_BYTES) return { ok: false, reason: 'size' }
  const info = png(bytes) ?? jpeg(bytes) ?? gif(bytes) ?? webp(bytes)
  if (!info || (filename && !extensionMatches(filename, info.mime))) return { ok: false, reason: 'signature' }
  if (
    info.width < 1 || info.height < 1 ||
    info.width > MAX_RASTER_AXIS || info.height > MAX_RASTER_AXIS ||
    info.width * info.height > MAX_RASTER_PIXELS
  ) return { ok: false, reason: 'dimensions' }
  return { info, ok: true }
}

function png(bytes: Uint8Array): RasterInfo | undefined {
  if (bytes.byteLength < 24 || !starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return undefined
  if (ascii(bytes, 12, 4) !== 'IHDR') return undefined
  return { height: u32be(bytes, 20), mime: 'image/png', width: u32be(bytes, 16) }
}

function gif(bytes: Uint8Array): RasterInfo | undefined {
  if (bytes.byteLength < 10 || !['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) return undefined
  return { height: u16le(bytes, 8), mime: 'image/gif', width: u16le(bytes, 6) }
}

function jpeg(bytes: Uint8Array): RasterInfo | undefined {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) return undefined
  let offset = 2
  while (offset + 3 < bytes.byteLength) {
    if (bytes[offset] !== 0xff) { offset += 1; continue }
    while (bytes[offset] === 0xff) offset += 1
    const marker = bytes[offset]
    offset += 1
    if (marker === undefined || marker === 0xd9 || marker === 0xda) break
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue
    if (offset + 1 >= bytes.byteLength) break
    const length = u16be(bytes, offset)
    if (length < 2 || offset + length > bytes.byteLength) break
    if (sofMarker(marker) && length >= 7) {
      return { height: u16be(bytes, offset + 3), mime: 'image/jpeg', width: u16be(bytes, offset + 5) }
    }
    offset += length
  }
  return undefined
}

function webp(bytes: Uint8Array): RasterInfo | undefined {
  if (bytes.byteLength < 30 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return undefined
  const chunk = ascii(bytes, 12, 4)
  if (chunk === 'VP8X' && bytes.byteLength >= 30) {
    return { height: u24le(bytes, 27) + 1, mime: 'image/webp', width: u24le(bytes, 24) + 1 }
  }
  if (chunk === 'VP8 ' && bytes.byteLength >= 30 && bytes[23] === 0x9d && bytes[24] === 0x01 && bytes[25] === 0x2a) {
    return { height: u16le(bytes, 28) & 0x3fff, mime: 'image/webp', width: u16le(bytes, 26) & 0x3fff }
  }
  if (chunk === 'VP8L' && bytes.byteLength >= 25 && bytes[20] === 0x2f) {
    const packed = (bytes[21] ?? 0) | ((bytes[22] ?? 0) << 8) | ((bytes[23] ?? 0) << 16) | ((bytes[24] ?? 0) << 24)
    return { height: ((packed >>> 14) & 0x3fff) + 1, mime: 'image/webp', width: (packed & 0x3fff) + 1 }
  }
  return undefined
}

function extensionMatches(filename: string, mime: RasterMime): boolean {
  const extension = filename.split(/[\\/]/).at(-1)?.split('.').at(-1)?.toLocaleLowerCase('en-US')
  if (mime === 'image/jpeg') return extension === 'jpg' || extension === 'jpeg'
  return extension === mime.slice('image/'.length)
}

const starts = (bytes: Uint8Array, signature: readonly number[]): boolean =>
  signature.every((byte, index) => bytes[index] === byte)

const ascii = (bytes: Uint8Array, offset: number, length: number): string =>
  String.fromCharCode(...bytes.slice(offset, offset + length))

const u16be = (bytes: Uint8Array, offset: number): number => ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0)
const u16le = (bytes: Uint8Array, offset: number): number => (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8)
const u24le = (bytes: Uint8Array, offset: number): number =>
  (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16)
const u32be = (bytes: Uint8Array, offset: number): number =>
  (((bytes[offset] ?? 0) * 0x1000000) + ((bytes[offset + 1] ?? 0) << 16) + ((bytes[offset + 2] ?? 0) << 8) + (bytes[offset + 3] ?? 0)) >>> 0

const sofMarker = (marker: number): boolean =>
  [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)
