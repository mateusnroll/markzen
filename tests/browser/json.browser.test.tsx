import axe from 'axe-core'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { JsonTree } from '../../src/app/JsonTree'
import { DocumentWorkspace, type DocumentSeed } from '../../src/app/DocumentWorkspace'
import {
  createJsonEditor,
  jsonRootFromEditor,
  parseJsonBytes,
  type JsonDocument,
  type JsonObject,
} from '../../src/documents/json'
import type { Path } from '../../src/platform/contracts'
import { FakeDocumentGateway } from './document-gateway.fake'

let root: Root | undefined
const editors: Array<ReturnType<typeof createJsonEditor>> = []

afterEach(() => {
  root?.unmount()
  root = undefined
  for (const editor of editors.splice(0)) editor.destroy()
  document.body.innerHTML = '<div id="test-root"></div>'
})

describe('spec 0010 row-first JSON tree', () => {
  test('AC2 AC6-AC10 AC20 AC35-AC39 AC51 AC69 AC73: JSON tabs render one accessible virtual tree without Markdown or CSV controls', async () => {
    await renderWorkspace(seed('{"name":"Markzen","nested":{"value":1},"items":[true,null]}'))
    await expect.element(page.getByTestId('document-title')).toHaveValue('data')
    await expect.element(page.getByTestId('json-title-extension')).toHaveTextContent('.json')
    expect(document.querySelector('[data-testid="formatting-toolbar"]')).toBeNull()
    expect(document.querySelector('[data-testid="csv-toolbar"]')).toBeNull()
    const toolbar = byTestId('json-toolbar')
    expect([...toolbar.querySelectorAll('button')].map((button) => button.getAttribute('aria-label'))).toEqual([
      'Add property',
      'Add item',
      'Insert before',
      'Insert after',
      'Delete',
    ])
    expect(toolbar.querySelectorAll('[data-testid="json-action-icon"]')).toHaveLength(5)
    expect(toolbar.querySelector('select')).toBeNull()
    expect(toolbar.textContent).toBe('')
    const tree = page.getByTestId('json-tree')
    await expect.element(tree).toHaveAttribute('role', 'tree')
    expect(document.querySelectorAll('[role="treeitem"]').length).toBeLessThanOrEqual(500)
    expect(document.querySelectorAll('[role="treeitem"][aria-selected="true"]')).toHaveLength(1)
    const rootRow = rowElement('Root')
    expect(getComputedStyle(rootRow).height).toBe('26px')
    expect(rootRow.querySelector('[data-testid="json-row-type"]')).toBeNull()
    expect(rootRow.querySelector('[data-testid="json-row-container-meta"]')?.textContent).toContain('{ }')
    expect(rootRow.querySelector('[data-testid="json-row-container-meta"]')?.textContent).toContain('3 properties')
    await userEvent.keyboard('{ArrowDown}{ArrowRight}{ArrowLeft}{End}{Home}')
    expect(document.querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1)
    expect((await axe.run(document.body)).violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])

    rerender()
    await renderWorkspace({
      id: 'bad-json',
      kind: 'json',
      preservation: { display: 'JSON is malformed at line 1, column 2.', kind: 'text' },
      title: 'bad',
    })
    expect(document.querySelector('[data-testid="json-tree"]')).toBeNull()
    expect(document.body.textContent).toContain('malformed')
  })

  test('AC40 AC45-AC48 AC50 AC58: cell-targeted rename, insertion, deletion, bounds, and undo are atomic', async () => {
    const onChange = vi.fn()
    await renderTree('{"name":"old","empty":[]}', onChange)
    const nameRow = rowElement('name')
    nameRow.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }))
    await wait(20)
    expect(document.querySelector('[data-testid="json-inline-editor"]')).toBeNull()

    nameRow.focus()
    await userEvent.keyboard('{Shift>}{F2}{/Shift}')
    await expect.element(page.getByTestId('json-inline-editor')).toHaveAttribute('aria-label', 'Rename JSON property')
    await userEvent.dblClick(byTestId('json-inline-editor'))
    await expect.element(page.getByTestId('json-inline-editor')).toHaveAttribute('aria-label', 'Rename JSON property')
    await userEvent.fill(page.getByTestId('json-inline-editor'), 'renamed')
    await userEvent.click(page.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledOnce()
    expect(document.body.textContent).toContain('renamed')

    await userEvent.click(rowByText('empty'))
    await userEvent.click(page.getByRole('button', { name: 'Add item' }))
    expect(rowElementByName('1').textContent).toContain('null')
    expect(onChange).toHaveBeenCalledTimes(2)
    await userEvent.click(rowElementByName('1'))
    await userEvent.click(page.getByRole('button', { name: 'Delete' }))
    expect(onChange).toHaveBeenCalledTimes(3)
    editors.at(-1)!.commands.undo()
    expect(((jsonRootFromEditor(editors.at(-1)!) as JsonObject).properties[1]?.value as { readonly items: readonly unknown[] }).items).toHaveLength(1)
  })

  test('AC40-AC44 AC49: names, scalar values, null, booleans, and types edit only in their inline cells', async () => {
    const onChange = vi.fn()
    await renderTree('{"":"blank name","value":"old","number":1e3,"flag":true,"nothing":null,"object":{},"array":[]}', onChange)

    const emptyName = rowElement('(empty name)').querySelector<HTMLElement>('[data-testid="json-row-name"]')!
    expect(getComputedStyle(emptyName).fontStyle).toBe('italic')
    expect(getComputedStyle(emptyName).fontWeight).toBe('400')
    rowElement('(empty name)').focus()
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByTestId('json-inline-editor')).toHaveAttribute('aria-label', 'Rename JSON property')
    await userEvent.keyboard('{Escape}')

    await userEvent.dblClick(rowCell('value', 'json-row-name'))
    await expect.element(page.getByTestId('json-inline-editor')).toHaveAttribute('aria-label', 'Rename JSON property')
    await userEvent.keyboard('{Escape}')
    await userEvent.dblClick(rowCell('value', 'json-row-preview'))
    await expect.element(page.getByTestId('json-inline-editor')).toHaveAttribute('aria-label', 'Edit JSON string')
    await userEvent.fill(page.getByTestId('json-inline-editor'), 'changed')
    await userEvent.click(rowByText('number'))
    expect(onChange).toHaveBeenCalledOnce()

    await userEvent.keyboard('{F2}')
    await userEvent.fill(page.getByTestId('json-inline-editor'), '01')
    await expect.element(page.getByTestId('json-inline-error')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Apply' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(document.body.textContent).toContain('1e3')

    const nullPreview = rowCell('nothing', 'json-row-preview')
    expect(nullPreview.textContent).toBe('null')
    expect(getComputedStyle(nullPreview).fontStyle).toBe('italic')
    await userEvent.dblClick(nullPreview)
    const nullEditor = byTestId<HTMLTextAreaElement>('json-inline-editor')
    expect(nullEditor.value).toBe('')
    expect(nullEditor.placeholder).toBe('Empty value')
    expect(getComputedStyle(nullEditor).fontStyle).toBe('normal')
    await userEvent.click(page.getByRole('button', { name: 'Apply' }))
    expect(propertyValue('nothing').type).toBe('string')

    await userEvent.dblClick(rowCell('flag', 'json-row-preview'))
    await userEvent.fill(page.getByTestId('json-inline-editor'), 'TRUE')
    await expect.element(page.getByTestId('json-inline-error')).toHaveTextContent('Enter true or false.')
    await expect.element(page.getByRole('button', { name: 'Apply' })).toBeDisabled()
    await userEvent.fill(page.getByTestId('json-inline-editor'), 'false')
    await userEvent.click(page.getByRole('button', { name: 'Apply' }))
    expect(propertyValue('flag')).toMatchObject({ type: 'boolean', value: false })

    expect(rowElement('object').querySelector('[data-testid="json-row-type"]')).toBeNull()
    expect(rowElement('array').querySelector('[data-testid="json-row-type"]')).toBeNull()
    await userEvent.dblClick(rowCell('value', 'json-row-type'))
    const typeEditor = byTestId<HTMLSelectElement>('json-inline-editor')
    expect(typeEditor).toBe(document.activeElement)
    await userEvent.click(typeEditor)
    expect(document.querySelector('[data-testid="json-inline-editor"]')).toBe(typeEditor)
    await userEvent.selectOptions(typeEditor, 'number')
    expect(propertyValue('value')).toMatchObject({ lexeme: '0', type: 'number' })
  })

  test('AC69: initial measurement mounts the complete visible window without a scroll event', async () => {
    await renderTree(JSON.stringify(Array.from({ length: 100 }, (_, index) => `row ${index}`)), vi.fn(), 780)
    expect(byTestId('json-tree').scrollTop).toBe(0)
    expect(document.querySelectorAll('[role="treeitem"]').length).toBeGreaterThan(21)
  })

  test('AC52-AC57 AC65: Find searches literal JSON labels, expands matches, and authored content stays inert', async () => {
    await renderWorkspace(seed('{"<img src=x>":{"hidden":"Needle"},"url":"https://example.com"}'))
    expect(document.querySelector('img')).toBeNull()
    expect(document.querySelector('a')).toBeNull()
    byTestId('json-tree').focus()
    await userEvent.keyboard('{Control>}f{/Control}')
    await userEvent.fill(page.getByTestId('search-input'), 'needle')
    await wait(180)
    await expect.element(page.getByTestId('search-status')).toHaveTextContent('1 of 1')
    await expect.element(page.getByTestId('json-row').filter({ hasText: 'Needle' })).toBeVisible()
    await userEvent.keyboard('{Escape}')
  })
})

