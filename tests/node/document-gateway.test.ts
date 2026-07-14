import { describe, expect, test, vi } from 'vitest'

import { DocumentGateway, type ExternalGatewayEvent } from '../../src/documents/gateway'
import { createMemoryPlatform } from '../../src/platform/memory'

const decoder = new TextDecoder()

describe('spec 0002 document lifecycle gateway', () => {
  test('AC41 AC42 AC47 AC48 AC50: Open uses the Markdown filter, cancellation is inert, and bytes select the safe model', async () => {
    const { harness, platform } = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    harness.mkdir('/notes')
    await platform.fs.create(harness.path('/notes/Olá world.md'), Uint8Array.from([0x41, 0xff]))
    harness.queueDialog({ kind: 'open' }, { kind: 'open', path: harness.path('/notes/Olá world.md') })
    const gateway = new DocumentGateway(platform)

    expect(await gateway.open()).toEqual({ kind: 'cancelled' })
    const opened = await gateway.open()
    expect(opened).toMatchObject({ kind: 'opened', document: { title: 'Olá world', preservation: { display: 'A\\xFF', kind: 'bytes' } } })
  })

  test('AC92 AC96-AC98 AC117-AC119 AC123: Save As creates from the current tab and adopts the new clean identity', async () => {
    const { harness, platform } = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    harness.mkdir('/notes')
    harness.queueDialog({ kind: 'save', path: harness.path('/notes/New note.md') })
    const gateway = new DocumentGateway(platform)
    const result = await gateway.saveAs({
      document: { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Hello' }] }], type: 'doc' },
      id: 'tab-1',
      title: 'New note',
    })

    expect(result).toMatchObject({ kind: 'saved', document: { path: '/notes/New note.md', title: 'New note' } })
    const read = await platform.fs.read(harness.path('/notes/New note.md'))
    expect(read.ok && decoder.decode(read.value.bytes)).toBe('Hello\n')
  })

  test('AC94 AC95 AC104 AC106: Save is a no-op when pristine and reports version changes or a missing source', async () => {
    const { harness, platform } = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    harness.mkdir('/notes')
    const path = harness.path('/notes/a.md')
    await platform.fs.create(path, new TextEncoder().encode('one\n'))
    const gateway = new DocumentGateway(platform)
    const opened = await gateway.openPath(path, 'tab-1')
    if (opened.kind !== 'opened') throw new Error('expected opened document')
    expect(await gateway.save({ ...opened.document, documentDirty: false, titleDirty: false })).toEqual({ kind: 'unchanged' })
    await platform.fs.overwrite(path, new TextEncoder().encode('external\n'))
    expect(await gateway.save({ ...opened.document, documentDirty: true, titleDirty: false })).toEqual({ kind: 'conflict' })
    await platform.fs.remove(path)
    expect(await gateway.save({ ...opened.document, documentDirty: true, titleDirty: false })).toEqual({ kind: 'missing' })
  })

  test('AC87 AC89-AC91 AC101 AC142-AC143 AC170: rename moves exact bytes and post-install cleanup remains recoverable', async () => {
    const { harness, platform } = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    harness.mkdir('/notes')
    const path = harness.path('/notes/Original.markdown')
    await platform.fs.create(path, new TextEncoder().encode('original bytes'))
    const gateway = new DocumentGateway(platform)
    const opened = await gateway.openPath(path, 'tab-1')
    if (opened.kind !== 'opened') throw new Error('expected opened document')

    const changedTitle = { ...opened.document, documentDirty: false, title: 'Renamed', titleDirty: true }
    const moved = await gateway.save(changedTitle)
    expect(moved).toMatchObject({ kind: 'saved', document: { path: '/notes/Renamed.markdown', title: 'Renamed' } })
    const movedRead = await platform.fs.read(harness.path('/notes/Renamed.markdown'))
    expect(movedRead.ok && decoder.decode(movedRead.value.bytes)).toBe('original bytes')

    if (moved.kind !== 'saved') throw new Error('expected saved rename')
    const editedRename = {
      ...moved.document,
      documentDirty: true,
      document: { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'edit' }] }], type: 'doc' },
      title: 'Again',
      titleDirty: true,
    } as const
    expect(await gateway.save(editedRename)).toEqual({ kind: 'rename-decision' })
    harness.setAccess('/notes/Renamed.markdown', { writable: false })
    const combined = await gateway.saveAndRename(editedRename)
    expect(combined).toMatchObject({ kind: 'cleanup-warning', document: { path: '/notes/Again.markdown' }, oldPath: '/notes/Renamed.markdown' })
    expect(await platform.fs.read(harness.path('/notes/Renamed.markdown'))).toMatchObject({ ok: true })
    const combinedRead = await platform.fs.read(harness.path('/notes/Again.markdown'))
    expect(combinedRead.ok && decoder.decode(combinedRead.value.bytes)).toBe('edit\n')
    harness.setAccess('/notes/Renamed.markdown', { writable: true })
    if (combined.kind !== 'cleanup-warning') throw new Error('expected cleanup warning')
    expect(await gateway.retryCleanup(combined.document)).toMatchObject({ kind: 'saved' })
    expect(await platform.fs.read(harness.path('/notes/Renamed.markdown'))).toEqual({ error: { code: 'not-found' }, ok: false })
  })

  test('AC88: a pure-case rename adopts requested spelling on a case-insensitive filesystem', async () => {
    const { harness, platform } = createMemoryPlatform({ caseSensitive: false, platform: 'win32' })
    harness.mkdir('C:\\Notes')
    const path = harness.path('C:\\Notes\\Draft.md')
    await platform.fs.create(path, new TextEncoder().encode('same'))
    const gateway = new DocumentGateway(platform)
    const opened = await gateway.openPath(path, 'tab-1')
    if (opened.kind !== 'opened') throw new Error('expected open')
    const renamed = await gateway.save({ ...opened.document, documentDirty: false, title: 'draft', titleDirty: true })
    expect(renamed).toMatchObject({ kind: 'saved', document: { path: 'C:\\Notes\\draft.md' } })
  })

  test('AC97 AC100 AC107-AC109 AC144: existing Save As target changes only after explicit current-version overwrite approval', async () => {
    const { harness, platform } = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    harness.mkdir('/notes')
    await platform.fs.create(harness.path('/notes/source.md'), new TextEncoder().encode('source\n'))
    await platform.fs.create(harness.path('/notes/target.md'), new TextEncoder().encode('target\n'))
    const gateway = new DocumentGateway(platform)
    const opened = await gateway.openPath(harness.path('/notes/source.md'), 'tab-1')
    if (opened.kind !== 'opened') throw new Error('expected open')
    const edited = { ...opened.document, document: { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'editor' }] }], type: 'doc' } } as const

    harness.queueDialog({ kind: 'save', path: harness.path('/notes/target.md') }, { choice: 1, kind: 'confirm' })
    expect(await gateway.saveAs(edited)).toEqual({ kind: 'cancelled' })
    const declined = await platform.fs.read(harness.path('/notes/target.md'))
    expect(declined.ok && decoder.decode(declined.value.bytes)).toBe('target\n')

    harness.queueDialog({ kind: 'save', path: harness.path('/notes/target.md') }, { choice: 0, kind: 'confirm' })
    expect(await gateway.saveAs(edited)).toMatchObject({ kind: 'saved', document: { path: '/notes/target.md' } })
    const replaced = await platform.fs.read(harness.path('/notes/target.md'))
    expect(replaced.ok && decoder.decode(replaced.value.bytes)).toBe('editor\n')
    const source = await platform.fs.read(harness.path('/notes/source.md'))
    expect(source.ok && decoder.decode(source.value.bytes)).toBe('source\n')
  })

  test('AC110 AC113: the production gateway coalesces overlapping saves of one tab revision', async () => {
    const { harness, platform } = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    harness.mkdir('/notes')
    const path = harness.path('/notes/queued.md')
    await platform.fs.create(path, new TextEncoder().encode('before\n'))
    const gateway = new DocumentGateway(platform)
    const opened = await gateway.openPath(path, 'tab-queued')
    if (opened.kind !== 'opened') throw new Error('expected open')

    const replace = platform.fs.atomicReplace.bind(platform.fs)
    let release!: () => void
    const gate = new Promise<void>((resolve) => { release = resolve })
    const replaceSpy = vi.spyOn(platform.fs, 'atomicReplace').mockImplementation(async (target, bytes, expected) => {
      await gate
      return replace(target, bytes, expected)
    })
    const input = {
      ...opened.document,
      document: { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'after' }] }], type: 'doc' },
      documentDirty: true,
      revision: 1,
      titleDirty: false,
    } as const

    const first = gateway.save(input)
    const duplicate = gateway.save(input)
    expect(replaceSpy).toHaveBeenCalledOnce()
    release()
    await expect(first).resolves.toMatchObject({ kind: 'saved' })
    await expect(duplicate).resolves.toMatchObject({ kind: 'saved' })
    expect(replaceSpy).toHaveBeenCalledOnce()
  })

  test('AC154-AC159: the production gateway suppresses self events and accepts a fresh watched version', async () => {
    const { harness, platform } = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    harness.mkdir('/notes')
    const path = harness.path('/notes/watched.md')
    await platform.fs.create(path, new TextEncoder().encode('before\n'))
    const gateway = new DocumentGateway(platform)
    const opened = await gateway.openPath(path, 'tab-watched')
    if (opened.kind !== 'opened') throw new Error('expected open')

    const changed = new Promise<ExternalGatewayEvent>((resolve) => {
      gateway.onExternalChange(resolve)
    })
    await harness.externalWrite('/notes/watched.md', new TextEncoder().encode('after\n'))
    const event = await changed
    expect(event).toMatchObject({ kind: 'changed', document: { id: 'tab-watched' } })
    if (event.kind !== 'changed') throw new Error('expected change')
    await expect(gateway.acceptExternal(event.document)).resolves.toBe(true)
  })
})

