import { Editor, Node, type JSONContent } from '@tiptap/core'
import { closeHistory } from '@tiptap/pm/history'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { Transaction } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'

import { SearchExtension } from '../search/search'

export const JSON_LIMITS = {
  maxDepth: 512,
  maxDocumentBytes: 10 * 1_048_576,
  maxTokenBytes: 1_048_576,
  maxTotalUnits: 100_000,
} as const

export type JsonNewline = 'cr' | 'crlf' | 'lf'
export type JsonFormat = {
  readonly bom: boolean
  readonly indent: string
  readonly newline: JsonNewline
  readonly terminalSeparator: boolean
}
type JsonBase = { readonly id: string }
export type JsonObject = JsonBase & { readonly properties: readonly JsonProperty[]; readonly type: 'object' }
export type JsonArray = JsonBase & { readonly items: readonly JsonValue[]; readonly type: 'array' }
export type JsonString = JsonBase & { readonly type: 'string'; readonly value: string }
export type JsonNumber = JsonBase & { readonly lexeme: string; readonly type: 'number' }
export type JsonBoolean = JsonBase & { readonly type: 'boolean'; readonly value: boolean }
export type JsonNull = JsonBase & { readonly type: 'null' }
export type JsonValue = JsonObject | JsonArray | JsonString | JsonNumber | JsonBoolean | JsonNull
export type JsonProperty = JsonBase & { readonly name: string; readonly value: JsonValue }
export type JsonDocument = {
  readonly edited: boolean
  readonly format: JsonFormat
  readonly originalBytes: Uint8Array
  readonly root: JsonValue
}
export type JsonPreservationReason =
  | 'depth'
  | 'document-bytes'
  | 'invalid-utf8'
  | 'malformed'
  | 'token-bytes'
  | 'total-units'
export type JsonParseResult =
  | { readonly document: JsonDocument; readonly mode: 'editable' }
  | {
    readonly bytes: Uint8Array
    readonly location?: { readonly column: number; readonly line: number }
    readonly mode: 'preserve'
    readonly reason: JsonPreservationReason
  }
export type JsonValidation =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: Exclude<JsonPreservationReason, 'invalid-utf8' | 'malformed'> }

const encoder = new TextEncoder()
const NUMBER_PATTERN = /^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?$/
const editorFormats = new WeakMap<Editor, JsonFormat>()
const editorListeners = new WeakMap<Editor, (editor: Editor) => void>()
const JSON_MUTATION_META = 'markzenJsonMutation'

const JsonDocumentNode = Node.create({
  name: 'doc',
  content: 'jsonValue',
  topNode: true,
})
const JsonObjectNode = Node.create({
  name: 'jsonObject',
  group: 'jsonValue',
  content: 'jsonProperty*',
  addAttributes: () => ({ id: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-json-object]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', { ...HTMLAttributes, 'data-json-object': '' }, 0],
})
const JsonPropertyNode = Node.create({
  name: 'jsonProperty',
  content: 'jsonName jsonValue',
  addAttributes: () => ({ id: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-json-property]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', { ...HTMLAttributes, 'data-json-property': '' }, 0],
})
const JsonNameNode = Node.create({
  name: 'jsonName',
  content: 'text*',
  marks: '',
  parseHTML: () => [{ tag: 'div[data-json-name]' }],
  renderHTML: () => ['div', { 'data-json-name': '' }, 0],
})
const JsonArrayNode = Node.create({
  name: 'jsonArray',
  group: 'jsonValue',
  content: 'jsonValue*',
  addAttributes: () => ({ id: { default: '' } }),
  parseHTML: () => [{ tag: 'div[data-json-array]' }],
  renderHTML: ({ HTMLAttributes }) => ['div', { ...HTMLAttributes, 'data-json-array': '' }, 0],
})
const scalarNode = (name: string) => Node.create({
  name,
  group: 'jsonValue',
  content: 'text*',
  marks: '',
  addAttributes: () => ({ id: { default: '' } }),
  parseHTML: () => [{ tag: `span[data-${name}]` }],
  renderHTML: ({ HTMLAttributes }) => ['span', { ...HTMLAttributes, [`data-${name}`]: '' }, 0],
})
const JsonStringNode = scalarNode('jsonString')
const JsonNumberNode = scalarNode('jsonNumber')
const JsonBooleanNode = scalarNode('jsonBoolean')
const JsonNullNode = scalarNode('jsonNull')

export function createEmptyJsonDocument(): JsonDocument {
  return {
    edited: false,
    format: { bom: false, indent: '  ', newline: 'lf', terminalSeparator: false },
    originalBytes: encoder.encode('{}'),
    root: { id: 'json-1', properties: [], type: 'object' },
  }
}

export function createJsonEditor(document: JsonDocument, onUpdate?: (editor: Editor) => void): Editor {
  const editor = new Editor({
    content: jsonValueToContent(document.root, true),
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bulletList: false,
        code: false,
        codeBlock: false,
        document: false,
        dropcursor: false,
        gapcursor: false,
        hardBreak: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        listItem: false,
        orderedList: false,
        paragraph: false,
        strike: false,
      }),
      JsonDocumentNode,
      JsonObjectNode,
      JsonPropertyNode,
      JsonNameNode,
      JsonArrayNode,
      JsonStringNode,
      JsonNumberNode,
      JsonBooleanNode,
      JsonNullNode,
      SearchExtension,
    ],
  })
  if (onUpdate) {
    editorListeners.set(editor, onUpdate)
    editor.on('transaction', ({ editor: updated, transaction }) => {
      if (transaction.docChanged && !transaction.getMeta(JSON_MUTATION_META)) onUpdate(updated)
    })
  }
  editorFormats.set(editor, document.format)
  return editor
}

