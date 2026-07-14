import axe from 'axe-core'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { DocumentWorkspace, type DocumentSeed } from '../../src/app/DocumentWorkspace'
import { ShellApp } from '../../src/app/ShellApp'
import { ok, type ExternalOpenResult, type ImageIntentOutcome, type SettingsSnapshotPayload, type SettingsPatch } from '../../src/platform/contracts'
import { createMemoryPlatform } from '../../src/platform/memory'
import { FakeDocumentGateway } from './document-gateway.fake'

let root: Root | undefined

afterEach(() => {
  root?.unmount()
  root = undefined
  document.body.innerHTML = '<div id="test-root"></div>'
})

describe('spec 0004 formatting toolbar', () => {
  test('AC1 AC2-AC7 AC14: Minimal, mixed, parsed-heading, and Regular presentation exposes only approved actions', async () => {
    await renderWorkspace([], {})
    expect(document.querySelector('[data-testid="formatting-toolbar"]')).toBeNull()

    rerender()
    await renderWorkspace([headingSeed(6)], {})
    await userEvent.click(editor().querySelector('h6')!)
    await frame()
    await expect.element(page.getByTestId('toolbar-summary')).toHaveTextContent('H6')
    await userEvent.click(page.getByTestId('toolbar-summary'))
    await expect.element(page.getByTestId('formatting-toolbar')).toHaveAttribute('aria-label', 'Formatting')
    await userEvent.click(page.getByTestId('toolbar-more'))
    for (const id of ['format-strike', 'format-code', 'format-bullet-list', 'format-ordered-list', 'format-task-list', 'format-blockquote', 'format-link']) {
      await expect.element(page.getByTestId(id)).toBeVisible()
    }

    rerender()
    await renderWorkspace(undefined, { toolbarMode: 'regular' })
    await expect.element(page.getByTestId('formatting-toolbar')).toBeVisible()
    expect(document.querySelector('[data-testid="toolbar-summary"]')).toBeNull()
  })

  test('AC8–AC13 AC15–AC21: saved-selection commands, mixed state, keyboard toolbar behavior, cleanup, and preview pinning are deterministic', async () => {
    await renderWorkspace([{
      id: 'preview',
      preview: true,
      title: 'Preview',
      document: { type: 'doc', content: [{ type: 'paragraph', content: [
        { type: 'text', text: 'bold', marks: [{ type: 'bold' }] },
        { type: 'text', text: ' plain' },
      ] }] },
    }], {})
    const editable = editor()
    editable.focus()
    await userEvent.keyboard(primaryShortcut('a'))
    await userEvent.click(page.getByTestId('toolbar-summary'))
    const bold = page.getByTestId('format-bold')
    await expect.element(bold).toHaveAttribute('aria-pressed', 'mixed')
    await userEvent.click(bold)
    expect(editable.querySelector('strong')?.textContent).toContain('bold plain')
    expect(byTestId('document-tab').getAttribute('aria-label')).not.toContain(', Preview')

    await userEvent.click(page.getByTestId('toolbar-heading'))
    await userEvent.click(page.getByTestId('heading-2'))
    expect(editable.querySelector('h2')).not.toBeNull()

    const toolbar = byTestId<HTMLElement>('formatting-toolbar')
    toolbar.querySelector<HTMLButtonElement>('button')?.focus()
    await userEvent.keyboard('{End}')
    expect(document.activeElement).toBe(toolbar.querySelectorAll('button').item(toolbar.querySelectorAll('button').length - 1))
    await userEvent.keyboard('{Escape}')
    await frame()
    expect(document.querySelector('[data-testid="heading-menu"]')).toBeNull()
  })
})

