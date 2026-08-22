import axe from 'axe-core'
import type { JSONContent } from '@tiptap/core'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { DocumentWorkspace, type DocumentSeed } from '../../src/app/DocumentWorkspace'
import type { SaveInput, SaveOutcome } from '../../src/documents/gateway'
import * as markdown from '../../src/documents/markdown'
import type { ImageIntentOutcome } from '../../src/platform/contracts'
import { asPath } from '../../src/platform/contracts'
import { FakeDocumentGateway } from './document-gateway.fake'

vi.mock('../../src/documents/markdown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/documents/markdown')>()
  return { ...actual, serializeRichDocument: vi.fn(actual.serializeRichDocument) }
})

let root: Root | undefined

afterEach(() => {
  root?.unmount()
  root = undefined
  document.body.innerHTML = '<div id="test-root"></div>'
})

describe('spec 0013 table and image reordering', () => {
  test('AC1–AC18 AC28–AC30: explicit row and column Move mode uses legal gaps, focus restoration, preview pinning, and one-step history', async () => {
    await renderWorkspace([tableSeed(true)])
    await userEvent.click(cell('6'))
    await userEvent.click(page.getByTestId('table-actions'))
    await expect.element(page.getByTestId('table-move-row')).toBeEnabled()
    await expect.element(page.getByTestId('table-move-column')).toBeEnabled()
    await userEvent.click(page.getByTestId('table-move-row'))
    await expect.element(page.getByTestId('move-controller')).toBeVisible()
    await expect.element(page.getByTestId('move-description')).toHaveTextContent('data row 2 of 2')
    await userEvent.click(page.getByTestId('move-first'))
    await userEvent.click(page.getByTestId('move-place'))
    expect(tableRows()).toEqual(['ABC', '456', '123'])
    expect(byTestId('document-tab').getAttribute('aria-label')).not.toContain('Preview')
    expect(byTestId('document-tab').getAttribute('aria-label')).toContain('dirty')
    await userEvent.keyboard(primaryShortcut('z'))
    expect(tableRows()).toEqual(['ABC', '123', '456'])
    await userEvent.keyboard(primaryShortcut('y'))
    expect(tableRows()).toEqual(['ABC', '456', '123'])

    await userEvent.click(cell('3'))
    await userEvent.click(page.getByTestId('table-actions'))
    await userEvent.click(page.getByTestId('table-move-column'))
    await userEvent.click(page.getByTestId('move-first'))
    await userEvent.click(page.getByTestId('move-place'))
    expect(tableRows()).toEqual(['CAB', '645', '312'])
    expect(document.activeElement).toBe(editor())
    expect(window.getSelection()?.anchorNode?.parentElement?.closest('td,th')?.textContent).toBe('3')
  })

  test('AC2 AC8–AC12: unavailable, no-op, cancellation, tab cleanup, native controls, and announcements change nothing', async () => {
    await renderWorkspace([tableSeed(), { id: 'other', title: 'Other', document: paragraphDocument('Other') }])
    await selectCell(cell('A'))
    await userEvent.click(page.getByTestId('table-actions'))
    await expect.element(page.getByTestId('table-move-row')).toBeDisabled()
    await userEvent.click(page.getByTestId('table-move-column'))
    await expect.element(page.getByTestId('move-status')).toHaveTextContent('column')
    await userEvent.click(page.getByTestId('move-cancel'))
    expect(tableRows()).toEqual(['ABC', '123', '456'])

    await userEvent.click(cell('2'))
    await userEvent.click(page.getByTestId('table-actions'))
    await userEvent.click(page.getByTestId('table-move-row'))
    await userEvent.click(page.getByTestId('document-tab').nth(1))
    expect(document.querySelector('[data-testid="move-controller"]')).toBeNull()
  })

  test('AC19–AC22 AC27 AC31–AC33: Move Image reaches a nested valid gap without changing source identity or invoking authority', async () => {
    const gateway = new FakeDocumentGateway()
    const select = vi.spyOn(gateway, 'selectImage')
    const authorize = vi.spyOn(gateway, 'authorizeImage')
    await renderWorkspace([imageSeed()], gateway)
    await userEvent.click(byTestId('blocked-image'))
    await userEvent.click(page.getByTestId('image-move'))
    await userEvent.click(cell('Target'))
    await userEvent.click(page.getByTestId('move-place'))
    const image = byTestId('blocked-image')
    expect(image.closest('td')?.textContent).toContain('Target')
    expect(image.getAttribute('aria-label')).toContain('Diagram')
    expect(select).not.toHaveBeenCalled()
    expect(authorize).not.toHaveBeenCalled()
    expect(document.activeElement).toBe(editor())
    expect(image.classList.contains('ProseMirror-selectednode')).toBe(true)
  })

  test('AC23–AC27: direct fine-pointer handles share target, pointer-up commit, and cancellation behavior', async () => {
    await renderWorkspace([tableSeed()])
    await userEvent.click(cell('6'))
    const handle = byTestId<HTMLButtonElement>('table-row-drag-handle')
    expect(getComputedStyle(handle).minWidth).toBe('24px')
    handle.dispatchEvent(pointer('pointerdown', 40, 200, 7))
    window.dispatchEvent(pointer('pointermove', 40, 100, 7))
    window.dispatchEvent(pointer('pointercancel', 40, 100, 7))
    expect(tableRows()).toEqual(['ABC', '123', '456'])

    const surface = editor().closest<HTMLElement>('.document-surface')!
    const scroll = vi.spyOn(surface, 'scrollBy').mockImplementation(() => undefined)
    const target = cell('1')
    const hitTest = vi.spyOn(document, 'elementFromPoint').mockReturnValue(target)
    handle.dispatchEvent(pointer('pointerdown', 40, 200, 8))
    window.dispatchEvent(pointer('pointermove', 40, surface.getBoundingClientRect().bottom - 1, 8))
    expect(scroll).toHaveBeenCalled()
    window.dispatchEvent(pointer('lostpointercapture', 40, 100, 8))
    expect(tableRows()).toEqual(['ABC', '123', '456'])
    hitTest.mockRestore()
  })

  test('AC21 AC32: a pending remote image completion follows unchanged identity to its moved position without a duplicate request or revocation', async () => {
    let finish!: (outcome: ImageIntentOutcome) => void
    const pending = new Promise<ImageIntentOutcome>((resolve) => { finish = resolve })
    let requests = 0
    let revocations = 0
    const gateway = new class extends FakeDocumentGateway {
      override async loadRemoteImage(): Promise<ImageIntentOutcome> { requests += 1; return pending }
      override async revokeImage(): Promise<void> { revocations += 1 }
    }()
    await renderWorkspace([remoteImageSeed()], gateway)
    await userEvent.click(byTestId('remote-image'))
    await userEvent.click(page.getByTestId('image-load'))
    expect(requests).toBe(1)
    await userEvent.click(byTestId('remote-image'))
    await userEvent.click(page.getByTestId('image-move'))
    await userEvent.click(cell('Target'))
    await userEvent.click(page.getByTestId('move-place'))
    finish({ asset: { source: 'https://images.example/diagram.png', url: memoryImageUrl() }, kind: 'authorized' })
    await frame()
    await frame()
    expect(byTestId('local-image').closest('td')?.textContent).toContain('Target')
    expect(requests).toBe(1)
    expect(revocations).toBe(0)
  })

  test('AC31: a move committed after an in-flight save snapshot remains dirty and owned by the live tab', async () => {
    let captured: SaveInput | undefined
    let finish!: (outcome: SaveOutcome) => void
    const pending = new Promise<SaveOutcome>((resolve) => { finish = resolve })
    const gateway = new class extends FakeDocumentGateway {
      override async save(input: SaveInput): Promise<SaveOutcome> { captured = input; return pending }
    }()
    await renderWorkspace([{ ...imageSeed(), path: asPath('/notes/reorder.md') }], gateway)
    await userEvent.click(byTestId('blocked-image'))
    await userEvent.click(page.getByTestId('image-move'))
    await userEvent.click(cell('Target'))
    await userEvent.click(page.getByTestId('move-place'))
    gateway.emitCommand('save')
    await frame()
    expect(captured).toBeDefined()
    await userEvent.click(byTestId('blocked-image'))
    await userEvent.click(page.getByTestId('image-move'))
    await userEvent.click(cell('Later'))
    await userEvent.click(page.getByTestId('move-place'))
    finish({ document: captured!, kind: 'saved' })
    await frame()
    await frame()
    expect(byTestId('blocked-image').closest('td')?.textContent).toContain('Later')
    expect(byTestId('document-tab').getAttribute('aria-label')).toContain('dirty')
  })

  test('AC35–AC37: movement remains named, focused, forced-color safe, and free of deprecated drag ARIA', async () => {
    await renderWorkspace([tableSeed()])
    await userEvent.click(cell('6'))
    await userEvent.click(page.getByTestId('table-actions'))
    await userEvent.click(page.getByTestId('table-move-row'))
    expect(document.activeElement).toBe(byTestId('move-first'))
    expect(document.querySelector('[aria-grabbed], [aria-dropeffect]')).toBeNull()
    const audit = await axe.run(document.body, { resultTypes: ['violations'] })
    expect(audit.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
  })

  test('AC34: candidate discovery and commit do not serialize the whole document', async () => {
    const serialize = vi.mocked(markdown.serializeRichDocument)
    serialize.mockClear()
    await renderWorkspace([tableSeed()])
    await userEvent.click(cell('6'))
    await userEvent.click(page.getByTestId('table-actions'))
    await userEvent.click(page.getByTestId('table-move-row'))
    await userEvent.click(page.getByTestId('move-first'))
    await userEvent.click(page.getByTestId('move-place'))
    expect(serialize).not.toHaveBeenCalled()
  })
})

async function renderWorkspace(seeds: readonly DocumentSeed[], gateway = new FakeDocumentGateway()): Promise<void> {
  const container = document.getElementById('test-root') ?? document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  root.render(<DocumentWorkspace gateway={gateway} initialTabs={seeds} reducedMotion />)
  await frame()
  await frame()
}

function tableSeed(preview = false): DocumentSeed {
  const item = (type: 'tableHeader' | 'tableCell', text: string, align: 'left' | 'center' | 'right') => ({ attrs: { align }, type, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
  return { id: 'table', preview, title: 'Table', document: { type: 'doc', content: [{ type: 'table', content: [
    { type: 'tableRow', content: [item('tableHeader', 'A', 'left'), item('tableHeader', 'B', 'center'), item('tableHeader', 'C', 'right')] },
    { type: 'tableRow', content: [item('tableCell', '1', 'left'), item('tableCell', '2', 'center'), item('tableCell', '3', 'right')] },
    { type: 'tableRow', content: [item('tableCell', '4', 'left'), item('tableCell', '5', 'center'), item('tableCell', '6', 'right')] },
  ] }] } }
}

type MarkdownSeed = DocumentSeed & { readonly document: JSONContent; readonly kind?: 'markdown' }

function imageSeed(): MarkdownSeed {
  return { id: 'image', title: 'Image', document: { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Before ' }, { type: 'image', attrs: { alt: 'Diagram', assetId: 'asset-1', src: 'images/a.png', title: 'Exact' } }] },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quote' }] }] },
    { type: 'table', content: [
      { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header' }] }] }] },
      { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Target' }] }] }] },
      { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Later' }] }] }] },
    ] },
  ] } }
}