export function parseJsonBytes(bytes: Uint8Array): JsonParseResult {
  if (bytes.byteLength > JSON_LIMITS.maxDocumentBytes) return preserve(bytes, 'document-bytes')
  const bom = hasBom(bytes)
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(bom ? 3 : 0))
  } catch {
    return preserve(bytes, 'invalid-utf8')
  }
  const parser = new JsonParser(text)
  try {
    const root = parser.parse()
    return {
      document: {
        edited: false,
        format: detectFormat(text, bom),
        originalBytes: bytes.slice(),
        root,
      },
      mode: 'editable',
    }
  } catch (error) {
    if (!(error instanceof JsonParseFailure)) throw error
    return {
      bytes: bytes.slice(),
      ...(error.reason === 'malformed' ? { location: sourceLocation(text, error.index) } : {}),
      mode: 'preserve',
      reason: error.reason,
    }
  }
}

export function serializeJsonDocument(document: JsonDocument): Uint8Array {
  if (!document.edited) return document.originalBytes.slice()
  const newline = newlineText(document.format.newline)
  const body = serializeValue(document.root, 0, document.format.indent, newline)
    + (document.format.terminalSeparator ? newline : '')
  const encoded = encoder.encode(body)
  if (!document.format.bom) return encoded
  const bytes = new Uint8Array(encoded.byteLength + 3)
  bytes.set([0xef, 0xbb, 0xbf])
  bytes.set(encoded, 3)
  return bytes
}

export function jsonRootFromEditor(editor: Editor): JsonValue {
  return jsonRootFromNode(editor.state.doc)
}

export function jsonValueEqual(left: JsonValue, right: JsonValue): boolean {
  if (left.type !== right.type) return false
  switch (left.type) {
    case 'object': {
      const other = right as JsonObject
      return left.properties.length === other.properties.length && left.properties.every((property, index) => {
        const candidate = other.properties[index]
        return candidate !== undefined && property.name === candidate.name && jsonValueEqual(property.value, candidate.value)
      })
    }
    case 'array': {
      const other = right as JsonArray
      return left.items.length === other.items.length && left.items.every((item, index) => (
        other.items[index] !== undefined && jsonValueEqual(item, other.items[index]!)
      ))
    }
    case 'string': return left.value === (right as JsonString).value
    case 'number': return left.lexeme === (right as JsonNumber).lexeme
    case 'boolean': return left.value === (right as JsonBoolean).value
    case 'null': return true
  }
}