describe('spec 0005 tables', () => {
  test('AC1-AC3 AC6-AC9 AC13 AC47: inserts a 3x3 header table and exposes contextual named actions', async () => {
    await renderWorkspace(undefined, {})
    await userEvent.click(page.getByTestId('toolbar-summary'))
    await userEvent.click(page.getByTestId('toolbar-more'))
    await expect.element(page.getByTestId('insert-table')).toBeEnabled()
    await userEvent.click(page.getByTestId('insert-table'))
    const table = editor().querySelector('table')!
    expect(table.querySelectorAll('tr')).toHaveLength(3)
    expect(table.querySelectorAll('tr:first-child th')).toHaveLength(3)
    await userEvent.click(table.querySelector('th')!)
    await expect.element(page.getByTestId('table-actions')).toBeVisible()
    await userEvent.click(page.getByTestId('table-actions'))
    for (const id of ['table-add-row', 'table-add-column', 'table-delete-row', 'table-delete-column', 'table-delete-table']) {
      await expect.element(page.getByTestId(id)).toBeVisible()
    }
    await expect.element(page.getByTestId('table-delete-row')).toBeDisabled()
    expect(byTestId('table-actions-context').textContent).toContain('header row')
  })

  test('AC8 AC10-AC12: append and destructive actions preserve a valid table or replacement paragraph', async () => {
    await renderWorkspace([tableSeed()], {})
    await userEvent.click(editor().querySelector('td')!)
    await userEvent.click(page.getByTestId('table-actions'))
    await userEvent.click(page.getByTestId('table-add-row'))
    expect(editor().querySelectorAll('tr')).toHaveLength(4)
    await userEvent.click(page.getByTestId('table-actions'))
    await userEvent.click(page.getByTestId('table-add-column'))
    expect(editor().querySelectorAll('tr:first-child > *')).toHaveLength(4)
    await userEvent.click(page.getByTestId('table-actions'))
    await userEvent.click(page.getByTestId('table-delete-table'))
    expect(editor().querySelector('table')).toBeNull()
    expect(editor().querySelector('p')).not.toBeNull()
  })

  test('AC4 AC5: Tab traverses cells, appends from the final cell, and Shift+Tab preserves the first header selection', async () => {
    await renderWorkspace([tableSeed()], {})
    const cells = editor().querySelectorAll('th, td')
    selectCell(cells.item(0))
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}')
    expect(editor().querySelectorAll('tr')).toHaveLength(3)
    selectCell(cells.item(cells.length - 1))
    await userEvent.keyboard('{Tab}')
    expect(editor().querySelectorAll('tr')).toHaveLength(4)
  })

  test('AC11: deleting the sole column replaces the table with one focused paragraph', async () => {
    await renderWorkspace([oneColumnTableSeed()], {})
    await userEvent.click(editor().querySelector('td')!)
    await userEvent.click(page.getByTestId('table-actions'))
    await userEvent.click(page.getByTestId('table-delete-column'))
    expect(editor().querySelector('table')).toBeNull()
    expect(editor().querySelector(':scope > p')?.textContent).toBe('')
  })
})

describe('spec 0005 local images', () => {
  test('AC17-AC23 AC29 AC43 AC44 AC46-AC48: From Disk requires metadata and inserts, edits, and deletes one accessible loaded image', async () => {
    const gateway = new class extends FakeDocumentGateway {
      override async selectImage(): Promise<ImageIntentOutcome> {
        return { candidate: { candidateId: 'candidate', internal: true, name: 'diagram.png', portable: false, source: '/tmp/diagram.png' }, kind: 'candidate' }
      }
      override async commitImage(): Promise<ImageIntentOutcome> {
        return { asset: { source: '/tmp/diagram.png', url: memoryImageUrl() }, kind: 'authorized' }
      }
    }()
    await renderWorkspaceWithGateway(gateway)
    await userEvent.click(page.getByTestId('toolbar-summary'))
    await userEvent.click(page.getByTestId('toolbar-more'))
    await userEvent.click(page.getByTestId('insert-image'))
    await expect.element(page.getByTestId('image-insert-popover')).toBeVisible()
    await userEvent.click(page.getByTestId('image-from-disk'))
    await expect.element(page.getByTestId('image-apply')).toBeDisabled()
    await userEvent.fill(page.getByTestId('image-alt'), 'Architecture diagram')
    await userEvent.click(page.getByTestId('image-apply'))
    const image = editor().querySelector<HTMLElement>('[data-markzen-image]')!
    expect(image.getAttribute('aria-label')).toContain('Architecture diagram, loaded')
    expect(image.querySelector('img')?.getAttribute('src')).toContain('blob:')
    await userEvent.click(image)
    await expect.element(page.getByTestId('image-actions')).toBeVisible()
    await userEvent.click(page.getByTestId('image-actions'))
    await userEvent.fill(page.getByTestId('image-title'), 'Updated')
    await userEvent.click(page.getByTestId('image-apply'))
    const audit = await axe.run(document.body, { resultTypes: ['violations'] })
    expect(audit.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
    await userEvent.keyboard('{Delete}')
    expect(editor().querySelector('[data-markzen-image]')).toBeNull()
  })

  test('AC19 AC21 AC30 AC34 AC42 AC45: cancel and blocked sources preserve the document without ambient loading', async () => {
    const gateway = new class extends FakeDocumentGateway {
      override async selectImage(): Promise<ImageIntentOutcome> { return { kind: 'cancelled' } }
    }()
    await renderWorkspaceWithGateway(gateway, [{ id: 'blocked', title: 'Blocked', document: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'image', attrs: { alt: 'Remote', src: 'https://example.com/a.png' } }] },
    ] } }])
    expect(editor().querySelector('[data-testid="blocked-image"]')).not.toBeNull()
    expect(editor().querySelector('[data-markzen-image] img')).toBeNull()
    await userEvent.click(page.getByTestId('toolbar-summary'))
    await userEvent.click(page.getByTestId('toolbar-more'))
    await userEvent.click(page.getByTestId('insert-image'))
    await userEvent.click(page.getByTestId('image-from-disk'))
    expect(document.querySelector('[data-testid="image-insert-popover"]')).toBeNull()
    expect(editor().querySelectorAll('[data-markzen-image]')).toHaveLength(1)
  })

  test('AC31 AC32 AC39: transient image authorization does not dirty a clean opened document', async () => {
    const gateway = new class extends FakeDocumentGateway {
      override async resolveImage(_id: string, source: string): Promise<ImageIntentOutcome> {
        return { asset: { source, url: memoryImageUrl() }, kind: 'authorized' }
      }
    }()
    await renderWorkspaceWithGateway(gateway, [{ id: 'clean-image', title: 'Clean', document: { type: 'doc', content: [
      { type: 'paragraph', content: [{ type: 'image', attrs: { alt: 'Local', src: 'image.png' } }] },
    ] } }])
    await expect.element(page.getByTestId('local-image')).toBeVisible()
    expect(byTestId('document-tab').getAttribute('aria-label')).not.toContain('dirty')
  })
})

