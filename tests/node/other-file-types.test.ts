import { readFile } from 'node:fs/promises'

import { describe, expect, test } from 'vitest'

import {
  classifyDocumentName,
  documentKindAllowsMarkdownAssets,
  documentKindAllowsWrite,
  grammarForLanguage,
  rasterDisplayMetadata,
} from '../../src/documents/file-types'
import { DocumentGateway } from '../../src/documents/gateway'
import { createMemoryPlatform } from '../../src/platform/memory'
import { isDocumentCompletionCurrent } from '../../src/documents/tab-state'
import {
  checkTextBounds,
  parseTextBytes,
  serializeTextDocument,
  TEXT_DOCUMENT_MAX_BYTES,
  TEXT_LINE_MAX_BYTES,
  TEXT_MAX_LINES,
} from '../../src/documents/text'
import { validateRaster } from '../../src/assets/raster'

const hexFixture = async (name: string): Promise<Uint8Array> => {
  const hex = (await readFile(`tests/fixtures/text/${name}.hex`, 'utf8')).trim()
  return Uint8Array.from(hex.match(/.{2}/g)?.map((value) => Number.parseInt(value, 16)) ?? [])
}

describe('spec 0011 closed file classification', () => {
  test('AC2-AC4 AC67: every suffix and basename maps to one exact kind and label with fixed precedence', () => {
    const textCases: Readonly<Record<string, string>> = {
      'note.txt': 'Plain text', 'note.text': 'Plain text', 'app.log': 'Plain text', LICENSE: 'Plain text', NOTICE: 'Plain text', AUTHORS: 'Plain text',
      'app.js': 'JavaScript', 'app.mjs': 'JavaScript', 'app.cjs': 'JavaScript', 'app.jsx': 'JSX', 'app.ts': 'TypeScript', 'app.mts': 'TypeScript', 'app.cts': 'TypeScript', 'app.tsx': 'TSX',
      'page.html': 'HTML', 'page.htm': 'HTML', 'page.css': 'CSS', 'page.scss': 'SCSS', 'page.sass': 'Sass', 'page.less': 'Less', 'page.vue': 'Vue', 'page.svelte': 'Svelte', 'page.astro': 'Astro',
      'script.py': 'Python', 'types.pyi': 'Python', 'run.sh': 'Shell', 'run.bash': 'Bash', 'run.zsh': 'Zsh', 'run.fish': 'Fish',
      'main.c': 'C', 'main.h': 'C header', 'main.cc': 'C++', 'main.cpp': 'C++', 'main.cxx': 'C++', 'main.hpp': 'C++ header', 'main.hxx': 'C++ header', 'main.cs': 'C#', 'Main.java': 'Java', 'main.kt': 'Kotlin', 'main.kts': 'Kotlin', 'main.go': 'Go', 'main.rs': 'Rust', 'main.swift': 'Swift',
      'main.rb': 'Ruby', 'main.php': 'PHP', 'main.lua': 'Lua', 'main.pl': 'Perl', 'main.pm': 'Perl', 'main.r': 'R', 'main.scala': 'Scala',
      'data.xml': 'XML', 'data.yaml': 'YAML', 'data.yml': 'YAML', 'data.toml': 'TOML', 'data.ini': 'INI', 'data.cfg': 'Configuration', 'data.conf': 'Configuration', 'data.jsonc': 'JSON with comments', 'data.sql': 'SQL', 'data.graphql': 'GraphQL', 'data.gql': 'GraphQL', 'data.proto': 'Protocol Buffers', 'data.properties': 'Java properties',
      'build.cmake': 'CMake', 'CMakeLists.txt': 'CMake', 'build.gradle': 'Gradle', 'main.tf': 'Terraform', 'main.tfvars': 'Terraform', 'main.hcl': 'HCL', 'main.nix': 'Nix', Dockerfile: 'Dockerfile', 'Dockerfile.dev': 'Dockerfile', Makefile: 'Makefile', GNUmakefile: 'Makefile',
      'guide.rst': 'reStructuredText', 'guide.adoc': 'AsciiDoc', 'guide.tex': 'TeX', '.env': 'Environment', '.env.local': 'Environment', '.gitignore': 'Ignore rules', '.prettierignore': 'Ignore rules', '.eslintignore': 'Ignore rules', '.gitattributes': 'Git attributes', '.editorconfig': 'EditorConfig', '.npmrc': 'npm configuration', '.nvmrc': 'nvm configuration', '.prettierrc': 'Prettier configuration', '.eslintrc': 'ESLint configuration',
    }
    for (const [name, label] of Object.entries(textCases)) {
      expect(classifyDocumentName(name), name).toMatchObject({ kind: 'text', language: label })
    }

    expect(classifyDocumentName('NOTE.MARKDOWN')).toEqual({ kind: 'markdown' })
    expect(classifyDocumentName('data.CSV')).toEqual({ kind: 'csv' })
    expect(classifyDocumentName('.env.json')).toEqual({ kind: 'json' })
    expect(classifyDocumentName('Dockerfile.json')).toEqual({ kind: 'json' })
    expect(classifyDocumentName('.env.log')).toMatchObject({ kind: 'text', language: 'Environment' })
    expect(classifyDocumentName('Dockerfile.log')).toMatchObject({ kind: 'text', language: 'Dockerfile' })
    expect(classifyDocumentName('photo.JPEG')).toEqual({ kind: 'raster' })
    expect(classifyDocumentName('archive.zip')).toEqual({ kind: 'external' })
  })

  test('AC5-AC6 AC9 AC62 AC64: view-only kinds are closed, non-writable, and reject Markdown asset authority', () => {
    for (const kind of ['raster', 'external'] as const) {
      expect(documentKindAllowsWrite(kind)).toBe(false)
      expect(documentKindAllowsMarkdownAssets(kind)).toBe(false)
    }
    for (const kind of ['markdown', 'csv', 'json', 'text'] as const) expect(documentKindAllowsWrite(kind)).toBe(true)
    expect(isDocumentCompletionCurrent(
      { fileKey: 'one', generation: 4, kind: 'text', owner: 'tab-1' },
      { fileKey: 'one', generation: 4, kind: 'text', owner: 'tab-1' },
    )).toBe(true)
    expect(isDocumentCompletionCurrent(
      { fileKey: 'one', generation: 3, kind: 'raster', owner: 'tab-1' },
      { fileKey: 'one', generation: 4, kind: 'text', owner: 'tab-1' },
    )).toBe(false)
  })

  test('AC6 AC19 AC21 AC23 AC30 AC67: unknown valid UTF-8 opens as Plain text while unsafe candidates stay byte-free external tabs', async () => {
    const { harness, platform } = createMemoryPlatform({ caseSensitive: true, platform: 'posix' })
    harness.mkdir('/notes')
    await platform.fs.create(harness.path('/notes/references.bib'), new TextEncoder().encode('@book{meditations, title={Meditations}}\n'))
    await platform.fs.create(harness.path('/notes/archive.bin'), Uint8Array.from([0x41, 0xff]))
    await platform.fs.create(harness.path('/notes/oversized.data'), new TextEncoder().encode('x'.repeat(TEXT_LINE_MAX_BYTES + 1)))
    const gateway = new DocumentGateway(platform)

    await expect(gateway.openPath(harness.path('/notes/references.bib'), 'valid')).resolves.toMatchObject({
      document: {
        kind: 'text',
        language: 'Plain text',
        text: { text: '@book{meditations, title={Meditations}}\n' },
        title: 'references.bib',
      },
      kind: 'opened',
    })
    for (const [path, id, limitation] of [
      ['/notes/archive.bin', 'invalid', 'valid UTF-8'],
      ['/notes/oversized.data', 'oversized', '1 MiB'],
    ] as const) {
      const opened = await gateway.openPath(harness.path(path), id)
      expect(opened).toMatchObject({ document: { kind: 'external' }, kind: 'opened' })
      if (opened.kind !== 'opened') throw new Error('expected external candidate')
      expect(opened.document.limitation).toContain(limitation)
      expect(opened.document).not.toHaveProperty('text')
      expect(opened.document).not.toHaveProperty('preservation')
    }
  })

  test('AC70: every language label derives exactly one approved common grammar without storing grammar in classification', () => {
    const expected: Readonly<Record<string, string | undefined>> = {
      Bash: 'bash', C: 'c', 'C header': 'c', 'C#': 'csharp', 'C++': 'cpp', 'C++ header': 'cpp',
      Configuration: 'ini', CSS: 'css', EditorConfig: 'ini', Go: 'go', GraphQL: 'graphql', HTML: 'xml',
      INI: 'ini', Java: 'java', JavaScript: 'javascript', JSX: 'javascript', 'JSON with comments': 'json',
      Kotlin: 'kotlin', Less: 'less', Lua: 'lua', Makefile: 'makefile', Perl: 'perl', PHP: 'php',
      'Plain text': undefined, 'Prettier configuration': 'json', Python: 'python', R: 'r', Ruby: 'ruby',
      Rust: 'rust', Sass: 'scss', SCSS: 'scss', Shell: 'bash', SQL: 'sql', Svelte: 'xml', Swift: 'swift',
      TSX: 'typescript', TypeScript: 'typescript', Vue: 'xml', XML: 'xml', YAML: 'yaml', Zsh: 'bash',
    }
    for (const [language, grammar] of Object.entries(expected)) expect(grammarForLanguage(language), language).toBe(grammar)
    for (const language of [
      'AsciiDoc', 'CMake', 'Dockerfile', 'Environment', 'ESLint configuration', 'Fish', 'Git attributes',
      'Gradle', 'HCL', 'Ignore rules', 'Java properties', 'Nix', 'npm configuration', 'nvm configuration',
      'Protocol Buffers', 'reStructuredText', 'Scala', 'TeX', 'Terraform', 'TOML',
    ]) expect(grammarForLanguage(language), language).toBeUndefined()
    expect(classifyDocumentName('example.ts')).toEqual({ kind: 'text', language: 'TypeScript', managedExtension: '.ts' })
  })
})

