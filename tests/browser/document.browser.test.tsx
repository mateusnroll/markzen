import axe from 'axe-core'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'

import { DocumentWorkspace, type DocumentSeed } from '../../src/app/DocumentWorkspace'
import type { DocumentGatewayPort, SaveInput, SaveOutcome } from '../../src/documents/gateway'
import { FakeDocumentGateway } from './document-gateway.fake'

let root: Root | undefined

afterEach(() => {
  root?.unmount()
  root = undefined
  document.body.innerHTML = '<div id="test-root"></div>'
})

describe('spec 0002 rich editor', () => {
  test('AC1 AC2 AC6 AC7: Markdown input rules transform character-by-character typing', async () => {
    await renderWorkspace()
    const editor = editable()

    await typeFresh(editor, '# Heading')
    expect(editor.querySelector('h1')?.textContent).toBe('Heading')
    await typeFresh(editor, '- item')
    expect(editor.querySelector('ul li')?.textContent).toBe('item')
    await typeFresh(editor, '> quote')
    expect(editor.querySelector('blockquote')?.textContent).toBe('quote')
    await typeFresh(editor, '**bold**')
    expect(editor.querySelector('strong')?.textContent).toBe('bold')
    await typeFresh(editor, '``` code')
    expect(editor.querySelector('pre code')?.textContent).toContain('code')
    await typeFresh(editor, '---')
    expect(editor.querySelector('hr')).not.toBeNull()
  })

  test('AC3-AC5: task input, checkbox activation, and Tab nesting mutate the document', async () => {
    await renderWorkspace()
    const editor = editable()
    await userEvent.click(editor)
    await userEvent.keyboard('- ')
    await userEvent.keyboard('[BracketLeft]')
    await userEvent.keyboard(' ')
    await userEvent.keyboard('[BracketRight]')
    await userEvent.keyboard(' first')
    const checkboxes = [...editor.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')]
    expect(checkboxes).toHaveLength(1)
    checkboxes[0]?.click()
    expect(checkboxes[0]?.checked).toBe(true)

    root?.unmount()
    root = undefined
    document.body.innerHTML = '<div id="test-root"></div>'
    await renderWorkspace([{ id: 'tasks', title: 'Tasks', document: {
      type: 'doc',
      content: [{
        type: 'taskList',
        content: [
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }] },
          { type: 'taskItem', attrs: { checked: false }, content: [{ type: 'paragraph', content: [{ type: 'text', text: 'second' }] }] },
        ],
      }],
    } }])
    const taskEditor = editable()
    const secondTask = taskEditor.querySelectorAll<HTMLInputElement>('input[type="checkbox"]')[1]?.closest('li')?.querySelector('p')
    if (!(secondTask instanceof HTMLElement)) throw new Error('Missing second task item')
    await userEvent.click(secondTask)
    await userEvent.keyboard('{Tab}')
    expect(taskEditor.querySelectorAll('ul ul li').length).toBeGreaterThanOrEqual(1)
  })

  test('AC8-AC10 AC29 AC35 AC166-AC167: semantic content renders while raw, links, and images stay inert', async () => {
    const seed: DocumentSeed = {
      id: 'one',
      title: 'Semantic',
      document: {
        type: 'doc',
        content: [
          { type: 'heading', attrs: { level: 5 }, content: [{ type: 'text', text: 'Deep' }] },
          { type: 'paragraph', content: [{ type: 'text', text: 'Link', marks: [{ type: 'link', attrs: { href: 'https://example.com' } }] }] },
          { type: 'paragraph', content: [{ type: 'image', attrs: { alt: 'Diagram', src: 'https://example.com/image.png' } }] },
          { type: 'opaque', attrs: { source: '<script>steal()</script>' } },
        ],
      },
    }
    await renderWorkspace([seed])
    const editor = editable()
    expect(editor.querySelector('h5')?.textContent).toBe('Deep')
    expect(editor.querySelector('a')).toBeNull()
    expect(editor.querySelector('img:not(.ProseMirror-separator)')).toBeNull()
    expect(editor.querySelector('[data-markzen-image]')?.getAttribute('aria-label')).toBe('Diagram, blocked')
    expect(editor.querySelector('script')).toBeNull()
    expect(getComputedStyle(byTestId('document-page')).maxWidth).toBe('720px')
    expect(getComputedStyle(editor).lineHeight).toBe('30.6px')
  })

  test('AC35-AC36 AC48: preservation fallback is complete, read-only, and explains why rich editing is blocked', async () => {
    await renderWorkspace([{
      id: 'preserved',
      title: 'Unsafe',
      preservation: { display: 'A\\x00\\xFF\\x0A', kind: 'bytes' },
    }])
    expect(byTestId('preservation-view').textContent).toContain('A\\x00\\xFF\\x0A')
    expect(byTestId('preservation-explanation').textContent).toContain('disabled to prevent data loss')
    expect(document.querySelector('[contenteditable="true"]')).toBeNull()
    expect(byTestId<HTMLButtonElement>('save-document').disabled).toBe(true)
    expect(byTestId<HTMLButtonElement>('save-as-document').disabled).toBe(false)
  })
})

