import { describe, expect, test, vi } from 'vitest'

import { asFileKey, asRootId, type DirectoryEntry, type RootId } from '../../src/platform/contracts'
import { WorkspaceFinder, validateFinderQueryRequest } from '../../src/workspaces/finder'

const rootOne = asRootId('root-1')
const rootTwo = asRootId('root-2')

const file = (name: string, fileKey = name, kind: DirectoryEntry['kind'] = 'file'): DirectoryEntry => ({
  fileKey: asFileKey(fileKey),
  kind,
  name,
  path: name as DirectoryEntry['path'],
})

describe('spec 0014 workspace finder', () => {
  test('AC6 AC7 AC8: pinned fuzzysort owns normalization and score ordering with deterministic equal-score ties', async () => {
    const finder = new WorkspaceFinder(listing({
      [rootOne]: {
        '': [file('src', 'src', 'directory'), file('Résumé.md', 'resume')],
        src: [file('UserInterface.ts', 'ui'), file('Guide.ts', 'guide')],
      },
      [rootTwo]: { '': [file('UserInterface.ts', 'ui-two')] },
    }))
    await finder.rebuild([{ rootId: rootOne }, { rootId: rootTwo }])

    expect(finder.query('resume').results.map((result) => result.relativePath)).toContain('Résumé.md')
    const ranked = finder.query('ui').results
    expect(ranked.map((result) => result.score)).toEqual(ranked.map((result) => result.score).toSorted((left, right) => right - left))
    expect(finder.query('ui')).toEqual(finder.query('ui'))

    const ties = new WorkspaceFinder(listing({
      [rootOne]: { '': [file('same.md', 'same-one')] },
      [rootTwo]: { '': [file('same.md', 'same-two')] },
    }))
    await ties.rebuild([{ rootId: rootOne }, { rootId: rootTwo }])
    expect(ties.query('same').results.map((result) => result.rootId)).toEqual([rootOne, rootTwo])
  })

  test('AC9 AC10 AC11 AC12: empty, capped, disambiguated, and stale query generations are closed', async () => {
    const many = Array.from({ length: 120 }, (_, index) => file(`same-${index}.md`, `key-${index}`))
    const finder = new WorkspaceFinder(listing({ [rootOne]: { '': many } }))
    await finder.rebuild([{ rootId: rootOne }])
    expect(finder.query('')).toMatchObject({ results: [], total: 0 })
    const outcome = finder.query('same')
    expect(outcome.results).toHaveLength(100)
    expect(outcome.total).toBe(120)
    expect(outcome.results[0]).toMatchObject({ name: expect.any(String), parentPath: '', rootId: rootOne })
    expect(outcome.generation).toBe(finder.status().generation)
  })

  test('AC13 AC14 AC15: scanning is sequential, hides dots, stops at directory symlinks, and publishes complete successful roots', async () => {
    let active = 0
    let maximum = 0
    const list = vi.fn(async (rootId: RootId, relativePath: string) => {
      active += 1
      maximum = Math.max(maximum, active)
      await Promise.resolve()
      active -= 1
      if (rootId === rootTwo) throw new Error('denied')
      return relativePath === ''
        ? [file('.git', 'hidden', 'directory'), file('notes', 'notes', 'directory'), file('linked', 'linked', 'directory-symlink')]
        : [file('visible.md', 'visible'), file('.draft.md', 'draft')]
    })
    const finder = new WorkspaceFinder(list)
    const pending = finder.rebuild([{ rootId: rootOne }, { rootId: rootTwo }])
    expect(finder.status().kind).toBe('indexing')
    await pending
    expect(maximum).toBe(1)
    expect(list).toHaveBeenCalledWith(rootOne, 'notes')
    expect(list).not.toHaveBeenCalledWith(rootOne, '.git')
    expect(list).not.toHaveBeenCalledWith(rootOne, 'linked')
    expect(finder.query('visible').results).toHaveLength(1)
    expect(finder.status()).toMatchObject({ incompleteRootIds: [rootTwo], kind: 'ready' })
  })

  test('AC16 AC17 AC18 AC19: stale snapshots remain queryable until atomic rebuild and disposal suppresses late work', async () => {
    let resolvePending!: (entries: readonly DirectoryEntry[]) => void
    let current = [file('old.md', 'old')]
    const finder = new WorkspaceFinder(async () => current)
    await finder.rebuild([{ rootId: rootOne }])
    finder.markStale(rootOne)
    expect(finder.status().kind).toBe('stale')
    expect(finder.query('old').results).toHaveLength(1)

    const delayed = new WorkspaceFinder(() => new Promise((resolve) => { resolvePending = resolve }))
    const rebuilding = delayed.rebuild([{ rootId: rootOne }])
    delayed.dispose()
    resolvePending([file('late.md', 'late')])
    await rebuilding
    expect(delayed.query('late').results).toEqual([])

    let releaseSuperseded!: (entries: readonly DirectoryEntry[]) => void
    const traversed = vi.fn((_: RootId, relativePath: string) => relativePath === ''
      ? new Promise<readonly DirectoryEntry[]>((resolve) => { releaseSuperseded = resolve })
      : Promise.resolve([file('obsolete.md', 'obsolete')]))
    const superseded = new WorkspaceFinder(traversed)
    const obsolete = superseded.rebuild([{ rootId: rootOne }])
    const replacement = superseded.rebuild([])
    releaseSuperseded([file('late-directory', 'late-directory', 'directory')])
    await Promise.all([obsolete, replacement])
    expect(traversed).not.toHaveBeenCalledWith(rootOne, 'late-directory')
    current = [file('new.md', 'new')]
  })

  test('AC37 AC38: query validation accepts one bounded string and rejects authority or oversized payloads', () => {
    expect(validateFinderQueryRequest({ query: 'guide' })).toEqual({ ok: true, value: { query: 'guide' } })
    expect(validateFinderQueryRequest({ query: 'x', rootId: rootOne })).toEqual({ error: { code: 'validation' }, ok: false })
    expect(validateFinderQueryRequest({ query: 'x'.repeat(513) })).toEqual({ error: { code: 'validation' }, ok: false })
    expect(validateFinderQueryRequest({ query: '../secret' })).toEqual({ ok: true, value: { query: '../secret' } })
  })
})

function listing(value: Readonly<Record<string, Readonly<Record<string, readonly DirectoryEntry[]>>>>) {
  return async (rootId: RootId, relativePath: string): Promise<readonly DirectoryEntry[]> => value[rootId]?.[relativePath] ?? []
}
