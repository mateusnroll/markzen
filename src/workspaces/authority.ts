import {
  asRootId,
  fail,
  ok,
  type PlatformResult,
  type RootId,
} from '../platform/contracts'

export type WorkspaceEntryRequest = {
  readonly generation: number
  readonly relativePath: string
  readonly rootId: RootId
}

export function validateWorkspaceEntryRequest(value: unknown): PlatformResult<WorkspaceEntryRequest, 'validation'> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail('validation')
  const record = value as Record<string, unknown>
  if (Object.keys(record).sort().join(',') !== 'generation,relativePath,rootId') return fail('validation')
  if (!Number.isSafeInteger(record.generation) || (record.generation as number) < 0) return fail('validation')
  if (typeof record.rootId !== 'string' || record.rootId.length < 1 || record.rootId.length > 128) return fail('validation')
  if (typeof record.relativePath !== 'string' || !validRelativePath(record.relativePath)) return fail('validation')
  return ok({ generation: record.generation as number, relativePath: record.relativePath, rootId: asRootId(record.rootId) })
}

function validRelativePath(value: string): boolean {
  if (value.length > 4_096 || value.includes('\0') || value.includes('\\')) return false
  if (value === '') return true
  if (value.startsWith('/') || /^[A-Za-z]:\//.test(value)) return false
  const segments = value.split('/')
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..')
}
