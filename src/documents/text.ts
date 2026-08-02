export const TEXT_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
export const TEXT_MAX_LINES = 200_000
export const TEXT_LINE_MAX_BYTES = 1024 * 1024

export interface TextDocument {
  readonly edited: boolean
  readonly encoding: {
    readonly bom: boolean
    readonly newline: 'crlf' | 'lf'
  }
  readonly originalBytes: Uint8Array
  readonly text: string
}

export type TextParseResult =
  | { readonly mode: 'editable'; readonly document: TextDocument }
  | { readonly mode: 'preserve'; readonly bytes: Uint8Array; readonly reason: 'document-bytes' | 'encoding' | 'line-bytes' | 'lines' }

export type TextBoundsResult =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: 'document-bytes' | 'line-bytes' | 'lines' }

const encoder = new TextEncoder()

export function parseTextBytes(bytes: Uint8Array): TextParseResult {
  if (bytes.byteLength > TEXT_DOCUMENT_MAX_BYTES) return { bytes, mode: 'preserve', reason: 'document-bytes' }
  const bom = bytes.length >= 3 && bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf
  let decoded: string
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(bom ? bytes.subarray(3) : bytes)
  } catch {
    return { bytes, mode: 'preserve', reason: 'encoding' }
  }
  const newline = dominantNewline(decoded)
  const text = decoded.replaceAll('\r\n', '\n')
  const bounds = checkTextBounds(text)
  if (!bounds.ok) return { bytes, mode: 'preserve', reason: bounds.reason }
  return {
    document: { edited: false, encoding: { bom, newline }, originalBytes: bytes, text },
    mode: 'editable',
  }
}

export function checkTextBounds(text: string): TextBoundsResult {
  const bytes = encoder.encode(text)
  if (bytes.byteLength > TEXT_DOCUMENT_MAX_BYTES) return { ok: false, reason: 'document-bytes' }
  const lines = text.split('\n')
  if (lines.length > TEXT_MAX_LINES) return { ok: false, reason: 'lines' }
  for (const line of lines) {
    if (encoder.encode(line).byteLength > TEXT_LINE_MAX_BYTES) return { ok: false, reason: 'line-bytes' }
  }
  return { ok: true }
}

export function serializeTextDocument(document: TextDocument): Uint8Array {
  if (!document.edited) return document.originalBytes
  const body = document.encoding.newline === 'crlf'
    ? document.text.replaceAll('\n', '\r\n')
    : document.text
  const encoded = encoder.encode(body)
  if (!document.encoding.bom) return encoded
  const result = new Uint8Array(encoded.byteLength + 3)
  result.set([0xef, 0xbb, 0xbf])
  result.set(encoded, 3)
  return result
}

function dominantNewline(text: string): 'crlf' | 'lf' {
  let crlf = 0
  let lf = 0
  let first: 'crlf' | 'lf' | undefined
  for (let index = 0; index < text.length; index += 1) {
    if (text[index] !== '\n') continue
    const kind = index > 0 && text[index - 1] === '\r' ? 'crlf' : 'lf'
    first ??= kind
    if (kind === 'crlf') crlf += 1
    else lf += 1
  }
  if (crlf === lf) return first ?? 'lf'
  return crlf > lf ? 'crlf' : 'lf'
}

export function createTextEditor(
  document: TextDocument,
  onUpdate?: (editor: Editor) => void,
  onRejected?: (reason: TextBoundsResult & { readonly ok: false }) => void,
): Editor {
  const bounds = Extension.create({
    name: 'textDocumentBounds',
    addProseMirrorPlugins: () => [new Plugin({
      filterTransaction: (transaction) => {
        if (!transaction.docChanged) return true
        const result = checkTextBounds(transaction.doc.textContent)
        if (!result.ok) onRejected?.(result)
        return result.ok
      },
    })],
  })
  return new Editor({
    content: textJson(document.text),
    editorProps: {
      attributes: {
        'aria-label': 'Text document editor',
        'data-testid': 'text-editor-content',
        role: 'textbox',
        spellcheck: 'false',
      },
    },
    extensions: [
      StarterKit.configure({
        blockquote: false,
        bold: false,
        bulletList: false,
        code: false,
        hardBreak: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        listItem: false,
        orderedList: false,
        paragraph: false,
        strike: false,
      }),
      bounds,
      SearchExtension,
    ],
    onUpdate: ({ editor }) => onUpdate?.(editor),
  })
}

export function textFromEditor(editor: Editor): string {
  return editor.state.doc.textContent
}

function textJson(text: string): JSONContent {
  return {
    content: [{
      ...(text ? { content: [{ text, type: 'text' }] } : {}),
      type: 'codeBlock',
    }],
    type: 'doc',
  }
}
import { Editor, Extension, type JSONContent } from '@tiptap/core'
import { Plugin } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'

import { SearchExtension } from '../search/search'
