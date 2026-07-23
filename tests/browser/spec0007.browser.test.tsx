import axe from 'axe-core'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test } from 'vitest'
import { userEvent } from 'vitest/browser'

import { DocumentWorkspace, type DocumentSeed } from '../../src/app/DocumentWorkspace'
import { FakeDocumentGateway } from './document-gateway.fake'
import '../../src/app/shell.css'

let root: Root | undefined

afterEach(() => {
  root?.unmount()
  root = undefined
  document.body.innerHTML = '<div id="test-root"></div>'
  document.documentElement.style.removeProperty('--mz-border')
})

describe('spec 0007 native chrome and editor polish', () => {
  test('AC7 AC13 AC14 AC16 AC17 AC19: the command-free writing surface uses compact, seamless, bordered, theme-aware presentation', async () => {
    await renderWorkspace([structuredSeed()])

    expect(document.querySelector('[data-testid="open-document"]')).toBeNull()
    expect(document.querySelector('[data-testid="save-document"]')).toBeNull()
    expect(document.querySelector('[data-testid="save-as-document"]')).toBeNull()

    const surface = activePanel()
    const page = byTestId<HTMLElement>('document-page')
    const title = byTestId<HTMLInputElement>('document-title')
    const editor = byTestId<HTMLElement>('rich-editor-content')
    const paragraph = editor.querySelector('p')!
    const cell = editor.querySelector('th')!

    expect(getComputedStyle(page).maxWidth).toBe('860px')
    expect(getComputedStyle(page).backgroundColor).toBe('rgba(0, 0, 0, 0)')
    expect(getComputedStyle(page).boxShadow).toBe('none')
    expect(getComputedStyle(editor).fontSize).toBe('16px')
    expect(getComputedStyle(editor).lineHeight).toBe('23.2px')
    expect(getComputedStyle(paragraph).marginBlockStart).toBe('0px')
    expect(getComputedStyle(paragraph).marginBlockEnd).toBe('0px')
    expect(getComputedStyle(cell).borderTopWidth).toBe('1px')
    expect(getComputedStyle(cell).paddingTop).toBe('6px')
    expect(getComputedStyle(cell).paddingLeft).toBe('8px')
    expect(getComputedStyle(cell).verticalAlign).toBe('top')
    expect(getComputedStyle(surface).cursor).toBe('text')
    expect(getComputedStyle(surface).overflowY).toBe('auto')

    title.focus()
    expect(getComputedStyle(title).outlineStyle).toBe('none')
    editor.focus()
    expect(getComputedStyle(editor).outlineStyle).toBe('none')
    const audit = await axe.run(document.body, { resultTypes: ['violations'] })
    expect(audit.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])

    rerender()
    await renderWorkspace([{ id: 'short', title: 'Short' }])
    const shortSurface = activePanel()
    expect(shortSurface.scrollHeight).toBeLessThanOrEqual(shortSurface.clientHeight)
  })

  test('AC15: flat and nested task items align native checkboxes without ordinary bullets', async () => {
    await renderWorkspace([taskSeed()])
    const editor = byTestId<HTMLElement>('rich-editor-content')
    const lists = editor.querySelectorAll<HTMLUListElement>('ul[data-type="taskList"]')
    const firstItem = lists[0]!.querySelector(':scope > li')!
    const checkbox = firstItem.querySelector<HTMLInputElement>('input[type="checkbox"]')!

    expect(getComputedStyle(lists[0]!).listStyleType).toBe('none')
    expect(getComputedStyle(firstItem).display).toBe('flex')
    expect(getComputedStyle(lists[1]!).paddingInlineStart).toBe('24px')
    expect(checkbox.checked).toBe(true)
    checkbox.click()
    expect(checkbox.checked).toBe(false)
  })

  test('AC18: empty title and body space route primary clicks to the title or closest line start', async () => {
    await renderWorkspace([lineSeed()])
    const surface = activePanel()
    const title = byTestId<HTMLInputElement>('document-title')
    const editor = byTestId<HTMLElement>('rich-editor-content')
    const titleBounds = title.parentElement!.getBoundingClientRect()

    surface.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      clientX: surface.getBoundingClientRect().left + 2,
      clientY: titleBounds.top + titleBounds.height / 2,
    }))
    expect(document.activeElement).toBe(title)

    const second = editor.querySelectorAll('p')[1]!
    const secondBounds = second.getBoundingClientRect()
    expect(secondBounds.top).toBeGreaterThan(titleBounds.bottom)
    surface.dispatchEvent(new MouseEvent('mousedown', {
      bubbles: true,
      button: 0,
      clientX: surface.getBoundingClientRect().left + 2,
      clientY: Math.max(titleBounds.bottom + 1, secondBounds.top + secondBounds.height / 2),
    }))
    await frame()
    expect(document.activeElement).toBe(editor)
    expect(window.getSelection()?.anchorOffset).toBe(0)
    expect(window.getSelection()?.anchorNode?.parentElement?.textContent).toBe('Second line')
  })

  test('AC8: a preview tab describes and supports double-click or Cmd/Ctrl+Enter Keep Open promotion', async () => {
    await renderWorkspace([{ id: 'preview', preview: true, title: 'Preview' }])
    const tab = byTestId<HTMLButtonElement>('document-tab')

    expect(tab.getAttribute('aria-description')).toContain('Cmd/Ctrl+Enter')
    tab.focus()
    await userEvent.keyboard(navigator.platform.includes('Mac') ? '{Meta>}{Enter}{/Meta}' : '{Control>}{Enter}{/Control}')
    expect(tab.classList.contains('document-tab-preview')).toBe(false)

    rerender()
    await renderWorkspace([{ id: 'preview-2', preview: true, title: 'Second' }])
    const second = byTestId<HTMLButtonElement>('document-tab')
    await userEvent.dblClick(second)
    expect(second.classList.contains('document-tab-preview')).toBe(false)
  })
})

