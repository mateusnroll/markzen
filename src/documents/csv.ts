import { Editor, Node, type JSONContent } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import StarterKit from '@tiptap/starter-kit'
import { SearchExtension } from '../search/search'

export const CSV_LIMITS = {
  maxDocumentBytes: 10 * 1_048_576,
  maxFieldBytes: 1_048_576,
  maxFieldsPerRecord: 1_000,
  maxRecords: 10_000,
  maxTotalFields: 100_000,
  maxTransferBytes: 32 * 1_048_576,
} as const

export type CsvDelimiter = ',' | ';' | '\t'
export type CsvNewline = 'lf' | 'crlf' | 'cr'
export type CsvDialect = {
  readonly bom: boolean
  readonly delimiter: CsvDelimiter
  readonly newline: CsvNewline
  readonly terminalSeparator: boolean
}
export type CsvDocument = {
  readonly dialect: CsvDialect
  readonly edited: boolean
  readonly originalBytes: Uint8Array
  readonly rows: string[][]
}
export type CsvPreservationReason =
  | 'document-bytes'
  | 'field-bytes'
  | 'fields-per-record'
  | 'invalid-utf8'
  | 'malformed'
  | 'ragged'
  | 'records'
  | 'total-fields'

export type CsvParseResult =
  | { readonly document: CsvDocument; readonly mode: 'editable' }
  | { readonly bytes: Uint8Array; readonly mode: 'preserve'; readonly reason: CsvPreservationReason }

type MutableDialect = {
  bom: boolean
  delimiter: CsvDelimiter
  newline: CsvNewline
  terminalSeparator: boolean
}

const encoder = new TextEncoder()
const editorDialects = new WeakMap<Editor, CsvDialect>()
const editorUpdateListeners = new WeakMap<Editor, (editor: Editor) => void>()
const CSV_REPLACE_META = 'markzenCsvReplace'

const CsvDocumentNode = Node.create({
  name: 'doc',
  content: 'csvRecord+',
  topNode: true,
})

const CsvRecord = Node.create({
  name: 'csvRecord',
  group: 'block',
  content: 'csvField+',
  parseHTML: () => [{ tag: 'div[data-csv-record]' }],
  renderHTML: () => ['div', { 'data-csv-record': '' }, 0],
})

const CsvField = Node.create({
  name: 'csvField',
  group: 'block',
  content: 'text*',
  marks: '',
  parseHTML: () => [{ tag: 'div[data-csv-field]' }],
  renderHTML: () => ['div', { 'data-csv-field': '' }, 0],
})

export function createCsvEditor(document: CsvDocument, onUpdate?: (editor: Editor) => void): Editor {
  const editor = new Editor({
    content: csvRowsToJson(document.rows),
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        document: false,
        hardBreak: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        listItem: false,
        orderedList: false,
        paragraph: false,
        strike: false,
      }),
      CsvDocumentNode,
      CsvRecord,
      CsvField,
      SearchExtension,
    ],
  })
  if (onUpdate) {
    editorUpdateListeners.set(editor, onUpdate)
    editor.on('transaction', ({ editor: updated, transaction }) => {
      if (!transaction.docChanged || transaction.getMeta(CSV_REPLACE_META)) return
      onUpdate(updated)
    })
  }
  editorDialects.set(editor, document.dialect)
  return editor
}

export function csvRowsToJson(rows: readonly (readonly string[])[]): JSONContent {
  return {
    type: 'doc',
    content: rows.map((row) => ({
      type: 'csvRecord',
      content: row.map((field) => ({
        type: 'csvField',
        ...(field ? { content: [{ type: 'text', text: field }] } : {}),
      })),
    })),
  }
}

export function csvRowsFromEditor(editor: Editor): string[][] {
  const json = editor.getJSON() as JSONContent
  return (json.content ?? []).map((record) => (record.content ?? []).map((field) => (
    field.content?.map((node: JSONContent) => node.text ?? '').join('') ?? ''
  )))
}

