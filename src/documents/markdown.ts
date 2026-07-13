import { Node, type Extensions, type JSONContent, type MarkdownRendererHelpers, type MarkdownToken } from '@tiptap/core'
import Link from '@tiptap/extension-link'
import { Table, TableCell, TableHeader, TableRow } from '@tiptap/extension-table'
import TaskItem from '@tiptap/extension-task-item'
import TaskList from '@tiptap/extension-task-list'
import { Markdown, MarkdownManager } from '@tiptap/markdown'
import StarterKit from '@tiptap/starter-kit'
import { SearchExtension } from '../search/search'

export type RichDocument = {
  readonly attrs?: Readonly<Record<string, unknown>>
  readonly content: readonly RichNode[]
  readonly type: 'doc'
}

export type RichNode = {
  readonly attrs?: Readonly<Record<string, unknown>>
  readonly content?: readonly RichNode[]
  readonly marks?: readonly RichNode[]
  readonly text?: string
  readonly type: string
}

export type DocumentEncoding = {
  readonly bom: boolean
  readonly newline: 'lf' | 'crlf'
}

export type ParsedDocument =
  | { readonly bytes: Uint8Array; readonly escaped: string; readonly mode: 'preserve-bytes' }
  | { readonly bytes: Uint8Array; readonly mode: 'preserve-text'; readonly reason: 'unsupported-or-ambiguous'; readonly text: string }
  | { readonly document: RichDocument; readonly encoding: DocumentEncoding; readonly mode: 'rich' }

const InertImage = Node.create({
  name: 'image',
  inline: true,
  group: 'inline',
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      alt: { default: '' },
      src: { default: '' },
      title: { default: null },
    }
  },
  parseHTML() {
    return []
  },
  renderHTML({ node }) {
    const alt = typeof node.attrs.alt === 'string' ? node.attrs.alt : ''
    return ['span', { 'aria-label': alt || 'Image', 'data-markzen-image': '', role: 'img' }, alt || 'Image']
  },
  markdownTokenName: 'image',
  parseMarkdown(token: MarkdownToken) {
    return {
      attrs: {
        alt: typeof token.text === 'string' ? token.text : '',
        src: typeof token.href === 'string' ? token.href : '',
        title: typeof token.title === 'string' ? token.title : null,
      },
      type: 'image',
    }
  },
  renderMarkdown(node: JSONContent) {
    const alt = stringAttribute(node, 'alt')
    const src = escapeDestination(stringAttribute(node, 'src'))
    const title = stringAttribute(node, 'title')
    return `![${alt}](${src}${title ? ` "${title.replaceAll('"', '\\"')}"` : ''})`
  },
})

const Opaque = Node.create({
  name: 'opaque',
  group: 'block',
  atom: true,
  selectable: true,
  addAttributes() {
    return { source: { default: '' } }
  },
  parseHTML() {
    return []
  },
  renderHTML({ node }) {
    return ['pre', { 'data-markzen-opaque': '' }, ['code', {}, stringAttribute(node.toJSON(), 'source')]]
  },
  renderMarkdown(node: JSONContent) {
    return stringAttribute(node, 'source')
  },
})

const InertLink = Link.extend({
  renderHTML({ HTMLAttributes }) {
    const href = typeof HTMLAttributes.href === 'string' ? HTMLAttributes.href : ''
    const title = typeof HTMLAttributes.title === 'string' ? HTMLAttributes.title : undefined
    return ['span', {
      'aria-label': `Link to ${href}`,
      'data-href': href,
      'data-markzen-link': '',
      'data-testid': 'rich-link',
      ...(title ? { title } : {}),
      role: 'link',
      tabindex: '0',
    }, 0]
  },
}).configure({ autolink: false, linkOnPaste: false, openOnClick: false })

const CanonicalTable = Table.extend({
  renderMarkdown(node: JSONContent, helpers: MarkdownRendererHelpers) {
    const rows = node.content ?? []
    if (rows.length === 0) return ''
    const lines = rows.map((row) => `| ${(row.content ?? []).map((cell) => cellText(cell, helpers)).join(' | ')} |`)
    const header = rows[0]?.content ?? []
    const delimiter = `| ${header.map((cell) => alignmentDelimiter(cell)).join(' | ')} |`
    return [lines[0] ?? '', delimiter, ...lines.slice(1)].join('\n')
  },
})

