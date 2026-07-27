import axe from 'axe-core'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { CsvGrid } from '../../src/app/CsvGrid'
import { DocumentWorkspace, type DocumentSeed } from '../../src/app/DocumentWorkspace'
import { createCsvEditor, csvRowsFromEditor, type CsvDocument } from '../../src/documents/csv'
import type { Path } from '../../src/platform/contracts'
import { FakeDocumentGateway } from './document-gateway.fake'

let root: Root | undefined
const editors: Array<ReturnType<typeof createCsvEditor>> = []

afterEach(() => {
  root?.unmount()
  root = undefined
  for (const editor of editors.splice(0)) editor.destroy()
  document.body.innerHTML = '<div id="test-root"></div>'
  document.documentElement.style.removeProperty('--mz-border')
})

describe('spec 0009 first-class CSV grid', () => {
  test('AC2 AC6-AC10 AC29-AC32 AC39 AC64 AC68: CSV tabs use fixed virtual grid semantics without Markdown controls', async () => {
    await renderWorkspace(csvSeed([
      ['Name', 'Note'],
      ['Ada', 'first\nsecond'],
      ...Array.from({ length: 1_000 }, (_, index) => [`row ${index}`, `value ${index}`]),
    ]))
    await expect.element(page.getByTestId('document-title')).toHaveValue('people')
    expect(document.querySelector('[data-testid="formatting-toolbar"]')).toBeNull()
    const grid = page.getByTestId('csv-grid')
    await expect.element(grid).toHaveAttribute('aria-rowcount', '1002')
    await expect.element(grid).toHaveAttribute('aria-colcount', '2')
    expect(document.querySelectorAll('[role="gridcell"], [role="columnheader"]').length).toBeLessThanOrEqual(600)
    expect(document.querySelectorAll('[data-testid="csv-row-number"]')[0]?.getAttribute('aria-hidden')).toBe('true')
    expect(document.querySelectorAll('[data-testid="csv-column-letter"]')).toHaveLength(0)
    expect(document.querySelectorAll('[role="columnheader"]')).toHaveLength(2)
    expect(cell(1, 1).textContent).toContain('first↵second')
    expect(getComputedStyle(cell(1, 1)).height).toBe('32px')
    expect(getComputedStyle(cell(1, 1)).width).toBe('180px')

    await userEvent.click(page.getByTestId('csv-header-toggle'))
    expect(document.querySelectorAll('[role="columnheader"]')).toHaveLength(0)
    expect(document.querySelectorAll('[role="gridcell"]').length).toBeGreaterThan(0)
    expect(document.querySelectorAll('[data-testid="csv-column-letter"]')).toHaveLength(2)
    expect(document.querySelectorAll('[data-testid="csv-column-letter"]')[0]?.getAttribute('aria-hidden')).toBe('true')
    await expect.element(page.getByTestId('document-tab')).not.toHaveAttribute('aria-label', /dirty/)
    expect((await axe.run(document.body)).violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
  })

  test('AC6 AC29-AC30 AC39 AC46-AC47 AC64 AC68: compact CSV chrome exposes fixed headers and named icon actions', async () => {
    document.documentElement.style.setProperty('--mz-border', '#d5d0c8')
    await renderWorkspace(csvSeed([
      ['Name', 'Team', 'Note'],
      ['Ada', 'North', 'hello'],
      ['Linus', 'South', 'world'],
    ]))

    const title = byTestId<HTMLInputElement>('document-title')
    expect(title.getAttribute('aria-label')).toBe('Document title, .csv extension is fixed')
    expect(byTestId('csv-title-extension').textContent).toBe('.csv')
    expect(getComputedStyle(title).fontSize).toBe('16px')

    const titleGutter = document.querySelector<HTMLElement>('.document-title-gutter')!
    const toolbar = byTestId('csv-toolbar')
    expect(titleGutter.getBoundingClientRect().height).toBe(40)
    expect(getComputedStyle(toolbar).minHeight).toBe('40px')
    expect(titleGutter.getBoundingClientRect().top).toBe(toolbar.getBoundingClientRect().top)
    expect(toolbar.querySelectorAll('button')).toHaveLength(7)
    expect(toolbar.querySelectorAll('[data-testid="csv-action-icon"]')).toHaveLength(7)
    for (const label of ['Header row', 'Add row above', 'Add row below', 'Add column before', 'Add column after', 'Delete row', 'Delete column']) {
      const button = toolbar.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!
      expect(getComputedStyle(button, '::after').content).toBe(`"${label}"`)
    }

    const grid = byTestId('csv-grid')
    const pageBounds = byTestId('document-page').getBoundingClientRect()
    const gridBounds = grid.getBoundingClientRect()
    expect(gridBounds.left).toBe(pageBounds.left)
    expect(gridBounds.right).toBe(pageBounds.right)
    expect(document.querySelector('[data-testid="csv-column-labels"]')).toBeNull()
    expect(document.querySelectorAll('[role="columnheader"]')).toHaveLength(3)
    expect(getComputedStyle(document.querySelector('.csv-header-row')!).position).toBe('sticky')
    expect(getComputedStyle(byTestId('csv-row-number')).position).toBe('sticky')
    expect(getComputedStyle(document.querySelector('.csv-grid-shell')!).userSelect).toBe('none')

    const addRowAbove = toolbar.querySelector<HTMLButtonElement>('[aria-label="Add row above"]')!
    title.focus()
    await userEvent.tab()
    await userEvent.tab()
    expect(document.activeElement).toBe(addRowAbove)
    await wait(150)
    expect(getComputedStyle(addRowAbove, '::after').content).toContain('Add row above')
    expect(getComputedStyle(addRowAbove, '::after').opacity).toBe('1')

    await userEvent.click(page.getByTestId('csv-header-toggle'))
    const labels = byTestId('csv-column-labels')
    expect(getComputedStyle(labels).position).toBe('sticky')
    expect(document.querySelectorAll('[data-testid="csv-column-letter"]')).toHaveLength(3)
    const firstLetter = document.querySelector<HTMLElement>('[data-testid="csv-column-letter"]')!
    expect(getComputedStyle(firstLetter).borderTopWidth).toBe('1px')
    expect(getComputedStyle(firstLetter).borderBottomWidth).toBe('1px')
    expect(document.querySelectorAll('[role="columnheader"]')).toHaveLength(0)
    expect(cell(0, 0).getAttribute('role')).toBe('gridcell')
  })

  test('AC33-AC38 AC56: navigation, layered textarea editing, commit-on-leave, cancellation, and no-op commits are deterministic', async () => {
    const onChange = vi.fn()
    await renderGrid([['a', 'b'], ['c', 'd']], { onChange })
    cell(0, 0).focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(document.activeElement).toBe(cell(0, 1))
    await userEvent.keyboard('{ArrowDown}{Home}')
    expect(document.activeElement).toBe(cell(1, 0))
    await userEvent.keyboard('{Enter}')
    const editor = byTestId<HTMLTextAreaElement>('csv-cell-editor')
    expect(editor.value).toBe('c')
    expect(getComputedStyle(editor).position).toBe('absolute')
    await userEvent.fill(editor, 'changed')
    await userEvent.click(cell(0, 0))
    expect(onChange).toHaveBeenCalledTimes(1)
    expect(cell(1, 0).textContent).toContain('changed')

    await userEvent.dblClick(cell(0, 0))
    await userEvent.fill(byTestId('csv-cell-editor'), 'cancelled')
    await userEvent.keyboard('{Escape}')
    expect(cell(0, 0).textContent).toContain('a')
    expect(onChange).toHaveBeenCalledTimes(1)

    await userEvent.keyboard('{Enter}')
    await userEvent.keyboard('{Enter}')
    expect(onChange).toHaveBeenCalledTimes(1)
  })

  test('AC35-AC37 AC40 AC68: pointer-down keeps one active cell and character editing retains the complete draft', async () => {
    const onChange = vi.fn()
    await renderGrid([['a', 'b'], ['c', 'd']], { onChange })

    cell(0, 0).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    cell(0, 1).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    await wait(20)
    expect(document.querySelectorAll('.csv-cell[aria-selected="true"]')).toHaveLength(1)
    expect(document.querySelector('.csv-cell[aria-selected="true"]')).toBe(cell(0, 1))
    expect(document.activeElement).toBe(cell(0, 1))

    await userEvent.keyboard('T')
    await wait(20)
    const editor = byTestId<HTMLTextAreaElement>('csv-cell-editor')
    await userEvent.keyboard('est')
    expect(editor.value).toBe('Test')
    expect(getComputedStyle(editor).userSelect).toBe('text')
    expect(getComputedStyle(cell(0, 1)).overflow).toBe('visible')
    await userEvent.click(editor)
    expect(document.querySelector('[data-testid="csv-cell-editor"]')).toBe(editor)
    await userEvent.keyboard('{Enter}')
    expect(cell(0, 1).textContent).toContain('Test')
    expect(onChange).toHaveBeenCalledOnce()

    cell(1, 0).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    cell(1, 1).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, shiftKey: true }))
    await wait(20)
    expect(document.querySelectorAll('.csv-cell[aria-selected="true"]')).toHaveLength(2)
    cell(0, 0).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }))
    await wait(20)
    expect(document.querySelectorAll('.csv-cell[aria-selected="true"]')).toHaveLength(1)
    expect(document.querySelector('.csv-cell[aria-selected="true"]')).toBe(cell(0, 0))
  })

  test('AC40-AC49: rectangular selection, native clipboard events, paste expansion, bounds, structure, and undo ownership remain atomic', async () => {
    const onChange = vi.fn()
    await renderGrid([['a', 'b'], ['c', 'd']], { onChange })
    await userEvent.click(cell(0, 0))
    await userEvent.keyboard('{Shift>}{ArrowRight}{ArrowDown}{/Shift}')
    expect(document.querySelectorAll('[aria-selected="true"]')).toHaveLength(4)

    const copied = new DataTransfer()
    cell(1, 1).dispatchEvent(new ClipboardEvent('copy', { bubbles: true, cancelable: true, clipboardData: copied }))
    expect(copied.getData('text/plain')).toBe('a\tb\nc\td')

    const pasted = new DataTransfer()
    pasted.setData('text/plain', 'x\ty\nz\tw')
    cell(0, 0).dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: pasted }))
    await wait(20)
    expect(onChange).toHaveBeenCalledOnce()
    expect(cell(0, 0).textContent).toContain('x')
    expect(csvRowsFromEditor(editors.at(-1)!)).toHaveLength(2)

    await userEvent.click(page.getByTestId('csv-add-row-below'))
    await wait(20)
    expect(csvRowsFromEditor(editors.at(-1)!)).toHaveLength(3)
    expect(onChange).toHaveBeenCalledTimes(2)
    await userEvent.click(page.getByTestId('csv-add-column-after'))
    await wait(20)
    expect(onChange).toHaveBeenCalledTimes(3)
    expect(csvRowsFromEditor(editors.at(-1)!)[0]).toHaveLength(3)
    await userEvent.click(page.getByTestId('csv-delete-row'))
    await wait(20)
    expect(csvRowsFromEditor(editors.at(-1)!)).toHaveLength(2)
    await userEvent.click(page.getByTestId('csv-delete-column'))
    await wait(20)
    expect(csvRowsFromEditor(editors.at(-1)!)[0]).toHaveLength(2)
    editors.at(-1)!.commands.undo()
    expect(csvRowsFromEditor(editors.at(-1)!)[0]).toHaveLength(3)
    editors.at(-1)!.commands.redo()
    expect(csvRowsFromEditor(editors.at(-1)!)[0]).toHaveLength(2)
    expect(onChange).toHaveBeenCalledTimes(7)
  })

  test('AC50-AC55: the existing Find panel searches CSV fields row-major and closes without content mutation', async () => {
    await renderWorkspace(csvSeed([['Name', 'Note'], ['Ada', 'hello'], ['Linus', 'HELLO']]))
    byTestId('csv-grid').focus()
    await userEvent.keyboard('{Control>}f{/Control}')
    await userEvent.fill(page.getByTestId('search-input'), 'hello')
    await wait(180)
    await expect.element(page.getByTestId('search-status')).toHaveTextContent('1 of 2')
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByTestId('search-status')).toHaveTextContent('2 of 2')
    await userEvent.keyboard('{Escape}')
    expect(document.querySelector('[data-testid="search-panel"]')).toBeNull()
    await expect.element(page.getByTestId('document-tab')).not.toHaveAttribute('aria-label', /dirty/)
  })

  test('AC61 AC70-AC71: preservation disables CSV actions and literal fields create no executable or rich content', async () => {
    await renderWorkspace(csvSeed([['<img src=x onerror=alert(1)>', '=1+1', 'https://example.com']]))
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('a')).toBeNull()
    expect(document.body.textContent).toContain('=1+1')

    rerender()
    await renderWorkspace({
      id: 'bad',
      kind: 'csv',
      preservation: { display: 'Malformed CSV', kind: 'text' },
      title: 'bad',
    })
    expect(document.querySelector('[data-testid="csv-grid"]')).toBeNull()
    expect(document.querySelector('[data-testid="search-panel"]')).toBeNull()
    expect(document.querySelector('[data-testid="csv-toolbar"]')).toBeNull()
    expect(document.body.textContent).toContain('Malformed CSV')
  })
})

