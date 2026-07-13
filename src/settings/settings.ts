import {
  fail,
  ok,
  type PlatformResult,
  type SettingsPatch,
  type ThemePreference,
  type ToolbarMode,
} from '../platform/contracts'

const MAX_PATCH_BYTES = 4 * 1024
const MAX_SETTINGS_BYTES = 1024 * 1024
const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export type SettingsSnapshot = {
  readonly revision: number
  readonly schemaVersion: 1
  readonly sidebarWidth: number
  readonly theme: ThemePreference
  readonly toolbarMode: ToolbarMode
}

export type PersistedSettings = Record<string, unknown> & {
  readonly schemaVersion: 1
  readonly sidebarWidth: number
  readonly theme: ThemePreference
  readonly toolbarMode: ToolbarMode
}

export const DEFAULT_SETTINGS: SettingsSnapshot = {
  revision: 0,
  schemaVersion: 1,
  sidebarWidth: 240,
  theme: 'system',
  toolbarMode: 'minimal',
}

export type SettingsLoadResult =
  | { readonly persisted: PersistedSettings; readonly snapshot: SettingsSnapshot }
  | { readonly corrupt: true; readonly snapshot: SettingsSnapshot }
  | { readonly invalid: true; readonly snapshot: SettingsSnapshot }
  | { readonly newer: true; readonly snapshot: SettingsSnapshot }
  | { readonly oversized: true; readonly snapshot: SettingsSnapshot }

export function validateSettingsPatch(value: unknown): PlatformResult<SettingsPatch, 'validation'> {
  if (!isPlainObject(value)) return fail('validation')
  let encoded: string
  try {
    encoded = JSON.stringify(value)
  } catch {
    return fail('validation')
  }
  if (new TextEncoder().encode(encoded).byteLength > MAX_PATCH_BYTES) return fail('validation')
  const keys = Object.keys(value)
  const key = keys[0]
  if (keys.length !== 1 || !key || DANGEROUS_KEYS.has(key)) return fail('validation')
  if (key === 'sidebarWidth' && typeof value.sidebarWidth === 'number' && Number.isFinite(value.sidebarWidth)) {
    return ok({ sidebarWidth: clampWidth(value.sidebarWidth) })
  }
  if (key === 'theme' && isTheme(value.theme)) return ok({ theme: value.theme })
  if (key === 'toolbarMode' && isToolbarMode(value.toolbarMode)) return ok({ toolbarMode: value.toolbarMode })
  return fail('validation')
}

export function parseSettings(raw: string): SettingsLoadResult {
  if (new TextEncoder().encode(raw).byteLength > MAX_SETTINGS_BYTES) return { oversized: true, snapshot: DEFAULT_SETTINGS }
  let value: unknown
  try {
    value = JSON.parse(raw)
  } catch {
    return { corrupt: true, snapshot: DEFAULT_SETTINGS }
  }
  if (!isPlainObject(value)) return { invalid: true, snapshot: DEFAULT_SETTINGS }
  if (!Number.isInteger(value.schemaVersion) || (value.schemaVersion as number) < 1) {
    return { invalid: true, snapshot: DEFAULT_SETTINGS }
  }
  if ((value.schemaVersion as number) > 1) return { newer: true, snapshot: DEFAULT_SETTINGS }
  const sidebarWidth = typeof value.sidebarWidth === 'number' && Number.isFinite(value.sidebarWidth)
    ? clampWidth(value.sidebarWidth)
    : DEFAULT_SETTINGS.sidebarWidth
  const theme = isTheme(value.theme) ? value.theme : DEFAULT_SETTINGS.theme
  const toolbarMode = isToolbarMode(value.toolbarMode) ? value.toolbarMode : DEFAULT_SETTINGS.toolbarMode
  const safe = sanitizeObject(value)
  const persisted = { ...safe, schemaVersion: 1 as const, sidebarWidth, theme, toolbarMode }
  return { persisted, snapshot: { revision: 0, schemaVersion: 1, sidebarWidth, theme, toolbarMode } }
}

export function encodeSettings(value: PersistedSettings): Uint8Array {
  return new TextEncoder().encode(`${JSON.stringify(value, null, 2)}\n`)
}

type SettingsServiceOptions = {
  readonly initial?: SettingsLoadResult
  readonly onPersistenceWarning?: (active: boolean) => void
  readonly write: (bytes: Uint8Array) => Promise<void>
}

export class SettingsService {
  readonly #listeners = new Set<(snapshot: SettingsSnapshot) => void>()
  readonly #write: (bytes: Uint8Array) => Promise<void>
  readonly #onPersistenceWarning: (active: boolean) => void
  #backoffIndex = 0
  #debounceTimer: ReturnType<typeof setTimeout> | undefined
  #disposed = false
  #inFlight: Promise<void> | undefined
  #persisted: PersistedSettings
  #persistedRevisionValue = 0
  #retryTimer: ReturnType<typeof setTimeout> | undefined
  #snapshot: SettingsSnapshot
  #warningActive = false

