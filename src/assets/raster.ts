export const MAX_RASTER_BYTES = 25 * 1024 * 1024
export const MAX_RASTER_AXIS = 16_384
export const MAX_RASTER_PIXELS = 40_000_000
export const MAX_RASTER_FRAMES = 500
export const MAX_RASTER_FRAME_PIXELS = 100_000_000

export type RasterMime = 'image/gif' | 'image/jpeg' | 'image/png' | 'image/webp'
export type RasterInfo = {
  readonly frames: number
  readonly height: number
  readonly mime: RasterMime
  readonly width: number
}

export type RasterValidation =
  | { readonly info: RasterInfo; readonly ok: true }
  | { readonly ok: false; readonly reason: 'dimensions' | 'frames' | 'signature' | 'size' }

export type RasterValidationOptions = {
  readonly expectedMime?: RasterMime
  readonly filename?: string
  readonly maxBytes?: number
}

export function validateRaster(bytes: Uint8Array, filenameOrOptions?: string | RasterValidationOptions): RasterValidation {
  const options = typeof filenameOrOptions === 'string' ? { filename: filenameOrOptions } : filenameOrOptions ?? {}
  if (bytes.byteLength === 0 || bytes.byteLength > (options.maxBytes ?? MAX_RASTER_BYTES)) return { ok: false, reason: 'size' }
  const info = png(bytes) ?? jpeg(bytes) ?? gif(bytes) ?? webp(bytes)
  if (!info || (options.filename && !extensionMatches(options.filename, info.mime)) || (options.expectedMime && options.expectedMime !== info.mime)) {
    return { ok: false, reason: 'signature' }
  }
  if (
    info.width < 1 || info.height < 1 ||
    info.width > MAX_RASTER_AXIS || info.height > MAX_RASTER_AXIS ||
    info.width * info.height > MAX_RASTER_PIXELS
  ) return { ok: false, reason: 'dimensions' }
  if (
    info.frames < 1 || info.frames > MAX_RASTER_FRAMES ||
    info.width * info.height * info.frames > MAX_RASTER_FRAME_PIXELS
  ) return { ok: false, reason: 'frames' }
  return { info, ok: true }
}

function png(bytes: Uint8Array): RasterInfo | undefined {
  if (bytes.byteLength < 24 || !starts(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return undefined
  if (ascii(bytes, 12, 4) !== 'IHDR') return undefined
  return { frames: 1, height: u32be(bytes, 20), mime: 'image/png', width: u32be(bytes, 16) }
}

function gif(bytes: Uint8Array): RasterInfo | undefined {
  if (bytes.byteLength < 14 || !['GIF87a', 'GIF89a'].includes(ascii(bytes, 0, 6))) return undefined
  const width = u16le(bytes, 6)
  const height = u16le(bytes, 8)
  const packed = bytes[10] ?? 0
  let offset = 13 + ((packed & 0x80) ? 3 * (2 ** ((packed & 0x07) + 1)) : 0)
  let frames = 0
  let trailer = false
  while (offset < bytes.byteLength) {
    const marker = bytes[offset++]
    if (marker === 0x3b) { trailer = true; break }
    if (marker === 0x21) {
      if (offset >= bytes.byteLength) return undefined
      offset += 1
      offset = skipSubBlocks(bytes, offset)
      if (offset < 0) return undefined
      continue
    }
    if (marker !== 0x2c || offset + 9 > bytes.byteLength) return undefined
    const imagePacked = bytes[offset + 8] ?? 0
    offset += 9
    if (imagePacked & 0x80) offset += 3 * (2 ** ((imagePacked & 0x07) + 1))
    if (offset >= bytes.byteLength) return undefined
    offset += 1
    offset = skipSubBlocks(bytes, offset)
    if (offset < 0) return undefined
    frames += 1
    if (frames > MAX_RASTER_FRAMES || width * height * frames > MAX_RASTER_FRAME_PIXELS) {
      return { frames, height, mime: 'image/gif', width }
    }
  }
  return trailer && frames > 0 ? { frames, height, mime: 'image/gif', width } : undefined
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
      return { frames: 1, height: u16be(bytes, offset + 3), mime: 'image/jpeg', width: u16be(bytes, offset + 5) }
    }
    offset += length
  }
  return undefined
}