describe('spec 0011 generic-text codec', () => {
  test('AC16-AC18 AC25-AC28 AC30: independent mixed-newline fixtures retain exact baseline and serialize edited text deterministically', async () => {
    const source = await hexFixture('mixed.source')
    const expected = JSON.parse(await readFile('tests/fixtures/text/mixed.expected.json', 'utf8')) as {
      readonly encoding: { readonly bom: boolean; readonly newline: 'crlf' | 'lf' }
      readonly text: string
    }
    const parsed = parseTextBytes(source)
    expect(parsed).toMatchObject({ mode: 'editable', document: expected })
    if (parsed.mode !== 'editable') throw new Error('expected editable text')
    expect(serializeTextDocument(parsed.document)).toEqual(source)
    expect(serializeTextDocument({ ...parsed.document, edited: true, text: `${parsed.document.text}!` }))
      .toEqual(await hexFixture('mixed.golden'))

    const empty = parseTextBytes(new Uint8Array())
    expect(empty).toMatchObject({ mode: 'editable', document: { text: '' } })
  })

  test('AC19-AC23 AC29: invalid encoding and every exact editable bound preserve or reject atomically', async () => {
    expect(parseTextBytes(await hexFixture('invalid-utf8'))).toMatchObject({ mode: 'preserve', reason: 'encoding' })
    expect(parseTextBytes(new Uint8Array(TEXT_DOCUMENT_MAX_BYTES + 1))).toMatchObject({ mode: 'preserve', reason: 'document-bytes' })
    expect(checkTextBounds('a'.repeat(TEXT_LINE_MAX_BYTES))).toEqual({ ok: true })
    expect(checkTextBounds('a'.repeat(TEXT_LINE_MAX_BYTES + 1))).toEqual({ ok: false, reason: 'line-bytes' })
    expect(checkTextBounds(`${'x\n'.repeat(TEXT_MAX_LINES - 1)}x`)).toEqual({ ok: true })
    expect(checkTextBounds('x\n'.repeat(TEXT_MAX_LINES))).toEqual({ ok: false, reason: 'lines' })
  })
})

describe('spec 0011 raster metadata', () => {
  test('AC40 AC67: approved raster validation exposes exact format, dimensions, and animated state', () => {
    const gif = Uint8Array.from([...new TextEncoder().encode('GIF89a'), 2, 0, 3, 0, 0, 0, 0, 0x2c, 0, 0, 0, 0, 2, 0, 3, 0, 0, 2, 1, 0, 0, 0x3b])
    const validation = validateRaster(gif, 'study.gif')
    expect(validation.ok).toBe(true)
    if (!validation.ok) throw new Error(validation.reason)
    expect(rasterDisplayMetadata(validation.info)).toEqual({ animated: false, format: 'GIF', height: 3, width: 2 })
  })
})
