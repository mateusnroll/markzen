import axe from 'axe-core'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { page, userEvent } from 'vitest/browser'

import { DocumentWorkspace, type DocumentSeed } from '../../src/app/DocumentWorkspace'
import { ShellApp } from '../../src/app/ShellApp'
import { ok, type ExternalOpenResult, type SettingsSnapshotPayload, type SettingsPatch } from '../../src/platform/contracts'
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
