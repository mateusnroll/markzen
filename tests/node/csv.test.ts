import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'vitest'

import {
  CSV_LIMITS,
  isCsvCompletionCurrent,
  parseClipboardText,
  parseCsvBytes,
  serializeClipboardMatrix,
  serializeCsvDocument,
  validateCsvMatrix,
  type CsvDocument,
} from '../../src/documents/csv'

const encode = (value: string): Uint8Array => new TextEncoder().encode(value)
const decode = (value: Uint8Array): string => new TextDecoder().decode(value)

describe('spec 0009 bounded CSV codec', () => {
  test('AC11-AC16 AC20: independently authored fixtures preserve Unicode, empty fields, quotes, delimiters, separators, and terminal state', async () => {
    const source = new Uint8Array(await readFile('tests/fixtures/csv/basic.source.csv'))
    const expected = JSON.parse(await readFile('tests/fixtures/csv/basic.expected.json', 'utf8')) as {
      readonly dialect: CsvDocument['dialect']
      readonly rows: readonly (readonly string[])[]
    }
    const parsed = parseCsvBytes(source)
    expect(parsed.mode).toBe('editable')
    if (parsed.mode !== 'editable') throw new Error(parsed.reason)
    expect(parsed.document.rows).toEqual(expected.rows)
    expect(parsed.document.dialect).toEqual(expected.dialect)

    for (const [text, delimiter] of [
      ['a;b\r1;2\r', ';'],
      ['a\tb\r\n1\t2\r\n', '\t'],
      ['single', ','],
      ['', ','],
    ] as const) {
      const outcome = parseCsvBytes(encode(text))
      expect(outcome.mode).toBe('editable')
      if (outcome.mode === 'editable') expect(outcome.document.dialect.delimiter).toBe(delimiter)
    }
  })

  test('AC12-AC14: quote-aware delimiter detection uses record presence, occurrence count, and comma-semicolon-tab precedence', () => {
    const comma = parseCsvBytes(encode('"a;b",c\n"x;y",d'))
    const semicolon = parseCsvBytes(encode('"a,b";c\n"x,y";d'))
    const tab = parseCsvBytes(encode('"a,b;c"\tx\n"d,e;f"\ty'))
    const ambiguous = parseCsvBytes(encode('a,b;c\n1,2;3'))
    for (const outcome of [comma, semicolon, tab, ambiguous]) expect(outcome.mode).toBe('editable')
    if (comma.mode === 'editable') expect(comma.document.dialect.delimiter).toBe(',')
    if (semicolon.mode === 'editable') expect(semicolon.document.dialect.delimiter).toBe(';')
    if (tab.mode === 'editable') expect(tab.document.dialect.delimiter).toBe('\t')
    if (ambiguous.mode === 'editable') expect(ambiguous.document.dialect.delimiter).toBe(',')
  })

  test('AC17-AC19: malformed, ragged, and invalid UTF-8 input selects exact-byte preservation', () => {
    for (const bytes of [
      encode('a,b\n1'),
      encode('"unclosed'),
      encode('a"b,c'),
      encode('"a"x,b'),
      Uint8Array.from([0xff, 0xfe]),
    ]) {
      const parsed = parseCsvBytes(bytes)
      expect(parsed.mode).toBe('preserve')
      if (parsed.mode === 'preserve') expect(parsed.bytes).toEqual(bytes)
    }
  })

  test('AC18 AC66 AC69: every exact editable limit is accepted and the first crossing is rejected without a partial matrix', () => {
    expect(validateCsvMatrix([['x'.repeat(CSV_LIMITS.maxFieldBytes)]])).toEqual({ ok: true })
    expect(validateCsvMatrix([['x'.repeat(CSV_LIMITS.maxFieldBytes + 1)]])).toMatchObject({ ok: false, reason: 'field-bytes' })
    expect(validateCsvMatrix([Array.from({ length: CSV_LIMITS.maxFieldsPerRecord }, () => '')])).toEqual({ ok: true })
    expect(validateCsvMatrix([Array.from({ length: CSV_LIMITS.maxFieldsPerRecord + 1 }, () => '')])).toMatchObject({
      ok: false,
      reason: 'fields-per-record',
    })
    expect(CSV_LIMITS.maxDocumentBytes).toBe(10 * 1_048_576)
    expect(CSV_LIMITS.maxTransferBytes).toBe(32 * 1_048_576)
  })

  test('AC21-AC26: unchanged Save As copies original bytes while edited output uses canonical quoting, BOM, delimiter, and dominant first-tie separator', async () => {
    const original = encode('a;b\r1;2\n3;4\r\n')
    const parsed = parseCsvBytes(original)
    expect(parsed.mode).toBe('editable')
    if (parsed.mode !== 'editable') throw new Error(parsed.reason)
    expect(serializeCsvDocument(parsed.document)).toEqual(original)

    const edited: CsvDocument = { ...parsed.document, edited: true, rows: parsed.document.rows.map((row) => [...row]) }
    edited.rows[1]![1] = 'two; "quoted"'
    expect(decode(serializeCsvDocument(edited))).toBe('a;b\r1;"two; ""quoted"""\r3;4\r')

    const secondaryTie = parseCsvBytes(encode('a\nb\rc\r\nd\re\r\nf'))
    if (secondaryTie.mode !== 'editable') throw new Error(secondaryTie.reason)
    expect(secondaryTie.document.dialect.newline).toBe('cr')

    const source = new Uint8Array(await readFile('tests/fixtures/csv/basic.source.csv'))
    const fixture = parseCsvBytes(source)
    if (fixture.mode !== 'editable') throw new Error(fixture.reason)
    expect(serializeCsvDocument({ ...fixture.document, edited: true })).toEqual(
      new Uint8Array(await readFile('tests/fixtures/csv/basic.golden.csv')),
    )
  })

  test('AC27-AC28: literal values round-trip without view metadata or type coercion', () => {
    const values = ['=1+1', '+cmd', '-2', '@name', '<img src=x>', 'https://example.com', '\u202Eabc', '😀', '', '  ']
    const parsed = parseCsvBytes(encode(values.map((value) => `"${value.replaceAll('"', '""')}"`).join(',')))
    if (parsed.mode !== 'editable') throw new Error(parsed.reason)
    expect(parsed.document.rows[0]).toEqual(values)
    const serialized = serializeCsvDocument({ ...parsed.document, edited: true })
    const reparsed = parseCsvBytes(serialized)
    if (reparsed.mode !== 'editable') throw new Error(reparsed.reason)
    expect(reparsed.document.rows[0]).toEqual(values)
    expect(decode(serialized)).not.toContain('Header row')
  })

  test('AC41 AC43 AC45: clipboard matrices reuse bounded tab CSV with LF and no terminal separator', () => {
    const text = serializeClipboardMatrix([['a', 'b\tb'], ['line\nbreak', '"quoted"']])
    expect(text).toBe('a\t"b\tb"\n"line\nbreak"\t"""quoted"""')
    expect(parseClipboardText(text)).toEqual({ ok: true, rows: [['a', 'b\tb'], ['line\nbreak', '"quoted"']] })
    expect(parseClipboardText('a\tb\none')).toMatchObject({ ok: false, reason: 'ragged' })
  })

  test('AC60 AC72: stale completion policy requires owner, kind, generation, and revision equality', () => {
    const current = { generation: 4, kind: 'csv' as const, owner: 'tab-a', revision: 9 }
    expect(isCsvCompletionCurrent(current, current)).toBe(true)
    for (const stale of [
      { ...current, generation: 3 },
      { ...current, kind: 'markdown' as const },
      { ...current, owner: 'tab-b' },
      { ...current, revision: 8 },
    ]) expect(isCsvCompletionCurrent(stale, current)).toBe(false)
  })
})
