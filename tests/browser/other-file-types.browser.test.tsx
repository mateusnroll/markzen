import axe from 'axe-core'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { DocumentWorkspace, type DocumentSeed } from '../../src/app/DocumentWorkspace'
import { TEXT_LINE_MAX_BYTES, type TextDocument } from '../../src/documents/text'
import { FakeDocumentGateway } from './document-gateway.fake'

let root: Root | undefined

afterEach(() => {
  root?.unmount()
  root = undefined
  document.body.innerHTML = '<div id="test-root"></div>'
})

describe('spec 0011 generic text editor', () => {
  test('AC10-AC15 AC31-AC39 AC69: generic text is one literal monospaced editor with Find, history, and accessible no-wrap presentation', async () => {
    await renderWorkspace(textSeed('const value = "<img src=x>"\nsecond line\n'))
    const label = byTestId('text-language-label')
    expect(label.textContent).toBe('TypeScript')
    expect(document.querySelector('[data-testid="formatting-toolbar"]')).toBeNull()
    expect(document.querySelector('[data-testid="csv-grid"]')).toBeNull()
    expect(document.querySelector('[data-testid="json-tree"]')).toBeNull()
    const editor = byTestId('text-editor-content')
    expect(editor.getAttribute('contenteditable')).toBe('true')
    expect(getComputedStyle(editor).fontFamily.toLowerCase()).toMatch(/mono/)
    expect(getComputedStyle(editor).whiteSpace).toBe('pre')
    expect(editor.querySelector('img')).toBeNull()
    expect(editor.textContent).toContain('<img src=x>')
    expect(byTestId('active-document-panel').classList).toContain('document-surface-full-panel')
    expect(byTestId('document-page').classList).toContain('document-page-full-panel')
    expect(byTestId('document-title-gutter').classList).toContain('document-title-gutter')

    editor.focus()
    await userEvent.keyboard('{Control>}f{/Control}')
    expect(byTestId('search-panel')).not.toBeNull()
    await userEvent.keyboard('second')
    await vi.waitFor(() => expect(document.body.textContent).toContain('1 of 1'))
    expect(byTestId('document-tab').getAttribute('aria-label')).not.toContain('dirty')

    await userEvent.keyboard('{Escape}')
    editor.focus()
    await userEvent.keyboard('{End}!')
    expect(byTestId('document-tab').getAttribute('aria-label')).toContain('dirty')
    expect(byTestId('document-tab').getAttribute('aria-label')).not.toContain('Preview')
    await userEvent.keyboard(/Mac/.test(navigator.platform) ? '{Meta>}z{/Meta}' : '{Control>}z{/Control}')
    expect(editor.textContent).not.toContain('!')
    expect((await axe.run(document.body)).violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
  })

  test('AC70-AC74: CodeBlockLowLight derives TypeScript tokens while plain text remains uncolored literal content', async () => {
    await renderWorkspace(textSeed('export const answer: number = 42\n'))
    const editor = byTestId('text-editor-content')
    expect(editor.querySelector('code.language-typescript')).not.toBeNull()
    expect(editor.querySelector('.hljs-keyword')?.textContent).toBe('export')
    expect(editor.querySelector('.hljs-built_in')?.textContent).toBe('number')
    expect(editor.textContent).toBe('export const answer: number = 42\n')

    editor.focus()
    await userEvent.keyboard('{End} // value')
    expect(editor.querySelector('.hljs-comment')?.textContent).toContain('// value')
    expect(byTestId('document-tab').getAttribute('aria-label')).toContain('dirty')
    await userEvent.keyboard(/Mac/.test(navigator.platform) ? '{Meta>}z{/Meta}' : '{Control>}z{/Control}')
    expect(editor.textContent).toBe('export const answer: number = 42\n')

    rerender()
    await renderWorkspace(textSeed('export const answer = 42\n', false, 'Plain text'))
    const plain = byTestId('text-editor-content')
    expect(plain.querySelector('[class^="hljs-"]')).toBeNull()
    expect(plain.textContent).toBe('export const answer = 42\n')
    expect(byTestId('text-language-label').textContent).toBe('Plain text')
    expect((await axe.run(document.body)).violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
  })

  test('AC20 AC22 AC29: preservation hides lossy content and bound-crossing input is rejected without pinning or moving selection', async () => {
    await renderWorkspace({
      id: 'preserved',
      kind: 'text',
      language: 'Plain text',
      managedExtension: '.txt',
      preservation: { bytes: Uint8Array.from([0x41, 0xff]), display: 'This file is not valid UTF-8.', kind: 'text' },
      preview: true,
      title: 'unsafe',
    })
    expect(document.querySelector('[data-testid="text-editor-content"]')).toBeNull()
    expect(document.querySelector('[data-testid="preservation-view"]')).toBeNull()
    expect(byTestId('preservation-explanation').textContent).toContain('not valid UTF-8')
    expect(byTestId('open-in-default-app')).not.toBeNull()

    rerender()
    await renderWorkspace(textSeed('x'.repeat(TEXT_LINE_MAX_BYTES), true, 'Plain text'))
    const editor = byTestId('text-editor-content')
    editor.focus()
    const before = document.getSelection()?.anchorOffset
    await userEvent.keyboard('y')
    expect(byTestId('document-issue').textContent).toContain('1 MiB')
    expect(byTestId('document-tab').getAttribute('aria-label')).toContain('Preview')
    expect(document.getSelection()?.anchorOffset).toBe(before)
  })
})

describe('spec 0011 view-only documents', () => {
  test('AC12 AC42-AC50: raster tabs expose metadata, pixels, fit-only presentation, reduced-motion withholding, and no editor/title mutation', async () => {
    await renderWorkspace({
      id: 'raster',
      kind: 'raster',
      path: '/notes/study.png' as never,
      preview: true,
      raster: { animated: false, format: 'PNG', height: 480, url: 'markzen-asset://token', width: 640 },
      title: 'study.png',
    }, new FakeDocumentGateway(), false)
    expect(document.querySelector('[data-testid="document-title"]')).toBeNull()
    expect(document.querySelector('[contenteditable="true"]')).toBeNull()
    expect(byTestId('raster-metadata').textContent).toContain('PNG · 640 × 480 · Static')
    const image = byTestId<HTMLImageElement>('raster-image')
    expect(image.getAttribute('src')).toBe('markzen-asset://token')
    expect(image.getAttribute('alt')).toContain('study.png')
    expect(getComputedStyle(image).maxWidth).toBe('100%')

    rerender()
    await renderWorkspace({
      id: 'animated',
      kind: 'raster',
      path: '/notes/study.gif' as never,
      raster: { animated: true, format: 'GIF', height: 20, url: 'markzen-asset://animated', width: 30 },
      title: 'study.gif',
    }, new FakeDocumentGateway(), true)
    expect(document.querySelector('[data-testid="raster-image"]')).toBeNull()
    expect(byTestId('raster-motion-warning').textContent).toContain('withheld')
    expect(byTestId('open-in-default-app')).not.toBeNull()
  })

  test('AC51-AC57 AC61 AC64-AC65: external handoff is the only action and native write commands stay inert', async () => {
    const handoff = vi.fn(async () => ({ kind: 'opened' as const }))
    const save = vi.fn()
    const gateway = new class extends FakeDocumentGateway {
      override openInDefaultApp = handoff
      override save = save
    }()
    await renderWorkspace({
      id: 'external',
      kind: 'external',
      limitation: 'Markzen cannot preview this file type.',
      path: '/notes/archive.zip' as never,
      preview: true,
      title: 'archive.zip',
    }, gateway)
    expect(document.querySelector('[data-testid="document-title"]')).toBeNull()
    expect(document.querySelector('[contenteditable="true"]')).toBeNull()
    expect(byTestId('external-limitation').textContent).toContain('cannot preview')
    gateway.emitCommand('save')
    gateway.emitCommand('save-as')
    await frame()
    expect(save).not.toHaveBeenCalled()
    await userEvent.click(byTestId('open-in-default-app'))
    expect(handoff).toHaveBeenCalledWith('external')
    expect(byTestId('document-tab').getAttribute('aria-label')).toContain('Preview')
  })
})

function textSeed(text: string, preview = false, language = 'TypeScript'): DocumentSeed {
  const document: TextDocument = {
    edited: false,
    encoding: { bom: false, newline: 'lf' },
    originalBytes: new TextEncoder().encode(text),
    text,
  }
  return { id: 'text', kind: 'text', language, managedExtension: '.ts', preview, text: document, title: 'example' }
}

async function renderWorkspace(
  seed: DocumentSeed,
  gateway = new FakeDocumentGateway(),
  reducedMotion = false,
): Promise<void> {
  const container = document.getElementById('test-root') ?? document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  root.render(<DocumentWorkspace gateway={gateway} initialTabs={[seed]} reducedMotion={reducedMotion} />)
  await frame()
  await frame()
}

function rerender(): void {
  root?.unmount()
  root = undefined
  document.body.innerHTML = '<div id="test-root"></div>'
}

function byTestId<T extends Element = HTMLElement>(testId: string): T {
  const element = document.querySelector(`[data-testid="${testId}"]`)
  if (!element) throw new Error(`Missing data-testid=${testId}`)
  return element as T
}

async function frame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}
