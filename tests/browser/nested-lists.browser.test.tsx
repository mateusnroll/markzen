import { Editor, type JSONContent } from '@tiptap/core'
import { createRoot, type Root } from 'react-dom/client'
import axe from 'axe-core'
import { afterEach, describe, expect, test } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { DocumentWorkspace, type DocumentSeed } from '../../src/app/DocumentWorkspace'
import { createDocumentExtensions } from '../../src/documents/markdown'
import { setEditorSearch } from '../../src/search/search'
import type { SaveInput, SaveOutcome } from '../../src/documents/gateway'
import { FakeDocumentGateway } from './document-gateway.fake'
import '../../src/app/shell.css'

let root: Root | undefined
const directEditors: Editor[] = []

afterEach(() => {
  root?.unmount()
  root = undefined
  for (const editor of directEditors) editor.destroy()
  directEditors.length = 0
  document.body.innerHTML = '<div id="test-root"></div>'
  document.documentElement.removeAttribute('dir')
})

describe('spec 0012 nested-list presentation', () => {
  test('AC1-AC10: nested guides and disclosure controls preserve list semantics and accessible pointer/keyboard behavior', async () => {
    const editor = createDirectEditor(nestedDocument())
    const changed: unknown[] = []
    editor.on('transaction', ({ transaction }) => { if (transaction.docChanged) changed.push(transaction.steps.map((step) => step.toJSON())) })
    const editable = editor.view.dom
    const nested = [...editable.querySelectorAll<HTMLElement>('[data-nested-list]')]
    const toggles = [...editable.querySelectorAll<HTMLButtonElement>('[data-testid="nested-list-toggle"]')]

    expect(nested).toHaveLength(4)
    expect(toggles).toHaveLength(3)
    expect(editable.querySelectorAll('li')).toHaveLength(7)
    expect(editable.querySelectorAll('input[type="checkbox"]')).toHaveLength(2)
    expect(editable.querySelector('li[data-nested-list-parent] > p')?.textContent).toBe('Parent')
    expect([...editable.querySelectorAll('li:not([data-nested-list-parent]) > p')].some((paragraph) => paragraph.textContent === 'Leaf')).toBe(true)
    expect(getComputedStyle(nested[0]!).borderInlineStartWidth).not.toBe('0px')

    const parentToggle = toggleFor(editable, 'Parent')
    const childToggle = toggleFor(editable, 'Child with branch')
    expect(parentToggle.getAttribute('aria-label')).toBe('Nested items')
    expect(parentToggle.getAttribute('aria-expanded')).toBe('true')
    expect(parentToggle.tabIndex).toBe(0)
    expect(parentToggle.closest('li')?.tagName).toBe('LI')

    editor.commands.setTextSelection(textPosition(editor, 'Parent'))
    editor.commands.focus()
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(parentToggle)

    await userEvent.click(childToggle)
    expect(changed).toEqual([])
    expect(toggleFor(editable, 'Child with branch').getAttribute('aria-expanded')).toBe('false')
    await userEvent.click(parentToggle)
    const collapsedParentAfterClick = toggleFor(editable, 'Parent')
    expect(collapsedParentAfterClick.getAttribute('aria-expanded')).toBe('false')
    expect(directChildLists(collapsedParentAfterClick).every((list) => list.hidden)).toBe(true)
    await userEvent.click(collapsedParentAfterClick)
    expect(toggleFor(editable, 'Child with branch').getAttribute('aria-expanded')).toBe('false')

    toggleFor(editable, 'Parent').focus()
    await userEvent.keyboard('{Space}')
    const collapsedParent = toggleFor(editable, 'Parent')
    expect(collapsedParent.getAttribute('aria-expanded')).toBe('false')
    expect(document.activeElement).toBe(collapsedParent)
    await userEvent.keyboard('{Enter}')
    expect(toggleFor(editable, 'Parent').getAttribute('aria-expanded')).toBe('true')

    document.documentElement.dir = 'rtl'
    expect(getComputedStyle(toggleFor(editable, 'Parent')).position).toBe('absolute')
    expect(getComputedStyle(toggleFor(editable, 'Parent')).transitionDuration).toBe('0s')
    const audit = await axe.run(document.body, { resultTypes: ['violations'] })
    expect(audit.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
  })

  test('AC11-AC16: collapse state is non-persistent editor state that maps, isolates, resets, and restores focus safely', async () => {
    const gateway = new CapturingGateway()
    await renderWorkspace(gateway, [nestedSeed('first', true), nestedSeed('second')])
    const firstToggle = toggleFor(workspaceEditor(), 'Parent')

    expect(page.getByTestId('document-tab').all()[0]!).toHaveAttribute('aria-label', 'Nested first, Preview')
    await userEvent.click(firstToggle)
    expect(page.getByTestId('document-tab').all()[0]!).toHaveAttribute('aria-label', 'Nested first, Preview')
    expect(toggleFor(workspaceEditor(), 'Parent').getAttribute('aria-expanded')).toBe('false')

    await userEvent.click(page.getByTestId('document-tab').all()[1]!)
    expect(toggleFor(workspaceEditor(), 'Parent').getAttribute('aria-expanded')).toBe('true')
    await userEvent.click(page.getByTestId('document-tab').all()[0]!)
    expect(toggleFor(workspaceEditor(), 'Parent').getAttribute('aria-expanded')).toBe('false')

    const parent = workspaceEditor().querySelector('p')!
    await userEvent.click(parent)
    await userEvent.keyboard('{End}!')
    await userEvent.click(toggleFor(workspaceEditor(), 'Parent!'))
    gateway.emitCommand('save')
    await frame()
    expect(gateway.saved?.document?.content?.[0]?.content?.[0]?.content?.some((node) => node.type === 'bulletList')).toBe(true)
    workspaceEditor().focus()
    await userEvent.keyboard(primaryShortcut('z'))
    expect(parent.textContent).toBe('Parent')

    rerender()
    await renderWorkspace(new FakeDocumentGateway(), [nestedSeed('first')])
    expect(toggleFor(workspaceEditor(), 'Parent').getAttribute('aria-expanded')).toBe('true')

    const direct = createDirectEditor(nestedDocument())
    let toggle = toggleFor(direct.view.dom, 'Parent')
    await userEvent.click(toggle)
    direct.commands.insertContentAt(0, { type: 'paragraph', content: [{ type: 'text', text: 'Before' }] })
    toggle = toggleFor(direct.view.dom, 'Parent')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    toggle.focus()
    const parentPosition = nodePosition(direct, 'listItem', 'Parent')
    const parentNode = direct.state.doc.nodeAt(parentPosition)
    if (!parentNode) throw new Error('Missing parent list item')
    direct.view.dispatch(direct.state.tr.delete(parentPosition, parentPosition + parentNode.nodeSize))
    await frame()
    expect(direct.view.dom.querySelector('[data-testid="nested-list-toggle"]')).toBeNull()
    expect(document.activeElement).toBe(direct.view.dom)

    const recovery = createDirectEditor(twoParentDocument())
    toggleFor(recovery.view.dom, 'First parent').focus()
    const firstPosition = nodePosition(recovery, 'listItem', 'First parent')
    const firstNode = recovery.state.doc.nodeAt(firstPosition)
    if (!firstNode) throw new Error('Missing first collapsible item')
    recovery.view.dispatch(recovery.state.tr.delete(firstPosition, firstPosition + firstNode.nodeSize))
    await frame()
    expect(toggleFor(recovery.view.dom, 'Second parent')).not.toBeNull()
    expect(document.activeElement).toBe(recovery.view.dom)
  })

  test('AC17-AC21: hidden descendants are revealed before selection, Find, or content mutation can affect them', async () => {
    const editor = createDirectEditor(nestedDocument())
    const editable = editor.view.dom
    const grandchild = textPosition(editor, 'Grandchild')
    const parentEnd = textPosition(editor, 'Parent') + 'Parent'.length

    editor.commands.setTextSelection(grandchild)
    await userEvent.click(toggleFor(editable, 'Parent'))
    expect(editor.state.selection.from).toBe(parentEnd)
    expect(editor.state.selection.empty).toBe(true)
    expect(document.activeElement).toBe(toggleFor(editable, 'Parent'))

    editor.commands.setTextSelection(grandchild)
    expect(toggleFor(editable, 'Parent').getAttribute('aria-expanded')).toBe('true')

    await userEvent.click(toggleFor(editable, 'Parent'))
    editor.commands.selectAll()
    expect([...editable.querySelectorAll<HTMLButtonElement>('[data-testid="nested-list-toggle"]')].every((button) => button.getAttribute('aria-expanded') === 'true')).toBe(true)
    expect(editor.state.selection.from).toBe(0)
    expect(editor.state.selection.to).toBe(editor.state.doc.content.size)

    await userEvent.click(toggleFor(editable, 'Parent'))
    setEditorSearch(editor, 'Grandchild')
    expect(toggleFor(editable, 'Parent').getAttribute('aria-expanded')).toBe('true')
    expect(editable.querySelector('.search-match-current')?.textContent).toBe('Grandchild')

    await userEvent.click(toggleFor(editable, 'Parent'))
    const hiddenText = textPosition(editor, 'Grandchild')
    editor.view.dispatch(editor.state.tr.insertText('Updated ', hiddenText))
    expect(toggleFor(editable, 'Parent').getAttribute('aria-expanded')).toBe('true')
    expect(editable.textContent).toContain('Updated Grandchild')
  })
})

class CapturingGateway extends FakeDocumentGateway {
  saved?: SaveInput

  override async save(input: SaveInput): Promise<SaveOutcome> {
    this.saved = input
    return { document: input, kind: 'saved' }
  }
}

function createDirectEditor(content: JSONContent): Editor {
  const element = document.createElement('div')
  element.setAttribute('aria-label', 'Document editor')
  document.body.appendChild(element)
  const editor = new Editor({
    content,
    element,
    editorProps: { attributes: { 'aria-label': 'Document editor', role: 'textbox' } },
    extensions: createDocumentExtensions(),
  })
  directEditors.push(editor)
  return editor
}

async function renderWorkspace(gateway: FakeDocumentGateway, seeds: readonly DocumentSeed[]): Promise<void> {
  const container = document.getElementById('test-root') ?? document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  root.render(<DocumentWorkspace gateway={gateway} initialTabs={seeds} />)
  await frame()
  await frame()
}

function nestedSeed(id: string, preview = false): DocumentSeed {
  return { document: nestedDocument(), id, preview, title: `Nested ${id}` }
}

function nestedDocument(): JSONContent {
  const paragraph = (text: string): JSONContent => ({ type: 'paragraph', content: [{ type: 'text', text }] })
  return {
    type: 'doc',
    content: [{
      type: 'bulletList',
      content: [
        {
          type: 'listItem',
          content: [
            paragraph('Parent'),
            {
              type: 'bulletList',
              content: [
                {
                  type: 'listItem',
                  content: [
                    paragraph('Child with branch'),
                    { type: 'orderedList', content: [{ type: 'listItem', content: [paragraph('Grandchild')] }] },
                  ],
                },
                { type: 'listItem', content: [paragraph('Child leaf')] },
              ],
            },
            {
              type: 'taskList',
              content: [
                { type: 'taskItem', attrs: { checked: false }, content: [paragraph('Task parent'), { type: 'taskList', content: [{ type: 'taskItem', attrs: { checked: true }, content: [paragraph('Task child')] }] }] },
              ],
            },
          ],
        },
        { type: 'listItem', content: [paragraph('Leaf')] },
      ],
    }],
  }
}

function twoParentDocument(): JSONContent {
  const parent = (label: string, child: string): JSONContent => ({
    type: 'listItem',
    content: [
      { type: 'paragraph', content: [{ type: 'text', text: label }] },
      { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: child }] }] }] },
    ],
  })
  return { type: 'doc', content: [{ type: 'bulletList', content: [parent('First parent', 'First child'), parent('Second parent', 'Second child')] }] }
}

