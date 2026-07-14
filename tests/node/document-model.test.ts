import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'vitest'

import {
  applyDocumentEncoding,
  parseDocumentBytes,
  serializeRichDocument,
  type RichDocument,
} from '../../src/documents/markdown'

const fixture = async (name: string): Promise<{ expected: RichDocument; golden: Uint8Array; source: Uint8Array }> => ({
  expected: JSON.parse(await readFile(`tests/fixtures/markdown/${name}.expected.json`, 'utf8')) as RichDocument,
  golden: new Uint8Array(await readFile(`tests/fixtures/markdown/${name}.golden.md`)),
  source: new Uint8Array(await readFile(`tests/fixtures/markdown/${name}.source.md`)),
})

describe('spec 0002 Markdown model and serialization', () => {
  test.each(['basic', 'blocks', 'inline', 'gfm', 'raw'])('AC17 AC22-AC28: %s source matches its independently authored semantic model', async (name) => {
    const value = await fixture(name)
    const parsed = parseDocumentBytes(value.source)

    expect(parsed.mode).toBe('rich')
    if (parsed.mode !== 'rich') throw new Error('expected rich parsing')
    expect(parsed.document).toEqual(value.expected)
  })

  test.each(['basic', 'blocks', 'inline', 'gfm', 'raw'])('AC18 AC20 AC21 AC25-AC27 AC30-AC31: %s model matches its independent golden', async (name) => {
    const value = await fixture(name)

    expect(serializeRichDocument(value.expected, { bom: false, newline: 'lf' })).toEqual(value.golden)
  })

  test.each(['basic', 'blocks', 'inline', 'gfm', 'raw'])('AC19: %s golden reparses to the independent model', async (name) => {
    const value = await fixture(name)
    const reparsed = parseDocumentBytes(value.golden)

    expect(reparsed.mode).toBe('rich')
    if (reparsed.mode !== 'rich') throw new Error('expected rich parsing')
    expect(reparsed.document).toEqual(value.expected)
  })

  test('AC21: an empty semantic document serializes to empty bytes', () => {
    expect(serializeRichDocument({ type: 'doc', content: [] }, { bom: false, newline: 'lf' })).toEqual(new Uint8Array())
  })

  test('AC23 AC120-AC123: newline and BOM policy preserves existing conventions and defines new files', () => {
    const generated = '# A\n\nline\n'
    expect(new TextDecoder().decode(applyDocumentEncoding(generated, { bom: false, newline: 'crlf' }))).toBe('# A\r\n\r\nline\r\n')
    expect([...applyDocumentEncoding(generated, { bom: true, newline: 'lf' }).slice(0, 3)]).toEqual([0xef, 0xbb, 0xbf])
    expect(new TextDecoder().decode(applyDocumentEncoding(generated, { bom: false, newline: 'lf' }))).toBe(generated)
  })

  test('AC24: UTF-8 Unicode scalar values survive parse and serialization', () => {
    const source = new TextEncoder().encode('Olá 👋🏽 東京\n')
    const parsed = parseDocumentBytes(source)
    expect(parsed.mode).toBe('rich')
    if (parsed.mode !== 'rich') throw new Error('expected rich parsing')
    expect(new TextDecoder().decode(serializeRichDocument(parsed.document, parsed.encoding))).toBe('Olá 👋🏽 東京\n')
  })

  test('AC28 AC30-AC32: a bounded raw node preserves its exact slice and can be explicitly removed', async () => {
    const value = await fixture('raw')
    const withoutRaw: RichDocument = { ...value.expected, content: value.expected.content.filter((node) => node.type !== 'opaque') }
    expect(new TextDecoder().decode(serializeRichDocument(value.expected, { bom: false, newline: 'lf' }))).toContain(
      '<div onclick="steal()"><script>steal()</script></div>\n\n',
    )
    expect(new TextDecoder().decode(serializeRichDocument(withoutRaw, { bom: false, newline: 'lf' }))).not.toContain('<script>')
  })

  test('AC33-AC36: unsupported ambiguous source uses whole-document preservation with exact Save As bytes', () => {
    const source = new TextEncoder().encode('# Note\n\n[^missing footnote]\n')
    const parsed = parseDocumentBytes(source)

    expect(parsed).toMatchObject({ mode: 'preserve-text', reason: 'unsupported-or-ambiguous' })
    if (parsed.mode !== 'preserve-text') throw new Error('expected preservation')
    expect(parsed.bytes).toEqual(source)
  })

  test('AC34 AC48: invalid UTF-8 uses reversible byte preservation without replacement characters', () => {
    const source = Uint8Array.from([0x41, 0x00, 0xff, 0x0a])
    const parsed = parseDocumentBytes(source)

    expect(parsed).toMatchObject({ mode: 'preserve-bytes', escaped: 'A\\x00\\xFF\\x0A' })
    if (parsed.mode !== 'preserve-bytes') throw new Error('expected byte preservation')
    expect(parsed.bytes).toEqual(source)
    expect(parsed.escaped).not.toContain('�')
  })

  test('AC117-AC119: milestone 0002 serialization does not resolve or rebase image source strings', async () => {
    const value = await fixture('gfm')
    const serialized = new TextDecoder().decode(serializeRichDocument(value.expected, { bom: false, newline: 'lf' }))
    expect(serialized).toContain('![Alt](images/a.png "Pic")')
  })
})

describe('spec 0005 table serialization', () => {
  test('AC14 AC15: the independent GFM model and golden preserve rectangular semantics and supported nesting', async () => {
    const value = await fixture('gfm')
    const parsed = parseDocumentBytes(value.source)
    expect(parsed.mode).toBe('rich')
    if (parsed.mode !== 'rich') throw new Error('expected rich parsing')
    expect(parsed.document).toEqual(value.expected)
    expect(serializeRichDocument(parsed.document, parsed.encoding)).toEqual(value.golden)
    const reparsed = parseDocumentBytes(value.golden)
    expect(reparsed.mode === 'rich' ? reparsed.document : undefined).toEqual(value.expected)
  })
})