function webp(bytes: Uint8Array): RasterInfo | undefined {
  if (bytes.byteLength < 20 || ascii(bytes, 0, 4) !== 'RIFF' || ascii(bytes, 8, 4) !== 'WEBP') return undefined
  const declaredEnd = u32le(bytes, 4) + 8
  if (declaredEnd !== bytes.byteLength || declaredEnd < 20) return undefined
  let offset = 12
  let canvas: { readonly height: number; readonly width: number } | undefined
  let animation = false
  let animationHeader = false
  let frames = 0
  let staticFrame = false
  while (offset + 8 <= declaredEnd) {
    const name = ascii(bytes, offset, 4)
    const length = u32le(bytes, offset + 4)
    const start = offset + 8
    const end = start + length
    if (end > declaredEnd) return undefined
    if (name === 'VP8X' && length === 10) {
      animation = Boolean((bytes[start] ?? 0) & 0x02)
      canvas = { height: u24le(bytes, start + 7) + 1, width: u24le(bytes, start + 4) + 1 }
    } else if (name === 'ANIM') {
      animationHeader = length === 6
    } else if (name === 'ANMF') {
      if (length < 16 || !canvas) return undefined
      const x = u24le(bytes, start) * 2
      const y = u24le(bytes, start + 3) * 2
      const frameWidth = u24le(bytes, start + 6) + 1
      const frameHeight = u24le(bytes, start + 9) + 1
      if (x + frameWidth > canvas.width || y + frameHeight > canvas.height || !validWebpFramePayload(bytes, start + 16, end)) return undefined
      frames += 1
    } else if (name === 'VP8 ' && length >= 10 && bytes[start + 3] === 0x9d && bytes[start + 4] === 0x01 && bytes[start + 5] === 0x2a) {
      staticFrame = true
      canvas ??= { height: u16le(bytes, start + 8) & 0x3fff, width: u16le(bytes, start + 6) & 0x3fff }
    } else if (name === 'VP8L' && length >= 5 && bytes[start] === 0x2f) {
      staticFrame = true
      const packed = u32le(bytes, start + 1)
      canvas ??= { height: ((packed >>> 14) & 0x3fff) + 1, width: (packed & 0x3fff) + 1 }
    }
    offset = end + (length % 2)
  }
  if (!canvas || offset !== declaredEnd) return undefined
  if (animation) return animationHeader && frames > 0 ? { ...canvas, frames, mime: 'image/webp' } : undefined
  return staticFrame ? { ...canvas, frames: 1, mime: 'image/webp' } : undefined
}

function validWebpFramePayload(bytes: Uint8Array, start: number, end: number): boolean {
  let offset = start
  let image = false
  let alpha = false
  while (offset + 8 <= end) {
    const name = ascii(bytes, offset, 4)
    const length = u32le(bytes, offset + 4)
    const body = offset + 8
    const next = body + length
    if (next > end) return false
    if (name === 'ALPH') {
      if (alpha || image || length < 1) return false
      alpha = true
    } else if (name === 'VP8 ') {
      if (image || length < 10 || bytes[body + 3] !== 0x9d || bytes[body + 4] !== 0x01 || bytes[body + 5] !== 0x2a) return false
      image = true
    } else if (name === 'VP8L') {
      if (image || length < 5 || bytes[body] !== 0x2f) return false
      image = true
    } else {
      return false
    }
    offset = next + (length % 2)
  }
  return image && offset === end
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
const u32le = (bytes: Uint8Array, offset: number): number =>
  (((bytes[offset] ?? 0) + ((bytes[offset + 1] ?? 0) << 8) + ((bytes[offset + 2] ?? 0) << 16) + ((bytes[offset + 3] ?? 0) * 0x1000000)) >>> 0)

const sofMarker = (marker: number): boolean =>
  [0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf].includes(marker)

function skipSubBlocks(bytes: Uint8Array, start: number): number {
  let offset = start
  while (offset < bytes.byteLength) {
    const size = bytes[offset++] ?? 0
    if (size === 0) return offset
    offset += size
    if (offset > bytes.byteLength) return -1
  }
  return -1
}
