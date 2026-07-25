import { describe, expect, test } from 'vitest'

import { MAX_RASTER_BYTES, validateRaster } from '../../src/assets/raster'
import type { RichDocument } from '../../src/documents/markdown'
import { asPath } from '../../src/platform/contracts'
import { rebaseDocumentImages } from '../../src/platform/electron/asset-paths'

const png = (width: number, height: number): Uint8Array => {
  const bytes = new Uint8Array(24)
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  bytes.set([0x49, 0x48, 0x44, 0x52], 12)
  new DataView(bytes.buffer).setUint32(16, width)
  new DataView(bytes.buffer).setUint32(20, height)
  return bytes
}

describe('spec 0005 local raster validation', () => {
  test('AC41: matching bounded PNG, JPEG, GIF, and WebP signatures expose canvas dimensions', () => {
    expect(validateRaster(png(640, 480), 'photo.png')).toMatchObject({ info: { height: 480, mime: 'image/png', width: 640 }, ok: true })
    expect(validateRaster(Uint8Array.from([0xff, 0xd8, 0xff, 0xc0, 0, 7, 8, 0, 2, 0, 3]), 'photo.jpeg'))
      .toMatchObject({ info: { height: 2, mime: 'image/jpeg', width: 3 }, ok: true })
    expect(validateRaster(animatedGif(3, 2, 1), 'photo.gif'))
      .toMatchObject({ info: { height: 2, mime: 'image/gif', width: 3 }, ok: true })
    expect(validateRaster(animatedWebp(3, 2, 1), 'photo.webp')).toMatchObject({ info: { height: 2, mime: 'image/webp', width: 3 }, ok: true })
  })

  test('AC41 / spec 0006 AC25: GIF/WebP frame count and aggregate full-canvas pixels are bounded', () => {
    expect(validateRaster(animatedGif(10, 10, 2), 'animated.gif')).toMatchObject({
      info: { frames: 2, height: 10, width: 10 },
      ok: true,
    })
    expect(validateRaster(animatedGif(1000, 1000, 101), 'animated.gif')).toEqual({ ok: false, reason: 'frames' })
    expect(validateRaster(animatedGif(1, 1, 501), 'animated.gif')).toEqual({ ok: false, reason: 'frames' })
    expect(validateRaster(animatedWebp(10, 10, 2), 'animated.webp')).toMatchObject({
      info: { frames: 2, height: 10, width: 10 },
      ok: true,
    })
    expect(validateRaster(animatedWebp(1, 1, 501), 'animated.webp')).toEqual({ ok: false, reason: 'frames' })
    expect(validateRaster(malformedAnimatedWebp(), 'animated.webp')).toEqual({ ok: false, reason: 'signature' })
  })

  test('AC41: size, dimensions, extension/signature mismatch, SVG, and unsupported bytes are rejected', () => {
    expect(validateRaster(new Uint8Array(MAX_RASTER_BYTES + 1), 'large.png')).toEqual({ ok: false, reason: 'size' })
    expect(validateRaster(png(16_385, 1), 'wide.png')).toEqual({ ok: false, reason: 'dimensions' })
    expect(validateRaster(png(10_000, 5_000), 'pixels.png')).toEqual({ ok: false, reason: 'dimensions' })
    expect(validateRaster(png(1, 1), 'wrong.jpg')).toEqual({ ok: false, reason: 'signature' })
    expect(validateRaster(new TextEncoder().encode('<svg/>'), 'image.svg')).toEqual({ ok: false, reason: 'signature' })
  })
})

