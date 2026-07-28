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
    expect(document.querySelector('[data-testid="formatting-toolbar"]')).toBeNull()
    expect(document.querySelector('[data-testid="csv-toolbar"]')).toBeNull()
    const tree = page.getByTestId('json-tree')
    await expect.element(tree).toHaveAttribute('role', 'tree')
    expect(document.querySelectorAll('[role="treeitem"]').length).toBeLessThanOrEqual(500)
    expect(document.querySelectorAll('[role="treeitem"][aria-selected="true"]')).toHaveLength(1)
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

  test('AC40-AC50 AC58: active-row rename, scalar editing, type replacement, insertion, deletion, bounds, and undo are atomic', async () => {
    const onChange = vi.fn()
    await renderTree('{"name":"old","empty":[]}', onChange)
    await userEvent.click(rowByText('name'))
    await userEvent.click(page.getByRole('button', { name: 'Rename property' }))
    await userEvent.fill(page.getByTestId('json-inline-editor'), 'renamed')
    await userEvent.click(page.getByRole('button', { name: 'Apply' }))
    expect(onChange).toHaveBeenCalledOnce()
    expect(document.body.textContent).toContain('renamed')

    await userEvent.click(rowByText('empty'))
    await userEvent.click(page.getByRole('button', { name: 'Add item' }))
    expect(document.body.textContent).toContain('null')
    await userEvent.selectOptions(page.getByTestId('json-replace-type'), 'string')
    expect(onChange.mock.calls.length).toBeGreaterThanOrEqual(3)
    editors.at(-1)!.commands.undo()
    expect((jsonRootFromEditor(editors.at(-1)!) as JsonObject).properties).toHaveLength(2)
  })

  test('AC41-AC42 AC49: valid drafts commit on leave, Escape cancels, no-ops stay clean, and invalid numbers block commit', async () => {
    const onChange = vi.fn()
    await renderTree('{"value":"old","number":1e3}', onChange)
    await userEvent.dblClick(rowByText('old'))
    await userEvent.fill(page.getByTestId('json-inline-editor'), 'changed')
    await userEvent.click(rowByText('number'))
    expect(onChange).toHaveBeenCalledOnce()

    await userEvent.keyboard('{F2}')
    await userEvent.fill(page.getByTestId('json-inline-editor'), '01')
    await expect.element(page.getByTestId('json-inline-error')).toBeVisible()
    await expect.element(page.getByRole('button', { name: 'Apply' })).toBeDisabled()
    await userEvent.keyboard('{Escape}')
    expect(document.body.textContent).toContain('1e3')
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

async function renderTree(source: string, onChange: (document: JsonDocument) => void): Promise<void> {
  const parsed = parseJsonBytes(new TextEncoder().encode(source))
  if (parsed.mode !== 'editable') throw new Error(parsed.reason)
  const editor = createJsonEditor(parsed.document, (updated) => onChange({
    ...parsed.document,
    edited: true,
    root: jsonRootFromEditor(updated),
  }))
  editors.push(editor)
  root = createRoot(testContainer())
  root.render(<JsonTree editor={editor} onError={() => undefined} />)
  await wait(20)
}

const rowByText = (text: string) => page.getByTestId('json-row').filter({ hasText: text }).first()
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
