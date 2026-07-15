import { fail, ok, type PlatformResult, type WindowId } from '../contracts'
import { isAllowedNavigation } from './development'

export type SenderDescriptor = {
  readonly contentsId: number
  readonly isMainFrame: boolean
  readonly url: string
}

export function resolveWindowSender<Record>(
  sender: SenderDescriptor,
  windowsByContents: ReadonlyMap<number, Record>,
  applicationOrigin: string,
  isLive: (record: Record) => boolean,
): PlatformResult<Record, 'sender'> {
  const record = windowsByContents.get(sender.contentsId)
  if (!sender.isMainFrame || !isAllowedNavigation(sender.url, applicationOrigin) || !record || !isLive(record)) return fail('sender')
  return ok(record)
}

export function validateWindowRequest(
  payload: unknown,
  senderWindowId: WindowId,
): PlatformResult<void, 'ownership' | 'validation'> {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return fail('validation')
  if ('windowId' in payload && payload.windowId !== senderWindowId) return fail('ownership')
  return Object.keys(payload).length === 0 ? ok(undefined) : fail('validation')
}