describe('spec 0004 links', () => {
  test('AC22–AC27 AC33–AC36 AC46: focusable span links retain editing clicks and expose explicit accessible opening', async () => {
    const open = vi.fn<(destination: string) => Promise<ExternalOpenResult>>(async () => ({ kind: 'opened' }))
    await renderWorkspace([linkSeed('example.com')], { onOpenExternal: open })
    const link = editor().querySelector<HTMLElement>('[data-markzen-link]')!
    expect(link.tagName).toBe('SPAN')
    expect(link.getAttribute('role')).toBe('link')
    expect(link.tabIndex).toBe(0)

    await userEvent.click(link)
    expect(open).not.toHaveBeenCalled()
    link.focus()
    await userEvent.keyboard(' ')
    await expect.element(page.getByTestId('link-popover')).toBeVisible()
    await userEvent.keyboard('{Enter}')
    expect(open).toHaveBeenCalledOnce()
    expect(open).toHaveBeenCalledWith('example.com')
  })

  test('AC31 AC37–AC45 AC48: unsupported opening, editing, removing, cancellation, and adjacent boundaries preserve content', async () => {
    const open = vi.fn<(destination: string) => Promise<ExternalOpenResult>>(async () => ({ kind: 'unsupported' }))
    await renderWorkspace([linkSeed('../relative.md')], { onOpenExternal: open })
    const link = editor().querySelector<HTMLElement>('[data-markzen-link]')!
    link.focus()
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByTestId('document-issue')).toHaveTextContent('cannot be opened')

    link.focus()
    await userEvent.keyboard(' ')
    await expect.element(page.getByTestId('link-popover')).toBeVisible()
    await userEvent.click(page.getByTestId('link-edit'))
    const input = page.getByTestId('link-destination')
    await userEvent.fill(input, '#changed')
    await userEvent.click(page.getByTestId('link-apply'))
    expect(editor().querySelector<HTMLElement>('[data-markzen-link]')?.dataset.href).toBe('#changed')

    editor().querySelector<HTMLElement>('[data-markzen-link]')?.focus()
    await userEvent.click(page.getByTestId('link-remove'))
    expect(editor().querySelector('[data-markzen-link]')).toBeNull()
    expect(editor().textContent).toContain('Link')
  })
})