function toggleFor(container: ParentNode, text: string): HTMLButtonElement {
  const paragraph = [...container.querySelectorAll('p')].find((candidate) => candidate.textContent === text)
  const toggle = paragraph?.parentElement?.querySelector<HTMLButtonElement>(':scope > [data-testid="nested-list-toggle"]')
    ?? paragraph?.closest('li')?.querySelector<HTMLButtonElement>('[data-testid="nested-list-toggle"]')
  if (!toggle) throw new Error(`Missing nested-list toggle for ${text}`)
  return toggle
}

function directChildLists(toggle: HTMLButtonElement): HTMLElement[] {
  const item = toggle.closest('li')
  if (!item) return []
  return [...item.querySelectorAll<HTMLElement>(':scope > ul, :scope > ol, :scope > div > ul, :scope > div > ol')]
}

function workspaceEditor(): HTMLElement {
  const editor = document.querySelector<HTMLElement>('[data-testid="rich-editor-content"]')
  if (!editor) throw new Error('Missing workspace editor')
  return editor
}

function nodePosition(editor: Editor, type: string, text: string): number {
  let found = -1
  editor.state.doc.descendants((node, position) => {
    if (found < 0 && node.type.name === type && node.textContent.includes(text)) found = position
  })
  if (found < 0) throw new Error(`Missing ${type} containing ${text}`)
  return found
}

function textPosition(editor: Editor, text: string): number {
  let found = -1
  editor.state.doc.descendants((node, position) => {
    const offset = node.isText ? node.text?.indexOf(text) ?? -1 : -1
    if (found < 0 && offset >= 0) found = position + offset
  })
  if (found < 0) throw new Error(`Missing text ${text}`)
  return found
}

function primaryShortcut(key: string): string {
  return navigator.platform.includes('Mac') ? `{Meta>}${key}{/Meta}` : `{Control>}${key}{/Control}`
}

function rerender(): void {
  root?.unmount()
  root = undefined
  document.body.innerHTML = '<div id="test-root"></div>'
}

async function frame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}