function seed(source: string): DocumentSeed {
  const parsed = parseJsonBytes(new TextEncoder().encode(source))
  if (parsed.mode !== 'editable') throw new Error(parsed.reason)
  return {
    id: 'json-1',
    json: parsed.document,
    kind: 'json',
    path: '/notes/data.json' as Path,
    title: 'data',
  }
}

async function renderWorkspace(document: DocumentSeed): Promise<void> {
  root = createRoot(testContainer())
  root.render(<DocumentWorkspace gateway={new FakeDocumentGateway()} initialTabs={[document]} />)
  await wait(20)
}

async function renderTree(
  source: string,
  onChange: (document: JsonDocument) => void,
  height = 720,
): Promise<void> {
  const parsed = parseJsonBytes(new TextEncoder().encode(source))
  if (parsed.mode !== 'editable') throw new Error(parsed.reason)
  const editor = createJsonEditor(parsed.document, (updated) => onChange({
    ...parsed.document,
    edited: true,
    root: jsonRootFromEditor(updated),
  }))
  editors.push(editor)
  root = createRoot(testContainer())
  root.render(
    <div style={{ display: 'flex', height }}>
      <JsonTree editor={editor} onError={() => undefined} />
    </div>,
  )
  await wait(20)
}

const rowByText = (text: string) => page.getByTestId('json-row').filter({ hasText: text }).first()
const rowElement = (text: string): HTMLElement => [...document.querySelectorAll<HTMLElement>('[data-testid="json-row"]')]
  .find((row) => row.textContent?.includes(text))!
const rowElementByName = (name: string): HTMLElement => [...document.querySelectorAll<HTMLElement>('[data-testid="json-row"]')]
  .find((row) => row.querySelector('[data-testid="json-row-name"]')?.textContent === name)!
const rowCell = (rowText: string, testId: string): HTMLElement =>
  rowElement(rowText).querySelector<HTMLElement>(`[data-testid="${testId}"]`)!
const propertyValue = (name: string) => (jsonRootFromEditor(editors.at(-1)!) as JsonObject).properties
  .find((property) => property.name === name)!.value
const byTestId = <Element extends HTMLElement = HTMLElement>(id: string): Element =>
  document.querySelector<Element>(`[data-testid="${id}"]`)!
const wait = (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds))

function rerender(): void {
  root?.unmount()
  root = undefined
  document.body.innerHTML = '<div id="test-root"></div>'
}

function testContainer(): HTMLElement {
  return document.getElementById('test-root') ?? document.body.appendChild(Object.assign(document.createElement('div'), { id: 'test-root' }))
}
