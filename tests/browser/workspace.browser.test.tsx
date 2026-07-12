import axe from 'axe-core'
import { createRoot, type Root } from 'react-dom/client'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { WorkspaceSidebar, type WorkspaceRootSeed } from '../../src/app/WorkspaceSidebar'
import { DocumentWorkspace, type DocumentSeed } from '../../src/app/DocumentWorkspace'
import type { DocumentGatewayPort, OpenOutcome, WorkspaceOpenInput } from '../../src/documents/gateway'
import { asFileKey, asPath, asRootId, type DirectoryEntry } from '../../src/platform/contracts'
import { FakeDocumentGateway } from './document-gateway.fake'

let root: Root | undefined
const defaultInnerWidth = window.innerWidth

afterEach(() => {
  root?.unmount()
  root = undefined
  document.body.innerHTML = '<div id="test-root"></div>'
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: defaultInnerWidth })
})

const entry = (name: string, kind: DirectoryEntry['kind'] = 'file', prefix = '/notes'): DirectoryEntry => ({
  fileKey: asFileKey(`${prefix}/${name}`.toLocaleLowerCase('en-US')),
  kind,
  name,
  path: asPath(`${prefix}/${name}`),
})

const roots = (...values: Array<{ path: string; entries: readonly DirectoryEntry[] }>): WorkspaceRootSeed[] => values.map((value, index) => ({
  entries: value.entries,
  path: asPath(value.path),
  rootId: asRootId(`root-${index + 1}`),
}))