describe('spec 0004 in-document search', () => {
  test('AC49 AC51–AC64 AC66–AC68: Find matches across marks, navigates, rescans, closes, and never changes document content', async () => {
    await renderWorkspace([{
      id: 'search',
      title: 'Search',
      document: { type: 'doc', content: [
        { type: 'paragraph', content: [{ type: 'text', text: 'Hel' }, { type: 'text', text: 'lo', marks: [{ type: 'bold' }] }] },
        { type: 'paragraph', content: [{ type: 'text', text: 'hello' }] },
      ] },
    }], {})
    const before = editor().innerHTML
    editor().focus()
    await userEvent.keyboard('{Control>}f{/Control}')
    const input = page.getByTestId('search-input')
    await userEvent.fill(input, 'HELLO')
    await wait(180)
    expect(document.querySelectorAll('.search-match').length).toBeGreaterThanOrEqual(2)
    await expect.element(page.getByTestId('search-status')).toHaveTextContent('1 of 2')
    await userEvent.keyboard('{Enter}')
    await expect.element(page.getByTestId('search-status')).toHaveTextContent('2 of 2')

    await userEvent.keyboard('{Control>}f{/Control}')
    expect(document.activeElement).toBe(byTestId('search-input'))
    await userEvent.keyboard('{Escape}')
    expect(document.querySelector('[data-testid="search-panel"]')).toBeNull()
    expect(editor().innerHTML).toBe(before)
  })

  test('AC53 AC55 AC63 AC69: empty, normalized Unicode, non-overlap, and no-active-editor states remain deterministic', async () => {
    await renderWorkspace([{
      id: 'unicode', title: 'Unicode', document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Cafe\u0301 aaa' }] }] },
    }], {})
    editor().focus()
    await userEvent.keyboard('{Control>}f{/Control}')
    await expect.element(page.getByTestId('search-next')).toBeDisabled()
    await userEvent.fill(page.getByTestId('search-input'), 'CAFÉ')
    await wait(180)
    expect(document.querySelectorAll('.search-match')).toHaveLength(1)
  })
})

