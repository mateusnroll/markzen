import { fail, ok, type PlatformResult } from '../platform/contracts'

const MAX_DESTINATION_LENGTH = 4_096
const NON_OPENABLE_SCHEMES = new Set(['blob:', 'data:', 'javascript:'])

export type ExternalDestination =
  | { readonly destination: string; readonly kind: 'confirm' | 'safe' }
  | { readonly kind: 'blocked' }

export type ExternalOpenPayload = { readonly destination: string }

export function classifyExternalDestination(destination: string): ExternalDestination {
  if (
    destination.length === 0 ||
    destination.length > MAX_DESTINATION_LENGTH ||
    destination !== destination.trim() ||
    hasControlCharacter(destination) ||
    destination.startsWith('#')
  ) return { kind: 'blocked' }

  const bare = parseUrl(`https://${destination}`)
  if (bare && looksLikeBareDnsName(destination, bare)) return { destination: bare.href, kind: 'safe' }

  const absolute = parseUrl(destination)
  return absolute ? classifyAbsolute(absolute, destination) : { kind: 'blocked' }
}

export function validateExternalOpenPayload(value: unknown): PlatformResult<ExternalOpenPayload, 'validation'> {
  if (!isRecord(value) || Object.keys(value).length !== 1 || typeof value.destination !== 'string') return fail('validation')
  if (value.destination.length === 0 || value.destination.length > MAX_DESTINATION_LENGTH) return fail('validation')
  return ok({ destination: value.destination })
}

function classifyAbsolute(url: URL, original: string): ExternalDestination {
  if (NON_OPENABLE_SCHEMES.has(url.protocol)) return { kind: 'blocked' }
  if (url.protocol === 'http:' || url.protocol === 'https:') {
    if (!url.hostname) return { kind: 'blocked' }
    return url.username || url.password
      ? { destination: original, kind: 'confirm' }
      : { destination: url.href, kind: 'safe' }
  }
  if (url.protocol === 'mailto:') return { destination: url.href, kind: 'safe' }
  return { destination: original, kind: 'confirm' }
}

function looksLikeBareDnsName(original: string, url: URL): boolean {
  const authority = original.split(/[/?#]/, 1)[0] ?? ''
  const hostname = url.hostname
  return authority.length > 0 && !authority.includes('@') && hostname.includes('.') && !hostname.startsWith('.') && !hostname.endsWith('.')
}

function parseUrl(value: string): URL | undefined {
  try {
    return new URL(value)
  } catch {
    return undefined
  }
}

function hasControlCharacter(value: string): boolean {
  for (const character of value) {
    const code = character.codePointAt(0) ?? 0
    if (code < 32 || code === 127) return true
  }
  return false
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value) && Object.getPrototypeOf(value) === Object.prototype
}