export function validateJsonDocument(root: JsonValue, format: JsonFormat): JsonValidation {
  let units = 0
  let failure: JsonValidation | undefined
  const visit = (value: JsonValue, depth: number): void => {
    if (failure) return
    units += 1
    if (units > JSON_LIMITS.maxTotalUnits) {
      failure = { ok: false, reason: 'total-units' }
      return
    }
    if ((value.type === 'object' || value.type === 'array') && depth > JSON_LIMITS.maxDepth) {
      failure = { ok: false, reason: 'depth' }
      return
    }
    if (value.type === 'string' && tokenBytes(JSON.stringify(value.value)) > JSON_LIMITS.maxTokenBytes) {
      failure = { ok: false, reason: 'token-bytes' }
      return
    }
    if (value.type === 'number' && (!NUMBER_PATTERN.test(value.lexeme) || tokenBytes(value.lexeme) > JSON_LIMITS.maxTokenBytes)) {
      failure = { ok: false, reason: 'token-bytes' }
      return
    }
    if (value.type === 'object') {
      for (const property of value.properties) {
        units += 1
        if (units > JSON_LIMITS.maxTotalUnits || tokenBytes(JSON.stringify(property.name)) > JSON_LIMITS.maxTokenBytes) {
          failure = { ok: false, reason: units > JSON_LIMITS.maxTotalUnits ? 'total-units' : 'token-bytes' }
          return
        }
        visit(property.value, depth + 1)
      }
    } else if (value.type === 'array') {
      for (const item of value.items) visit(item, depth + 1)
    }
  }
  visit(root, 1)
  if (failure) return failure
  const bytes = serializeJsonDocument({
    edited: true,
    format,
    originalBytes: new Uint8Array(),
    root,
  })
  return bytes.byteLength > JSON_LIMITS.maxDocumentBytes
    ? { ok: false, reason: 'document-bytes' }
    : { ok: true }
}

export function isValidJsonNumber(value: string): boolean {
  return NUMBER_PATTERN.test(value) && tokenBytes(value) <= JSON_LIMITS.maxTokenBytes
}

export function jsonPreservationMessage(
  reason: JsonPreservationReason,
  location?: { readonly column: number; readonly line: number },
): string {
  switch (reason) {
    case 'document-bytes': return 'JSON exceeds the 10 MiB editable document limit.'
    case 'depth': return 'JSON exceeds the 512-container-depth limit.'
    case 'invalid-utf8': return 'JSON is not valid UTF-8.'
    case 'malformed': return `JSON is malformed${location ? ` at line ${location.line}, column ${location.column}` : ''}.`
    case 'token-bytes': return 'A JSON property name, string, or number exceeds the 1 MiB token limit.'
    case 'total-units': return 'JSON exceeds the 100,000-value-and-property-name limit.'
  }
}

export function renameJsonProperty(editor: Editor, propertyId: string, name: string): JsonValidation {
  const found = findNode(editor.state.doc, propertyId)
  if (!found || found.node.type.name !== 'jsonProperty') return { ok: true }
  const nameNode = editor.schema.nodes.jsonName?.create(undefined, name ? editor.schema.text(name) : undefined)
  if (!nameNode) return { ok: true }
  const transaction = editor.state.tr.replaceWith(found.pos + 1, found.pos + 1 + found.node.child(0).nodeSize, nameNode)
  return dispatchJsonMutation(editor, transaction)
}

export function replaceJsonValue(editor: Editor, valueId: string, value: JsonValue): JsonValidation {
  const found = findNode(editor.state.doc, valueId)
  if (!found || !found.node.type.isInGroup('jsonValue')) return { ok: true }
  const replacement = editor.schema.nodeFromJSON(jsonValueToContent(value))
  return dispatchJsonMutation(editor, editor.state.tr.replaceWith(found.pos, found.pos + found.node.nodeSize, replacement))
}

export function addJsonProperty(editor: Editor, objectId: string): { readonly id?: string; readonly validation: JsonValidation } {
  const found = findNode(editor.state.doc, objectId)
  if (!found || found.node.type.name !== 'jsonObject') return { validation: { ok: true } }
  const id = nextJsonId()
  const property: JsonProperty = { id, name: '', value: { id: nextJsonId(), type: 'null' } }
  const node = editor.schema.nodeFromJSON(jsonPropertyToContent(property))
  return {
    id,
    validation: dispatchJsonMutation(editor, editor.state.tr.insert(found.pos + found.node.nodeSize - 1, node)),
  }
}

export function addJsonItem(editor: Editor, arrayId: string): { readonly id?: string; readonly validation: JsonValidation } {
  const found = findNode(editor.state.doc, arrayId)
  if (!found || found.node.type.name !== 'jsonArray') return { validation: { ok: true } }
  const id = nextJsonId()
  const node = editor.schema.nodeFromJSON(jsonValueToContent({ id, type: 'null' }))
  return {
    id,
    validation: dispatchJsonMutation(editor, editor.state.tr.insert(found.pos + found.node.nodeSize - 1, node)),
  }
}