  constructor(options: SettingsServiceOptions) {
    this.#write = options.write
    this.#onPersistenceWarning = options.onPersistenceWarning ?? (() => undefined)
    const loaded = options.initial
    this.#snapshot = loaded?.snapshot ?? DEFAULT_SETTINGS
    this.#persisted = loaded && 'persisted' in loaded
      ? loaded.persisted
      : {
          schemaVersion: 1,
          sidebarWidth: this.#snapshot.sidebarWidth,
          theme: this.#snapshot.theme,
          toolbarMode: this.#snapshot.toolbarMode,
        }
  }

  dispose(): void {
    this.#disposed = true
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer)
    if (this.#retryTimer) clearTimeout(this.#retryTimer)
    this.#debounceTimer = undefined
    this.#retryTimer = undefined
    this.#listeners.clear()
  }

  async flush(timeoutMs = 2_000): Promise<boolean> {
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer)
    this.#debounceTimer = undefined
    if (this.#persistedRevisionValue >= this.#snapshot.revision) return true
    const persistence = this.#persist()
    return Promise.race([
      persistence.then(() => this.#persistedRevisionValue >= this.#snapshot.revision),
      new Promise<false>((resolve) => setTimeout(() => resolve(false), timeoutMs)),
    ])
  }

  patch(value: unknown): PlatformResult<SettingsSnapshot, 'validation'> {
    const validated = validateSettingsPatch(value)
    if (!validated.ok) return validated
    this.#snapshot = { ...this.#snapshot, ...validated.value, revision: this.#snapshot.revision + 1, schemaVersion: 1 }
    this.#persisted = { ...this.#persisted, ...validated.value, schemaVersion: 1 }
    for (const listener of this.#listeners) listener(this.#snapshot)
    this.#schedule(300)
    return ok(this.#snapshot)
  }

  persistedRevision(): number {
    return this.#persistedRevisionValue
  }

  retry(): void {
    if (this.#disposed || this.#persistedRevisionValue >= this.#snapshot.revision) return
    if (this.#retryTimer) clearTimeout(this.#retryTimer)
    this.#retryTimer = undefined
    void this.#persist()
  }

  snapshot(): SettingsSnapshot {
    return this.#snapshot
  }

  subscribe(listener: (snapshot: SettingsSnapshot) => void): () => void {
    this.#listeners.add(listener)
    return () => this.#listeners.delete(listener)
  }

  #schedule(delay: number): void {
    if (this.#disposed) return
    if (this.#debounceTimer) clearTimeout(this.#debounceTimer)
    this.#debounceTimer = setTimeout(() => {
      this.#debounceTimer = undefined
      void this.#persist()
    }, delay)
  }

  #persist(): Promise<void> {
    if (this.#disposed) return Promise.resolve()
    if (this.#inFlight) return this.#inFlight
    const revision = this.#snapshot.revision
    const bytes = encodeSettings(this.#persisted)
    const task = this.#write(bytes).then(() => {
      this.#persistedRevisionValue = Math.max(this.#persistedRevisionValue, revision)
      this.#backoffIndex = 0
      if (this.#retryTimer) clearTimeout(this.#retryTimer)
      this.#retryTimer = undefined
      if (this.#warningActive) {
        this.#warningActive = false
        this.#onPersistenceWarning(false)
      }
    }).catch(() => {
      if (!this.#warningActive) {
        this.#warningActive = true
        this.#onPersistenceWarning(true)
      }
      const delays = [1_000, 2_000, 4_000, 8_000, 16_000, 30_000]
      const delay = delays[Math.min(this.#backoffIndex, delays.length - 1)] ?? 30_000
      this.#backoffIndex += 1
      if (!this.#disposed) {
        if (this.#retryTimer) clearTimeout(this.#retryTimer)
        this.#retryTimer = setTimeout(() => {
          this.#retryTimer = undefined
          void this.#persist()
        }, delay)
      }
    }).finally(() => {
      this.#inFlight = undefined
      if (!this.#disposed && this.#persistedRevisionValue < this.#snapshot.revision && !this.#retryTimer && !this.#debounceTimer) {
        this.#schedule(0)
      }
    })
    this.#inFlight = task
    return task
  }
}

export const shouldApplySettings = (snapshot: SettingsSnapshot, appliedRevision: number): boolean =>
  snapshot.revision > appliedRevision

const clampWidth = (value: number): number => Math.round(Math.min(480, Math.max(160, value)))

const isTheme = (value: unknown): value is ThemePreference => value === 'system' || value === 'light' || value === 'dark'
const isToolbarMode = (value: unknown): value is ToolbarMode => value === 'minimal' || value === 'regular'

function sanitizeObject(value: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>
  for (const [key, candidate] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(key)) continue
    const safe = sanitizeValue(candidate)
    if (safe !== unsafe) result[key] = safe
  }
  return { ...result }
}

const unsafe = Symbol('unsafe')

function sanitizeValue(value: unknown): unknown | typeof unsafe {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value
  if (typeof value === 'number') return Number.isFinite(value) ? value : unsafe
  if (Array.isArray(value)) {
    const result: unknown[] = []
    for (const candidate of value) {
      const safe = sanitizeValue(candidate)
      if (safe === unsafe) return unsafe
      result.push(safe)
    }
    return result
  }
  if (isPlainObject(value)) return sanitizeObject(value)
  return unsafe
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false
  const prototype = Object.getPrototypeOf(value) as unknown
  return prototype === Object.prototype || prototype === null
}
