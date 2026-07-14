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
    expect(validateRaster(Uint8Array.from([...new TextEncoder().encode('GIF89a'), 3, 0, 2, 0]), 'photo.gif'))
      .toMatchObject({ info: { height: 2, mime: 'image/gif', width: 3 }, ok: true })
    const webp = new Uint8Array(30)
    webp.set(new TextEncoder().encode('RIFF'), 0)
    webp.set(new TextEncoder().encode('WEBPVP8X'), 8)
    webp.set([2, 0, 0], 24)
    webp.set([1, 0, 0], 27)
    expect(validateRaster(webp, 'photo.webp')).toMatchObject({ info: { height: 2, mime: 'image/webp', width: 3 }, ok: true })
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