export function insertJsonItem(editor: Editor, itemId: string, after: boolean): { readonly id?: string; readonly validation: JsonValidation } {
  const found = findNode(editor.state.doc, itemId)
  if (!found || found.parent.type.name !== 'jsonArray') return { validation: { ok: true } }
  const id = nextJsonId()
  const node = editor.schema.nodeFromJSON(jsonValueToContent({ id, type: 'null' }))
  return {
    id,
    validation: dispatchJsonMutation(editor, editor.state.tr.insert(found.pos + (after ? found.node.nodeSize : 0), node)),
  }
}

export function deleteJsonNode(editor: Editor, id: string): JsonValidation {
  const found = findNode(editor.state.doc, id)
  if (!found || found.parent.type.name === 'doc') return { ok: true }
  return dispatchJsonMutation(editor, editor.state.tr.delete(found.pos, found.pos + found.node.nodeSize))
}

function dispatchJsonMutation(editor: Editor, transaction: Transaction): JsonValidation {
  const root = jsonRootFromNode(transaction.doc)
  const validation = validateJsonDocument(root, editorFormats.get(editor) ?? createEmptyJsonDocument().format)
  if (!validation.ok) return validation
  editor.view.dispatch(closeHistory(transaction).setMeta(JSON_MUTATION_META, true))
  editorListeners.get(editor)?.(editor)
  return validation
}

function jsonRootFromNode(document: ProseMirrorNode): JsonValue {
  return valueFromNode(document.child(0))
}

function valueFromNode(node: ProseMirrorNode): JsonValue {
  const id = String(node.attrs.id)
  switch (node.type.name) {
    case 'jsonObject':
      return {
        id,
        properties: Array.from({ length: node.childCount }, (_, index) => {
          const property = node.child(index)
          return {
            id: String(property.attrs.id),
            name: property.child(0).textContent,
            value: valueFromNode(property.child(1)),
          }
        }),
        type: 'object',
      }
    case 'jsonArray':
      return {
        id,
        items: Array.from({ length: node.childCount }, (_, index) => valueFromNode(node.child(index))),
        type: 'array',
      }
    case 'jsonString': return { id, type: 'string', value: node.textContent }
    case 'jsonNumber': return { id, lexeme: node.textContent, type: 'number' }
    case 'jsonBoolean': return { id, type: 'boolean', value: node.textContent === 'true' }
    default: return { id, type: 'null' }
  }
}

function jsonValueToContent(value: JsonValue, top = false): JSONContent {
  const content = value.type === 'object'
    ? value.properties.map(jsonPropertyToContent)
    : value.type === 'array'
      ? value.items.map((item) => jsonValueToContent(item))
      : scalarContent(value)
  const node = {
    attrs: { id: value.id },
    ...(Array.isArray(content) && content.length > 0 ? { content } : {}),
    type: `json${value.type[0]!.toUpperCase()}${value.type.slice(1)}`,
  }
  return top ? { content: [node], type: 'doc' } : node
}

function jsonPropertyToContent(property: JsonProperty): JSONContent {
  return {
    attrs: { id: property.id },
    content: [
      { ...(property.name ? { content: [{ text: property.name, type: 'text' }] } : {}), type: 'jsonName' },
      jsonValueToContent(property.value),
    ],
    type: 'jsonProperty',
  }
}

function scalarContent(value: Exclude<JsonValue, JsonArray | JsonObject>): JSONContent[] {
  const text = value.type === 'string'
    ? value.value
    : value.type === 'number'
      ? value.lexeme
      : value.type === 'boolean'
        ? String(value.value)
        : 'null'
  return text ? [{ text, type: 'text' }] : []
}

function findNode(document: ProseMirrorNode, id: string):
  | { readonly node: ProseMirrorNode; readonly parent: ProseMirrorNode; readonly pos: number }
  | undefined {
  let found: { readonly node: ProseMirrorNode; readonly parent: ProseMirrorNode; readonly pos: number } | undefined
  document.descendants((node, pos, parent) => {
    if (node.attrs.id !== id || !parent) return true
    found = { node, parent, pos }
    return false
  })
  return found
}

class JsonParseFailure extends Error {
  constructor(readonly reason: JsonPreservationReason, readonly index: number) {
    super(reason)
  }
}

class JsonParser {
  #index = 0
  #sequence = 0
  #units = 0

  constructor(readonly source: string) {}