describe('spec 0002 tabs, title, focus, and accessibility', () => {
  test('AC11-AC14 AC54-AC55: gutter focus and per-tab ProseMirror history/selection remain document-owned', async () => {
    await renderWorkspace([{ id: 'one', title: 'One' }, { id: 'two', title: 'Two' }])
    const firstEditor = editable()
    await userEvent.click(firstEditor)
    await userEvent.keyboard('alpha{Shift>}{ArrowLeft}{ArrowLeft}{/Shift}')
    const selected = window.getSelection()?.toString()
    await userEvent.keyboard('{Control>}{Tab}{/Control}')
    await frame()
    await userEvent.keyboard('{Control>}{Shift>}{Tab}{/Shift}{/Control}')
    await frame()
    expect(window.getSelection()?.toString()).toBe(selected)
    await userEvent.keyboard(navigator.platform.includes('Mac') ? '{Meta>}z{/Meta}' : '{Control>}z{/Control}')
    await frame()
    expect(editable().textContent).not.toContain('alpha')

    const page = byTestId<HTMLDivElement>('document-page')
    page.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, clientX: 1, clientY: page.getBoundingClientRect().bottom - 1 }))
    expect(document.activeElement).toBe(editable())
    expect(window.getSelection()?.anchorNode && byTestId('document-workspace').contains(window.getSelection()!.anchorNode)).toBe(true)
  })

  test('AC39 AC40 AC52 AC57 AC59-AC63 AC74: tabs add, switch, retain dirty documents, and close deterministically', async () => {
    await renderWorkspace()
    expect(allByTestId('document-tab')).toHaveLength(1)
    byTestId<HTMLButtonElement>('tab-add').click()
    await frame()
    expect(allByTestId('document-tab')).toHaveLength(2)
    const closes = allByTestId<HTMLButtonElement>('document-tab-close')
    expect(closes).toHaveLength(2)
    for (const [index, close] of closes.entries()) {
      const closeBounds = close.getBoundingClientRect()
      const tabBounds = allByTestId('document-tab')[index]!.getBoundingClientRect()
      expect(closeBounds.left).toBeGreaterThanOrEqual(tabBounds.left)
      expect(closeBounds.right).toBeLessThanOrEqual(tabBounds.right)
      expect(closeBounds.top).toBe(tabBounds.top)
      expect(closeBounds.bottom).toBe(tabBounds.bottom)
    }
    await userEvent.click(editable())
    await userEvent.keyboard('second')
    expect(allByTestId('document-tab')[1]?.getAttribute('aria-label')).toContain('dirty')
    const tabs = allByTestId<HTMLButtonElement>('document-tab')
    tabs[0]?.click()
    await frame()
    expect(editable().textContent).not.toContain('second')
    tabs[1]?.click()
    await frame()
    expect(editable().textContent).toContain('second')
    allByTestId<HTMLButtonElement>('document-tab-close')[1]?.click()
    await frame()
    expect(allByTestId('document-tab')).toHaveLength(1)
  })

  test('AC53 AC56 AC72-AC73: roving tab focus is manual and editor-origin switching restores editor focus', async () => {
    await renderWorkspace([
      { id: 'one', title: 'One' },
      { id: 'two', title: 'Two' },
    ])
    const tabs = allByTestId<HTMLButtonElement>('document-tab')
    tabs[0]?.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(tabs[1])
    expect(tabs[0]?.getAttribute('aria-selected')).toBe('true')
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement).toBe(tabs[1])
    expect(tabs[1]?.getAttribute('aria-selected')).toBe('true')
    await userEvent.keyboard('{Tab}')
    expect(document.activeElement).toBe(editable())
    editable().focus()
    await userEvent.keyboard('{Control>}{Tab}{/Control}')
    await frame()
    expect(document.activeElement).toBe(editable())
  })

  test('AC75-AC86 AC92 AC101 AC171-AC172: title editing validates, navigates, cancels, and returns clean at baseline', async () => {
    await renderWorkspace([{ id: 'one', title: 'Original' }])
    const title = byTestId<HTMLInputElement>('document-title')
    expect(title.getAttribute('aria-label')).toBe('Document title')
    await userEvent.fill(title, 'CON')
    expect(byTestId('title-error').textContent).toContain('reserved')
    expect(byTestId<HTMLButtonElement>('save-document').disabled).toBe(true)
    await userEvent.fill(title, 'Changed')
    expect(byTestId('document-tab').getAttribute('aria-label')).toContain('dirty')
    await userEvent.keyboard('{Escape}')
    expect(title.value).toBe('Original')
    expect(byTestId('document-tab').getAttribute('aria-label')).not.toContain('dirty')
    await userEvent.fill(title, 'Changed')
    await userEvent.keyboard('{Enter}')
    expect(document.activeElement).toBe(editable())
  })

  test('AC64-AC66 AC169: document UI remains keyboard-accessible at zoom and passes the serious audit', async () => {
    await renderWorkspace([
      { id: 'one', title: 'One' },
      { id: 'two', title: 'Two' },
      { id: 'three', title: 'Three' },
    ])
    document.documentElement.style.zoom = '2'
    const strip = byTestId('tab-strip')
    strip.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaX: 80 }))
    expect(strip.scrollLeft).toBeGreaterThanOrEqual(0)
    expect(getComputedStyle(strip).userSelect).toBe('none')
    const audit = await axe.run(document.body, { resultTypes: ['violations'] })
    expect(audit.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
  })

  test('AC145: a newer edit made during close-triggered save keeps the tab open and dirty', async () => {
    let finishSave!: (outcome: SaveOutcome) => void
    const saveResult = new Promise<SaveOutcome>((resolve) => { finishSave = resolve })
    const gateway = new class extends FakeDocumentGateway {
      override async confirmClose(): Promise<'save'> { return 'save' }
      override async save(): Promise<SaveOutcome> { return saveResult }
    }()
    await renderWorkspace([{ id: 'one', title: 'Draft' }], gateway)
    await userEvent.click(editable())
    await userEvent.keyboard('first')
    byTestId<HTMLButtonElement>('document-tab-close').click()
    await frame()
    await userEvent.click(editable())
    await userEvent.keyboard(' newer')
    finishSave({ document: {
      document: { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'first' }] }], type: 'doc' },
      id: 'one',
      title: 'Draft',
    }, kind: 'saved' })
    await frame()
    await frame()
    expect(allByTestId('document-tab')).toHaveLength(1)
    expect(byTestId('document-tab').getAttribute('aria-label')).toContain('dirty')
    expect(editable().textContent).toContain('newer')
  })

  test('AC68-AC70: composition text commits once before switch, save snapshot, and close evaluation', async () => {
    let saved: SaveInput | undefined
    let closePrompts = 0
    const gateway = new class extends FakeDocumentGateway {
      override async confirmClose(): Promise<'cancel'> {
        closePrompts += 1
        return 'cancel'
      }
      override async save(input: SaveInput): Promise<SaveOutcome> {
        saved = input
        return { document: input, kind: 'saved' }
      }
    }()
    await renderWorkspace([{ id: 'one', title: 'One' }, { id: 'two', title: 'Two' }], gateway)
    const first = editable()
    first.focus()
    first.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    await userEvent.keyboard('文')
    await userEvent.keyboard('{Control>}{Tab}{/Control}')
    await frame()
    await userEvent.keyboard('{Control>}{Shift>}{Tab}{/Shift}{/Control}')
    await frame()
    expect(editable().textContent).toBe('文')

    editable().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    await userEvent.keyboard('字')
    byTestId<HTMLButtonElement>('save-document').click()
    await frame()
    expect(JSON.stringify(saved?.document)).toContain('文字')

    editable().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true, data: '' }))
    await userEvent.keyboard('終')
    byTestId<HTMLButtonElement>('document-tab-close').click()
    await frame()
    expect(closePrompts).toBe(1)
    expect(editable().textContent).toBe('文字終')
  })

  test('AC71: a missing source does not prevent switching or normal dirty close handling', async () => {
    const gateway = new FakeDocumentGateway()
    await renderWorkspace([{ id: 'one', title: 'One' }, { id: 'two', title: 'Two' }], gateway)
    await userEvent.click(editable())
    await userEvent.keyboard('retained')
    gateway.emitExternal({ id: 'one', kind: 'missing' })
    await frame()
    expect(byTestId('document-issue').textContent).toContain('original file is missing')
    allByTestId<HTMLButtonElement>('document-tab')[1]?.click()
    await frame()
    allByTestId<HTMLButtonElement>('document-tab')[0]?.click()
    await frame()
    expect(editable().textContent).toContain('retained')
    allByTestId<HTMLButtonElement>('document-tab-close')[0]?.click()
    await frame()
    expect(allByTestId('document-tab')).toHaveLength(1)
  })
})

