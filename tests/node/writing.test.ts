import { describe, expect, test } from 'vitest'

import { classifyExternalDestination, validateExternalOpenPayload } from '../../src/links/external'
import { ExternalRequestRegistry } from '../../src/links/external-requests'
import { findTextMatches, normalizeSearchText } from '../../src/search/search'

describe('spec 0004 external-link policy', () => {
  test('AC27 AC88: safe absolute and bare-host destinations normalize through the shared WHATWG policy', () => {
    expect(classifyExternalDestination('https://example.com/a?q=1#part')).toEqual({
      destination: 'https://example.com/a?q=1#part',
      kind: 'safe',
    })
    expect(classifyExternalDestination('mailto:writer@example.com?subject=Hello')).toEqual({
      destination: 'mailto:writer@example.com?subject=Hello',
      kind: 'safe',
    })
    expect(classifyExternalDestination('example.com:8443/a?q=1#part')).toEqual({
      destination: 'https://example.com:8443/a?q=1#part',
      kind: 'safe',
    })
  })

  test('AC28 AC89: credential, file, and non-executable custom absolute destinations require confirmation', () => {
    expect(classifyExternalDestination('https://user:secret@example.com/')).toEqual({
      destination: 'https://user:secret@example.com/',
      kind: 'confirm',
    })
    expect(classifyExternalDestination('file:///Users/example/note.md')).toEqual({
      destination: 'file:///Users/example/note.md',
      kind: 'confirm',
    })
    expect(classifyExternalDestination('obsidian://open?vault=notes')).toEqual({
      destination: 'obsidian://open?vault=notes',
      kind: 'confirm',
    })
  })

  test('AC31 AC32 AC90: non-openable values and non-closed bounded payloads reject before privileged work', () => {
    for (const destination of [
      '../relative.md',
      '#heading',
      'javascript:alert(1)',
      'data:text/plain,hello',
      'blob:https://example.com/id',
      'https://exa\u0000mple.com',
      'not a url',
    ]) expect(classifyExternalDestination(destination)).toEqual({ kind: 'blocked' })

    expect(validateExternalOpenPayload({ destination: 'https://example.com' })).toEqual({
      ok: true,
      value: { destination: 'https://example.com' },
    })
    expect(validateExternalOpenPayload({ destination: 'https://example.com', confirmed: true })).toEqual({
      error: { code: 'validation' },
      ok: false,
    })
    expect(validateExternalOpenPayload({ destination: 'x'.repeat(4_097) })).toEqual({
      error: { code: 'validation' },
      ok: false,
    })
  })

  test('AC32 AC47 AC91: duplicate, foreign, stale, and disposed external requests cannot commit', () => {
    const requests = new ExternalRequestRegistry<string>()
    const first = requests.begin('window-a')
    if (!first.ok) throw new Error('first request must be accepted')
    expect(requests.begin('window-a')).toEqual({ error: { code: 'blocked' }, ok: false })
    expect(requests.current('window-b', first.value)).toBe(false)
    requests.finish('window-a', Symbol('forged'))
    expect(requests.current('window-a', first.value)).toBe(true)
    requests.dispose('window-a')
    expect(requests.current('window-a', first.value)).toBe(false)
    const later = requests.begin('window-a')
    expect(later.ok && later.value).not.toBe(first.value)
  })
})

describe('spec 0004 normalized search', () => {
  test('AC55: NFC plus ECMAScript lowercase keeps source offsets for combining characters', () => {
    expect(normalizeSearchText('Cafe\u0301')).toMatchObject({ text: 'café' })
    expect(findTextMatches('Cafe\u0301 noir', 'CAFÉ')).toEqual([{ from: 0, to: 5 }])
    expect(findTextMatches('İstanbul', 'i\u0307s')).toEqual([{ from: 0, to: 2 }])
  })

  test('AC63: matching is deterministic and non-overlapping', () => {
    expect(findTextMatches('aaa', 'aa')).toEqual([{ from: 0, to: 2 }])
    expect(findTextMatches('one one one', 'ONE')).toEqual([
      { from: 0, to: 3 },
      { from: 4, to: 7 },
      { from: 8, to: 11 },
    ])
  })
})
