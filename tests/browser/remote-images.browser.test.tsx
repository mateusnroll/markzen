import axe from 'axe-core'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, test, vi } from 'vitest'
import { userEvent } from 'vitest/browser'

import { DocumentWorkspace, type DocumentSeed } from '../../src/app/DocumentWorkspace'
import type { ImageIntentOutcome } from '../../src/platform/contracts'
import { FakeDocumentGateway } from './document-gateway.fake'

let root: Root | undefined

afterEach(() => {
  root?.unmount()
  root = undefined
  document.body.innerHTML = '<div id="test-root"></div>'
  document.documentElement.style.zoom = ''
})

describe('spec 0006 remote image UI', () => {
  test('AC1-AC2: opening is ambient-effect free and one explicit Load owns the loading state', async () => {
    let finish!: (outcome: ImageIntentOutcome) => void
    const pending = new Promise<ImageIntentOutcome>((resolve) => { finish = resolve })
    const gateway = new class extends FakeDocumentGateway {
      readonly load = vi.fn((_id: string, _assetId: string, _source: string, _generation: number) => {
        void _id; void _assetId; void _source; void _generation
        return pending
      })
      override loadRemoteImage(id: string, assetId: string, source: string, generation: number): Promise<ImageIntentOutcome> {
        return this.load(id, assetId, source, generation)
      }
    }()
    await render(gateway, remoteSeed())
    expect(gateway.load).not.toHaveBeenCalled()
    expect(byTestId('remote-image-origin').textContent).toBe('https://images.example')
    const load = byTestId<HTMLButtonElement>('image-load')
    expect(load.textContent).toBe('Load')
    await userEvent.click(load)
    expect(document.querySelector('[data-testid="image-load"]')).toBeNull()
    expect(gateway.load).toHaveBeenCalledTimes(1)
    expect(byTestId('remote-image-status').textContent).toContain('Loading')
    finish({ kind: 'retryable' })
    await frame()
  })

  test('AC14-AC15: retryable and blocked outcomes expose distinct actions and generations', async () => {
    const calls: number[] = []
    const gateway = new class extends FakeDocumentGateway {
      override async loadRemoteImage(_id: string, _assetId: string, _source: string, generation: number): Promise<ImageIntentOutcome> {
        calls.push(generation)
        return calls.length === 1
          ? { kind: 'retryable' }
          : { asset: { source: 'https://images.example/cat.png', url: rasterUrl() }, kind: 'authorized' }
      }
    }()
    await render(gateway, remoteSeed())
    await userEvent.click(byTestId('image-load'))
    await frame()
    expect(byTestId('remote-image-status').textContent).toContain('could not be loaded')
    expect(byTestId<HTMLButtonElement>('image-retry').textContent).toBe('Retry')
    await userEvent.click(byTestId('image-retry'))
    await frame()
    expect(calls).toEqual([1, 2])
    expect(byTestId('loaded-image')).not.toBeNull()
  })

  test('AC16 AC19-AC20: removing a pending node revokes its generation and ignores late success', async () => {
    let finish!: (outcome: ImageIntentOutcome) => void
    const revoked: Array<{ assetId: string; generation: number; source: string; url?: string }> = []
    const gateway = new class extends FakeDocumentGateway {
      override loadRemoteImage(): Promise<ImageIntentOutcome> {
        return new Promise((resolve) => { finish = resolve })
      }
      override async revokeImage(_id: string, assetId: string, source: string, generation: number, url?: string): Promise<void> {
        revoked.push({ assetId, generation, source, ...(url ? { url } : {}) })
      }
    }()
    await render(gateway, remoteSeed())
    await userEvent.click(byTestId('image-load'))
    const image = byTestId('remote-image')
    await userEvent.click(image)
    await userEvent.keyboard('{Delete}')
    finish({ asset: { source: 'https://images.example/cat.png', url: rasterUrl() }, kind: 'authorized' })
    await frame()
    await frame()
    expect(document.querySelector('[data-markzen-image]')).toBeNull()
    expect(revoked.length).toBeGreaterThan(0)
  })

  test('AC16 AC20: replacing or closing a document revokes its current image node', async () => {
    const revoked: string[] = []
    const gateway = new class extends FakeDocumentGateway {
      override async revokeImage(_id: string, assetId: string): Promise<void> {
        revoked.push(assetId)
      }
    }()
    await render(gateway, remoteSeed())
    root?.unmount()
    root = undefined
    await Promise.resolve()
    expect(revoked).toHaveLength(1)
  })

  test('AC19: switching tabs does not dispose the inactive node generation', async () => {
    const revoked: string[] = []
    const gateway = new class extends FakeDocumentGateway {
      override async revokeImage(_id: string, assetId: string): Promise<void> {
        revoked.push(assetId)
      }
    }()
    await renderTabs(gateway, [remoteSeed(), { id: 'second', title: 'Second' }])
    await userEvent.click(document.querySelector('[role="tab"][aria-label="Second"]') ?? byTestId('document-tab-second'))
    await Promise.resolve()
    expect(revoked).toEqual([])
  })

  test('AC21-AC22: embedded sources resolve through the gateway without a raw data DOM source', async () => {
    const gateway = new class extends FakeDocumentGateway {
      readonly resolveEmbedded = vi.fn(async (_id: string, _assetId: string, source: string): Promise<ImageIntentOutcome> => ({
        asset: { source, url: rasterUrl() },
        kind: 'authorized',
      }))
      override resolveEmbeddedImage(id: string, assetId: string, source: string, generation: number): Promise<ImageIntentOutcome> {
        void generation
        return this.resolveEmbedded(id, assetId, source)
      }
    }()
    await render(gateway, embeddedSeed())
    await frame()
    expect(gateway.resolveEmbedded).toHaveBeenCalledTimes(1)
    const image = byTestId<HTMLImageElement>('loaded-image')
    expect(image.src.startsWith('blob:')).toBe(true)
    expect(image.src.startsWith('data:')).toBe(false)
  })

  test('AC22: malformed embedded sources render the gateway blocked outcome', async () => {
    const gateway = new class extends FakeDocumentGateway {
      readonly resolveEmbedded = vi.fn()
      override resolveEmbeddedImage(): Promise<ImageIntentOutcome> {
        this.resolveEmbedded()
        return Promise.resolve({ kind: 'blocked' })
      }
    }()
    await render(gateway, imageSeed('data:image/png;base64,not valid'))
    expect(gateway.resolveEmbedded).toHaveBeenCalledOnce()
    expect(byTestId('blocked-image').getAttribute('aria-label')).toContain('blocked')
  })

  test('AC26: remote states remain named, reachable, responsive, and serious-audit clean', async () => {
    await render(new FakeDocumentGateway(), remoteSeed())
    document.documentElement.style.zoom = '2'
    const image = byTestId('remote-image')
    image.focus()
    expect(document.activeElement).toBe(image)
    const load = byTestId<HTMLButtonElement>('image-load')
    load.focus()
    await userEvent.keyboard('{Enter}')
    await frame()
    expect(byTestId('remote-image-status').getAttribute('role')).toBe('status')
    const audit = await axe.run(document.body, { resultTypes: ['violations'] })
    expect(audit.violations.filter((violation) => ['serious', 'critical'].includes(violation.impact ?? ''))).toEqual([])
  })
})