function remoteImageSeed(): MarkdownSeed {
  const seed = imageSeed()
  return {
    ...seed,
    document: {
      ...seed.document,
      content: seed.document.content!.map((node, index) => index === 0 ? {
        type: 'paragraph',
        content: [{ type: 'image', attrs: { alt: 'Remote diagram', assetId: 'remote-asset', src: 'https://images.example/diagram.png' } }],
      } : node),
    },
  }
}

function paragraphDocument(text: string) {
  return { type: 'doc' as const, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] }
}

function cell(text: string): Element {
  return [...editor().querySelectorAll('th,td')].find((element) => element.textContent === text)!
}

function tableRows(): string[] {
  return [...editor().querySelectorAll('tr')].map((row) => row.textContent ?? '')
}

function editor(): HTMLElement {
  return byTestId('rich-editor').querySelector<HTMLElement>('[contenteditable="true"]')!
}

function byTestId<T extends Element = HTMLElement>(testId: string): T {
  return document.querySelector(`[data-testid="${testId}"]`) as T
}

function pointer(type: string, clientX: number, clientY: number, pointerId: number): PointerEvent {
  return new PointerEvent(type, { bubbles: true, button: 0, clientX, clientY, pointerId, pointerType: 'mouse' })
}

async function selectCell(element: Element): Promise<void> {
  const text = element.querySelector('p')?.firstChild
  if (!text) throw new Error('Expected table cell text')
  const range = document.createRange()
  range.selectNodeContents(text)
  range.collapse(false)
  const selection = window.getSelection()
  selection?.removeAllRanges()
  selection?.addRange(range)
  editor().focus()
  document.dispatchEvent(new Event('selectionchange'))
  await frame()
  await frame()
}

async function frame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

function primaryShortcut(key: string): string {
  return navigator.platform.toLowerCase().includes('mac') ? `{Meta>}${key}{/Meta}` : `{Control>}${key}{/Control}`
}

function memoryImageUrl(): string {
  const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
}
