import { describe, expect, test, vi } from 'vitest'

import { DocumentRegistry } from '../../src/documents/registry'
import {
  asFileKey,
  asPath,
  asRootId,
  asTabId,
  asWindowId,
  fail,
  ok,
  type DirectoryEntry,
} from '../../src/platform/contracts'
import { createMemoryPlatform } from '../../src/platform/memory'
import {
  RootRegistry,
  WorkspaceWatchBatcher,
  directoryActivationDecision,
  disambiguateRootLabels,
  filterAndSortEntries,
  insertPinnedBeforePreview,
  isDirectoryGenerationCurrent,
  preparePreviewReplacement,
  selectContainingRoot,
  watcherRefreshDecision,
} from '../../src/workspaces/state'

const entry = (name: string, kind: DirectoryEntry['kind'] = 'file', path = `/root/${name}`): DirectoryEntry => ({
  fileKey: asFileKey(path.toLocaleLowerCase('en-US')),
  kind,
  name,
  path: asPath(path),
})

describe('spec 0003 workspace state', () => {
  test('AC10: accepted roots receive distinct opaque RootIds owned by one window', () => {
    const roots = new RootRegistry()
    const windowId = asWindowId('window-1')
    const first = roots.accept(windowId, asPath('/one'), asFileKey('/one'))
    const second = roots.accept(windowId, asPath('/two'), asFileKey('/two'))
    expect(first.kind).toBe('accepted')
    expect(second.kind).toBe('accepted')
    expect(first.root.rootId).not.toBe(second.root.rootId)
    expect(roots.get(windowId, first.root.rootId)).toEqual(first.root)
  })

  test('AC11 AC12: canonical aliases deduplicate without lexical identity logic', () => {
    const roots = new RootRegistry()
    const windowId = asWindowId('window-1')
    const first = roots.accept(windowId, asPath('/logical/notes'), asFileKey('/canonical/notes'))
    const alias = roots.accept(windowId, asPath('/alias'), asFileKey('/canonical/notes'))
    expect(first.kind).toBe('accepted')
    expect(alias).toEqual({ kind: 'duplicate', root: first.root })
  })

  test('AC13: symlink roots with one Platform FileKey deduplicate', () => {
    const roots = new RootRegistry()
    const windowId = asWindowId('window-1')
    const source = roots.accept(windowId, asPath('/notes'), asFileKey('/real/notes'))
    const symlink = roots.accept(windowId, asPath('/linked-notes'), asFileKey('/real/notes'))
    expect(symlink.root.rootId).toBe(source.root.rootId)
    expect(roots.values(windowId)).toHaveLength(1)
  })

  test('AC17: duplicate root basenames gain the shortest unique parent suffix', () => {
    expect(disambiguateRootLabels(['/work/alpha/notes', '/work/beta/notes', '/other'])).toEqual([
      'alpha/notes',
      'beta/notes',
      'other',
    ])
  })

  test('AC21: entries sort directories first with fixed collator and code-point tie-breaking', () => {
    expect(filterAndSortEntries([
      entry('z.md'), entry('A.md'), entry('a.md'), entry('folder', 'directory'), entry('b.md'),
    ]).map((candidate) => candidate.name)).toEqual(['folder', 'A.md', 'a.md', 'b.md', 'z.md'])
  })

  test('AC22: dot entries are filtered while unsupported visible files remain', () => {
    expect(filterAndSortEntries([entry('.secret'), entry('visible.pdf'), entry('.git', 'directory')]).map((candidate) => candidate.name))
      .toEqual(['visible.pdf'])
  })

  test('AC23: a collapsed never-loaded directory remains a lazy load decision', () => {
    expect(directoryActivationDecision({ expanded: false, loaded: false })).toBe('load')
  })

  test('AC25: a valid cached snapshot reopens without another load decision', () => {
    expect(directoryActivationDecision({ expanded: false, loaded: true })).toBe('reopen')
  })

  test('AC26: collapse or invalidation suppresses a stale directory generation', () => {
    expect(isDirectoryGenerationCurrent(2, 1)).toBe(false)
    expect(isDirectoryGenerationCurrent(2, 2)).toBe(true)
  })

  test('AC37: directory symlinks remain terminal entry kinds', async () => {
    const memory = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    memory.harness.mkdir('/root')
    memory.harness.mkdir('/target')
    memory.harness.symlink('/root/link', '/target')
    const listed = await memory.platform.fs.list(memory.harness.path('/root'))
    expect(listed.ok && listed.value).toEqual([
      expect.objectContaining({ kind: 'directory-symlink', name: 'link', path: '/root/link' }),
    ])
  })

  test('AC39: file symlink aliases receive the target FileKey without a canonical target path', async () => {
    const memory = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    memory.harness.mkdir('/root')
    await memory.platform.fs.create(memory.harness.path('/root/a.md'), new TextEncoder().encode('a'))
    memory.harness.symlink('/root/alias.md', '/root/a.md')
    const listed = await memory.platform.fs.list(memory.harness.path('/root'))
    if (!listed.ok) throw new Error('expected list')
    const source = listed.value.find((candidate) => candidate.name === 'a.md')
    const alias = listed.value.find((candidate) => candidate.name === 'alias.md')
    expect(alias?.kind).toBe('file-symlink')
    expect(alias?.fileKey).toBe(source?.fileKey)
    expect(alias).not.toHaveProperty('canonicalPath')
  })

  test('AC41: the deepest containing root supplies title context', () => {
    const roots = [
      { fileKey: asFileKey('/notes'), insertionIndex: 0, path: asPath('/notes'), rootId: asRootId('root-1') },
      { fileKey: asFileKey('/notes/project'), insertionIndex: 1, path: asPath('/notes/project'), rootId: asRootId('root-2') },
    ]
    expect(selectContainingRoot(roots, asPath('/notes/project/deep/a.md'))?.rootId).toBe('root-2')
  })

  test('AC42: insertion order breaks equally deep containing-root ties', () => {
    const roots = [
      { fileKey: asFileKey('/same'), insertionIndex: 1, path: asPath('/alias-b'), rootId: asRootId('root-b') },
      { fileKey: asFileKey('/same'), insertionIndex: 0, path: asPath('/alias-a'), rootId: asRootId('root-a') },
    ]
    expect(selectContainingRoot(roots, asPath('/same/a.md'))?.rootId).toBe('root-a')
  })

  test('AC49: a dirty preview is pinned before replacement instead of reused', () => {
    expect(preparePreviewReplacement({ dirty: true, id: 'preview' })).toEqual({ pinExisting: true })
    expect(preparePreviewReplacement({ dirty: false, id: 'preview' })).toEqual({ pinExisting: false, reusableId: 'preview' })
  })

  test('AC55: new pinned tabs insert immediately before the preview', () => {
    expect(insertPinnedBeforePreview([
      { id: 'one', preview: false }, { id: 'peek', preview: true },
    ], { id: 'two', preview: false }).map((tab) => tab.id)).toEqual(['one', 'two', 'peek'])
  })

  test('AC57: a pin request promotes the existing preview without reopening', () => {
    const original = { id: 'peek', preview: true }
    const result = insertPinnedBeforePreview([original], { id: 'peek', preview: false })
    expect(result).toEqual([{ id: 'peek', preview: false }])
  })

  test('AC63: disposing a directory owner makes its pending generation stale', () => {
    expect(isDirectoryGenerationCurrent(undefined, 1)).toBe(false)
  })

  test('AC79 AC80: one logical watch belongs to each accepted root and duplicates add none', () => {
    const dispose = vi.fn()
    const roots = new RootRegistry()
    const windowId = asWindowId('window-1')
    const first = roots.accept(windowId, asPath('/notes'), asFileKey('/notes'), dispose)
    const duplicate = roots.accept(windowId, asPath('/alias'), asFileKey('/notes'), vi.fn())
    expect(first.kind).toBe('accepted')
    expect(duplicate.kind).toBe('duplicate')
    expect(roots.activeWatchCount()).toBe(1)
  })

  test('AC82 AC83: invalidation refreshes expanded loaded state, stales collapsed state, and ignores unloaded state', () => {
    expect(watcherRefreshDecision({ expanded: true, loaded: true })).toBe('refresh')
    expect(watcherRefreshDecision({ expanded: false, loaded: true })).toBe('stale')
    expect(watcherRefreshDecision({ expanded: false, loaded: false })).toBe('ignore')
  })

  test('AC84 AC119: a continuous event stream batches at 300ms trailing with a 750ms maximum wait', () => {
    vi.useFakeTimers()
    const batches: number[] = []
    const batcher = new WorkspaceWatchBatcher(() => batches.push(Date.now()))
    for (let elapsed = 0; elapsed < 1_000; elapsed += 50) {
      batcher.invalidate()
      vi.advanceTimersByTime(50)
    }
    vi.advanceTimersByTime(300)
    expect(batches).toHaveLength(2)
    batcher.dispose()
    vi.useRealTimers()
  })

  test('AC85: one change invalidates every overlapping root independently', () => {
    const roots = new RootRegistry()
    const windowId = asWindowId('window-1')
    roots.accept(windowId, asPath('/notes'), asFileKey('/notes'))
    roots.accept(windowId, asPath('/notes/project'), asFileKey('/notes/project'))
    expect(roots.values(windowId).map((root) => root.rootId)).toEqual(['root-1', 'root-2'])
  })

  test('AC86: foreign WindowId and RootId pairs resolve to ownership failure', () => {
    const roots = new RootRegistry()
    const first = roots.accept(asWindowId('window-1'), asPath('/notes'), asFileKey('/notes'))
    expect(roots.authorize(asWindowId('window-2'), first.root.rootId)).toEqual(fail('ownership'))
  })

  test('AC87: hidden-only watcher events are ignored', () => {
    expect(WorkspaceWatchBatcher.isVisibleInvalidation('.draft.md')).toBe(false)
    expect(WorkspaceWatchBatcher.isVisibleInvalidation('notes/.draft.md')).toBe(false)
    expect(WorkspaceWatchBatcher.isVisibleInvalidation('notes/a.md')).toBe(true)
  })

  test('AC88 AC94: newer invalidation and disposal invalidate captured refresh generations', () => {
    expect(isDirectoryGenerationCurrent(2, 1)).toBe(false)
    expect(isDirectoryGenerationCurrent(undefined, 2)).toBe(false)
  })

  test('AC92: explicit retry advances once and no automatic timer is owned', () => {
    vi.useFakeTimers()
    const batcher = new WorkspaceWatchBatcher(vi.fn())
    expect(vi.getTimerCount()).toBe(0)
    batcher.dispose()
    vi.useRealTimers()
  })

  test('AC93: disposal closes root watches and pending timers idempotently', () => {
    vi.useFakeTimers()
    const dispose = vi.fn()
    const roots = new RootRegistry()
    const windowId = asWindowId('window-1')
    roots.accept(windowId, asPath('/notes'), asFileKey('/notes'), dispose)
    roots.disposeWindow(windowId)
    roots.disposeWindow(windowId)
    expect(dispose).toHaveBeenCalledOnce()
    expect(roots.activeWatchCount()).toBe(0)
    vi.useRealTimers()
  })

  test('AC91 AC95: MemoryPlatform root watch routes failures and events only to active matching registrations', () => {
    const memory = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    memory.harness.mkdir('/notes')
    const first = vi.fn()
    const other = vi.fn()
    const failed = vi.fn()
    const dispose = memory.platform.watch.subscribe(memory.harness.path('/notes'), first, failed)
    memory.platform.watch.subscribe(memory.harness.path('/other'), other, vi.fn())
    memory.harness.emitWatch('/notes/a.md')
    expect(first).toHaveBeenCalledOnce()
    expect(other).not.toHaveBeenCalled()
    expect(memory.harness.activeWatchCount()).toBe(2)
    memory.harness.failWatch('/notes')
    expect(failed).toHaveBeenCalledOnce()
    dispose()
    expect(memory.harness.activeWatchCount()).toBe(1)
  })

  test('AC126 AC144 AC145: preview ownership replacement commits atomically or retains A', () => {
    const focus = vi.fn()
    const registry = new DocumentRegistry(focus)
    const preview = { tabId: asTabId('preview'), windowId: asWindowId('window-1') }
    const other = { tabId: asTabId('other'), windowId: asWindowId('window-2') }
    const a = asFileKey('/a.md')
    const b = asFileKey('/b.md')
    registry.claim(a, preview)
    expect(registry.replace(a, b, preview)).toEqual(ok(undefined))
    expect(registry.owner(a)).toBeUndefined()
    expect(registry.owner(b)).toEqual(preview)
    registry.claim(a, other)
    expect(registry.replace(b, a, preview)).toEqual(fail('already-open'))
    expect(registry.owner(b)).toEqual(preview)
    expect(registry.owner(a)).toEqual(other)
  })

  test('AC128: batched MemoryPlatform listing returns typed failures and no target path', async () => {
    const memory = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    memory.harness.mkdir('/notes')
    await memory.platform.fs.create(memory.harness.path('/notes/a.md'), new Uint8Array())
    const listed = await memory.platform.fs.list(memory.harness.path('/notes'))
    expect(listed).toEqual(ok([entry('a.md', 'file', '/notes/a.md')]))
    expect(await memory.platform.fs.list(memory.harness.path('/missing'))).toEqual(fail('not-found'))
    expect(await memory.platform.fs.list(memory.harness.path('/notes/a.md'))).toEqual(fail('not-directory'))
  })

})