const baseExtensions = (): Extensions => [
  StarterKit.configure({ link: false }),
  InertLink,
  TaskList,
  TaskItem.configure({ nested: true }),
  CanonicalTable,
  TableRow,
  TableHeader,
  TableCell,
  InertImage,
  Opaque,
]

const manager = new MarkdownManager({
  extensions: baseExtensions(),
  indentation: { size: 4, style: 'space' },
  markedOptions: { gfm: true },
})

export function createDocumentExtensions(): Extensions {
  return [
    ...baseExtensions(),
    SearchExtension,
    Markdown.configure({ indentation: { size: 4, style: 'space' }, markedOptions: { gfm: true } }),
  ]
}

export function parseDocumentBytes(input: Uint8Array): ParsedDocument {
  const bytes = input.slice()
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  const encoded = bom ? bytes.slice(3) : bytes
  let text: string
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(encoded)
  } catch {
    return { bytes, escaped: escapeBytes(bytes), mode: 'preserve-bytes' }
  }
  if (ambiguousUnsupported(text)) return { bytes, mode: 'preserve-text', reason: 'unsupported-or-ambiguous', text }
  if (text.length > 0 && !text.includes('\n') && !text.includes('\r') && ![..."\\`*_~[]<>#!|"].some((value) => text.includes(value))) {
    return {
      document: { content: [{ content: [{ text, type: 'text' }], type: 'paragraph' }], type: 'doc' },
      encoding: { bom, newline: 'lf' },
      mode: 'rich',
    }
  }
  let tokens: MarkdownToken[]
  try {
    tokens = manager.instance.lexer(text) as MarkdownToken[]
  } catch {
    return { bytes, mode: 'preserve-text', reason: 'unsupported-or-ambiguous', text }
  }
  if (tokens.map((token) => token.raw ?? '').join('') !== text) {
    return { bytes, mode: 'preserve-text', reason: 'unsupported-or-ambiguous', text }
  }
  const content: RichNode[] = []
  for (const token of tokens) {
    const raw = token.raw ?? ''
    if (token.type === 'html') {
      content.push({ attrs: { source: raw }, type: 'opaque' })
      continue
    }
    const parsed = normalizeDocument(manager.parse(raw))
    content.push(...parsed.content.filter((node) => node.type !== 'paragraph' || (node.content?.length ?? 0) > 0))
  }
  return {
    document: { content, type: 'doc' },
    encoding: { bom, newline: detectNewline(text) },
    mode: 'rich',
  }
}

export function serializeRichDocument(document: RichDocument, encoding: DocumentEncoding): Uint8Array {
  if (document.content.length === 0) return new Uint8Array()
  const opaque: Array<{ source: string; token: string }> = []
  const prepared = mapNode(document, (node) => {
    if (node.type !== 'opaque') return denormalizeNode(node)
    const token = `MARKZENOPAQUE${opaque.length}TOKEN`
    opaque.push({ source: stringAttribute(node, 'source'), token })
    return { attrs: { source: token }, type: 'opaque' }
  }) as RichDocument
  let markdown = manager.serialize(prepared as JSONContent).replace(/\n{3,}/g, '\n\n')
  for (const entry of opaque) {
    markdown = entry.source.endsWith('\n')
      ? markdown.replace(`${entry.token}\n\n`, entry.source).replace(entry.token, entry.source)
      : markdown.replace(entry.token, entry.source)
  }
  if (markdown.length > 0 && !markdown.endsWith('\n')) markdown += '\n'
  return applyDocumentEncoding(markdown, encoding)
}

export function applyDocumentEncoding(markdown: string, encoding: DocumentEncoding): Uint8Array {
  const normalized = markdown.replaceAll('\r\n', '\n').replaceAll('\r', '\n')
  const text = encoding.newline === 'crlf' ? normalized.replaceAll('\n', '\r\n') : normalized
  const encoded = new TextEncoder().encode(text)
  if (!encoding.bom) return encoded
  const bytes = new Uint8Array(encoded.byteLength + 3)
  bytes.set([0xef, 0xbb, 0xbf])
  bytes.set(encoded, 3)
  return bytes
}