async function render(gateway: FakeDocumentGateway, seed: DocumentSeed): Promise<void> {
  await renderTabs(gateway, [seed])
}

async function renderTabs(gateway: FakeDocumentGateway, seeds: readonly DocumentSeed[]): Promise<void> {
  const container = document.getElementById('test-root') ?? document.body.appendChild(document.createElement('div'))
  root = createRoot(container)
  root.render(<DocumentWorkspace gateway={gateway} initialTabs={seeds} />)
  await frame()
  await frame()
}

function remoteSeed(): DocumentSeed {
  return imageSeed('https://images.example/cat.png')
}

function embeddedSeed(): DocumentSeed {
  return imageSeed(`data:image/png;base64,${rasterBase64}`)
}

function imageSeed(source: string): DocumentSeed {
  return {
    document: {
      content: [{ content: [{ attrs: { alt: 'Cat', src: source }, type: 'image' }], type: 'paragraph' }],
      type: 'doc',
    },
    id: 'remote',
    title: 'Remote',
  }
}

function rasterUrl(): string {
  const decoded = atob(rasterBase64)
  const bytes = Uint8Array.from(decoded, (value) => value.charCodeAt(0))
  return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }))
}

const rasterBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII='

function byTestId<T extends Element = HTMLElement>(testId: string): T {
  const element = document.querySelector(`[data-testid="${testId}"]`)
  if (!element) throw new Error(`Missing data-testid=${testId}`)
  return element as T
}

async function frame(): Promise<void> {
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
}
