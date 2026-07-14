import {
  asTabId,
  fail,
  ok,
  type DocumentWriteRequest,
  asDiskVersion,
  type DiskVersion,
  type PlatformResult,
  type TabId,
  type WindowId,
} from '../contracts'

export type DocumentOwnerRecord = {
  readonly generation: number
  readonly tabId: TabId
  readonly windowId: WindowId
}

export type DocumentIdentityRequest = { readonly generation: number; readonly tabId: TabId }
export type ExternalVersionRequest = DocumentIdentityRequest & { readonly diskVersion: DiskVersion }
export type ExternalWriteRequest = DocumentWriteRequest & { readonly diskVersion: DiskVersion }
export type CloseDecisionRequest = DocumentIdentityRequest & { readonly name: string }
export type DocumentIntent = 'accept-external' | 'close' | 'confirm-close' | 'open' | 'overwrite-external' | 'retry-cleanup' | 'save' | 'save-and-rename' | 'save-as'

export function validateDocumentRequest(
  intent: DocumentIntent,
  payload: unknown,
): PlatformResult<CloseDecisionRequest | DocumentIdentityRequest | DocumentWriteRequest | ExternalVersionRequest | ExternalWriteRequest, 'validation'> {
  if (!plainObject(payload)) return fail('validation')
  const write = intent === 'save' || intent === 'save-and-rename' || intent === 'save-as' || intent === 'overwrite-external'
  const external = intent === 'accept-external' || intent === 'overwrite-external'
  const closeDecision = intent === 'confirm-close'
  const expected = write
    ? ['bytes', 'documentDirty', 'generation', 'tabId', 'title', 'titleDirty']
    : ['generation', 'tabId']
  const keys = external ? [...expected, 'diskVersion'] : closeDecision ? [...expected, 'name'] : expected
  const optionalSaveAs = intent === 'save-as' && 'model' in payload && 'encoding' in payload
  if (!exactKeys(payload, optionalSaveAs ? [...keys, 'encoding', 'model'] : keys)) return fail('validation')
  const identity = validateIdentity(payload)
  if (!identity.ok) return identity
  if (closeDecision) {
    if (typeof payload.name !== 'string' || payload.name.length === 0 || payload.name.length > 255) return fail('validation')
    return ok({ ...identity.value, name: payload.name })
  }
  if (external && (typeof payload.diskVersion !== 'string' || payload.diskVersion.length === 0)) return fail('validation')
  if (!write) return external ? ok({ ...identity.value, diskVersion: asDiskVersion(String(payload.diskVersion)) }) : identity
  if (!(payload.bytes instanceof Uint8Array) || payload.bytes.byteLength > 32 * 1024 * 1024) return fail('validation')
  if (typeof payload.documentDirty !== 'boolean' || typeof payload.titleDirty !== 'boolean') return fail('validation')
  if (typeof payload.title !== 'string' || payload.title.length > 255) return fail('validation')
  const encoding = optionalSaveAs ? validEncoding(payload.encoding) : undefined
  const model = optionalSaveAs ? validModel(payload.model) : undefined
  if (optionalSaveAs && (!encoding || !model)) return fail('validation')
  const request: DocumentWriteRequest = {
    bytes: payload.bytes,
    documentDirty: payload.documentDirty,
    ...identity.value,
    title: payload.title,
    titleDirty: payload.titleDirty,
    ...(encoding && model ? { encoding, model } : {}),
  }
  return external ? ok({ ...request, diskVersion: asDiskVersion(String(payload.diskVersion)) }) : ok(request)
}

export function authorizeDocumentRequest(
  record: DocumentOwnerRecord,
  senderWindowId: WindowId,
  tabId: TabId,
  generation: number,
): PlatformResult<void, 'ownership'> {
  return record.windowId === senderWindowId && record.tabId === tabId && record.generation === generation
    ? ok(undefined)
    : fail('ownership')
}

const validateIdentity = (payload: Record<string, unknown>): PlatformResult<DocumentIdentityRequest, 'validation'> => {
  if (typeof payload.generation !== 'number' || !Number.isSafeInteger(payload.generation) || payload.generation < 0) return fail('validation')
  if (typeof payload.tabId !== 'string' || payload.tabId.length === 0 || payload.tabId.length > 128) return fail('validation')
  return ok({ generation: payload.generation, tabId: asTabId(payload.tabId) })
}

const plainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)

function validEncoding(value: unknown): DocumentWriteRequest['encoding'] | undefined {
  if (!plainObject(value) || !exactKeys(value, ['bom', 'newline'])) return undefined
  return typeof value.bom === 'boolean' && (value.newline === 'lf' || value.newline === 'crlf')
    ? { bom: value.bom, newline: value.newline }
    : undefined
}

function validModel(value: unknown): unknown | undefined {
  try {
    const serialized = JSON.stringify(value)
    return serialized.length <= 32 * 1024 * 1024 && plainObject(value) ? value : undefined
  } catch {
    return undefined
  }
}

const exactKeys = (value: Record<string, unknown>, expected: readonly string[]): boolean => {
  const keys = Object.keys(value).sort()
  const sorted = [...expected].sort()
  return keys.length === sorted.length && keys.every((key, index) => key === sorted[index])
}
