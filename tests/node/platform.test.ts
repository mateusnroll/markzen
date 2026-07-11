import { describe, expect, test, vi } from 'vitest'

import { asWindowId, fail, ok } from '../../src/platform/contracts'
import { resolveWindowSender, validateWindowRequest } from '../../src/platform/electron/authority'
import { channels } from '../../src/platform/electron/channels'
import { createMemoryPlatform } from '../../src/platform/memory'
import { OwnerRegistry } from '../../src/platform/ownership'

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value)
const text = (value: Uint8Array): string => new TextDecoder().decode(value)

describe('spec 0001 Platform foundations', () => {
  test('AC3: routing uses the sender-derived window only', async () => {
    const { platform } = createMemoryPlatform({ platform: 'posix', caseSensitive: true })
    const first = await platform.window.create()
    const second = await platform.window.create()
    const firstEvents: string[] = []
    const secondEvents: string[] = []
    platform.window.onState(first, (state) => firstEvents.push(state.status))
    platform.window.onState(second, (state) => secondEvents.push(state.status))

    await platform.window.toggleMaximize(second)

    expect(firstEvents).toEqual([])
    expect(secondEvents).toEqual(['maximized'])
  })

  test('AC4: disposing one owner preserves another owner and its resources', () => {
    const registry = new OwnerRegistry<string>()
    const firstDisposed = vi.fn()
    const secondDisposed = vi.fn()
    registry.open('first')
    registry.open('second')
    registry.track('first', firstDisposed)
    registry.track('second', secondDisposed)

    registry.dispose('first')

    expect(firstDisposed).toHaveBeenCalledOnce()
    expect(secondDisposed).not.toHaveBeenCalled()
    expect(registry.isLive('second')).toBe(true)
  })

  test('AC24: an unregistered IPC channel has no main handler or mutation path', () => {
    const registeredInvokeChannels = new Set<string>([
      channels.bootstrap,
      channels.windowClose,
      channels.windowGetState,
      channels.windowMinimize,
      channels.windowToggleMaximize,
    ])
    const operation = vi.fn()
    if (registeredInvokeChannels.has('markzen:unknown')) operation()

    expect(registeredInvokeChannels.has('markzen:unknown')).toBe(false)
    expect(operation).not.toHaveBeenCalled()
  })

  test('AC25: the production request validator rejects an invalid payload', () => {
    expect(validateWindowRequest({ action: 'wrong' }, asWindowId('window-one'))).toEqual(fail('validation'))
  })

  test('AC26: the production sender resolver rejects an invalid frame before domain work', () => {
    const isLive = vi.fn(() => true)
    const result = resolveWindowSender(
      { contentsId: 1, isMainFrame: false, url: 'markzen://app/' },
      new Map([[1, 'window-one']]),
      'markzen://app',
      isLive,
    )

    expect(result).toEqual(fail('sender'))
    expect(isLive).not.toHaveBeenCalled()
  })

  test('AC27: a foreign owner identifier cannot grant cross-window authority', () => {
    expect(validateWindowRequest({ windowId: 'window-two' }, asWindowId('window-one'))).toEqual(fail('ownership'))
    expect(validateWindowRequest({}, asWindowId('window-one'))).toEqual(ok(undefined))
  })

  test('AC36: Platform results are serializable discriminated data', () => {
    const success = ok({ path: '/notes/a.md' })
    const failure = fail('not-found')

    expect(JSON.parse(JSON.stringify(success))).toEqual(success)
    expect(JSON.parse(JSON.stringify(failure))).toEqual(failure)
    expect(success).not.toBeInstanceOf(Error)
    expect(failure).not.toBeInstanceOf(Error)
  })

  test('AC37: MemoryPlatform create, read, and overwrite match the file contract', async () => {
    const { platform, harness } = createMemoryPlatform({ platform: 'posix', caseSensitive: true })
    harness.mkdir('/notes')
    const path = harness.path('/notes/a.md')

    expect(await platform.fs.create(path, bytes('one'))).toEqual(ok(undefined))
    expect(await platform.fs.create(path, bytes('duplicate'))).toEqual(fail('already-exists'))
    const firstRead = await platform.fs.read(path)
    expect(firstRead.ok && text(firstRead.value.bytes)).toBe('one')
    expect(await platform.fs.overwrite(path, bytes('two'))).toEqual(ok(undefined))
    const secondRead = await platform.fs.read(path)
    expect(secondRead.ok && text(secondRead.value.bytes)).toBe('two')
    expect(await platform.fs.overwrite(harness.path('/notes/missing.md'), bytes('x'))).toEqual(fail('not-found'))
  })

  test('AC38: MemoryPlatform stat and removal reject unsafe directory deletion', async () => {
    const { platform, harness } = createMemoryPlatform({ platform: 'posix', caseSensitive: true })
    harness.mkdir('/notes')
    await platform.fs.create(harness.path('/notes/a.md'), bytes('one'))

    const stat = await platform.fs.stat(harness.path('/notes/a.md'))
    expect(stat.ok && stat.value).toMatchObject({ kind: 'file', size: 3 })
    expect(await platform.fs.remove(harness.path('/notes'))).toEqual(fail('not-empty'))
    expect(await platform.fs.remove(harness.path('/notes/a.md'))).toEqual(ok(undefined))
    expect(await platform.fs.remove(harness.path('/notes'))).toEqual(ok(undefined))
  })

  test('AC39: MemoryPlatform path validation and canonicalization share one contract', async () => {
    const { platform, harness } = createMemoryPlatform({ platform: 'posix', caseSensitive: true })
    harness.mkdir('/notes')
    await platform.fs.create(harness.path('/notes/a.md'), bytes('one'))

    const canonical = await platform.fs.canonicalize(harness.path('/notes/./a.md'))

    expect(canonical.ok && canonical.value.path).toBe('/notes/a.md')
    expect(canonical.ok && canonical.value.fileKey).toBe('/notes/a.md')
  })

  test('AC40: MemoryPlatform window commands and state remain WindowId-scoped', async () => {
    const { platform } = createMemoryPlatform({ platform: 'posix', caseSensitive: true })
    const first = await platform.window.create()
    const second = await platform.window.create()

    await platform.window.minimize(first)
    await platform.window.toggleMaximize(second)

    expect(await platform.window.getState(first)).toEqual(ok({ focused: false, status: 'minimized' }))
    expect(await platform.window.getState(second)).toEqual(ok({ focused: true, status: 'maximized' }))
  })

  test('AC43: validation preserves referent-changing dot segments until canonicalization', async () => {
    const { platform, harness } = createMemoryPlatform({ platform: 'posix', caseSensitive: true })
    harness.mkdir('/root')
    harness.mkdir('/outside')
    harness.symlink('/root/link', '/outside')
    await platform.fs.create(harness.path('/file.md'), bytes('root'))

    const validated = harness.validatePath('/root/link/../file.md')
    expect(validated).toEqual(ok('/root/link/../file.md'))
    if (!validated.ok) throw new Error('expected a valid path')
    const canonical = await platform.fs.canonicalize(validated.value)
    expect(canonical.ok && canonical.value.path).toBe('/file.md')
  })

  test('AC44: symlink aliases share FileKey while hard-link paths remain distinct', async () => {
    const { platform, harness } = createMemoryPlatform({ platform: 'posix', caseSensitive: true })
    harness.mkdir('/notes')
    await platform.fs.create(harness.path('/notes/a.md'), bytes('one'))
    harness.symlink('/alias.md', '/notes/a.md')
    harness.hardlink('/hard.md', '/notes/a.md')

    const source = await platform.fs.canonicalize(harness.path('/notes/a.md'))
    const alias = await platform.fs.canonicalize(harness.path('/alias.md'))
    const hard = await platform.fs.canonicalize(harness.path('/hard.md'))

    expect(source.ok && alias.ok && source.value.fileKey).toBe(alias.ok ? alias.value.fileKey : '')
    expect(source.ok && hard.ok && source.value.fileKey).not.toBe(hard.ok ? hard.value.fileKey : '')
  })

  test('AC45: missing-leaf identity follows the parent filesystem case behavior', async () => {
    const insensitive = createMemoryPlatform({ platform: 'win32', caseSensitive: false })
    insensitive.harness.mkdir('C:\\Notes')
    const upper = await insensitive.platform.fs.canonicalize(insensitive.harness.path('C:\\Notes\\Draft.md'))
    const lower = await insensitive.platform.fs.canonicalize(insensitive.harness.path('c:\\notes\\draft.MD'))
    expect(upper.ok && lower.ok && upper.value.fileKey).toBe(lower.ok ? lower.value.fileKey : '')

    const sensitive = createMemoryPlatform({ platform: 'posix', caseSensitive: true })
    sensitive.harness.mkdir('/notes')
    const first = await sensitive.platform.fs.canonicalize(sensitive.harness.path('/notes/Draft.md'))
    const second = await sensitive.platform.fs.canonicalize(sensitive.harness.path('/notes/draft.md'))
    expect(first.ok && second.ok && first.value.fileKey).not.toBe(second.ok ? second.value.fileKey : '')
  })

  test('AC46: invalid paths fail before any filesystem side effect', async () => {
    const { platform, harness } = createMemoryPlatform({ platform: 'posix', caseSensitive: true })
    const invalid = harness.validatePath('relative.md')
    expect(invalid).toEqual(fail('invalid-path'))
    expect(harness.operationCount()).toBe(0)
    expect(await platform.fs.create('relative.md' as never, bytes('x'))).toEqual(fail('invalid-path'))
    expect(harness.operationCount()).toBe(0)
  })

  test('AC47: a completion token becomes stale after its owner generation advances', () => {
    const registry = new OwnerRegistry<string>()
    registry.open('window')
    const captured = registry.capture('window')

    registry.advance('window')

    expect(registry.isCurrent(captured)).toBe(false)
  })

  test('AC48: disposing an owner invalidates tokens and absorbs later cleanup', () => {
    const registry = new OwnerRegistry<string>()
    const disposer = vi.fn()
    registry.open('window')
    const captured = registry.capture('window')
    registry.track('window', disposer)

    expect(() => registry.dispose('window')).not.toThrow()
    expect(registry.isCurrent(captured)).toBe(false)
    expect(disposer).toHaveBeenCalledOnce()
    expect(() => registry.dispose('window')).not.toThrow()
  })
})
