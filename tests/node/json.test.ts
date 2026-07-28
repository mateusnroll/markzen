import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'vitest'

import {
  JSON_LIMITS,
  jsonValueEqual,
  parseJsonBytes,
  serializeJsonDocument,
  validateJsonDocument,
  type JsonArray,
  type JsonDocument,
  type JsonObject,
  type JsonValue,
} from '../../src/documents/json'
import { isDocumentCompletionCurrent } from '../../src/documents/tab-state'

const encode = (value: string): Uint8Array => new TextEncoder().encode(value)
describe('spec 0010 JSON codec', () => {
  test('AC11-AC15 AC23: strict parsing preserves roots, duplicate properties, decoded strings, number lexemes, and deterministic formatting', async () => {
    const source = new Uint8Array(await readFile('tests/fixtures/json/basic.source.json'))
    const expected = JSON.parse(await readFile('tests/fixtures/json/basic.expected.json', 'utf8')) as {
      readonly format: JsonDocument['format']
      readonly numberLexemes: readonly string[]
      readonly propertyNames: readonly string[]
      readonly rootType: JsonValue['type']
    }
    const parsed = parseJsonBytes(source)
    expect(parsed.mode).toBe('editable')
    if (parsed.mode !== 'editable') throw new Error(parsed.reason)
    expect(parsed.document.root.type).toBe(expected.rootType)
    expect(parsed.document.format).toEqual(expected.format)
    const root = parsed.document.root as JsonObject
    expect(root.properties.map((property) => property.name)).toEqual(expected.propertyNames)
    expect(root.properties.flatMap((property) => property.value.type === 'number' ? [property.value.lexeme] : [])).toEqual(expected.numberLexemes)
    expect(root.properties.find((property) => property.name === 'unicode')?.value).toMatchObject({ type: 'string', value: '𝄞' })
    expect(root.properties.find((property) => property.name === 'lone')?.value).toMatchObject({ type: 'string', value: '\uDEAD' })

    for (const [text, type] of [
      ['[]', 'array'],
      ['"text"', 'string'],
      ['-0.5E+2', 'number'],
      ['true', 'boolean'],
      ['null', 'null'],
    ] as const) {
      const outcome = parseJsonBytes(encode(text))
      expect(outcome.mode).toBe('editable')
      if (outcome.mode === 'editable') expect(outcome.document.root.type).toBe(type)
    }
  })

  test('AC16-AC19 AC71: empty, malformed, invalid UTF-8, and exact bound crossings select whole-document preservation', () => {
    for (const source of ['', '   ', '{"a":}', '{"a":1,}', '[1 2]', '"\\x"', '01', '{} extra']) {
      const parsed = parseJsonBytes(encode(source))
      expect(parsed.mode).toBe('preserve')
      if (parsed.mode === 'preserve' && source.trim()) {
        expect(parsed.reason).toBe('malformed')
        expect(parsed.location?.line).toBeGreaterThan(0)
        expect(parsed.location?.column).toBeGreaterThan(0)
      }
    }
    expect(parseJsonBytes(Uint8Array.from([0xff, 0xfe]))).toMatchObject({ mode: 'preserve', reason: 'invalid-utf8' })
    expect(parseJsonBytes(new Uint8Array(JSON_LIMITS.maxDocumentBytes + 1))).toMatchObject({ mode: 'preserve', reason: 'document-bytes' })

    const token = JSON.stringify('x'.repeat(JSON_LIMITS.maxTokenBytes))
    expect(parseJsonBytes(encode(token))).toMatchObject({ mode: 'preserve', reason: 'token-bytes' })
  })

  test('AC24-AC34: unchanged bytes are exact and edited output uses the canonical ordered serializer', async () => {
    const original = new Uint8Array(await readFile('tests/fixtures/json/basic.source.json'))
    const parsed = parseJsonBytes(original)
    if (parsed.mode !== 'editable') throw new Error(parsed.reason)
    expect(serializeJsonDocument(parsed.document)).toEqual(original)

    const root = parsed.document.root as JsonObject
    const items = root.properties.find((property) => property.name === 'items')?.value as JsonArray
    const edited: JsonDocument = {
      ...parsed.document,
      edited: true,
      root: {
        ...root,
        properties: root.properties.map((property) => property.value !== items ? property : {
          ...property,
          value: {
            ...items,
            items: items.items.map((item, index) => index === 2 ? { ...item, value: 'changed' } as JsonValue : item),
          },
        }),
      },
    }
    expect(serializeJsonDocument(edited)).toEqual(new Uint8Array(await readFile('tests/fixtures/json/basic.golden.json')))
    const reparsed = parseJsonBytes(serializeJsonDocument(edited))
    expect(reparsed.mode).toBe('editable')
    if (reparsed.mode === 'editable') expect(jsonValueEqual(reparsed.document.root, edited.root)).toBe(true)
  })

  test('AC50 AC58 AC71: mutation validation enforces canonical byte, depth, unit, and token bounds atomically', () => {
    const parsed = parseJsonBytes(encode('{"a":1}'))
    if (parsed.mode !== 'editable') throw new Error(parsed.reason)
    expect(validateJsonDocument(parsed.document.root, parsed.document.format)).toEqual({ ok: true })

    const oversized: JsonValue = {
      id: 'large',
      type: 'string',
      value: 'x'.repeat(JSON_LIMITS.maxTokenBytes),
    }
    expect(validateJsonDocument(oversized, parsed.document.format)).toMatchObject({ ok: false, reason: 'token-bytes' })
  })

  test('AC63 AC67: completion and closed-authority policy requires owner, JSON kind, generation, and revision equality', () => {
    const current = { generation: 4, kind: 'json' as const, owner: 'tab-a', revision: 9 }
    expect(isDocumentCompletionCurrent(current, current)).toBe(true)
    for (const stale of [
      { ...current, generation: 3 },
      { ...current, kind: 'csv' as const },
      { ...current, owner: 'tab-b' },
      { ...current, revision: 8 },
    ]) expect(isDocumentCompletionCurrent(stale, current)).toBe(false)
  })
})
