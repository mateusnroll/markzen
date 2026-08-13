import { Editor, Extension, type JSONContent } from '@tiptap/core'
import CodeBlockLowlight from '@tiptap/extension-code-block-lowlight'
import { Plugin } from '@tiptap/pm/state'
import StarterKit from '@tiptap/starter-kit'
import { common, createLowlight } from 'lowlight'

import { SearchExtension } from '../search/search'
import { grammarForLanguage } from './file-types'
import { checkTextBounds, type TextBoundsResult, type TextDocument } from './text'

const lowlight = createLowlight(common)

export function createTextEditor(
  document: TextDocument,
  language: string,
  onUpdate?: (editor: Editor) => void,
  onRejected?: (reason: TextBoundsResult & { readonly ok: false }) => void,
): Editor {
  const grammar = grammarForLanguage(language)
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
    content: textJson(document.text, grammar),
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
        ...(grammar ? { codeBlock: false } : {}),
        hardBreak: false,
        heading: false,
        horizontalRule: false,
        italic: false,
        listItem: false,
        orderedList: false,
        paragraph: false,
        strike: false,
      }),
      ...(grammar ? [CodeBlockLowlight.configure({ lowlight })] : []),
      bounds,
      SearchExtension,
    ],
    onUpdate: ({ editor }) => onUpdate?.(editor),
  })
}

export function textFromEditor(editor: Editor): string {
  return editor.state.doc.textContent
}

function textJson(text: string, grammar?: string): JSONContent {
  return {
    content: [{
      ...(text ? { content: [{ text, type: 'text' }] } : {}),
      ...(grammar ? { attrs: { language: grammar } } : {}),
      type: 'codeBlock',
    }],
    type: 'doc',
  }
}