describe('spec 0005 MemoryPlatform image parity', () => {
  test('AC18-AC24 AC30-AC32: selection, validation, commit, and automatic same-directory resolution use the memory ports', async () => {
    const { harness, platform } = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    harness.mkdir('/notes')
    const png = validPng()
    await platform.fs.create(harness.path('/notes/image.png'), png)
    await platform.fs.create(harness.path('/notes/note.md'), new TextEncoder().encode('![Alt](image.png)\n'))
    const gateway = new DocumentGateway(platform)
    const opened = await gateway.openPath(harness.path('/notes/note.md'), 'image-tab')
    expect(opened.kind).toBe('opened')
    const resolved = await gateway.resolveImage('image-tab', 'image.png')
    expect(resolved).toMatchObject({ kind: 'authorized', asset: { source: 'image.png' } })

    harness.queueDialog({ kind: 'open', path: harness.path('/notes/image.png') })
    const selected = await gateway.selectImage('untitled')
    expect(selected).toMatchObject({ kind: 'candidate', candidate: { internal: true, source: '/notes/image.png' } })
    if (selected.kind !== 'candidate') throw new Error('expected image candidate')
    expect(await gateway.commitImage('untitled', selected.candidate.candidateId)).toMatchObject({ kind: 'authorized' })
  })

  test('AC24-AC28: MemoryPlatform Save As rebases captured image sources through its trusted path port', async () => {
    const { harness, platform } = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    harness.mkdir('/notes')
    harness.mkdir('/archive')
    await platform.fs.create(harness.path('/notes/note.md'), new TextEncoder().encode('![Alt](image.png)\n'))
    const gateway = new DocumentGateway(platform)
    const opened = await gateway.openPath(harness.path('/notes/note.md'), 'rebase-tab')
    if (opened.kind !== 'opened') throw new Error('expected open')
    harness.queueDialog({ kind: 'save', path: harness.path('/archive/note.md') })
    const saved = await gateway.saveAs(opened.document)
    expect(saved).toMatchObject({ kind: 'saved', document: { assetsRevoked: true, sourceRebases: [{ from: 'image.png', to: '../notes/image.png' }] } })
    const read = await platform.fs.read(harness.path('/archive/note.md'))
    expect(read.ok && decoder.decode(read.value.bytes)).toBe('![Alt](../notes/image.png)\n')
  })
})

function validPng(): Uint8Array {
  return Uint8Array.from(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64'))
}
