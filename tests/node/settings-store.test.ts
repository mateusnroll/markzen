import { access, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, test } from 'vitest'

import { SettingsFileStore } from '../../src/platform/electron/settings-store'

const bytes = (value: string): Uint8Array => new TextEncoder().encode(value)

describe('spec 0003 real settings store', () => {
  test('AC103 AC106: the configuration directory appears only on first complete atomic write', async () => {
    const parent = await mkdtemp(path.join(os.tmpdir(), 'markzen-settings-parent-'))
    const directory = path.join(parent, 'user-data')
    const store = new SettingsFileStore(directory)
    try {
      await expect(access(directory)).rejects.toThrow()
      expect(await store.read()).toEqual({ kind: 'missing' })
      await expect(access(directory)).rejects.toThrow()
      await store.write(bytes('{"schemaVersion":1,"sidebarWidth":240}\n'))
      expect(new TextDecoder().decode(await readFile(path.join(directory, 'settings.json')))).toBe('{"schemaVersion":1,"sidebarWidth":240}\n')
      expect((await readdir(directory)).filter((name) => name.includes('.tmp'))).toEqual([])
    } finally {
      await rm(parent, { force: true, recursive: true })
    }
  })

  test('AC109: syntax-corrupt input can be quarantined to an epoch-safe sibling', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-settings-corrupt-'))
    const store = new SettingsFileStore(directory)
    try {
      await writeFile(path.join(directory, 'settings.json'), '{broken')
      const moved = await store.quarantineCorrupt(123456)
      expect(path.basename(moved ?? '')).toBe('settings.json.corrupt-123456')
      expect(await readFile(path.join(directory, 'settings.json.corrupt-123456'), 'utf8')).toBe('{broken')
      expect(await store.read()).toEqual({ kind: 'missing' })
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  test('AC124: startup removes recognizable staging files without replacing the previous valid file', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-settings-recover-'))
    const store = new SettingsFileStore(directory)
    try {
      await writeFile(path.join(directory, 'settings.json'), 'previous')
      await writeFile(path.join(directory, 'settings.json.markzen-1.tmp'), 'partial')
      await writeFile(path.join(directory, 'unrelated.tmp'), 'keep')
      await store.recover()
      expect(await readFile(path.join(directory, 'settings.json'), 'utf8')).toBe('previous')
      expect(await readdir(directory)).toEqual(['settings.json', 'unrelated.tmp'])
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })

  test('AC151: oversized or unreadable input is reported as data without throwing', async () => {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'markzen-settings-read-'))
    const store = new SettingsFileStore(directory)
    try {
      await writeFile(path.join(directory, 'settings.json'), Buffer.alloc(1024 * 1024 + 1))
      expect(await store.read()).toEqual({ kind: 'oversized' })
      await rm(path.join(directory, 'settings.json'))
      await writeFile(path.join(directory, 'settings.json'), '{}')
      await rm(path.join(directory, 'settings.json'))
      expect(await store.read()).toEqual({ kind: 'missing' })
    } finally {
      await rm(directory, { force: true, recursive: true })
    }
  })
})
