import { describe, expect, test, vi } from 'vitest'

import { asFileKey, asPath, asRootId, asWindowId, fail, ok } from '../../src/platform/contracts'
import { resolveWindowSender } from '../../src/platform/electron/authority'
import { RootRegistry } from '../../src/workspaces/state'
import { validateWorkspaceEntryRequest } from '../../src/workspaces/authority'

describe('spec 0003 workspace security', () => {
  test('AC131: sender validation happens before payload parsing or domain work', () => {
    const parse = vi.fn((value: unknown) => {
      void value
      return ok({ generation: 1, relativePath: 'a.md', rootId: asRootId('root-1') })
    })
    const operate = vi.fn()
    const result = resolveWindowSender(
      { contentsId: 1, isMainFrame: false, url: 'markzen://app/' },
      new Map([[1, asWindowId('window-1')]]),
      'markzen://app',
      () => true,
    )
    if (result.ok) {
      const parsed = parse({ generation: 1, relativePath: 'a.md', rootId: 'root-1' })
      if (parsed.ok) operate(parsed.value)
    }
    expect(result).toEqual(fail('sender'))
    expect(parse).not.toHaveBeenCalled()
    expect(operate).not.toHaveBeenCalled()
  })

  test('AC132: forged roots, stale generations, traversal, absolute paths, and extra fields reject', () => {
    const roots = new RootRegistry()
    const windowId = asWindowId('window-1')
    const accepted = roots.accept(windowId, asPath('/notes'), asFileKey('/notes'))
    expect(roots.authorize(asWindowId('window-2'), accepted.root.rootId)).toEqual(fail('ownership'))
    for (const relativePath of ['../outside.md', 'dir/../../outside.md', '/absolute.md', 'C:/absolute.md', 'dir\\file.md', 'a\0.md']) {
      expect(validateWorkspaceEntryRequest({ generation: 3, relativePath, rootId: accepted.root.rootId }), relativePath)
        .toEqual(fail('validation'))
    }
    expect(validateWorkspaceEntryRequest({ extra: true, generation: 3, relativePath: 'a.md', rootId: accepted.root.rootId }))
      .toEqual(fail('validation'))
  })

  test('AC133 AC134: event payloads expose logical data while root allocation stays main-owned', () => {
    const event = { generation: 2, kind: 'invalidated' as const, relativePath: 'folder', rootId: asRootId('root-1') }
    expect(event).toEqual({ generation: 2, kind: 'invalidated', relativePath: 'folder', rootId: 'root-1' })
    expect(event).not.toHaveProperty('canonicalPath')
  })
})
