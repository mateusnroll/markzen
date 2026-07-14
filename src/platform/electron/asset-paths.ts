import nodePath from 'node:path'

import type { RichDocument, RichNode } from '../../documents/markdown'
import type { Path, SourceRebase } from '../contracts'

export function rebaseDocumentImages(
  document: RichDocument,
  oldDocumentPath: Path | undefined,
  newDocumentPath: Path,
): { readonly document: RichDocument; readonly sourceRebases: readonly SourceRebase[] } {
  const sourceRebases: SourceRebase[] = []
  const content = document.content.map((node) => rebaseNode(node, oldDocumentPath, newDocumentPath, sourceRebases))
  return { document: { ...document, content }, sourceRebases }
}

function rebaseNode(node: RichNode, oldPath: Path | undefined, newPath: Path, changes: SourceRebase[]): RichNode {
  const content = node.content?.map((child) => rebaseNode(child, oldPath, newPath, changes))
  if (node.type !== 'image') return { ...node, ...(content ? { content } : {}) }
  const source = typeof node.attrs?.src === 'string' ? node.attrs.src : ''
  const internal = node.attrs?.internal === true
  const rebased = rebaseSource(source, internal, oldPath, newPath)
  if (!rebased || rebased === source) return { ...node, attrs: { ...node.attrs, assetUrl: null, ...(internal ? { internal: false } : {}) }, ...(content ? { content } : {}) }
  changes.push({ ...(typeof node.attrs?.assetId === 'string' ? { assetId: node.attrs.assetId } : {}), from: source, to: rebased })
  return { ...node, attrs: { ...node.attrs, assetUrl: null, internal: false, src: rebased }, ...(content ? { content } : {}) }
}

function rebaseSource(source: string, internal: boolean, oldDocumentPath: Path | undefined, newDocumentPath: Path): string | undefined {
  const windowsAbsolute = /^[A-Za-z]:[\\/]/.test(source) || /^\\\\/.test(source)
  if (!source || source.includes('\0') || (/^[a-z][a-z0-9+.-]*:/i.test(source) && !windowsAbsolute) || (!internal && source.startsWith('//'))) return undefined
  const pathApi = windowsPath(source, oldDocumentPath, newDocumentPath) ? nodePath.win32 : nodePath.posix
  const platformSource = pathApi === nodePath.win32 ? source.replaceAll('/', '\\') : source
  let absolute: string
  if (internal) {
    if (!pathApi.isAbsolute(platformSource)) return undefined
    absolute = pathApi.normalize(platformSource)
  } else {
    if (!oldDocumentPath || pathApi.isAbsolute(platformSource)) return undefined
    absolute = pathApi.resolve(pathApi.dirname(String(oldDocumentPath)), platformSource)
  }
  const relative = pathApi.relative(pathApi.dirname(String(newDocumentPath)), absolute)
  return (pathApi.isAbsolute(relative) ? absolute : relative || pathApi.basename(absolute)).replaceAll('\\', '/')
}

function windowsPath(source: string, oldPath: Path | undefined, newPath: Path): boolean {
  return /^[A-Za-z]:[\\/]|^\\\\/.test(source) || /^[A-Za-z]:[\\/]|^\\\\/.test(String(oldPath ?? '')) || /^[A-Za-z]:[\\/]|^\\\\/.test(String(newPath))
}
