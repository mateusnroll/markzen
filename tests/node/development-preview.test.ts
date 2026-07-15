import { describe, expect, test } from 'vitest'

import { isAllowedNavigation, parseDevelopmentRendererOrigin } from '../../src/platform/electron/development'

describe('Electron development renderer', () => {
  test('accepts only an explicit unpackaged IPv4 loopback origin', () => {
    expect(parseDevelopmentRendererOrigin('', false)).toBeUndefined()
    expect(parseDevelopmentRendererOrigin('http://127.0.0.1:4173/', false)).toBe('http://127.0.0.1:4173')
  })

  test('rejects the development renderer switch in a packaged build', () => {
    expect(() => parseDevelopmentRendererOrigin('http://127.0.0.1:4173/', true)).toThrow(/packaged/)
  })

  test.each([
    'https://127.0.0.1:4173/',
    'http://localhost:4173/',
    'http://127.0.0.1/',
    'http://127.0.0.1:4173/path',
    'http://127.0.0.1:4173/?query=1',
    'http://127.0.0.1:4173/#fragment',
    'http://user:secret@127.0.0.1:4173/',
    'http://127.0.0.2:4173/',
    'http://example.com:4173/',
    'not a url',
  ])('rejects unsafe development renderer input: %s', (value) => {
    expect(() => parseDevelopmentRendererOrigin(value, false)).toThrow()
  })

  test('limits top-level navigation to the selected renderer origin', () => {
    const origin = 'http://127.0.0.1:4173'
    expect(isAllowedNavigation('http://127.0.0.1:4173/', origin)).toBe(true)
    expect(isAllowedNavigation('http://127.0.0.1:4173/editor', origin)).toBe(true)
    expect(isAllowedNavigation('http://127.0.0.1:4174/', origin)).toBe(false)
    expect(isAllowedNavigation('http://127.0.0.1:4173.evil.example/', origin)).toBe(false)
    expect(isAllowedNavigation('https://127.0.0.1:4173/', origin)).toBe(false)
    expect(isAllowedNavigation('https://example.com/', origin)).toBe(false)
    expect(isAllowedNavigation('invalid', origin)).toBe(false)
  })

  test('keeps production navigation on the application protocol host', () => {
    expect(isAllowedNavigation('markzen://app/', 'markzen://app')).toBe(true)
    expect(isAllowedNavigation('markzen://app/document', 'markzen://app')).toBe(true)
    expect(isAllowedNavigation('markzen://other/', 'markzen://app')).toBe(false)
    expect(isAllowedNavigation('https://app/', 'markzen://app')).toBe(false)
  })
})
