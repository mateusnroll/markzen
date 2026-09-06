import axe from 'axe-core'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { DocumentWorkspace, type DocumentSeed } from '../../src/app/DocumentWorkspace'
import type { SaveInput, SaveOutcome } from '../../src/documents/gateway'
import { FakeDocumentGateway } from './document-gateway.fake'
import * as markdown from '../../src/documents/markdown'

vi.mock('../../src/documents/markdown', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../src/documents/markdown')>()
  return { ...actual, parseDocumentBytes: vi.fn(actual.parseDocumentBytes), serializeRichDocument: vi.fn(actual.serializeRichDocument) }
})

let root: Root | undefined
const mod = navigator.platform.includes('Mac') ? 'Meta' : 'Control'
const frame = () => new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
const element = (id: string) => {
  const result = document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
  if (!result) throw new Error(`Missing ${id}`)
  return result
}
const raw = () => element('raw-editor-content')
async function mount(seeds: readonly DocumentSeed[] = [{ id: 'one', title: 'One', document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'hello world' }] }] } }], gateway = new FakeDocumentGateway()) {
  const container = document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  root.render(<DocumentWorkspace initialTabs={seeds} gateway={gateway} />)
  await frame(); await frame()
  return gateway
}
async function toggle(gateway: FakeDocumentGateway) {
  gateway.emitCommand('raw-markdown')
  await frame(); await frame()
}
async function replace(text: string) {
  raw().focus()
  await userEvent.keyboard(`{${mod}>}a{/${mod}}`)
  await userEvent.keyboard('{Backspace}')
  await userEvent.keyboard(text)
  await frame()
}
afterEach(() => { root?.unmount(); root = undefined; document.body.innerHTML = '<div id="test-root"></div>'; document.documentElement.style.zoom = ''; vi.clearAllMocks() })