describe('spec 0003 accessible workspace sidebar', () => {
  test('AC16 AC19 AC30 AC32: roots retain order, active aliases mark current, unsupported rows stay disabled, and collapse removes descendants', async () => {
    const active = asFileKey('/shared/a.md')
    await renderSidebar({
      activeFileKey: active,
      roots: roots(
        { path: '/first', entries: [{ ...entry('a.md', 'file', '/first'), fileKey: active }, entry('image.png', 'file', '/first')] },
        { path: '/second', entries: [{ ...entry('alias.md', 'file', '/second'), fileKey: active }] },
      ),
    })
    expect([...document.querySelectorAll('[data-testid="workspace-root-header"]')].map((node) => node.textContent)).toEqual(['first', 'second'])
    expect(document.querySelectorAll('[aria-current="page"]')).toHaveLength(2)
    const unsupported = byLabel<HTMLButtonElement>('image.png')
    expect(unsupported.getAttribute('aria-disabled')).toBe('true')

    await userEvent.click(document.querySelectorAll<HTMLButtonElement>('[data-testid="workspace-root-header"]')[0]!)
    expect(byLabelOptional('a.md')).toBeNull()
    await userEvent.click(document.querySelectorAll<HTMLButtonElement>('[data-testid="workspace-root-header"]')[0]!)
    expect(byLabel('a.md')).not.toBeNull()
  })

  test('AC24 AC27 AC37 AC38: directories expose loading/error state while linked directories remain terminal', async () => {
    let reject!: (error: Error) => void
    const pending = new Promise<readonly DirectoryEntry[]>((_resolve, rejectPromise) => { reject = rejectPromise })
    const onList = vi.fn(() => pending)
    await renderSidebar({
      onList,
      roots: roots({ path: '/notes', entries: [entry('folder', 'directory'), entry('linked', 'directory-symlink')] }),
    })
    await userEvent.click(byLabel('folder'))
    expect(byLabel('folder').getAttribute('aria-busy')).toBe('true')
    reject(new Error('denied'))
    await frame()
    expect(byLabel('folder').getAttribute('aria-describedby')).toContain('workspace-row-error')
    expect(byLabel('linked').hasAttribute('aria-expanded')).toBe(false)
    byLabel<HTMLButtonElement>('linked').click()
    expect(onList).toHaveBeenCalledOnce()
  })

  test('AC64-AC72: tree semantics, roving focus, arrows, typeahead, preview and pinned keyboard paths are deterministic', async () => {
    const onOpen = vi.fn()
    await renderSidebar({
      onOpen,
      roots: roots({ path: '/notes', entries: [entry('alpha.md'), entry('beta.md'), entry('folder', 'directory')] }),
    })
    const tree = document.querySelector('[role="tree"]')
    expect(tree).not.toBeNull()
    expect(document.querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1)
    const alpha = byLabel<HTMLButtonElement>('alpha.md')
    alpha.focus()
    await userEvent.keyboard('{ArrowDown}')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('beta.md')
    await userEvent.keyboard('f')
    expect(document.activeElement?.getAttribute('aria-label')).toBe('folder')
    alpha.focus()
    await userEvent.keyboard('{Enter}')
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'alpha.md' }), false, asRootId('root-1'))
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    expect(onOpen).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'alpha.md' }), true, asRootId('root-1'))
  })

  test('AC73-AC77 AC111: separator keyboard operations clamp and apply width immediately', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1_000 })
    const onWidthChange = vi.fn()
    await renderSidebar({ onWidthChange, roots: roots({ path: '/notes', entries: [entry('a.md')] }), width: 240 })
    const separator = document.querySelector<HTMLElement>('[role="separator"]')!
    separator.focus()
    await userEvent.keyboard('{ArrowRight}')
    expect(separator.getAttribute('aria-valuenow')).toBe('250')
    expect(onWidthChange).toHaveBeenLastCalledWith(250)
    await userEvent.keyboard('{Shift>}{ArrowLeft}{/Shift}')
    expect(separator.getAttribute('aria-valuenow')).toBe('210')
    await userEvent.keyboard('{End}')
    expect(separator.getAttribute('aria-valuenow')).toBe('480')
    await userEvent.keyboard('{Home}')
    expect(separator.getAttribute('aria-valuenow')).toBe('160')
  })

  test('AC116: a 10,000-entry loaded tree renders at most 300 treeitems', async () => {
    await renderSidebar({
      roots: roots({ path: '/notes', entries: Array.from({ length: 10_000 }, (_, index) => entry(`file-${index}.md`)) }),
    })
    expect(document.querySelectorAll('[role="treeitem"]').length).toBeLessThanOrEqual(300)
  })

  test('AC127 AC147 AC148: minimum-width, zoom, forced-color, reduced-motion, and virtual focus remain accessible', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 480 })
    document.documentElement.style.zoom = '2'
    await renderSidebar({
      forcedColors: true,
      reducedMotion: true,
      roots: roots({ path: '/notes', entries: Array.from({ length: 500 }, (_, index) => entry(`file-${index}.md`)) }),
      width: 480,
    })
    const sidebar = document.querySelector<HTMLElement>('[data-testid="workspace-sidebar"]')!
    expect(Number.parseFloat(getComputedStyle(sidebar).width)).toBeLessThan(480)
    const audit = await axe.run(document.body, { resultTypes: ['violations'] })
    expect(audit.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
    expect(document.querySelectorAll('[role="treeitem"][tabindex="0"]')).toHaveLength(1)
  })

  test('AC149 AC152: interrupted pointer resize cleans up and submits at most one patch per frame', async () => {
    const onWidthChange = vi.fn()
    await renderSidebar({ onWidthChange, roots: roots({ path: '/notes', entries: [entry('a.md')] }), width: 240 })
    const separator = document.querySelector<HTMLElement>('[role="separator"]')!
    separator.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 240, pointerId: 1 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 260, pointerId: 1 }))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 280, pointerId: 1 }))
    await frame()
    expect(onWidthChange).toHaveBeenCalledTimes(1)
    expect(onWidthChange).toHaveBeenLastCalledWith(280)
    window.dispatchEvent(new Event('blur'))
    window.dispatchEvent(new PointerEvent('pointermove', { clientX: 300, pointerId: 1 }))
    await frame()
    expect(onWidthChange).toHaveBeenCalledTimes(1)
    expect(document.body.style.cursor).toBe('')
    expect(document.body.style.userSelect).toBe('')
  })
})