export function replaceCsvRows(editor: Editor, rows: readonly (readonly string[])[]): boolean {
  const current = csvRowsFromEditor(editor)
  if (csvRowsEqual(current, rows)) return false
  const next = editor.schema.nodeFromJSON(csvRowsToJson(rows))
  const transaction = closeHistory(editor.state.tr
    .replaceWith(0, editor.state.doc.content.size, next.content)
    .setMeta(CSV_REPLACE_META, true))
  editor.view.dispatch(transaction)
  editorUpdateListeners.get(editor)?.(editor)
  return true
}

export function csvRowsEqual(first: readonly (readonly string[])[], second: readonly (readonly string[])[]): boolean {
  return first.length === second.length && first.every((row, rowIndex) => (
    row.length === second[rowIndex]?.length && row.every((field, columnIndex) => field === second[rowIndex]?.[columnIndex])
  ))
}

export function parseCsvBytes(bytes: Uint8Array): CsvParseResult {
  if (bytes.byteLength > CSV_LIMITS.maxDocumentBytes) return preserve(bytes, 'document-bytes')
  const bom = bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(bom ? 3 : 0))
  } catch {
    return preserve(bytes, 'invalid-utf8')
  }
  const delimiter = detectCsvDelimiter(text)
  const parsed = parseCsvText(text, delimiter)
  if (!parsed.ok) return preserve(bytes, parsed.reason)
  const dialect: MutableDialect = {
    bom,
    delimiter,
    newline: dominantNewline(parsed.newlines, parsed.newlineOrder),
    terminalSeparator: parsed.terminalSeparator,
  }
  return {
    document: {
      dialect,
      edited: false,
      originalBytes: bytes.slice(),
      rows: parsed.rows,
    },
    mode: 'editable',
  }
}

export function serializeCsvDocument(document: CsvDocument): Uint8Array {
  if (!document.edited) return document.originalBytes.slice()
  return encodeCsv(document.rows, document.dialect)
}

export function serializeClipboardMatrix(rows: readonly (readonly string[])[]): string {
  return decodeWithoutBom(encodeCsv(rows, {
    bom: false,
    delimiter: '\t',
    newline: 'lf',
    terminalSeparator: false,
  }))
}

export function parseClipboardText(text: string):
  | { readonly ok: true; readonly rows: string[][] }
  | { readonly ok: false; readonly reason: CsvPreservationReason } {
  const bytes = encoder.encode(text)
  if (bytes.byteLength > CSV_LIMITS.maxDocumentBytes) return { ok: false, reason: 'document-bytes' }
  const parsed = parseCsvText(text, '\t')
  return parsed.ok ? { ok: true, rows: parsed.rows } : parsed
}

export function validateCsvMatrix(
  rows: readonly (readonly string[])[],
  dialect: CsvDialect = { bom: false, delimiter: ',', newline: 'lf', terminalSeparator: false },
):
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: CsvPreservationReason } {
  if (rows.length > CSV_LIMITS.maxRecords) return { ok: false, reason: 'records' }
  const width = rows[0]?.length ?? 1
  let totalFields = 0
  for (const row of rows) {
    if (row.length !== width) return { ok: false, reason: 'ragged' }
    if (row.length > CSV_LIMITS.maxFieldsPerRecord) return { ok: false, reason: 'fields-per-record' }
    totalFields += row.length
    if (totalFields > CSV_LIMITS.maxTotalFields) return { ok: false, reason: 'total-fields' }
    for (const field of row) {
      if (encoder.encode(field).byteLength > CSV_LIMITS.maxFieldBytes) return { ok: false, reason: 'field-bytes' }
    }
  }
  const normalized = rows.length === 0 ? [['']] : rows
  if (encodeCsv(normalized, dialect).byteLength > CSV_LIMITS.maxDocumentBytes) {
    return { ok: false, reason: 'document-bytes' }
  }
  return { ok: true }
}

export function validateCsvEditorRows(
  editor: Editor,
  rows: readonly (readonly string[])[],
): ReturnType<typeof validateCsvMatrix> {
  return validateCsvMatrix(rows, editorDialects.get(editor))
}

