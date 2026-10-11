import { readFile } from 'node:fs/promises'
import { describe, expect, test, vi } from 'vitest'
import { DocumentGateway } from '../../src/documents/gateway'
import { createMemoryPlatform } from '../../src/platform/memory'
import { mapContentPosition } from '../../src/documents/raw-markdown'
import { applyDocumentEncoding } from '../../src/documents/markdown'

describe('spec 0015 Raw Markdown', () => {
  test('AC23: Raw saving preserves source spelling without canonical formatting', () => {
    const source = '# title\n\n* alternate  \n<bad html>\n\\* literal 🙂'
    expect(new TextDecoder().decode(applyDocumentEncoding(source, { bom: false, newline: 'lf' }))).toBe(source)
  })
  test('AC24: BOM and CRLF are applied once, and new documents retain LF defaults', () => {
    expect([...applyDocumentEncoding('a\nb\n', { bom: true, newline: 'crlf' })]).toEqual([239, 187, 191, 97, 13, 10, 98, 13, 10])
    expect([...applyDocumentEncoding('', { bom: true, newline: 'lf' })]).toEqual([239, 187, 191])
    expect([...applyDocumentEncoding('a\n', { bom: false, newline: 'lf' })]).toEqual([97, 10])
  })
  test('AC25: unchanged Raw Save performs no write', async () => {
    const memory = createMemoryPlatform({ platform: 'posix', caseSensitive: true })
    const gateway = new DocumentGateway(memory.platform)
    memory.harness.mkdir('/notes')
    const path = memory.harness.path('/notes/raw.md')
    await memory.platform.fs.create(path, new TextEncoder().encode('$$unsupported'))
    const opened = await gateway.openPath(path, 'raw')
    if (opened.kind !== 'opened') throw new Error('Expected Raw fixture')
    const saved = await gateway.save({ ...opened.document, raw: '$$saved', documentDirty: true, titleDirty: false })
    if (saved.kind !== 'saved') throw new Error('Expected saved baseline')
    const write = vi.spyOn(memory.platform.fs, 'atomicReplace')
    expect(await gateway.save({ ...saved.document, documentDirty: false, titleDirty: false })).toEqual({ kind: 'unchanged' })
    expect(write).not.toHaveBeenCalled()
    const read = await memory.platform.fs.read(path)
    if (!read.ok) throw new Error('Expected saved file')
    expect(new TextDecoder().decode(read.value.bytes)).toBe('$$saved')
    write.mockRestore()
  })
  test('AC34: independently authored anchor matches, repeated content, misses and Unicode map deterministically', () => {
    expect(mapContentPosition('hello world', '## hello world\n', 5)).toBe(8)
    expect(mapContentPosition('abc', 'XYZXYZ', 1)).toBe(2)
    expect(mapContentPosition('🙂abc', '## 🙂abc', 2)).toBe(5)
    expect(mapContentPosition('', 'hello', 0)).toBe(0)
    expect(mapContentPosition('hello', '', 3)).toBe(0)
  })
})


test('spec 0015 AC36: Raw uses the installed literal editor and has no network or filesystem imports', async () => {
  const source = await readFile('src/documents/raw-markdown.ts', 'utf8')
  const editor = await readFile('src/documents/text-editor.ts', 'utf8')
  const pkg = JSON.parse(await readFile('package.json', 'utf8')) as { dependencies: Record<string, string> }
  expect(Object.keys(pkg.dependencies).filter((name) => /codemirror|monaco/.test(name))).toEqual([])
  expect(editor).toContain('CodeBlockLowlight')
  expect(source).not.toMatch(/fetch\(|XMLHttpRequest|from ['"](?:electron|node:)/)
})

test('spec 0015 AC23 AC24 AC34: Raw fallback Save As writes independently authored BOM and CRLF bytes', async () => {
  const memory = createMemoryPlatform({ platform: 'posix', caseSensitive: true })
  memory.harness.mkdir('/notes')
  const path = memory.harness.path('/notes/raw.md')
  const bytes = new Uint8Array([239, 187, 191, 36, 36, 120, 13, 10, 121])
  await memory.platform.fs.create(path, bytes)
  const gateway = new DocumentGateway(memory.platform)
  const opened = await gateway.openPath(path, 'one')
  expect(opened.kind).toBe('opened')
  if (opened.kind !== 'opened') throw new Error('Expected Raw fixture to open')
  expect(opened.document.raw).toBe('$$x\ny')
  memory.harness.queueDialog({ kind: 'save', path: memory.harness.path('/notes/copy.md') })
  expect((await gateway.saveAs({ ...opened.document, raw: '$$x\ny  ' })).kind).toBe('saved')
  const read = await memory.platform.fs.read(memory.harness.path('/notes/copy.md'))
  if (!read.ok) throw new Error('Expected saved copy')
  expect([...read.value.bytes]).toEqual([239, 187, 191, 36, 36, 120, 13, 10, 121, 32, 32])
})
