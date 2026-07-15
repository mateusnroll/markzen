import { readdir, readFile } from 'node:fs/promises'
import nodePath from 'node:path'

import { describe, expect, test } from 'vitest'

import { validateRaster } from '../../src/assets/raster'
import { parseDocumentBytes, serializeRichDocument, type RichNode } from '../../src/documents/markdown'

const workspace = 'examples/stoic-workspace'
const preservationDocument = 'archive/Unfinished Footnote.md'
const recognized = /\.(?:md|markdown|txt)$/i

async function walk(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true })
  const paths = await Promise.all(entries.map(async (entry) => {
    const path = nodePath.join(directory, entry.name)
    return entry.isDirectory() ? walk(path) : [path]
  }))
  return paths.flat().sort()
}

function visit(node: RichNode, nodes: Set<string>, marks: Set<string>): void {
  nodes.add(node.type)
  for (const mark of node.marks ?? []) marks.add(mark.type)
  for (const child of node.content ?? []) visit(child, nodes, marks)
}

describe('Stoic demo workspace', () => {
  test('recognized demo documents parse and round-trip without semantic loss', async () => {
    const paths = (await walk(workspace)).filter((path) => recognized.test(path))
    expect(paths.map((path) => nodePath.extname(path).toLowerCase())).toEqual(expect.arrayContaining(['.md', '.markdown', '.txt']))

    for (const path of paths) {
      const bytes = new Uint8Array(await readFile(path))
      const relative = nodePath.relative(workspace, path)
      const parsed = parseDocumentBytes(bytes)
      if (relative === preservationDocument) {
        expect(parsed, relative).toMatchObject({ bytes, mode: 'preserve-text', reason: 'unsupported-or-ambiguous' })
        continue
      }

      expect(parsed.mode, relative).toBe('rich')
      if (parsed.mode !== 'rich') throw new Error(`${relative} did not parse as rich Markdown`)
      const serialized = serializeRichDocument(parsed.document, parsed.encoding)
      const reparsed = parseDocumentBytes(serialized)
      expect(reparsed.mode, relative).toBe('rich')
      if (reparsed.mode !== 'rich') throw new Error(`${relative} did not reparse as rich Markdown`)
      expect(reparsed.document, relative).toEqual(parsed.document)
    }
  })

  test('the corpus covers supported Markdown structures and inline marks', async () => {
    const nodes = new Set<string>()
    const marks = new Set<string>()
    const headingLevels = new Set<number>()
    for (const path of (await walk(workspace)).filter((candidate) => recognized.test(candidate))) {
      const parsed = parseDocumentBytes(new Uint8Array(await readFile(path)))
      if (parsed.mode !== 'rich') continue
      for (const node of parsed.document.content) {
        visit(node, nodes, marks)
        if (node.type === 'heading') headingLevels.add(Number(node.attrs?.level))
      }
    }

    expect([...headingLevels]).toEqual(expect.arrayContaining([1, 2, 3, 4, 5, 6]))
    expect([...nodes]).toEqual(expect.arrayContaining([
      'blockquote', 'bulletList', 'codeBlock', 'hardBreak', 'horizontalRule', 'image', 'listItem', 'opaque', 'orderedList',
      'paragraph', 'table', 'tableCell', 'tableHeader', 'tableRow', 'taskItem', 'taskList', 'text',
    ]))
    expect([...marks]).toEqual(expect.arrayContaining(['bold', 'code', 'italic', 'link', 'strike']))
  })

  test('raw HTML stays opaque and byte-exact after surrounding rich content round-trips', async () => {
    const path = nodePath.join(workspace, 'archive/Raw Marginalia.md')
    const source = new Uint8Array(await readFile(path))
    const parsed = parseDocumentBytes(source)
    expect(parsed.mode).toBe('rich')
    if (parsed.mode !== 'rich') throw new Error('raw marginalia did not parse as rich Markdown')
    const raw = parsed.document.content.find((node) => node.type === 'opaque')
    expect(raw?.attrs?.source).toBe('<aside data-kind="marginalia"><cite>Archive hand</cite>: compare the language of training with the notebook\'s later entry.</aside>\n\n')
    expect(new TextDecoder().decode(serializeRichDocument(parsed.document, parsed.encoding))).toContain(String(raw?.attrs?.source))
  })

  test('local raster assets validate and intentional failure sources stay explicit', async () => {
    const imagePath = nodePath.join(workspace, 'assets/stoic-study.png')
    expect(validateRaster(new Uint8Array(await readFile(imagePath)), imagePath)).toMatchObject({
      info: { height: 1024, mime: 'image/png', width: 1536 },
      ok: true,
    })

    const imageSources = async (relativePath: string): Promise<string[]> => {
      const parsed = parseDocumentBytes(new Uint8Array(await readFile(nodePath.join(workspace, relativePath))))
      expect(parsed.mode).toBe('rich')
      if (parsed.mode !== 'rich') throw new Error(`${relativePath} did not parse as rich Markdown`)
      const sources: string[] = []
      const collectImages = (node: RichNode): void => {
        if (node.type === 'image') sources.push(String(node.attrs?.src))
        for (const child of node.content ?? []) collectImages(child)
      }
      for (const node of parsed.document.content) collectImages(node)
      return sources
    }
    expect(await imageSources('06 — Local Image Study.md')).toEqual(['assets/stoic-study.png'])
    expect(await imageSources('05 — Links and Images.md')).toEqual([
      'assets/missing-stoa.png',
      'https://example.com/stoic-demo/remote-bust.png',
    ])
  })
})