const dialect: CsvDocument['dialect'] = {
  bom: false,
  delimiter: ',',
  newline: 'lf',
  terminalSeparator: false,
}

function csvSeed(rows: readonly (readonly string[])[]): DocumentSeed {
  return {
    csv: { dialect, edited: false, originalBytes: new TextEncoder().encode(''), rows: rows.map((row) => [...row]) },
    id: 'csv-1',
    kind: 'csv',
    path: '/notes/people.csv' as Path,
    title: 'people',
  }
}

async function renderWorkspace(seed: DocumentSeed): Promise<void> {
  const container = testContainer()
  root = createRoot(container)
  root.render(<DocumentWorkspace gateway={new FakeDocumentGateway()} initialTabs={[seed]} />)
  await wait(20)
}

async function renderGrid(
  rows: readonly (readonly string[])[],
  options: { readonly onChange?: (document: CsvDocument) => void } = {},
): Promise<void> {
  const document: CsvDocument = { dialect, edited: false, originalBytes: new Uint8Array(), rows: rows.map((row) => [...row]) }
  const editor = createCsvEditor(document, (updated) => options.onChange?.({
    ...document,
    edited: true,
    rows: csvRowsFromEditor(updated),
  }))
  editors.push(editor)
  const container = testContainer()
  root = createRoot(container)
  root.render(
    <CsvGrid
      editor={editor}
      header
      onHeaderChange={() => undefined}
    />,
  )
  await wait(20)
}

const cell = (row: number, column: number): HTMLElement =>
  document.querySelector<HTMLElement>(`[data-csv-row="${row}"][data-csv-column="${column}"]`)!

const byTestId = <Element extends HTMLElement = HTMLElement>(id: string): Element =>
  document.querySelector<Element>(`[data-testid="${id}"]`)!

function rerender(): void {
  root?.unmount()
  root = undefined
  document.body.innerHTML = '<div id="test-root"></div>'
}

const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds))

function testContainer(): HTMLElement {
  let container = document.getElementById('test-root')
  if (!container) {
    container = document.createElement('div')
    container.id = 'test-root'
    document.body.append(container)
  }
  return container
}
