import { readdir, readFile } from 'node:fs/promises'
import nodePath from 'node:path'

import { app, protocol } from 'electron'
import { assetRegistry } from './asset-registry'

export const APP_ORIGIN = 'markzen://app'

export const PRODUCTION_CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self'",
  "img-src 'self' data: markzen-asset:",
  "font-src 'self'",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "child-src 'none'",
  "frame-src 'none'",
  "worker-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ')

protocol.registerSchemesAsPrivileged([
  {
    privileges: {
      allowServiceWorkers: false,
      bypassCSP: false,
      corsEnabled: false,
      secure: true,
      standard: true,
      stream: true,
      supportFetchAPI: true,
    },
    scheme: 'markzen',
  },
  {
    privileges: {
      allowServiceWorkers: false,
      bypassCSP: false,
      corsEnabled: false,
      secure: true,
      standard: false,
      stream: false,
      supportFetchAPI: false,
    },
    scheme: 'markzen-asset',
  },
])

let registered = false
export async function registerApplicationProtocol(): Promise<void> {
  if (registered) return
  const assets = await rendererAssets(nodePath.join(app.getAppPath(), 'dist'))
  protocol.handle('markzen', async (request) => {
    if (unsafeRawUrl(request.url)) return response('Not found', 404, 'text/plain; charset=utf-8')
    const url = new URL(request.url)
    if (url.protocol !== 'markzen:' || url.hostname !== 'app' || url.username || url.password || url.port) {
      return response('Not found', 404, 'text/plain; charset=utf-8')
    }
    const key = url.pathname === '/' ? '/index.html' : url.pathname
    const asset = assets.get(key)
    if (!asset) return response('Not found', 404, 'text/plain; charset=utf-8')
    try {
      return response(new Uint8Array(await readFile(asset)), 200, contentType(asset))
    } catch {
      return response('Unavailable', 503, 'text/plain; charset=utf-8')
    }
  })
  protocol.handle('markzen-asset', async (request) => {
    if (request.method !== 'GET' || unsafeRawUrl(request.url)) return assetDenial()
    let url: URL
    try {
      url = new URL(request.url)
    } catch {
      return assetDenial()
    }
    if (url.protocol !== 'markzen-asset:' || url.username || url.password || url.port || url.search || url.hash || (url.hostname && url.pathname !== '' && url.pathname !== '/')) return assetDenial()
    const token = url.hostname || url.pathname.replace(/^\//, '')
    if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return assetDenial()
    const asset = await assetRegistry.read(token)
    if (!asset) return assetDenial()
    const body = asset.bytes.buffer.slice(asset.bytes.byteOffset, asset.bytes.byteOffset + asset.bytes.byteLength) as ArrayBuffer
    return new Response(body, {
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': asset.mime,
        'X-Content-Type-Options': 'nosniff',
      },
      status: 200,
    })
  })
  registered = true
}

function assetDenial(): Response {
  return new Response('Not found', {
    headers: { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8', 'X-Content-Type-Options': 'nosniff' },
    status: 404,
  })
}

async function rendererAssets(root: string): Promise<Map<string, string>> {
  const assets = new Map<string, string>()
  const visit = async (directory: string): Promise<void> => {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const absolute = nodePath.join(directory, entry.name)
      if (entry.isDirectory()) await visit(absolute)
      else if (entry.isFile()) assets.set(`/${nodePath.relative(root, absolute).split(nodePath.sep).join('/')}`, absolute)
    }
  }
  await visit(root)
  return assets
}

function response(body: BodyInit, status: number, contentTypeValue: string): Response {
  return new Response(body, {
    headers: {
      'Content-Security-Policy': PRODUCTION_CSP,
      'Content-Type': contentTypeValue,
      'Cross-Origin-Opener-Policy': 'same-origin',
      'X-Content-Type-Options': 'nosniff',
    },
    status,
  })
}

function unsafeRawUrl(value: string): boolean {
  return /%(?:2e|2f|5c)/i.test(value) || value.includes('\\')
}

function contentType(path: string): string {
  switch (nodePath.extname(path).toLocaleLowerCase('en-US')) {
    case '.css': return 'text/css; charset=utf-8'
    case '.html': return 'text/html; charset=utf-8'
    case '.js': return 'text/javascript; charset=utf-8'
    case '.json': return 'application/json; charset=utf-8'
    case '.map': return 'application/json; charset=utf-8'
    case '.png': return 'image/png'
    case '.svg': return 'image/svg+xml'
    default: return 'application/octet-stream'
  }
}