describe('spec 0005 trusted image path rebasing', () => {
  test('AC22-AC27: saved relative and untitled internal sources rebase while remote and authored absolute sources do not', () => {
    const result = rebaseDocumentImages(imageDocument([
      { src: 'images/a.png' },
      { src: 'https://example.com/a.png' },
      { src: '/opt/shared.png' },
      { internal: true, src: '/tmp/draft.png' },
    ]), asPath('/notes/project/note.md'), asPath('/archive/note.md'))
    expect(imageSources(result.document)).toEqual([
      '../notes/project/images/a.png',
      'https://example.com/a.png',
      '/opt/shared.png',
      '../tmp/draft.png',
    ])
    expect(result.sourceRebases).toEqual([
      { from: 'images/a.png', to: '../notes/project/images/a.png' },
      { from: '/tmp/draft.png', to: '../tmp/draft.png' },
    ])
  })

  test('AC28: Windows separators, UNC paths, and cross-volume internal assets retain platform identity', () => {
    const sameVolume = rebaseDocumentImages(imageDocument([{ internal: true, src: 'C:/Users/Zoë/My (image)#1.png' }]), undefined, asPath('C:\\Notes\\note.md'))
    expect(imageSources(sameVolume.document)).toEqual(['../Users/Zoë/My (image)#1.png'])
    const crossVolume = rebaseDocumentImages(imageDocument([{ internal: true, src: 'D:/Media/100% real.png' }]), undefined, asPath('C:\\Notes\\note.md'))
    expect(imageSources(crossVolume.document)).toEqual(['D:/Media/100% real.png'])
    const unc = rebaseDocumentImages(imageDocument([{ internal: true, src: '//server/share/image.png' }]), undefined, asPath('C:\\Notes\\note.md'))
    expect(imageSources(unc.document)).toEqual(['//server/share/image.png'])
  })
})

function imageDocument(images: readonly Record<string, unknown>[]): RichDocument {
  return { content: [{ content: images.map((attrs) => ({ attrs: { alt: '', ...attrs }, type: 'image' })), type: 'paragraph' }], type: 'doc' }
}

function imageSources(document: RichDocument): string[] {
  return (document.content[0]?.content ?? []).map((node) => String(node.attrs?.src))
}

function animatedGif(width: number, height: number, frames: number): Uint8Array {
  const bytes = [
    ...new TextEncoder().encode('GIF89a'),
    width & 0xff, width >>> 8,
    height & 0xff, height >>> 8,
    0, 0, 0,
  ]
  for (let index = 0; index < frames; index += 1) {
    bytes.push(0x2c, 0, 0, 0, 0, width & 0xff, width >>> 8, height & 0xff, height >>> 8, 0, 2, 1, 0, 0)
  }
  bytes.push(0x3b)
  return Uint8Array.from(bytes)
}

function animatedWebp(width: number, height: number, frames: number): Uint8Array {
  const chunks: number[] = []
  chunks.push(...chunk('VP8X', Uint8Array.from([0x02, 0, 0, 0, ...u24(width - 1), ...u24(height - 1)])))
  chunks.push(...chunk('ANIM', new Uint8Array(6)))
  for (let index = 0; index < frames; index += 1) {
    const packed = ((height - 1) << 14) | (width - 1)
    const frame = Uint8Array.from([
      0, 0, 0, 0, 0, 0,
      ...u24(width - 1), ...u24(height - 1),
      0, 0, 0, 0,
      ...chunk('VP8L', Uint8Array.from([0x2f, ...u32(packed)])),
    ])
    chunks.push(...chunk('ANMF', frame))
  }
  const size = 4 + chunks.length
  return Uint8Array.from([...new TextEncoder().encode('RIFF'), ...u32(size), ...new TextEncoder().encode('WEBP'), ...chunks])
}

function malformedAnimatedWebp(): Uint8Array {
  const valid = animatedWebp(2, 2, 1)
  return valid.slice(0, valid.byteLength - 1)
}

function chunk(name: string, body: Uint8Array): number[] {
  return [...new TextEncoder().encode(name), ...u32(body.length), ...body, ...(body.length % 2 ? [0] : [])]
}

function u24(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff]
}

function u32(value: number): number[] {
  return [value & 0xff, (value >>> 8) & 0xff, (value >>> 16) & 0xff, (value >>> 24) & 0xff]
}
