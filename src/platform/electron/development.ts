export const DEVELOPMENT_RENDERER_SWITCH = 'markzen-dev-server-url'
export const POLISH_WORKSPACE_SWITCH = 'markzen-polish-workspace'

export function parseDevelopmentRendererOrigin(value: string, packaged: boolean): string | undefined {
  if (!value) return undefined
  if (packaged) throw new Error('Development renderer is unavailable in packaged builds')

  let url: URL
  try {
    url = new URL(value)
  } catch {
    throw new Error('Development renderer URL is invalid')
  }
  const port = Number(url.port)
  if (
    url.protocol !== 'http:' ||
    url.hostname !== '127.0.0.1' ||
    !url.port ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65_535 ||
    url.username ||
    url.password ||
    url.pathname !== '/' ||
    url.search ||
    url.hash
  ) {
    throw new Error('Development renderer URL must be an exact 127.0.0.1 HTTP origin')
  }
  return url.origin
}

export function isAllowedNavigation(value: string, allowedOrigin: string): boolean {
  try {
    const target = new URL(value)
    const allowed = new URL(allowedOrigin)
    return !target.username && !target.password &&
      target.protocol === allowed.protocol &&
      target.hostname === allowed.hostname &&
      target.port === allowed.port
  } catch {
    return false
  }
}