async function renderWorkspace(seeds: readonly DocumentSeed[]): Promise<void> {
  document.documentElement.style.setProperty('--mz-border', '#888')
  const container = document.getElementById('test-root') ?? document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  root.render(<DocumentWorkspace gateway={new FakeDocumentGateway()} initialTabs={seeds} />)
  await frame()
  await frame()
}

function rerender(): void {
  root?.unmount()
  root = undefined
  document.body.innerHTML = '<div id="test-root"></div>'
}

function structuredSeed(): DocumentSeed {
  return {
    id: 'structured',
    title: 'Structured',
    document: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Paragraph' }] },
        {
          type: 'table',
          content: [{
            type: 'tableRow',
            content: [
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Heading' }] }] },
              { type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Value' }] }] },
            ],
          }],
        },
      ],
    },
  }
}

function taskSeed(): DocumentSeed {
  return {
    id: 'tasks',
    title: 'Tasks',
    document: {
      type: 'doc',
      content: [{
        type: 'taskList',
        content: [{
          type: 'taskItem',
          attrs: { checked: true },
          content: [
            { type: 'paragraph', content: [{ type: 'text', text: 'Parent task' }] },
            {
              type: 'taskList',
              content: [{
                type: 'taskItem',
                attrs: { checked: false },
                content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Nested task' }] }],
              }],
            },
          ],
        }],
      }],
    },
  }
}

function lineSeed(): DocumentSeed {
  return {
    id: 'lines',
    title: 'Lines',
    document: {
      type: 'doc',
      content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'First line' }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'Second line' }] },
      ],
    },
  }
}

function byTestId<T extends Element = HTMLElement>(testId: string): T {
  const element = document.querySelector(`[data-testid="${testId}"]`)
  if (!element) throw new Error(`Missing data-testid=${testId}`)
  return element as T
}

function activePanel(): HTMLElement {
  const element = document.getElementById('active-document-panel')
  if (!element) throw new Error('Missing active document panel')
  return element
}

async function frame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}