describe('spec 0003 preview tabs', () => {
  test('AC43 AC58: out-of-root files have no secondary path and closing the sole preview restores workspace empty state', async () => {
    await renderDocumentWorkspace(
      new WorkspaceFakeGateway(),
      [{ id: 'preview', path: asPath('/elsewhere/a.md'), preview: true, title: 'a' }],
      roots({ path: '/notes', entries: [] }),
    )
    expect(document.querySelector('[data-testid="document-secondary-path"]')).toBeNull()
    document.querySelector<HTMLButtonElement>('[data-testid="document-tab-close"]')!.click()
    await frame()
    expect(document.querySelectorAll('[data-testid="document-tab"]')).toHaveLength(0)
    expect(document.querySelector('[data-testid="empty-document-message"]')?.textContent).toBe('Select a file from the sidebar')
  })

  test('AC47 AC53 AC54: preview tabs expose non-visual state and pointer or accessible Keep Open promotion', async () => {
    const gateway = new WorkspaceFakeGateway()
    await renderDocumentWorkspace(gateway, [{ id: 'preview', preview: true, title: 'Draft' }])
    const tab = document.querySelector<HTMLButtonElement>('[data-testid="document-tab"]')!
    expect(tab.classList.contains('document-tab-preview')).toBe(true)
    expect(tab.getAttribute('aria-label')).toContain('Preview')
    const keep = document.querySelector<HTMLButtonElement>('[data-testid="preview-keep-open"]')!
    await userEvent.click(keep)
    expect(tab.classList.contains('document-tab-preview')).toBe(false)

    root?.unmount()
    root = undefined
    document.body.innerHTML = '<div id="test-root"></div>'
    await renderDocumentWorkspace(gateway, [{ id: 'preview-2', preview: true, title: 'Second' }])
    const second = document.querySelector<HTMLButtonElement>('[data-testid="document-tab"]')!
    await userEvent.dblClick(second)
    expect(second.classList.contains('document-tab-preview')).toBe(false)
  })

  test('AC50: the first persistent editor mutation pins a preview before it can be replaced', async () => {
    await renderDocumentWorkspace(new WorkspaceFakeGateway(), [{ id: 'preview', preview: true, title: 'Draft' }])
    const editor = document.querySelector<HTMLElement>('[contenteditable="true"]')!
    await userEvent.click(editor)
    await userEvent.keyboard('x')
    expect(document.querySelector('[data-testid="document-tab"]')?.classList.contains('document-tab-preview')).toBe(false)
  })

  test('AC61: double-clicking a tree file performs one read and opens one pinned tab', async () => {
    const gateway = new WorkspaceFakeGateway()
    const file = entry('one.md')
    const container = document.getElementById('test-root') ?? document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
    root.render(
      <DocumentWorkspace
        gateway={gateway}
        workspace={{
          forcedColors: false,
          onList: async () => [],
          onWidthChange: () => undefined,
          reducedMotion: false,
          roots: roots({ path: '/notes', entries: [file] }),
          width: 240,
        }}
      />,
    )
    await frame()
    await userEvent.dblClick(byLabel('one.md'))
    await frame()
    expect(gateway.workspaceOpens).toBe(1)
    expect(document.querySelectorAll('[data-testid="document-tab"]')).toHaveLength(1)
    expect(document.querySelector('[data-testid="document-tab"]')?.getAttribute('aria-label')).not.toContain('Preview')
  })

  test('AC62 AC145: failed replacement clears old content while an owned target atomically restores preview A', async () => {
    const file = entry('b.md')
    const initial: readonly DocumentSeed[] = [{
      document: { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Preview A content' }] }], type: 'doc' },
      fileKey: asFileKey('/notes/a.md'),
      id: 'preview-a',
      path: asPath('/notes/a.md'),
      preview: true,
      title: 'a',
    }]
    const failed = new WorkspaceFakeGateway()
    failed.workspaceOutcome = { kind: 'error' }
    await renderDocumentWorkspace(failed, initial, roots({ path: '/notes', entries: [file] }))
    await userEvent.click(byLabel('b.md'))
    await delay(220)
    await frame()
    expect(document.querySelector('[data-testid="document-issue"]')?.textContent).toContain('could not be opened')
    expect(document.querySelector('[data-testid="rich-editor"]')?.textContent).not.toContain('Preview A content')
    expect(document.querySelector('[data-testid="workspace-open-retry"]')).not.toBeNull()

    root?.unmount()
    root = undefined
    document.body.innerHTML = '<div id="test-root"></div>'
    const collision = new WorkspaceFakeGateway()
    collision.workspaceOutcome = { kind: 'collision' }
    await renderDocumentWorkspace(collision, initial, roots({ path: '/notes', entries: [file] }))
    await userEvent.click(byLabel('b.md'))
    await delay(220)
    await frame()
    expect(document.querySelector<HTMLInputElement>('[data-testid="document-title"]')?.value).toBe('a')
    expect(document.querySelector('[data-testid="rich-editor"]')?.textContent).toContain('Preview A content')
    expect(document.querySelector('[data-testid="document-issue"]')).toBeNull()
  })

  test('AC59 AC143: a late preview result updates its inactive tab without stealing focus', async () => {
    const gateway = new WorkspaceFakeGateway()
    gateway.deferWorkspaceOpen()
    await renderDocumentWorkspace(gateway, [{ id: 'pinned', title: 'Pinned' }], roots({ path: '/notes', entries: [entry('b.md')] }))
    await userEvent.click(byLabel('b.md'))
    await delay(220)
    await frame()
    expect(document.querySelectorAll('[data-testid="document-tab"]')).toHaveLength(2)
    document.querySelector<HTMLButtonElement>('[data-document-tab="pinned"]')!.click()
    await frame()
    expect(document.querySelector<HTMLInputElement>('[data-testid="document-title"]')?.value).toBe('Pinned')
    gateway.resolveWorkspaceOpen()
    await frame()
    await frame()
    expect(document.querySelector<HTMLInputElement>('[data-testid="document-title"]')?.value).toBe('Pinned')
  })

  test('AC60: preview B resolving first makes preview A stale permanently', async () => {
    const gateway = new RacingWorkspaceGateway()
    await renderDocumentWorkspace(gateway, [], roots({ path: '/notes', entries: [entry('a.md'), entry('b.md')] }))
    await userEvent.click(byLabel('a.md'))
    await delay(220)
    await frame()
    await userEvent.click(byLabel('b.md'))
    await delay(220)
    await frame()
    gateway.resolve('b.md')
    await frame()
    await frame()
    expect(document.querySelector<HTMLInputElement>('[data-testid="document-title"]')?.value).toBe('b')
    gateway.resolve('a.md')
    await frame()
    await frame()
    expect(document.querySelector<HTMLInputElement>('[data-testid="document-title"]')?.value).toBe('b')
  })
})

async function renderSidebar(overrides: Partial<ComponentProps<typeof WorkspaceSidebar>> & {
  roots: readonly WorkspaceRootSeed[]
}) {
  const container = document.getElementById('test-root') ?? document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  root.render(
    <WorkspaceSidebar
      {...(overrides.activeFileKey ? { activeFileKey: overrides.activeFileKey } : {})}
      forcedColors={overrides.forcedColors ?? false}
      onList={overrides.onList ?? (async () => [])}
      onOpen={overrides.onOpen ?? (() => undefined)}
      onWidthChange={overrides.onWidthChange ?? (() => undefined)}
      reducedMotion={overrides.reducedMotion ?? false}
      roots={overrides.roots}
      width={overrides.width ?? 240}
    />,
  )
  await frame()
  await frame()
}

const byLabel = <T extends Element = HTMLElement>(label: string): T => {
  const element = byLabelOptional(label)
  if (!element) throw new Error(`Missing aria-label=${label}`)
  return element as T
}

const byLabelOptional = (label: string): Element | null => document.querySelector(`[aria-label="${CSS.escape(label)}"]`)
const frame = async (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => resolve()))

