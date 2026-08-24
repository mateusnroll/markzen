import { getSchema, type JSONContent } from '@tiptap/core'
import { EditorState, NodeSelection, TextSelection } from '@tiptap/pm/state'
import { describe, expect, test } from 'vitest'

import { createDocumentExtensions, serializeRichDocument, type RichDocument } from '../../src/documents/markdown'
import { applyStructuralMove, createStructuralMovePlan } from '../../src/documents/reordering'

const schema = getSchema(createDocumentExtensions())

describe('spec 0013 structural movement model', () => {
  test('AC13–AC18: row and column gaps preserve the header, alignment, cell subtrees, and canonical Markdown', () => {
    const document = schema.nodeFromJSON(tableDocument())
    const rowState = stateAtText(document, '4')
    const rowPlan = createStructuralMovePlan(rowState, 'row')
    expect(rowPlan?.gaps).toHaveLength(2)
    const rowMove = rowPlan && applyStructuralMove(rowState, rowPlan, 0)
    const rowJson = rowMove?.doc.toJSON() as RichDocument
    expect(rowJson.content[0]?.content?.map((row) => row.content?.map((entry) => entry.content?.[0]?.content?.[0]?.text).join(''))).toEqual(['ABC', '456', '123'])
    expect(rowJson.content[0]?.content?.[0]?.content?.map((entry) => entry.type)).toEqual(['tableHeader', 'tableHeader', 'tableHeader'])

    const columnState = stateAtText(document, '3')
    const columnPlan = createStructuralMovePlan(columnState, 'column')
    const columnMove = columnPlan && applyStructuralMove(columnState, columnPlan, 0)
    const moved = columnMove?.doc.toJSON() as RichDocument
    expect(moved.content[0]?.content?.[0]?.content?.map((cell) => cell.content?.[0]?.content?.[0]?.text)).toEqual(['C', 'A', 'B'])
    expect(moved.content[0]?.content?.[0]?.content?.map((cell) => cell.attrs?.align)).toEqual(['right', 'left', 'center'])
    expect(new TextDecoder().decode(serializeRichDocument(moved, { bom: false, newline: 'lf' }))).toContain('| C | A | B |\n| ---: | :--- | :---: |')
  })

  test('AC19–AC22 AC28: one image moves to any valid nested inline gap with exact persistent and transient identity and one-step undo', () => {
    const document = schema.nodeFromJSON(imageDocument())
    const state = stateAtNode(document, 'image')
    const plan = createStructuralMovePlan(state, 'image')
    expect(plan?.gaps.length).toBeGreaterThan(5)
    const target = plan?.gaps.findIndex((gap) => gap.label.includes('table')) ?? -1
    expect(target).toBeGreaterThanOrEqual(0)
    const transaction = plan && applyStructuralMove(state, plan, target)
    const images: JSONContent[] = []
    transaction?.doc.descendants((node) => { if (node.type.name === 'image') images.push(node.toJSON()) })
    expect(images).toEqual([{ attrs: expect.objectContaining({ alt: 'Diagram', assetId: 'asset-1', assetUrl: 'blob:test', src: 'images/a.png', title: 'Exact' }), type: 'image' }])
    expect(transaction?.getMeta('addToHistory')).not.toBe(false)
  })

  test('AC10 AC28–AC30: equivalent gaps are no-ops and a stale plan cannot move a replacement node', () => {
    const document = schema.nodeFromJSON(tableDocument())
    const state = stateAtText(document, '1')
    const plan = createStructuralMovePlan(state, 'row')
    expect(plan).toBeDefined()
    expect(plan && applyStructuralMove(state, plan, plan.currentGap)).toBeUndefined()
    const changed = state.apply(state.tr.insertText('changed'))
    expect(plan && applyStructuralMove(changed, plan, 1)).toBeUndefined()
  })

  test('AC17–AC18: rich cell subtrees move intact without disturbing their surrounding blockquote', () => {
    const richCell = {
      attrs: { align: 'left' },
      type: 'tableCell',
      content: [{
        type: 'paragraph',
        content: [
          { marks: [{ attrs: { href: 'https://example.com' }, type: 'link' }], text: 'Olá | ', type: 'text' },
          { marks: [{ type: 'code' }], text: 'a|b', type: 'text' },
          { attrs: { alt: 'Local', assetId: 'asset-rich', src: 'images/a|b.png' }, type: 'image' },
        ],
      }],
    }
    const nested = schema.nodeFromJSON({
      type: 'doc',
      content: [{
        type: 'blockquote',
        content: [{
          type: 'table',
          content: [
            { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ text: 'Head', type: 'text' }] }] }] },
            { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph' }] }] },
            { type: 'tableRow', content: [richCell] },
          ],
        }],
      }],
    })
    const normalizedRichCell = nested.toJSON().content?.[0]?.content?.[0]?.content?.[2]?.content?.[0]
    const state = stateAtText(nested, 'Olá | ')
    const plan = createStructuralMovePlan(state, 'row')
    const transaction = plan && applyStructuralMove(state, plan, 0)
    const result = transaction?.doc.toJSON()
    expect(result?.content?.[0]?.type).toBe('blockquote')
    expect(result?.content?.[0]?.content?.[0]?.content?.[1]?.content?.[0]).toEqual(normalizedRichCell)
    const markdown = new TextDecoder().decode(serializeRichDocument(result as RichDocument, { bom: false, newline: 'lf' }))
    expect(markdown).toContain('[Olá \\|](https://example.com) `a\\|b`![Local](images/a\\|b.png)')
  })
})

function stateAtText(document: import('@tiptap/pm/model').Node, text: string) {
  let position = 1
  document.descendants((node, offset) => {
    if (node.isText && node.text === text) position = offset
  })
  return EditorState.create({ doc: document, schema, selection: TextSelection.near(document.resolve(Math.min(position + 1, document.content.size))) })
}

function stateAtNode(document: import('@tiptap/pm/model').Node, type: string) {
  let position = 0
  document.descendants((node, offset) => {
    if (node.type.name === type) position = offset
  })
  return EditorState.create({ doc: document, schema, selection: NodeSelection.create(document, position) })
}

function tableDocument(): JSONContent {
  const cell = (type: 'tableHeader' | 'tableCell', text: string, align: 'left' | 'center' | 'right') => ({ attrs: { align }, type, content: [{ type: 'paragraph', content: [{ type: 'text', text }] }] })
  return { type: 'doc', content: [{ type: 'table', content: [
    { type: 'tableRow', content: [cell('tableHeader', 'A', 'left'), cell('tableHeader', 'B', 'center'), cell('tableHeader', 'C', 'right')] },
    { type: 'tableRow', content: [cell('tableCell', '1', 'left'), cell('tableCell', '2', 'center'), cell('tableCell', '3', 'right')] },
    { type: 'tableRow', content: [cell('tableCell', '4', 'left'), cell('tableCell', '5', 'center'), cell('tableCell', '6', 'right')] },
  ] }] }
}

function imageDocument(): JSONContent {
  return { type: 'doc', content: [
    { type: 'paragraph', content: [{ type: 'text', text: 'Before ' }, { type: 'image', attrs: { alt: 'Diagram', assetId: 'asset-1', assetUrl: 'blob:test', loadState: 'loaded', src: 'images/a.png', title: 'Exact' } }] },
    { type: 'blockquote', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Quote' }] }] },
    { type: 'table', content: [
      { type: 'tableRow', content: [{ type: 'tableHeader', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Header' }] }] }] },
      { type: 'tableRow', content: [{ type: 'tableCell', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Target' }] }] }] },
    ] },
  ] }
}