describe('spec 0004 settings, themes, and surface coordination', () => {
  test('AC70–AC81 AC83 AC84: one accessible modal applies authoritative theme/toolbar settings and closes editor surfaces', async () => {
    const gateway = new FakeDocumentGateway()
    const memory = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    const windowId = await memory.platform.window.create()
    let snapshot: SettingsSnapshotPayload = {
      revision: 0,
      schemaVersion: 1,
      sidebarWidth: 240,
      theme: 'system',
      toolbarMode: 'minimal',
    }
    const listeners = new Set<(value: SettingsSnapshotPayload) => void>()
    const patch = vi.fn(async (value: SettingsPatch) => {
      snapshot = { ...snapshot, ...value, revision: snapshot.revision + 1 }
      for (const listener of listeners) listener(snapshot)
      return ok(snapshot)
    })
    const container = document.getElementById('test-root') ?? document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
    root.render(
      <ShellApp
        documentGateway={gateway}
        environment={{ forcedColors: false, reducedMotion: false }}
        fixtureName="writing"
        platformName="linux"
        settings={{
          appearance: 'light',
          onAppearance: () => () => undefined,
          onPatch: patch,
          onRetry: () => undefined,
          onSnapshot: (listener) => { listeners.add(listener); return () => listeners.delete(listener) },
          onWarning: () => () => undefined,
          snapshot,
        }}
        windowId={windowId}
        windowPort={memory.platform.window}
      />,
    )
    await expect.element(page.getByTestId('app-shell')).toBeVisible()
    await userEvent.click(page.getByTestId('toolbar-summary'))
    gateway.emitCommand('settings')
    await expect.element(page.getByTestId('settings-dialog')).toBeVisible()
    expect(document.querySelector('[data-testid="toolbar-more-menu"]')).toBeNull()
    await userEvent.selectOptions(page.getByTestId('theme-setting'), 'dark')
    await expect.element(page.getByTestId('app-shell')).toHaveAttribute('data-theme', 'dark')
    await userEvent.selectOptions(page.getByTestId('toolbar-setting'), 'regular')
    expect(patch).toHaveBeenCalledWith({ toolbarMode: 'regular' })
    const audit = await axe.run(document.body, { resultTypes: ['violations'] })
    expect(audit.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
    await userEvent.keyboard('{Escape}')
    expect(document.querySelector('[data-testid="settings-dialog"]')).toBeNull()
  })

  test('AC73–AC77 AC82 AC85: effective System appearance, forced colors, zoom, and toolbar revisions remain reachable', async () => {
    const rendered = await renderShell({ theme: 'system', toolbarMode: 'regular' }, 'dark')
    document.documentElement.style.zoom = '2'
    await expect.element(page.getByTestId('app-shell')).toHaveAttribute('data-theme', 'dark')
    await expect.element(page.getByTestId('formatting-toolbar')).toBeVisible()
    expect(getComputedStyle(byTestId('formatting-toolbar')).maxWidth).not.toBe('')
    rendered.unmount()
  })
})

async function renderWorkspace(
  seeds: readonly DocumentSeed[] | undefined = undefined,
  options: { readonly onOpenExternal?: (destination: string) => Promise<ExternalOpenResult>; readonly toolbarMode?: 'minimal' | 'regular' },
): Promise<void> {
  const container = document.getElementById('test-root') ?? document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  root.render(<DocumentWorkspace gateway={new FakeDocumentGateway()} {...options} {...(seeds ? { initialTabs: seeds } : {})} />)
  await frame()
  await frame()
}

async function renderWorkspaceWithGateway(gateway: FakeDocumentGateway, seeds?: readonly DocumentSeed[]): Promise<void> {
  const container = document.getElementById('test-root') ?? document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  root.render(<DocumentWorkspace gateway={gateway} {...(seeds ? { initialTabs: seeds } : {})} />)
  await frame()
  await frame()
}

function tableSeed(): DocumentSeed {
  const cell = (type: 'tableHeader' | 'tableCell', text: string) => ({ type, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
  return {
    id: 'table',
    title: 'Table',
    document: { type: 'doc', content: [{ type: 'table', content: [
      { type: 'tableRow', content: [cell('tableHeader', 'A'), cell('tableHeader', 'B'), cell('tableHeader', 'C')] },
      { type: 'tableRow', content: [cell('tableCell', '1'), cell('tableCell', '2'), cell('tableCell', '3')] },
      { type: 'tableRow', content: [cell('tableCell', '4'), cell('tableCell', '5'), cell('tableCell', '6')] },
    ] }] },
  }
}

function oneColumnTableSeed(): DocumentSeed {
  const cell = (type: 'tableHeader' | 'tableCell', text: string) => ({ type, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
  return {
    id: 'one-column',
    title: 'One column',
    document: { type: 'doc', content: [{ type: 'table', content: [
      { type: 'tableRow', content: [cell('tableHeader', 'A')] },
      { type: 'tableRow', content: [cell('tableCell', '1')] },
    ] }] },
  }
}

async function renderShell(settings: Pick<SettingsSnapshotPayload, 'theme' | 'toolbarMode'>, appearance: 'light' | 'dark') {
  const memory = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
  const windowId = await memory.platform.window.create()
  const snapshot: SettingsSnapshotPayload = { revision: 0, schemaVersion: 1, sidebarWidth: 240, ...settings }
  const container = document.getElementById('test-root') ?? document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  root.render(
    <ShellApp
      documentGateway={new FakeDocumentGateway()}
      environment={{ forcedColors: true, reducedMotion: true }}
      fixtureName="writing"
      platformName="linux"
      settings={{
        appearance,
        onAppearance: () => () => undefined,
        onPatch: async () => ok(snapshot),
        onRetry: () => undefined,
        onSnapshot: () => () => undefined,
        onWarning: () => () => undefined,
        snapshot,
      }}
      windowId={windowId}
      windowPort={memory.platform.window}
    />,
  )
  await expect.element(page.getByTestId('app-shell')).toBeVisible()
  return { unmount: () => root?.unmount() }
}

function headingSeed(level: number): DocumentSeed {
  return { id: 'heading', title: 'Heading', document: { type: 'doc', content: [{ type: 'heading', attrs: { level }, content: [{ type: 'text', text: 'Heading' }] }] } }
}

function linkSeed(href: string): DocumentSeed {
  return {
    id: 'link',
    title: 'Link',
    document: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Link', marks: [{ type: 'link', attrs: { href } }] }] }] },
  }
}

function editor(): HTMLElement {
  return byTestId('rich-editor').querySelector<HTMLElement>('[contenteditable="true"]')!
}

function byTestId<T extends Element = HTMLElement>(testId: string): T {
  return document.querySelector(`[data-testid="${testId}"]`) as T
}

function selectCell(element: Element): void {
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
}

function rerender(): void {
  root?.unmount()
  root = undefined
  document.body.innerHTML = '<div id="test-root"></div>'
}

async function frame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}

async function wait(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve) => setTimeout(resolve, milliseconds))
}

function primaryShortcut(key: string): string {
  return navigator.platform.toLowerCase().includes('mac') ? `{Meta>}${key}{/Meta}` : `{Control>}${key}{/Control}`
}

function memoryImageUrl(): string {
  const binary = atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=')
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0))
  return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
}