  parse(): JsonValue {
    this.#skipWhitespace()
    if (this.#index === this.source.length) this.#fail('malformed')
    const value = this.#parseValue(1)
    this.#skipWhitespace()
    if (this.#index !== this.source.length) this.#fail('malformed')
    return value
  }

  #parseValue(depth: number): JsonValue {
    this.#skipWhitespace()
    this.#unit()
    const character = this.source[this.#index]
    if (character === '{') return this.#parseObject(depth)
    if (character === '[') return this.#parseArray(depth)
    if (character === '"') return { id: this.#id(), type: 'string', value: this.#parseString() }
    if (character === 't') {
      this.#literal('true')
      return { id: this.#id(), type: 'boolean', value: true }
    }
    if (character === 'f') {
      this.#literal('false')
      return { id: this.#id(), type: 'boolean', value: false }
    }
    if (character === 'n') {
      this.#literal('null')
      return { id: this.#id(), type: 'null' }
    }
    return this.#parseNumber()
  }

  #parseObject(depth: number): JsonObject {
    if (depth > JSON_LIMITS.maxDepth) this.#fail('depth')
    const id = this.#id()
    this.#index += 1
    this.#skipWhitespace()
    const properties: JsonProperty[] = []
    if (this.source[this.#index] === '}') {
      this.#index += 1
      return { id, properties, type: 'object' }
    }
    while (this.#index < this.source.length) {
      if (this.source[this.#index] !== '"') this.#fail('malformed')
      const name = this.#parseString()
      this.#unit()
      this.#skipWhitespace()
      if (this.source[this.#index] !== ':') this.#fail('malformed')
      this.#index += 1
      const property: JsonProperty = { id: this.#id(), name, value: this.#parseValue(depth + 1) }
      properties.push(property)
      this.#skipWhitespace()
      if (this.source[this.#index] === '}') {
        this.#index += 1
        return { id, properties, type: 'object' }
      }
      if (this.source[this.#index] !== ',') this.#fail('malformed')
      this.#index += 1
      this.#skipWhitespace()
    }
    this.#fail('malformed')
  }

  #parseArray(depth: number): JsonArray {
    if (depth > JSON_LIMITS.maxDepth) this.#fail('depth')
    const id = this.#id()
    this.#index += 1
    this.#skipWhitespace()
    const items: JsonValue[] = []
    if (this.source[this.#index] === ']') {
      this.#index += 1
      return { id, items, type: 'array' }
    }
    while (this.#index < this.source.length) {
      items.push(this.#parseValue(depth + 1))
      this.#skipWhitespace()
      if (this.source[this.#index] === ']') {
        this.#index += 1
        return { id, items, type: 'array' }
      }
      if (this.source[this.#index] !== ',') this.#fail('malformed')
      this.#index += 1
      this.#skipWhitespace()
    }
    this.#fail('malformed')
  }

  #parseString(): string {
    const start = this.#index
    this.#index += 1
    let value = ''
    while (this.#index < this.source.length) {
      const character = this.source[this.#index]!
      if (character === '"') {
        this.#index += 1
        if (tokenBytes(this.source.slice(start, this.#index)) > JSON_LIMITS.maxTokenBytes) this.#fail('token-bytes', start)
        return value
      }
      if (character.codePointAt(0)! < 0x20) this.#fail('malformed')
      if (character !== '\\') {
        value += character
        this.#index += 1
        continue
      }
      const escaped = this.source[this.#index + 1]
      if (escaped === undefined) this.#fail('malformed')
      const simple: Readonly<Record<string, string>> = {
        '"': '"',
        '/': '/',
        '\\': '\\',
        b: '\b',
        f: '\f',
        n: '\n',
        r: '\r',
        t: '\t',
      }
      if (escaped === 'u') {
        const digits = this.source.slice(this.#index + 2, this.#index + 6)
        if (!/^[0-9a-fA-F]{4}$/.test(digits)) this.#fail('malformed')
        value += String.fromCharCode(Number.parseInt(digits, 16))
        this.#index += 6
      } else if (simple[escaped] !== undefined) {
        value += simple[escaped]
        this.#index += 2
      } else {
        this.#fail('malformed')
      }
    }
    this.#fail('malformed')
  }

  #parseNumber(): JsonNumber {
    const start = this.#index
    const match = this.source.slice(start).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/)
    if (!match?.[0]) this.#fail('malformed')
    const lexeme = match[0]
    this.#index += lexeme.length
    if (tokenBytes(lexeme) > JSON_LIMITS.maxTokenBytes) this.#fail('token-bytes', start)
    return { id: this.#id(), lexeme, type: 'number' }
  }

  #literal(value: string): void {
    if (this.source.slice(this.#index, this.#index + value.length) !== value) this.#fail('malformed')
    this.#index += value.length
  }

  #skipWhitespace(): void {
    while (/[\t\n\r ]/.test(this.source[this.#index] ?? '')) this.#index += 1
  }

  #unit(): void {
    this.#units += 1
    if (this.#units > JSON_LIMITS.maxTotalUnits) this.#fail('total-units')
  }

  #id(): string {
    this.#sequence += 1
    return `json-${this.#sequence}`
  }

  #fail(reason: JsonPreservationReason, index = this.#index): never {
    throw new JsonParseFailure(reason, index)
  }
}

function serializeValue(value: JsonValue, depth: number, indent: string, newline: string): string {
  switch (value.type) {
    case 'object':
      if (value.properties.length === 0) return '{}'
      return `{${newline}${value.properties.map((property) => (
        `${indent.repeat(depth + 1)}${JSON.stringify(property.name)}: ${serializeValue(property.value, depth + 1, indent, newline)}`
      )).join(`,${newline}`)}${newline}${indent.repeat(depth)}}`
    case 'array':
      if (value.items.length === 0) return '[]'
      return `[${newline}${value.items.map((item) => (
        `${indent.repeat(depth + 1)}${serializeValue(item, depth + 1, indent, newline)}`
      )).join(`,${newline}`)}${newline}${indent.repeat(depth)}]`
    case 'string': return JSON.stringify(value.value)
    case 'number': return value.lexeme
    case 'boolean': return String(value.value)
    case 'null': return 'null'
  }
}

function detectFormat(source: string, bom: boolean): JsonFormat {
  const encountered: JsonNewline[] = []
  const counts: Record<JsonNewline, number> = { cr: 0, crlf: 0, lf: 0 }
  let quoted = false
  let escaped = false
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index]!
    if (quoted) {
      if (escaped) escaped = false
      else if (character === '\\') escaped = true
      else if (character === '"') quoted = false
      continue
    }
    if (character === '"') {
      quoted = true
      continue
    }
    if (character !== '\r' && character !== '\n') continue
    const newline: JsonNewline = character === '\r' && source[index + 1] === '\n' ? 'crlf' : character === '\r' ? 'cr' : 'lf'
    if (newline === 'crlf') index += 1
    counts[newline] += 1
    if (!encountered.includes(newline)) encountered.push(newline)
  }
  const order: JsonNewline[] = [...encountered, ...(['lf', 'crlf', 'cr'] as const).filter((value) => !encountered.includes(value))]
  const newline = [...order].sort((left, right) => counts[right] - counts[left] || order.indexOf(left) - order.indexOf(right))[0]!
  return {
    bom,
    indent: detectIndent(source),
    newline,
    terminalSeparator: /(?:\r\n|\r|\n)$/.test(source),
  }
}

function detectIndent(source: string): string {
  const lines = source.split(/\r\n|\r|\n/)
  let previous = ''
  let candidate: string | undefined
  for (const line of lines) {
    if (!line.trim()) continue
    const prefix = line.match(/^[\t ]*/)?.[0] ?? ''
    if (prefix.length > previous.length && prefix.startsWith(previous)) {
      const delta = prefix.slice(previous.length)
      const valid = delta === '\t' || (/^ {1,8}$/.test(delta))
      if (!valid || (candidate !== undefined && candidate !== delta)) return '  '
      candidate = delta
    }
    previous = prefix
  }
  return candidate ?? '  '
}

function sourceLocation(source: string, target: number): { readonly column: number; readonly line: number } {
  let column = 1
  let line = 1
  for (let index = 0; index < target;) {
    const character = source[index]!
    if (character === '\r' || character === '\n') {
      if (character === '\r' && source[index + 1] === '\n') index += 1
      line += 1
      column = 1
      index += 1
      continue
    }
    const codePoint = character.codePointAt(0)!
    index += codePoint > 0xffff ? 2 : 1
    column += 1
  }
  return { column, line }
}

function tokenBytes(value: string): number {
  return encoder.encode(value).byteLength
}

function newlineText(value: JsonNewline): string {
  return value === 'crlf' ? '\r\n' : value === 'cr' ? '\r' : '\n'
}

function hasBom(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
}

function preserve(bytes: Uint8Array, reason: JsonPreservationReason): JsonParseResult {
  return { bytes: bytes.slice(), mode: 'preserve', reason }
}

let generatedId = 1_000_000
function nextJsonId(): string {
  generatedId += 1
  return `json-${generatedId}`
}