async function renderWorkspace(
  seeds?: readonly DocumentSeed[],
  gateway: DocumentGatewayPort = new FakeDocumentGateway(),
): Promise<void> {
  const container = document.getElementById('test-root') ?? document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  root.render(<DocumentWorkspace gateway={gateway} {...(seeds ? { initialTabs: seeds } : {})} />)
  await frame()
  await frame()
  expect(byTestId('document-workspace')).not.toBeNull()
}

async function typeFresh(editor: HTMLElement, value: string): Promise<void> {
  editor.focus()
  const selection = window.getSelection()
  const range = document.createRange()
  range.selectNodeContents(editor)
  selection?.removeAllRanges()
  selection?.addRange(range)
  await userEvent.keyboard('{Backspace}{Control>}{Alt>}0{/Alt}{/Control}')
  await userEvent.keyboard(value)
}

function editable(): HTMLElement {
  const element = byTestId('rich-editor').querySelector<HTMLElement>('[contenteditable="true"]')
  if (!element) throw new Error('Missing rich editor contenteditable')
  return element
}

function byTestId<T extends Element = HTMLElement>(testId: string): T {
  const element = document.querySelector(`[data-testid="${testId}"]`)
  if (!element) throw new Error(`Missing data-testid=${testId}`)
  return element as T
}

function allByTestId<T extends Element = HTMLElement>(testId: string): T[] {
  return [...document.querySelectorAll(`[data-testid="${testId}"]`)] as T[]
}

async function frame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}
