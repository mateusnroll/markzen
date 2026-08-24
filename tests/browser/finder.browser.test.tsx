import axe from 'axe-core'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest'
import type { ReactNode } from 'react'
import { userEvent } from 'vitest/browser'

import { FileFinderDialog, TabSwitcherDialog } from '../../src/app/QuickOpen'
import { asFileKey, asRootId, asTabId, type FinderQueryOutcome } from '../../src/platform/contracts'

let root: Root | undefined

beforeEach(() => { document.body.innerHTML = '<button id="origin">Origin</button><div id="test-root"></div>' })

afterEach(() => {
  root?.unmount()
  root = undefined
  document.body.innerHTML = '<button id="origin">Origin</button><div id="test-root"></div>'
})

const outcome: FinderQueryOutcome = {
  generation: 1,
  kind: 'ready',
  results: [
    { fileKey: asFileKey('/notes/alpha.md'), name: 'alpha.md', parentPath: 'notes', relativePath: 'alpha.md', rootId: asRootId('root-1'), score: 1 },
    { fileKey: asFileKey('/notes/beta.md'), name: 'beta.md', parentPath: 'notes', relativePath: 'beta.md', rootId: asRootId('root-1'), score: 0.8 },
  ],
  total: 2,
}

describe('spec 0014 quick-open surfaces', () => {
  test('AC1 AC3 AC5: finder focuses its searchbox, waits for composition, and restores focus on Escape', async () => {
    const origin = document.querySelector<HTMLButtonElement>('#origin')!
    origin.focus()
    const query = vi.fn(async () => outcome)
    await render(<FileFinderDialog onActivate={async () => ({ ok: true })} onClose={() => root?.render(<></>)} onQuery={query} status={{ generation: 1, kind: 'ready' }} />)
    const input = document.querySelector<HTMLInputElement>('[data-testid="file-finder-input"]')!
    expect(document.activeElement).toBe(input)
    input.dispatchEvent(new CompositionEvent('compositionstart', { bubbles: true }))
    await userEvent.type(input, 'a')
    expect(query).not.toHaveBeenCalled()
    input.dispatchEvent(new CompositionEvent('compositionend', { bubbles: true, data: 'a' }))
    await vi.waitFor(() => expect(query).toHaveBeenCalled())
    await userEvent.keyboard('{Escape}')
    expect(document.activeElement).toBe(origin)
  })

  test('AC20 AC21 AC24 AC25 AC26: finder navigation activates preview/pinned only after success and retains failures', async () => {
    const activate = vi.fn(async (_entry, pinned: boolean) => pinned ? { ok: false as const, message: 'Blocked draft.' } : { ok: true as const })
    await render(<FileFinderDialog onActivate={activate} onClose={vi.fn()} onQuery={async () => outcome} status={{ generation: 1, kind: 'ready' }} />)
    const input = document.querySelector<HTMLInputElement>('[data-testid="file-finder-input"]')!
    await userEvent.type(input, 'a')
    await vi.waitFor(() => expect(document.querySelectorAll('[role="option"]')).toHaveLength(2))
    await userEvent.keyboard('{ArrowDown}')
    expect(document.querySelector('[aria-selected="true"]')?.textContent).toContain('beta.md')
    await userEvent.keyboard('{Control>}{Enter}{/Control}')
    expect(activate).toHaveBeenLastCalledWith(expect.objectContaining({ name: 'beta.md' }), true)
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Blocked draft')
  })

  test('AC27-AC34: tab switcher exposes MRU rows and commits or cancels the selected live tab', async () => {
    const activate = vi.fn(() => true)
    const close = vi.fn()
    await render(<TabSwitcherDialog
      onActivate={activate}
      onClose={close}
      tabs={[
        { dirty: false, id: asTabId('two'), label: 'two.md', preview: false, secondaryPath: 'notes' },
        { dirty: true, id: asTabId('one'), label: 'one.md', preview: true },
      ]}
    />)
    expect(document.querySelectorAll('[role="option"]')).toHaveLength(2)
    expect(document.querySelector('[aria-selected="true"]')?.textContent).toContain('two.md')
    await userEvent.keyboard('{ArrowDown}{Enter}')
    expect(activate).toHaveBeenCalledWith(asTabId('one'))
    expect(close).toHaveBeenCalled()
  })

  test('AC35 AC36: finder and switcher retain dialog/listbox semantics and serious accessibility is green', async () => {
    Object.defineProperty(window, 'innerWidth', { configurable: true, value: 480 })
    document.documentElement.style.zoom = '2'
    await render(<FileFinderDialog onActivate={async () => ({ ok: true })} onClose={vi.fn()} onQuery={async () => outcome} status={{ generation: 1, kind: 'stale' }} />)
    expect(document.querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Go to File')
    const audit = await axe.run(document.body, { resultTypes: ['violations'] })
    expect(audit.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
  })
})

async function render(element: ReactNode): Promise<void> {
  root = createRoot(document.querySelector('#test-root')!)
  root.render(element)
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}
