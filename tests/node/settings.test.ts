import { describe, expect, test, vi } from 'vitest'

import { fail, ok } from '../../src/platform/contracts'
import {
  DEFAULT_SETTINGS,
  SettingsService,
  encodeSettings,
  parseSettings,
  shouldApplySettings,
  validateSettingsPatch,
} from '../../src/settings/settings'

describe('spec 0003 settings', () => {
  test('AC97 AC98: a closed sidebar patch clamps, rounds, and advances the authoritative revision', () => {
    const service = new SettingsService({ write: vi.fn(async () => undefined) })
    expect(service.patch({ sidebarWidth: 999.6 })).toEqual(ok({ revision: 1, schemaVersion: 1, sidebarWidth: 480 }))
    expect(service.patch({ sidebarWidth: 160.4 })).toEqual(ok({ revision: 2, schemaVersion: 1, sidebarWidth: 160 }))
  })

  test('AC99: renderer snapshot ordering accepts only newer revisions', () => {
    const service = new SettingsService({ write: vi.fn(async () => undefined) })
    const first = service.patch({ sidebarWidth: 300 })
    if (!first.ok) throw new Error('expected accepted patch')
    expect(shouldApplySettings(first.value, 0)).toBe(true)
    expect(shouldApplySettings(first.value, 1)).toBe(false)
    expect(shouldApplySettings(first.value, 2)).toBe(false)
  })

  test('AC100 AC101: near-simultaneous patches serialize revisions and later acceptance wins', () => {
    const service = new SettingsService({ write: vi.fn(async () => undefined) })
    const first = service.patch({ sidebarWidth: 200 })
    const second = service.patch({ sidebarWidth: 300 })
    expect(first.ok && first.value.revision).toBe(1)
    expect(second).toEqual(ok({ revision: 2, schemaVersion: 1, sidebarWidth: 300 }))
    expect(service.snapshot()).toEqual({ revision: 2, schemaVersion: 1, sidebarWidth: 300 })
  })

  test('AC103 AC104: no write occurs before a patch and a burst persists once after 300ms', async () => {
    vi.useFakeTimers()
    const write = vi.fn<(bytes: Uint8Array) => Promise<void>>(async () => undefined)
    const service = new SettingsService({ write })
    expect(write).not.toHaveBeenCalled()
    service.patch({ sidebarWidth: 200 })
    vi.advanceTimersByTime(200)
    service.patch({ sidebarWidth: 220 })
    vi.advanceTimersByTime(299)
    expect(write).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(write).toHaveBeenCalledOnce()
    expect(new TextDecoder().decode(write.mock.calls[0]?.[0])).toContain('"sidebarWidth": 220')
    service.dispose()
    vi.useRealTimers()
  })

  test('AC105: completion of revision N cannot mark revision N+1 persisted', async () => {
    vi.useFakeTimers()
    let finishFirst!: () => void
    const first = new Promise<void>((resolve) => { finishFirst = resolve })
    const write = vi.fn<() => Promise<void>>().mockImplementationOnce(() => first).mockResolvedValue(undefined)
    const service = new SettingsService({ write })
    service.patch({ sidebarWidth: 200 })
    await vi.advanceTimersByTimeAsync(300)
    service.patch({ sidebarWidth: 300 })
    finishFirst()
    await first
    await vi.advanceTimersByTimeAsync(300)
    expect(write).toHaveBeenCalledTimes(2)
    expect(service.persistedRevision()).toBe(2)
    service.dispose()
    vi.useRealTimers()
  })

  test('AC106: encoded settings are one complete deterministic JSON document', () => {
    const encoded = encodeSettings({ safeFuture: ['x'], schemaVersion: 1, sidebarWidth: 240 })
    expect(JSON.parse(new TextDecoder().decode(encoded))).toEqual({ safeFuture: ['x'], schemaVersion: 1, sidebarWidth: 240 })
    expect(encoded.at(-1)).toBe(10)
  })

  test('AC107: invalid persisted sidebar width defaults without dropping safe unknown data', () => {
    expect(parseSettings('{"schemaVersion":1,"sidebarWidth":"wide","future":true}')).toEqual({
      persisted: { future: true, schemaVersion: 1, sidebarWidth: 240 },
      snapshot: DEFAULT_SETTINGS,
    })
  })

  test('AC108: recursive safe unknown data survives while dangerous keys and non-finite data do not', () => {
    const parsed = parseSettings('{"schemaVersion":1,"sidebarWidth":260,"future":{"ok":[1,true,null],"__proto__":{"polluted":true}},"constructor":1}')
    expect(parsed).toEqual({
      persisted: { future: { ok: [1, true, null] }, schemaVersion: 1, sidebarWidth: 260 },
      snapshot: { revision: 0, schemaVersion: 1, sidebarWidth: 260 },
    })
    expect({}).not.toHaveProperty('polluted')
  })

  test('AC109: syntactically corrupt JSON requests one corrupt-file move and loads defaults', () => {
    expect(parseSettings('{broken')).toEqual({ corrupt: true, snapshot: DEFAULT_SETTINGS })
  })

  test('AC113: bounded flush reports timeout without waiting indefinitely', async () => {
    vi.useFakeTimers()
    const service = new SettingsService({ write: () => new Promise(() => undefined) })
    service.patch({ sidebarWidth: 280 })
    const flushed = service.flush(2_000)
    await vi.advanceTimersByTimeAsync(2_000)
    await expect(flushed).resolves.toBe(false)
    service.dispose()
    vi.useRealTimers()
  })

  test('AC121: invalid, unknown, dangerous, extra, and oversized runtime patches reject wholly', () => {
    expect(validateSettingsPatch({ unknown: 1 })).toEqual(fail('validation'))
    expect(validateSettingsPatch({ sidebarWidth: Number.POSITIVE_INFINITY })).toEqual(fail('validation'))
    expect(validateSettingsPatch({ sidebarWidth: 240, extra: true })).toEqual(fail('validation'))
    expect(validateSettingsPatch(JSON.parse('{"__proto__":1,"sidebarWidth":240}'))).toEqual(fail('validation'))
    expect(validateSettingsPatch({ sidebarWidth: 240, padding: 'x'.repeat(5_000) })).toEqual(fail('validation'))
    expect(validateSettingsPatch({ sidebarWidth: 240 })).toEqual(ok({ sidebarWidth: 240 }))
  })

  test('AC122 AC150: newer and invalid versions load defaults without becoming writable snapshots', () => {
    expect(parseSettings('{"schemaVersion":2,"sidebarWidth":300}')).toEqual({ newer: true, snapshot: DEFAULT_SETTINGS })
    expect(parseSettings('{"sidebarWidth":300}')).toEqual({ invalid: true, snapshot: DEFAULT_SETTINGS })
    expect(parseSettings('{"schemaVersion":0,"sidebarWidth":300}')).toEqual({ invalid: true, snapshot: DEFAULT_SETTINGS })
    expect(parseSettings('[]')).toEqual({ invalid: true, snapshot: DEFAULT_SETTINGS })
  })

  test('AC123: accepted revisions remain service-owned after the initiating subscriber leaves', async () => {
    vi.useFakeTimers()
    const write = vi.fn(async () => undefined)
    const service = new SettingsService({ write })
    const listener = vi.fn()
    const dispose = service.subscribe(listener)
    service.patch({ sidebarWidth: 320 })
    dispose()
    await vi.advanceTimersByTimeAsync(300)
    expect(write).toHaveBeenCalledOnce()
    expect(service.snapshot().sidebarWidth).toBe(320)
    service.dispose()
    vi.useRealTimers()
  })

  test('AC114 AC125: one failure warning spans bounded backoff and explicit Retry until success', async () => {
    vi.useFakeTimers()
    const write = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error('fail')).mockResolvedValue(undefined)
    const warning = vi.fn()
    const service = new SettingsService({ onPersistenceWarning: warning, write })
    service.patch({ sidebarWidth: 300 })
    await vi.advanceTimersByTimeAsync(300)
    expect(write).toHaveBeenCalledOnce()
    expect(warning).toHaveBeenCalledWith(true)
    await vi.advanceTimersByTimeAsync(999)
    expect(write).toHaveBeenCalledOnce()
    service.retry()
    await vi.runAllTicks()
    expect(write).toHaveBeenCalledTimes(2)
    expect(service.persistedRevision()).toBe(1)
    expect(warning).toHaveBeenLastCalledWith(false)
    service.dispose()
    vi.useRealTimers()
  })

  test('AC151: oversized input is rejected before parsing', () => {
    expect(parseSettings(`{"schemaVersion":1,"sidebarWidth":240,"padding":"${'x'.repeat(1024 * 1024)}"}`)).toEqual({
      oversized: true,
      snapshot: DEFAULT_SETTINGS,
    })
  })
})