describe('spec 0015 Raw editor', () => {
  test('AC8 AC9 AC12 AC13: named highlighted inert source, gutter, soft wrap and accessible constrained layout', async () => {
    const gateway = await mount()
    await toggle(gateway)
    expect(raw().getAttribute('aria-label')).toContain('One — Raw Markdown')
    expect(element('raw-line-numbers').getAttribute('aria-hidden')).toBe('true')
    await replace('# Heading\n<script>alert(1)</script>\n![img](https://example.com/image.png)')
    expect(raw().querySelector('script,img,a')).toBeNull()
    expect(raw().querySelector('[class^="hljs-"]')).not.toBeNull()
    expect(getComputedStyle(raw().querySelector('pre')!).whiteSpace).toBe('pre-wrap')
    document.documentElement.style.zoom = '2'
    const audit = await axe.run(element('document-workspace'), { resultTypes: ['violations'] })
    expect(audit.violations.filter((v) => ['serious', 'critical'].includes(v.impact ?? ''))).toEqual([])
    document.documentElement.style.zoom = ''
  })
  test('AC10 AC15 AC18: unchanged transfers retain each history; changed transfer clears only receiving history', async () => {
    const gateway = await mount()
    await toggle(gateway)
    await replace('changed')
    await toggle(gateway)
    expect(element('rich-editor-content').textContent).toBe('changed')
    await userEvent.keyboard(`{${mod}>}z{/${mod}}`)
    expect(element('rich-editor-content').textContent).toBe('changed')
    await toggle(gateway)
    expect(raw().textContent).toBe('changed\n')
    await replace('newer')
    await userEvent.keyboard(`{${mod}>}z{/${mod}}`)
    expect(raw().textContent).not.toBe('newer')
  })
  test('AC11: Find searches literal syntax and returns focus to Raw', async () => {
    const gateway = await mount()
    await toggle(gateway)
    await replace('needle needle')
    gateway.emitCommand('find'); await frame()
    await userEvent.fill(element('search-input'), 'needle')
    await expect.poll(() => element('search-status').textContent).toBe('1 of 2')
    element('search-close').click(); await frame()
    expect(document.activeElement).toBe(raw())
  })
  test('AC14 AC16 AC21: explicit transfers use current content without making a clean tab dirty', async () => {
    const gateway = await mount()
    await toggle(gateway)
    expect(raw().textContent).toBe('hello world\n')
    expect(element('document-tab').getAttribute('aria-label')).toBe('One')
    await toggle(gateway)
    expect(element('document-tab').getAttribute('aria-label')).toBe('One')
    await toggle(gateway)
    await replace('# Edited')
    await toggle(gateway)
    expect(element('rich-editor-content').querySelector('h1')?.textContent).toBe('Edited')
  })
  test('AC17: failed Rich conversion preserves source, selection, mode and dirty history', async () => {
    const gateway = await mount()
    await toggle(gateway)
    const notice = element('raw-notice')
    expect(notice.textContent).toBe('')
    await replace('$$unsupported\nretained')
    const before = window.getSelection()?.toString()
    await toggle(gateway)
    expect(raw().textContent).toBe('$$unsupported\nretained')
    expect(window.getSelection()?.toString()).toBe(before)
    expect(element('raw-notice')).toBe(notice)
    expect(notice.textContent).toContain('Rich')
    expect(element('document-tab').getAttribute('aria-label')).toContain('dirty')
  })
  test('AC19: changed transfer maps a valid caret and keeps document focus', async () => {
    const gateway = await mount()
    await toggle(gateway)
    await replace('# hello world')
    await toggle(gateway)
    expect(document.activeElement).toBe(element('rich-editor-content'))
    expect(window.getSelection()?.anchorNode && element('rich-editor-content').contains(window.getSelection()!.anchorNode)).toBe(true)
  })
  test('AC20: composition is captured once before mode switch and save', async () => {
    let saved: SaveInput | undefined
    const gateway = new class extends FakeDocumentGateway {
      override async save(input: SaveInput): Promise<SaveOutcome> { saved = input; return { kind: 'saved', document: input } }
    }()
    await mount(undefined, gateway)
    await toggle(gateway)
    raw().focus()
    raw().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    await userEvent.keyboard('文')
    gateway.emitCommand('save'); await frame()
    expect(saved?.raw?.match(/文/g)).toHaveLength(1)
    await toggle(gateway)
    expect(element('rich-editor-content').textContent?.match(/文/g)).toHaveLength(1)
  })
  test('AC20: Save captures a final composition DOM mutation before the observer microtask', async () => {
    let saved: SaveInput | undefined
    const gateway = new class extends FakeDocumentGateway {
      override async save(input: SaveInput): Promise<SaveOutcome> { saved = input; return { kind: 'saved', document: input } }
    }()
    await mount(undefined, gateway)
    await toggle(gateway)
    raw().focus()
    raw().dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    const text = raw().querySelector('code')!.firstChild!
    text.textContent += '文'
    const range = document.createRange()
    range.selectNodeContents(text); range.collapse(false)
    window.getSelection()?.removeAllRanges(); window.getSelection()?.addRange(range)
    gateway.emitCommand('save')
    await frame()
    expect(saved?.raw).toBe('hello world\n文')
    expect(document.activeElement).toBe(raw())
    await toggle(gateway)
    expect(element('rich-editor-content').textContent?.match(/文/g)).toHaveLength(1)
  })
  test('AC14: failed serialization leaves Rich source and exposes its conversion notice', async () => {
    const gateway = await mount()
    const notice = element('raw-notice')
    vi.mocked(markdown.serializeRichDocument).mockImplementationOnce(() => { throw new Error('Serialization failed') })
    await toggle(gateway)
    expect(element('rich-editor-content').textContent).toBe('hello world')
    expect(element('raw-notice')).toBe(notice)
    expect(notice.textContent).toContain('cannot safely transfer')
  })
  test('AC3 AC7: only the native modifier on an eligible Markdown editor invokes Raw', async () => {
    await mount([{ id: 'one', title: 'Plain', kind: 'text', language: 'plaintext' }])
    const event = new KeyboardEvent('keydown', { key: 'e', metaKey: mod === 'Meta', ctrlKey: mod === 'Control', bubbles: true, cancelable: true })
    element('text-editor-content').dispatchEvent(event)
    expect(event.defaultPrevented).toBe(false)
  })
  test('AC28 AC32: Save All explains supersession while the newer save is still pending', async () => {
    const pending: (() => void)[] = []
    const gateway = new class extends FakeDocumentGateway {
      override save(input: SaveInput): Promise<SaveOutcome> {
        return new Promise((resolve) => pending.push(() => resolve({ kind: 'saved', document: input })))
      }
    }()
    await mount(undefined, gateway)
    await toggle(gateway)
    await replace('changed')
    gateway.emitCommand('save-all'); await frame()
    gateway.emitCommand('save'); await frame()
    expect(pending).toHaveLength(2)
    pending[0]!(); await frame()
    expect(element('document-issue').textContent).toContain('Save All stopped')
    expect(element('document-issue').textContent).toContain('took over')
    expect(element('document-tab').getAttribute('aria-label')).toContain('dirty')
    pending[1]!(); await frame()
    expect(element('document-tab').getAttribute('aria-label')).not.toContain('dirty')
  })
  test('AC35: ordinary Raw edits and Find do not parse or serialize a rich document', async () => {
    const gateway = await mount()
    await toggle(gateway)
    vi.mocked(markdown.parseDocumentBytes).mockClear()
    vi.mocked(markdown.serializeRichDocument).mockClear()
    await replace('literal **source**')
    gateway.emitCommand('find'); await frame()
    await userEvent.fill(element('search-input'), 'source')
    await expect.poll(() => element('search-status').textContent).toBe('1 of 1')
    expect(markdown.parseDocumentBytes).not.toHaveBeenCalled()
    expect(markdown.serializeRichDocument).not.toHaveBeenCalled()
  })
  test('AC22: Raw edit pins preview and undo to its baseline clears content dirty', async () => {
    const gateway = await mount([{ id: 'one', title: 'Preview', preview: true }])
    await toggle(gateway)
    raw().focus(); await userEvent.keyboard('edit')
    await frame()
    expect(element('document-tab').getAttribute('aria-label')).toBe('Preview, dirty')
    await userEvent.keyboard(`{${mod}>}z{/${mod}}`); await frame()
    expect(element('document-tab').getAttribute('aria-label')).toBe('Preview')
  })
})