function normalizeDocument(value: JSONContent): RichDocument {
  const normalized = normalizeNode(value)
  return { content: normalized.content ?? [], type: 'doc' }
}

function normalizeNode(value: JSONContent): RichNode {
  const node: { attrs?: Record<string, unknown>; content?: RichNode[]; marks?: RichNode[]; text?: string; type: string } = {
    type: value.type ?? 'text',
  }
  if (value.text !== undefined) node.text = value.text
  if (value.content) node.content = value.content.map(normalizeNode)
  if (value.marks) node.marks = value.marks.map(normalizeNode).sort((a, b) => markRank(a.type) - markRank(b.type))
  const attrs = normalizeAttributes(node.type, value.attrs)
  if (attrs && Object.keys(attrs).length > 0) node.attrs = attrs
  return node
}

function denormalizeNode(value: RichNode): RichNode {
  const content = value.content?.map(denormalizeNode)
  const marks = value.marks?.map(denormalizeNode)
  if ((value.type === 'tableCell' || value.type === 'tableHeader') && value.attrs?.alignment) {
    return { ...value, attrs: { align: value.attrs.alignment }, ...(content ? { content } : {}), ...(marks ? { marks } : {}) }
  }
  return { ...value, ...(content ? { content } : {}), ...(marks ? { marks } : {}) }
}

function normalizeAttributes(type: string, attrs: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!attrs) return undefined
  if (type === 'heading') return { level: attrs.level }
  if (type === 'codeBlock') return attrs.language ? { language: attrs.language } : undefined
  if (type === 'taskItem') return { checked: attrs.checked === true }
  if (type === 'tableCell' || type === 'tableHeader') return { alignment: attrs.align ?? null }
  if (type === 'link') return { href: attrs.href, ...(attrs.title ? { title: attrs.title } : {}) }
  if (type === 'image') return { alt: attrs.alt ?? '', src: attrs.src ?? '', ...(attrs.title ? { title: attrs.title } : {}) }
  if (type === 'orderedList' && attrs.start !== 1) return { start: attrs.start }
  return undefined
}

function mapNode(value: RichNode, visit: (node: RichNode) => RichNode): RichNode {
  const children = value.content?.map((child) => mapNode(child, visit))
  const marks = value.marks?.map((mark) => mapNode(mark, visit))
  return visit({ ...value, ...(children ? { content: children } : {}), ...(marks ? { marks } : {}) })
}

function detectNewline(value: string): 'lf' | 'crlf' {
  const sequences = value.match(/\r\n|\n/g) ?? []
  const crlf = sequences.filter((sequence) => sequence === '\r\n').length
  const lf = sequences.length - crlf
  if (crlf === lf) return sequences[0] === '\r\n' ? 'crlf' : 'lf'
  return crlf > lf ? 'crlf' : 'lf'
}

function escapeBytes(bytes: Uint8Array): string {
  let result = ''
  for (const byte of bytes) result += byte >= 0x20 && byte <= 0x7e ? String.fromCharCode(byte) : `\\x${byte.toString(16).toUpperCase().padStart(2, '0')}`
  return result
}

function ambiguousUnsupported(value: string): boolean {
  return /\[\^[^\]]+\]/.test(value) || /^---\s*\n[\s\S]*?\n---\s*$/m.test(value) || /^\$\$?/m.test(value)
}

function markRank(type: string): number {
  return ['bold', 'italic', 'strike', 'code', 'link'].indexOf(type)
}

function stringAttribute(node: JSONContent | RichNode, name: string): string {
  const value = node.attrs?.[name]
  return typeof value === 'string' ? value : ''
}

function escapeDestination(value: string): string {
  return /[\s()]/.test(value) ? `<${value.replaceAll('>', '\\>')}>` : value
}

function cellText(cell: JSONContent, helpers: MarkdownRendererHelpers): string {
  return helpers.renderChildren(cell.content ?? []).replace(/\s+/g, ' ').trim()
}

function alignmentDelimiter(cell: JSONContent): string {
  const alignment = cell.attrs?.align
  if (alignment === 'left') return ':---'
  if (alignment === 'center') return ':---:'
  if (alignment === 'right') return '---:'
  return '---'
}