export function csvPreservationMessage(reason: CsvPreservationReason): string {
  const messages: Record<CsvPreservationReason, string> = {
    'document-bytes': 'CSV exceeds the 10 MiB editable document limit.',
    'field-bytes': 'A CSV field exceeds the 1 MiB UTF-8 limit.',
    'fields-per-record': 'A CSV record exceeds the 1,000-field limit.',
    'invalid-utf8': 'CSV is not valid UTF-8.',
    malformed: 'CSV quoting is malformed.',
    ragged: 'CSV records have unequal field counts.',
    records: 'CSV exceeds the 10,000-record limit.',
    'total-fields': 'CSV exceeds the 100,000-total-field limit.',
  }
  return messages[reason]
}

export function isCsvCompletionCurrent(
  captured: { readonly generation: number; readonly kind: 'csv' | 'markdown'; readonly owner: string; readonly revision: number },
  current: { readonly generation: number; readonly kind: 'csv' | 'markdown'; readonly owner: string; readonly revision: number },
): boolean {
  return captured.owner === current.owner
    && captured.kind === current.kind
    && captured.generation === current.generation
    && captured.revision === current.revision
}

export function csvColumnLabel(index: number): string {
  let value = index + 1
  let label = ''
  while (value > 0) {
    value -= 1
    label = String.fromCharCode(65 + (value % 26)) + label
    value = Math.floor(value / 26)
  }
  return label
}

function detectCsvDelimiter(text: string): CsvDelimiter {
  const candidates = [',', ';', '\t'] as const
  const present = new Map<CsvDelimiter, number>(candidates.map((candidate) => [candidate, 0]))
  const totals = new Map<CsvDelimiter, number>(candidates.map((candidate) => [candidate, 0]))
  let counts = new Map<CsvDelimiter, number>(candidates.map((candidate) => [candidate, 0]))
  let records = 0
  let quoted = false
  let atFieldStart = true
  const finishRecord = () => {
    for (const candidate of candidates) {
      const count = counts.get(candidate) ?? 0
      if (count > 0) present.set(candidate, (present.get(candidate) ?? 0) + 1)
      totals.set(candidate, (totals.get(candidate) ?? 0) + count)
    }
    counts = new Map(candidates.map((candidate) => [candidate, 0]))
    records += 1
    atFieldStart = true
  }
  for (let index = 0; index < text.length && records < 20; index += 1) {
    const character = text[index]!
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') index += 1
      else if (character === '"') quoted = false
      continue
    }
    if (character === '"' && atFieldStart) {
      quoted = true
      atFieldStart = false
      continue
    }
    if (candidates.includes(character as CsvDelimiter)) {
      const candidate = character as CsvDelimiter
      counts.set(candidate, (counts.get(candidate) ?? 0) + 1)
      atFieldStart = true
      continue
    }
    if (character === '\r' || character === '\n') {
      if (character === '\r' && text[index + 1] === '\n') index += 1
      finishRecord()
      continue
    }
    atFieldStart = false
  }
  if (records < 20 && (text.length > 0 || records === 0)) finishRecord()
  return [...candidates].sort((first, second) => (
    (present.get(second) ?? 0) - (present.get(first) ?? 0)
    || (totals.get(second) ?? 0) - (totals.get(first) ?? 0)
    || candidates.indexOf(first) - candidates.indexOf(second)
  ))[0]!
}