async function renderDocumentWorkspace(
  gateway: DocumentGatewayPort,
  initialTabs: Parameters<typeof DocumentWorkspace>[0]['initialTabs'],
  workspaceRoots?: readonly WorkspaceRootSeed[],
) {
  const container = document.getElementById('test-root') ?? document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  root.render(<DocumentWorkspace
    gateway={gateway}
    {...(initialTabs ? { initialTabs } : {})}
    {...(workspaceRoots ? { workspace: {
      forcedColors: false,
      onList: async () => [],
      onWidthChange: () => undefined,
      reducedMotion: false,
      roots: workspaceRoots,
      width: 240,
    } } : {})}
  />)
  await frame()
  await frame()
}

class WorkspaceFakeGateway extends FakeDocumentGateway {
  workspaceOpens = 0
  workspaceOutcome: OpenOutcome | undefined
  #resolveWorkspace: (() => void) | undefined
  #workspacePending: Promise<void> | undefined

  deferWorkspaceOpen(): void {
    this.#workspacePending = new Promise((resolve) => { this.#resolveWorkspace = resolve })
  }

  resolveWorkspaceOpen(): void {
    this.#resolveWorkspace?.()
  }

  override async openWorkspace(input: WorkspaceOpenInput): Promise<OpenOutcome> {
    this.workspaceOpens += 1
    await this.#workspacePending
    if (this.workspaceOutcome) return this.workspaceOutcome
    return {
      document: {
        document: { content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Opened' }] }], type: 'doc' },
        fileKey: input.fileKey,
        id: input.id,
        path: input.path,
        title: input.path.split('/').at(-1)?.replace(/\.(md|markdown|txt)$/i, '') ?? '',
      },
      kind: 'opened',
    }
  }
}

class RacingWorkspaceGateway extends FakeDocumentGateway {
  readonly #pending = new Map<string, { readonly input: WorkspaceOpenInput; readonly resolve: (outcome: OpenOutcome) => void }>()

  override openWorkspace(input: WorkspaceOpenInput): Promise<OpenOutcome> {
    const name = input.path.split('/').at(-1) ?? ''
    return new Promise((resolve) => this.#pending.set(name, { input, resolve }))
  }

  resolve(name: string): void {
    const pending = this.#pending.get(name)
    if (!pending) throw new Error(`No pending workspace open for ${name}`)
    this.#pending.delete(name)
    pending.resolve({
      document: {
        document: { content: [{ type: 'paragraph', content: [{ type: 'text', text: name }] }], type: 'doc' },
        fileKey: pending.input.fileKey,
        id: pending.input.id,
        path: pending.input.path,
        title: name.replace(/\.md$/i, ''),
      },
      kind: 'opened',
    })
  }
}

const delay = async (milliseconds: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, milliseconds))
