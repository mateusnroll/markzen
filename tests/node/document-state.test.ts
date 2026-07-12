import { describe, expect, test, vi } from 'vitest'

import { asDiskVersion, asFileKey, asPath, asTabId, asWindowId, fail, ok } from '../../src/platform/contracts'
import { validateDocumentName, deriveDocumentFilename, displayDocumentStem } from '../../src/documents/filename'
import { DocumentRegistry } from '../../src/documents/registry'
import { SaveCoordinator, type SaveRequest } from '../../src/documents/save-coordinator'
import { createTabBaseline, editTabDocument, editTabTitle, isTabDirty, revertTabTitle } from '../../src/documents/tab-state'
import { DocumentWatchState } from '../../src/documents/watch-state'
import { pathContains, relativeSegments } from '../../src/documents/path-identity'
import { createMemoryPlatform } from '../../src/platform/memory'

const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

describe('spec 0002 document state', () => {
  test('AC85 AC86: filename validation rejects unsafe and reserved portable names', () => {
    for (const name of ['', '.', '..', 'bad/name', 'bad\\name', 'bad:name', 'trail.', 'trail ', 'CON', 'con.md', 'LPT9.txt', `bad${String.fromCharCode(1)}`]) {
      expect(validateDocumentName(name), name).toMatchObject({ valid: false })
    }
    expect(validateDocumentName('Olá 世界')).toEqual({ valid: true })
  })

  test('AC75 AC89-AC92: display and target names preserve or explicitly replace recognized extensions', () => {
    expect(displayDocumentStem('Note.MARKDOWN')).toBe('Note')
    expect(deriveDocumentFilename('Renamed', '.markdown')).toBe('Renamed.markdown')
    expect(deriveDocumentFilename('Renamed.TXT', '.md')).toBe('Renamed.TXT')
    expect(deriveDocumentFilename('Draft', undefined)).toBe('Draft.md')
  })

  test('AC77 AC81 AC93 AC172: title and document equality independently determine dirty state', () => {
    const baseline = createTabBaseline('Title')
    const renamed = editTabTitle(baseline, 'Other')
    expect(isTabDirty(renamed)).toBe(true)
    expect(isTabDirty(revertTabTitle(renamed))).toBe(false)
    const edited = editTabDocument(baseline, false)
    expect(isTabDirty(edited)).toBe(true)
    expect(isTabDirty(editTabDocument(edited, true))).toBe(false)
  })

  test('AC45 AC46 AC108 AC116 AC146: registry reservation and atomic adoption enforce one owner per FileKey', () => {
    const focus = vi.fn()
    const registry = new DocumentRegistry(focus)
    const first = { tabId: asTabId('tab-1'), windowId: asWindowId('window-1') }
    const second = { tabId: asTabId('tab-2'), windowId: asWindowId('window-2') }
    const oldKey = asFileKey('/a.md')
    const newKey = asFileKey('/b.md')
    expect(registry.claim(oldKey, first)).toEqual(ok(undefined))
    expect(registry.claim(oldKey, second)).toEqual(fail('already-open'))
    expect(focus).toHaveBeenCalledWith(first)
    expect(registry.adopt(oldKey, newKey, first)).toEqual(ok(undefined))
    expect(registry.owner(oldKey)).toBeUndefined()
    expect(registry.owner(newKey)).toEqual(first)
    registry.release(newKey, first)
    expect(registry.owner(newKey)).toBeUndefined()
  })

  test('AC110 AC113: the save coordinator serializes writes and coalesces the same revision', async () => {
    const first = deferred<'saved'>()
    const execute = vi.fn<(request: SaveRequest<string>) => Promise<'saved'>>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue('saved')
    const coordinator = new SaveCoordinator(execute)
    const request = { revision: 1, snapshot: 'one' }
    const one = coordinator.save(request)
    const duplicate = coordinator.save(request)
    expect(execute).toHaveBeenCalledTimes(1)
    first.resolve('saved')
    await expect(one).resolves.toBe('saved')
    await expect(duplicate).resolves.toBe('saved')
    expect(execute).toHaveBeenCalledTimes(1)
  })

  test('AC111-AC114: one explicit newer save follows success while failure suppresses an automatic follow-up', async () => {
    const first = deferred<'saved' | 'failed'>()
    const execute = vi.fn<(request: SaveRequest<string>) => Promise<'saved' | 'failed'>>()
      .mockImplementationOnce(() => first.promise)
      .mockResolvedValue('saved')
    const coordinator = new SaveCoordinator(execute)
    const initial = coordinator.save({ revision: 1, snapshot: 'one' })
    const follow = coordinator.save({ revision: 2, snapshot: 'two' })
    first.resolve('saved')
    await expect(initial).resolves.toBe('saved')
    await expect(follow).resolves.toBe('saved')
    expect(execute).toHaveBeenCalledTimes(2)

    const failed = deferred<'saved' | 'failed'>()
    const failedExecute = vi.fn<(request: SaveRequest<string>) => Promise<'saved' | 'failed'>>()
      .mockImplementationOnce(() => failed.promise)
    const failedCoordinator = new SaveCoordinator(failedExecute)
    const failedInitial = failedCoordinator.save({ revision: 1, snapshot: 'one' })
    const blockedFollow = failedCoordinator.save({ revision: 2, snapshot: 'two' })
    failed.resolve('failed')
    await expect(failedInitial).resolves.toBe('failed')
    await expect(blockedFollow).resolves.toBe('failed')
    expect(failedExecute).toHaveBeenCalledTimes(1)
  })

  test('AC115 AC159: stale persistence and watcher generations cannot commit', () => {
    const watches = new DocumentWatchState()
    const first = watches.open(asTabId('tab-1'), asPath('/a.md'), asDiskVersion('v1'))
    const second = watches.repoint(asTabId('tab-1'), asPath('/b.md'), asDiskVersion('v2'))
    expect(watches.accept(first, asDiskVersion('external'))).toBe(false)
    expect(watches.accept(second, asDiskVersion('v2'))).toBe(false)
    expect(watches.accept(second, asDiskVersion('v3'))).toBe(true)
  })

  test('AC154-AC161: watcher state distinguishes clean reload, dirty conflict, self events, errors, and disposal', () => {
    const watches = new DocumentWatchState()
    const token = watches.open(asTabId('tab-1'), asPath('/a.md'), asDiskVersion('v1'))
    expect(watches.invalidate(token, asDiskVersion('v1'), false)).toEqual({ kind: 'self' })
    expect(watches.invalidate(token, asDiskVersion('v2'), false)).toEqual({ kind: 'reload', diskVersion: asDiskVersion('v2') })
    expect(watches.invalidate(token, asDiskVersion('v3'), true)).toEqual({ kind: 'conflict', diskVersion: asDiskVersion('v3') })
    expect(watches.fail(token)).toEqual({ kind: 'warning' })
    watches.dispose(asTabId('tab-1'))
    expect(watches.invalidate(token, asDiskVersion('v4'), false)).toEqual({ kind: 'stale' })
  })

  test('AC37 AC94 AC104 AC107: conditional atomic replacement uses the immediately observed DiskVersion', async () => {
    const { harness, platform } = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    harness.mkdir('/notes')
    const path = harness.path('/notes/a.md')
    await platform.fs.create(path, new TextEncoder().encode('one'))
    const opened = await platform.fs.read(path)
    if (!opened.ok) throw new Error('expected read')

    const saved = await platform.fs.atomicReplace(path, new TextEncoder().encode('two'), opened.value.diskVersion)
    expect(saved.ok && new TextDecoder().decode(saved.value.bytes)).toBe('two')
    expect(saved.ok && saved.value.diskVersion).not.toBe(opened.value.diskVersion)
    expect(await platform.fs.atomicReplace(path, new TextEncoder().encode('stale'), opened.value.diskVersion)).toEqual(fail('conflict'))
    const retained = await platform.fs.read(path)
    expect(retained.ok && new TextDecoder().decode(retained.value.bytes)).toBe('two')
  })

  test('AC38: containment compares canonical path segments instead of textual prefixes', () => {
    expect(pathContains('/notes/a', '/notes/ab/file.md', '/')).toBe(false)
    expect(pathContains('/notes/a', '/notes/a/file.md', '/')).toBe(true)
    expect(relativeSegments('/notes/a', '/notes/a/deep/file.md', '/')).toEqual(['deep', 'file.md'])
    expect(relativeSegments('/notes/a', '/notes/ab/file.md', '/')).toBeUndefined()
  })

  test('AC99 AC100 AC143 AC170: failed replacements preserve bytes and unchanged rename moves without rewriting', async () => {
    const { harness, platform } = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    harness.mkdir('/notes')
    const source = harness.path('/notes/source.md')
    const target = harness.path('/notes/target.md')
    await platform.fs.create(source, new TextEncoder().encode('source bytes'))
    await platform.fs.create(target, new TextEncoder().encode('target bytes'))
    const sourceRead = await platform.fs.read(source)
    const targetRead = await platform.fs.read(target)
    if (!sourceRead.ok || !targetRead.ok) throw new Error('expected reads')

    harness.setAccess(source, { writable: false })
    expect(await platform.fs.atomicReplace(source, new TextEncoder().encode('changed'), sourceRead.value.diskVersion)).toEqual(
      fail('permission-denied'),
    )
    expect(await platform.fs.atomicReplace(target, new TextEncoder().encode('changed'), sourceRead.value.diskVersion)).toEqual(fail('conflict'))
    expect(await platform.fs.read(source)).toEqual(sourceRead)
    expect(await platform.fs.read(target)).toEqual(targetRead)

    harness.setAccess(source, { writable: true })
    await platform.fs.remove(target)
    const operations = harness.operationCount()
    const moved = await platform.fs.move(source, target, sourceRead.value.diskVersion)
    expect(moved.ok && moved.value.bytes).toEqual(sourceRead.value.bytes)
    expect(harness.operationCount()).toBe(operations + 1)
    expect(await platform.fs.read(source)).toEqual(fail('not-found'))
  })

  test('AC152: MemoryPlatform dialog calls consume typed queued results in FIFO order and represent cancellation', async () => {
    const { harness, platform } = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    harness.queueDialog(
      { kind: 'open', path: harness.path('/one.md') },
      { kind: 'open' },
      { choice: 2, kind: 'confirm' },
    )
    const openOptions = { extensions: ['md', 'markdown', 'txt'], title: 'Open Markdown Document' } as const
    expect(await platform.dialog.open(openOptions)).toEqual(ok('/one.md'))
    expect(await platform.dialog.open(openOptions)).toEqual(ok(undefined))
    expect(await platform.dialog.confirm({ buttons: ['Save', "Don't Save", 'Cancel'], message: 'Close?', title: 'Close' })).toEqual(ok(2))
    expect(await platform.dialog.save({
      confirmationLabel: 'Save As',
      defaultName: 'Note.md',
      message: 'A new document will be created from the current tab.',
      title: 'Save Current Tab As',
    })).toEqual(fail('blocked'))
  })

  test('AC154 AC159 AC160: MemoryPlatform exact-document watchers invalidate only their live path', async () => {
    const { harness, platform } = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    harness.mkdir('/notes')
    await platform.fs.create(harness.path('/notes/a.md'), new TextEncoder().encode('a'))
    await platform.fs.create(harness.path('/notes/b.md'), new TextEncoder().encode('b'))
    const events: string[] = []
    const dispose = platform.watch.subscribe(harness.path('/notes/a.md'), () => events.push('a'), () => events.push('error'))
    await harness.externalWrite('/notes/b.md', new TextEncoder().encode('other'))
    await Promise.resolve()
    expect(events).toEqual([])
    await harness.externalWrite('/notes/a.md', new TextEncoder().encode('external'))
    await Promise.resolve()
    expect(events).toEqual(['a'])
    dispose()
    await harness.externalWrite('/notes/a.md', new TextEncoder().encode('later'))
    await Promise.resolve()
    expect(events).toEqual(['a'])
  })
})