function parseCsvText(text: string, delimiter: CsvDelimiter):
  | {
    readonly newlineOrder: readonly CsvNewline[]
    readonly newlines: Readonly<Record<CsvNewline, number>>
    readonly ok: true
    readonly rows: string[][]
    readonly terminalSeparator: boolean
  }
  | { readonly ok: false; readonly reason: CsvPreservationReason } {
  if (text.length === 0) {
    return {
      newlineOrder: [],
      newlines: { cr: 0, crlf: 0, lf: 0 },
      ok: true,
      rows: [['']],
      terminalSeparator: false,
    }
  }
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let closedQuote = false
  let terminalSeparator = false
  let totalFields = 0
  const newlines: Record<CsvNewline, number> = { cr: 0, crlf: 0, lf: 0 }
  const newlineOrder: CsvNewline[] = []

  const pushField = (): CsvPreservationReason | undefined => {
    if (encoder.encode(field).byteLength > CSV_LIMITS.maxFieldBytes) return 'field-bytes'
    row.push(field)
    field = ''
    closedQuote = false
    totalFields += 1
    if (row.length > CSV_LIMITS.maxFieldsPerRecord) return 'fields-per-record'
    if (totalFields > CSV_LIMITS.maxTotalFields) return 'total-fields'
    return undefined
  }
  const pushRecord = (): CsvPreservationReason | undefined => {
    const fieldFailure = pushField()
    if (fieldFailure) return fieldFailure
    if (rows.length > 0 && row.length !== rows[0]!.length) return 'ragged'
    rows.push(row)
    row = []
    if (rows.length > CSV_LIMITS.maxRecords) return 'records'
    return undefined
  }

  for (let index = 0; index < text.length; index += 1) {
    const character = text[index]!
    terminalSeparator = false
    if (quoted) {
      if (character === '"' && text[index + 1] === '"') {
        field += '"'
        index += 1
      } else if (character === '"') {
        quoted = false
        closedQuote = true
      } else {
        field += character
      }
      continue
    }
    if (closedQuote && character !== delimiter && character !== '\r' && character !== '\n') return { ok: false, reason: 'malformed' }
    if (character === '"' && field.length === 0 && !closedQuote) {
      quoted = true
      continue
    }
    if (character === '"') return { ok: false, reason: 'malformed' }
    if (character === delimiter) {
      const failure = pushField()
      if (failure) return { ok: false, reason: failure }
      continue
    }
    if (character === '\r' || character === '\n') {
      const newline: CsvNewline = character === '\r' && text[index + 1] === '\n' ? 'crlf' : character === '\r' ? 'cr' : 'lf'
      if (newline === 'crlf') index += 1
      const failure = pushRecord()
      if (failure) return { ok: false, reason: failure }
      newlines[newline] += 1
      if (!newlineOrder.includes(newline)) newlineOrder.push(newline)
      terminalSeparator = index === text.length - 1
      continue
    }
    field += character
  }
  if (quoted) return { ok: false, reason: 'malformed' }
  if (!terminalSeparator) {
    const failure = pushRecord()
    if (failure) return { ok: false, reason: failure }
  }
  return { newlineOrder, newlines, ok: true, rows, terminalSeparator }
}

function dominantNewline(counts: Readonly<Record<CsvNewline, number>>, encountered: readonly CsvNewline[]): CsvNewline {
  const order: CsvNewline[] = [
    ...encountered,
    ...(['lf', 'crlf', 'cr'] as const).filter((value) => !encountered.includes(value)),
  ]
  return [...order].sort((firstValue, secondValue) => counts[secondValue] - counts[firstValue] || order.indexOf(firstValue) - order.indexOf(secondValue))[0]!
}

function encodeCsv(rows: readonly (readonly string[])[], dialect: CsvDialect): Uint8Array {
  const newline = dialect.newline === 'crlf' ? '\r\n' : dialect.newline === 'cr' ? '\r' : '\n'
  const body = rows.map((row) => row.map((field) => encodeField(field, dialect.delimiter)).join(dialect.delimiter)).join(newline)
    + (dialect.terminalSeparator ? newline : '')
  const content = encoder.encode(body)
  if (!dialect.bom) return content
  const bytes = new Uint8Array(content.length + 3)
  bytes.set([0xef, 0xbb, 0xbf])
  bytes.set(content, 3)
  return bytes
}

function encodeField(field: string, delimiter: CsvDelimiter): string {
  return field.includes(delimiter) || /["\r\n]/.test(field) ? `"${field.replaceAll('"', '""')}"` : field
}

function decodeWithoutBom(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes)
}

function preserve(bytes: Uint8Array, reason: CsvPreservationReason): CsvParseResult {
  return { bytes: bytes.slice(), mode: 'preserve', reason }
}
