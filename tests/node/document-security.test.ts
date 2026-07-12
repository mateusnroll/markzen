import { readFile } from 'node:fs/promises'

import { describe, expect, test, vi } from 'vitest'

import { asTabId, asWindowId, fail, ok } from '../../src/platform/contracts'
import {
  authorizeDocumentRequest,
  validateDocumentRequest,
  type DocumentOwnerRecord,
} from '../../src/platform/electron/document-authority'

describe('spec 0002 document capability security', () => {
  test('AC162: preload exposes named document intents without arbitrary IPC or raw filesystem capabilities', async () => {
    const preload = await readFile('src/platform/electron/preload.ts', 'utf8')
    const contract = await readFile('src/platform/contracts.ts', 'utf8')
    const exposedContract = contract.slice(contract.indexOf('export interface MarkzenDocumentCapability'))
    expect(preload).not.toContain('ipcRenderer.send(')
    expect(preload).not.toContain('sendSync')
    expect(exposedContract).not.toContain('readonly fs:')
    for (const intent of ['createTab', 'open', 'save', 'saveAs', 'saveAndRename', 'confirmClose', 'onExternalChange']) {
      expect(exposedContract).toContain(`${intent}(`)
    }
  })

  test('AC163: document payload schemas reject unknown keys and wrong types before domain work', () => {
    expect(validateDocumentRequest('save', {
      tabId: 'tab-1', generation: 2, bytes: new Uint8Array([1]), documentDirty: true, title: 'Note', titleDirty: false,
    })).toEqual(
      ok({ tabId: asTabId('tab-1'), generation: 2, bytes: new Uint8Array([1]), documentDirty: true, title: 'Note', titleDirty: false }),
    )
    expect(validateDocumentRequest('save', { tabId: 'tab-1', generation: '2', bytes: [] })).toEqual(fail('validation'))
    expect(validateDocumentRequest('save', { tabId: 'tab-1', generation: 2, bytes: new Uint8Array(), path: '/forged' })).toEqual(
      fail('validation'),
    )
  })

  test('AC164 AC165: forged and stale TabIds cannot authorize another window or invoke work', () => {
    const operation = vi.fn()
    const record: DocumentOwnerRecord = {
      generation: 3,
      tabId: asTabId('tab-1'),
      windowId: asWindowId('window-1'),
    }
    expect(authorizeDocumentRequest(record, asWindowId('window-2'), asTabId('tab-1'), 3)).toEqual(fail('ownership'))
    expect(authorizeDocumentRequest(record, asWindowId('window-1'), asTabId('tab-2'), 3)).toEqual(fail('ownership'))
    expect(authorizeDocumentRequest(record, asWindowId('window-1'), asTabId('tab-1'), 2)).toEqual(fail('ownership'))
    if (authorizeDocumentRequest(record, asWindowId('window-1'), asTabId('tab-1'), 3).ok) operation()
    expect(operation).toHaveBeenCalledOnce()
  })
})
