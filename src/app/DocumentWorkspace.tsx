import { Editor, type JSONContent } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { EditorContent } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type WheelEvent } from 'react'
import type { SelectionBookmark } from '@tiptap/pm/state'

import { validateDocumentName } from '../documents/filename'
import type { DocumentGatewayPort, ExternalGatewayEvent, GatewayDocument, SaveOutcome } from '../documents/gateway'
import { createCsvEditor, csvRowsFromEditor, type CsvDocument } from '../documents/csv'
import {
  createEmptyJsonDocument,
  createJsonEditor,
  jsonRootFromEditor,
  type JsonDocument,
} from '../documents/json'
import { createDocumentExtensions, type RichDocument } from '../documents/markdown'
import { acceptTabBaseline, createTabBaseline, editTabDocument, editTabTitle, isTabDirty } from '../documents/tab-state'
import {
  asTabId,
  type DirectoryEntry,
  type DiskVersion,
  type ExternalOpenResult,
  type FileKey,
  type Path,
  type RootId,
  type ToolbarMode,
} from '../platform/contracts'
import { insertPinnedBeforePreview, preparePreviewReplacement } from '../workspaces/state'
import { WorkspaceSidebar, type WorkspaceRootSeed } from './WorkspaceSidebar'
import { LinkActions, type LinkActionsHandle } from './LinkActions'
import { ImageActions, imageKeyboardHandler, type ImageActionsHandle } from './ImageActions'
import { SearchPanel } from './SearchPanel'
import { WritingToolbar } from './WritingToolbar'
import { TableActions } from './TableActions'
import { useOverlaySurface } from './overlays'
import { CsvGrid } from './CsvGrid'
import { commitJsonDraft, JsonTree } from './JsonTree'
import { createTextEditor, textFromEditor } from '../documents/text-editor'
import type { TextDocument } from '../documents/text'
import type { RasterDisplayMetadata } from '../documents/file-types'

import './document.css'

type DocumentSeedBase = {
  readonly diskVersion?: DiskVersion
  readonly fileKey?: FileKey
  readonly id: string
  readonly path?: Path
  readonly preservation?: { readonly bytes?: Uint8Array; readonly display: string; readonly kind: 'bytes' | 'text' }
  readonly preview?: boolean
  readonly secondaryPath?: string
  readonly title: string
}

export type DocumentSeed =
  | (DocumentSeedBase & { readonly document?: JSONContent; readonly kind?: 'markdown' })
  | (DocumentSeedBase & { readonly csv?: CsvDocument; readonly kind: 'csv' })
  | (DocumentSeedBase & { readonly json?: JsonDocument; readonly kind: 'json' })
  | (DocumentSeedBase & { readonly kind: 'text'; readonly language: string; readonly managedExtension?: string; readonly text?: TextDocument })
  | (DocumentSeedBase & { readonly kind: 'raster'; readonly raster: RasterDisplayMetadata & { readonly url: string } })
  | (DocumentSeedBase & { readonly kind: 'external'; readonly limitation: string })

export type DocumentWorkspaceFolder = {
  readonly forcedColors: boolean
  readonly invalidation?: { readonly generation: number; readonly path: Path; readonly rootId: RootId }
  readonly onList: (rootId: RootId, path: Path) => Promise<readonly DirectoryEntry[]>
  readonly onWidthChange: (width: number) => void
  readonly reducedMotion: boolean
  readonly roots: readonly WorkspaceRootSeed[]
  readonly width: number
}

type WorkspaceTabBase = {
  readonly baselineTitle: string
  readonly contentDirty: boolean
  readonly diskVersion?: DiskVersion
  readonly fileKey?: FileKey
  readonly id: string
  readonly header: boolean
  readonly path?: Path
  readonly preservation?: { readonly bytes?: Uint8Array; readonly display: string; readonly kind: 'bytes' | 'text' }
  readonly preview: boolean
  readonly revision: number
  readonly secondaryPath?: string
  readonly title: string
}

type WritableWorkspaceTab = WorkspaceTabBase & {
  readonly csv?: CsvDocument
  readonly editor: Editor
  readonly json?: JsonDocument
  readonly text?: TextDocument
  readonly language?: string
  readonly managedExtension?: string
  readonly kind: 'csv' | 'json' | 'markdown' | 'text'
}

type WorkspaceTab = WritableWorkspaceTab
  | (WorkspaceTabBase & { readonly kind: 'raster'; readonly raster: RasterDisplayMetadata & { readonly url: string } })
  | (WorkspaceTabBase & { readonly kind: 'external'; readonly limitation: string })

const emptyDocument: JSONContent = { content: [{ type: 'paragraph' }], type: 'doc' }

export function DocumentWorkspace({
  closeRequest = 0,
  gateway,
  initialTabs,
  onCloseWindow,
  onOpenExternal = unsupportedExternalOpen,
  onSettingsRequest,
  toolbarMode = 'minimal',
  workspace,
  reducedMotion = workspace?.reducedMotion ?? false,
}: {
  readonly closeRequest?: number
  readonly gateway: DocumentGatewayPort
  readonly initialTabs?: readonly DocumentSeed[]
  readonly onCloseWindow?: () => void
  readonly onOpenExternal?: (destination: string) => Promise<ExternalOpenResult>
  readonly onSettingsRequest?: () => void
  readonly toolbarMode?: ToolbarMode
  readonly workspace?: DocumentWorkspaceFolder
  readonly reducedMotion?: boolean
}) {
  const editors = useRef(new Set<Editor>())
  const baselineDocuments = useRef(new Map<string, ProseMirrorNode>())
  const [renameCandidate, setRenameCandidate] = useState<string>()
  const [issue, setIssue] = useState<{ readonly kind: SaveOutcome['kind']; readonly message: string }>()
  const [pendingExternal, setPendingExternal] = useState<GatewayDocument>()
  const [announcement, setAnnouncement] = useState('')
  const [workspaceRetry, setWorkspaceRetry] = useState<{ readonly entry: DirectoryEntry; readonly pinned: boolean; readonly rootId: RootId }>()
  const generations = useRef(new Map<string, number>())
  const activationIntent = useRef(0)
  const lifecycleGeneration = useRef(0)
  const handledCloseRequest = useRef(0)
  const linkActions = useRef<LinkActionsHandle>(null)
  const imageActions = useRef<ImageActionsHandle>(null)
  const searchBookmark = useRef<SelectionBookmark | undefined>(undefined)
  const [searchOpen, setSearchOpen] = useState(false)
  const [searchRequest, setSearchRequest] = useState(0)

  const updateDocument = useCallback((id: string, editor: Editor) => {
    const baseline = baselineDocuments.current.get(id)
    setTabs((current) => current.map((tab) => (
      tab.id === id ? { ...editTabDocument(tab, baseline ? persistentDocumentsEqual(editor.state.doc, baseline) : false), preview: false } : tab
    )))
  }, [])

  const makeTab = useCallback(
    (seed: DocumentSeed): WorkspaceTab => {
      if (seed.kind === 'text') {
        const text = seed.text ?? {
          edited: false,
          encoding: { bom: false as const, newline: 'lf' as const },
          originalBytes: new Uint8Array(),
          text: '',
        }
        const editor = createTextEditor(
          text,
          seed.language ?? 'Plain text',
          (updated) => updateDocument(seed.id, updated),
          (reason) => setIssue({
            kind: 'error',
            message: reason.reason === 'line-bytes'
              ? 'A generic-text line cannot exceed 1 MiB.'
              : 'This edit exceeds the generic-text document limits.',
          }),
        )
        editors.current.add(editor)
        baselineDocuments.current.set(seed.id, editor.state.doc)
        return {
          ...createTabBaseline(seed.title), editor, id: seed.id, kind: 'text',
          text,
          language: seed.language ?? 'Plain text',
          ...(seed.managedExtension ? { managedExtension: seed.managedExtension } : {}),
          ...(seed.diskVersion ? { diskVersion: seed.diskVersion } : {}),
          ...(seed.fileKey ? { fileKey: seed.fileKey } : {}),
          header: false,
          ...(seed.path ? { path: seed.path } : {}),
          ...(seed.preservation ? { preservation: seed.preservation } : {}),
          preview: seed.preview ?? false,
          ...(seed.secondaryPath ? { secondaryPath: seed.secondaryPath } : {}),
          title: seed.title,
        }
      }
      if (seed.kind === 'raster' || seed.kind === 'external') {
        const common = {
          ...createTabBaseline(seed.title), id: seed.id,
          ...(seed.diskVersion ? { diskVersion: seed.diskVersion } : {}),
          ...(seed.fileKey ? { fileKey: seed.fileKey } : {}),
          header: false,
          ...(seed.path ? { path: seed.path } : {}),
          preview: seed.preview ?? false,
          ...(seed.secondaryPath ? { secondaryPath: seed.secondaryPath } : {}),
          title: seed.title,
        }
        return seed.kind === 'raster'
          ? { ...common, kind: 'raster', raster: seed.raster }
          : { ...common, kind: 'external', limitation: seed.limitation }
      }
      if (seed.kind === 'csv') {
        const csv = seed.csv ?? {
          dialect: { bom: false, delimiter: ',', newline: 'lf', terminalSeparator: false },
          edited: false,
          originalBytes: new Uint8Array(),
          rows: [['']],
        }
        const editor = createCsvEditor(csv, (updated) => updateDocument(seed.id, updated))
        editors.current.add(editor)
        baselineDocuments.current.set(seed.id, editor.state.doc)
        return {
          ...createTabBaseline(seed.title),
          csv,
          editor,
          ...(seed.diskVersion ? { diskVersion: seed.diskVersion } : {}),
          ...(seed.fileKey ? { fileKey: seed.fileKey } : {}),
          header: true,
          id: seed.id,
          kind: 'csv',
          ...(seed.path ? { path: seed.path } : {}),
          ...(seed.preservation ? { preservation: seed.preservation } : {}),
          preview: seed.preview ?? false,
          ...(seed.secondaryPath ? { secondaryPath: seed.secondaryPath } : {}),
          title: seed.title,
        }
      }
      if (seed.kind === 'json') {
        const json = seed.json ?? createEmptyJsonDocument()
        const editor = createJsonEditor(json, (updated) => updateDocument(seed.id, updated))
        editors.current.add(editor)
        baselineDocuments.current.set(seed.id, editor.state.doc)
        return {
          ...createTabBaseline(seed.title),
          editor,
          ...(seed.diskVersion ? { diskVersion: seed.diskVersion } : {}),
          ...(seed.fileKey ? { fileKey: seed.fileKey } : {}),
          header: false,
          id: seed.id,
          json,
          kind: 'json',
          ...(seed.path ? { path: seed.path } : {}),
          ...(seed.preservation ? { preservation: seed.preservation } : {}),
          preview: seed.preview ?? false,
          ...(seed.secondaryPath ? { secondaryPath: seed.secondaryPath } : {}),
          title: seed.title,
        }
      }
      const document = withImageIds(seed.document ?? emptyDocument)
      const editor: Editor = new Editor({
        content: document,
        editorProps: {
          attributes: {
            'aria-label': 'Document editor',
            'data-testid': 'rich-editor-content',
            role: 'textbox',
            spellcheck: 'true',
          },
          handleTextInput: (view, from, _to, text) => convertTaskMarkerInput(view, from, text),
          handleKeyDown: (_view, event): boolean => imageKeyboardHandler(editor, () => imageActions.current?.openSelected(), event),
        },
        extensions: createDocumentExtensions(),
        onUpdate: ({ editor: updated }) => updateDocument(seed.id, updated),
      })
      editors.current.add(editor)
      baselineDocuments.current.set(seed.id, editor.state.doc)
      return {
        ...createTabBaseline(seed.title),
        editor,
        ...(seed.diskVersion ? { diskVersion: seed.diskVersion } : {}),
        ...(seed.fileKey ? { fileKey: seed.fileKey } : {}),
        header: false,
        id: seed.id,
        kind: 'markdown',
        ...(seed.path ? { path: seed.path } : {}),
        ...(seed.preservation ? { preservation: seed.preservation } : {}),
        preview: seed.preview ?? false,
        ...(seed.secondaryPath ? { secondaryPath: seed.secondaryPath } : {}),
        title: seed.title,
      }
    },
    [updateDocument],
  )

  const seeds = useMemo(
    () => initialTabs ?? (workspace ? [] : [{ id: 'untitled-1', title: '' }]),
    [initialTabs, workspace],
  )
  const [tabs, setTabs] = useState<WorkspaceTab[]>(() => seeds.map(makeTab))
  const tabsRef = useRef(tabs)
  tabsRef.current = tabs
  const [activeId, setActiveId] = useState(seeds[0]?.id ?? '')
  const [rovingId, setRovingId] = useState(seeds[0]?.id ?? '')

  useEffect(() => {
    const generation = ++lifecycleGeneration.current
    return () => {
      queueMicrotask(() => {
        if (lifecycleGeneration.current !== generation) return
        for (const editor of editors.current) editor.destroy()
        editors.current.clear()
      })
    }
  }, [])

  const active = tabs.find((tab) => tab.id === activeId)
  const activeIndex = tabs.findIndex((tab) => tab.id === activeId)
  const secondaryPath = useMemo(() => active?.secondaryPath ?? (active?.path && workspace
    ? workspaceSecondaryPath(active.path, workspace.roots)
    : undefined), [active?.path, active?.secondaryPath, workspace])

  const dirty = useCallback(
    (tab: WorkspaceTab) => {
      if (tab.kind === 'raster' || tab.kind === 'external') return false
      if (tab.kind === 'markdown') return isTabDirty(tab)
      const baseline = baselineDocuments.current.get(tab.id)
      return isTabDirty(tab) || Boolean(baseline && !persistentDocumentsEqual(tab.editor.state.doc, baseline))
    },
    [],
  )

  const contentDirty = useCallback((tab: WorkspaceTab) => {
    if (tab.kind === 'raster' || tab.kind === 'external') return false
    if (tab.kind === 'markdown') return tab.contentDirty
    const baseline = baselineDocuments.current.get(tab.id)
    return tab.contentDirty || Boolean(baseline && !persistentDocumentsEqual(tab.editor.state.doc, baseline))
  }, [])

  const pinTab = useCallback((id: string) => {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, preview: false } : tab))
  }, [])

  const openSearch = useCallback(() => {
    if (!active || active.preservation || active.kind === 'raster' || active.kind === 'external') return
    if (!searchOpen) searchBookmark.current = active.editor.state.selection.getBookmark()
    setSearchOpen(true)
    setSearchRequest((value) => value + 1)
  }, [active, searchOpen])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    if (!active || !isWritableTab(active) || !searchBookmark.current) return
    if (active.kind === 'json') {
      focusJsonTree()
      searchBookmark.current = undefined
      return
    }
    try {
      const selection = searchBookmark.current.resolve(active.editor.state.doc)
      active.editor.chain().setTextSelection({ from: selection.from, to: selection.to }).focus().run()
    } catch {
      active.editor.commands.focus()
    }
    searchBookmark.current = undefined
  }, [active])

  const closeTab = useCallback(
    (id: string) => {
      setTabs((current) => {
        const index = current.findIndex((tab) => tab.id === id)
        const closing = current[index]
        if (!closing) return current
        disposeTabEditor(closing, editors.current, baselineDocuments.current)
        generations.current.set(id, (generations.current.get(id) ?? 0) + 1)
        const remaining = current.filter((tab) => tab.id !== id)
        if (id === activeId) {
          const next = remaining[Math.min(index, remaining.length - 1)]
          setActiveId(next?.id ?? '')
          setRovingId(next?.id ?? '')
        }
        return remaining
      })
      void gateway.closeTab(id)
    },
    [activeId, gateway],
  )

  const requestClose = useCallback(
    (id: string) => {
      const tab = tabs.find((candidate) => candidate.id === id)
      if (!tab) return
      if (!commitStructuredDraft(tab)) return
      if (!dirty(tab)) {
        closeTab(id)
        return
      }
      if (!isWritableTab(tab)) return
      void gateway.confirmClose(id, tab.title || 'Untitled').then((choice) => {
        if (choice === 'discard') closeTab(id)
        if (choice !== 'save') return
        const generation = (generations.current.get(tab.id) ?? 0) + 1
        const snapshot = tab.editor.state.doc
        generations.current.set(tab.id, generation)
        void gateway.save({
          ...gatewayDocument(tab, contentDirty(tab)),
          documentDirty: contentDirty(tab),
          titleDirty: tab.title !== tab.baselineTitle,
        }).then((result) => {
          if (result.kind === 'saved' || result.kind === 'cleanup-warning') {
            if (generations.current.get(tab.id) !== generation) return
            baselineDocuments.current.set(tab.id, snapshot)
            setTabs((current) => current.map((candidate) => (
              candidate.id === tab.id ? adoptGatewayResult(candidate, result.document, snapshot) : candidate
            )))
            const latest = tabsRef.current.find((candidate) => candidate.id === id)
            if (latest && isWritableTab(latest) && latest.editor.state.doc.eq(snapshot) && latest.title === result.document.title) closeTab(id)
            else setIssue({ kind: 'error', message: 'Newer changes remain open and still need a close decision.' })
          } else if (result.kind === 'unchanged' && !dirty(tab)) closeTab(id)
          else setIssue({ kind: result.kind, message: 'The document remains open because saving did not complete.' })
        })
      })
    },
    [closeTab, contentDirty, dirty, gateway, tabs],
  )

  const addTab = useCallback((kind: 'csv' | 'json' | 'markdown' = 'markdown') => {
    if (active && !commitStructuredDraft(active)) return
    activationIntent.current += 1
    const append = (id: string) => {
      const tab = makeTab({ id, kind, title: '' })
      setTabs((current) => [...insertPinnedBeforePreview(current, tab)])
      setActiveId(tab.id)
      setRovingId(tab.id)
      requestAnimationFrame(() => focusTabEditor(tab, 'start'))
    }
    void gateway.createTabId(kind).then(append)
  }, [active, gateway, makeTab])

  const activateFromEditor = useCallback(
    (offset: number) => {
      if (tabs.length < 2 || activeIndex < 0) return
      if (active && !commitStructuredDraft(active)) return
      const next = tabs[(activeIndex + offset + tabs.length) % tabs.length]
      if (!next) return
      setActiveId(next.id)
      setRovingId(next.id)
      requestAnimationFrame(() => focusTabEditor(next))
    },
    [active, activeIndex, tabs],
  )

  const handleWorkspaceKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const modifier = event.metaKey || event.ctrlKey
      if (modifier && event.key === ',') {
        event.preventDefault()
        onSettingsRequest?.()
        return
      }
      if (modifier && event.key.toLowerCase() === 'f') {
        event.preventDefault()
        openSearch()
        return
      }
      if (!(event.target instanceof Element) || !event.target.closest('.ProseMirror')) return
      if (event.ctrlKey && event.key === 'Tab') {
        event.preventDefault()
        activateFromEditor(event.shiftKey ? -1 : 1)
        return
      }
      if (event.key === 'ArrowUp' && active && isWritableTab(active) && active.editor.state.selection.from === 1) {
        event.preventDefault()
        const title = document.querySelector<HTMLInputElement>('[data-testid="document-title"]')
        title?.focus()
        title?.setSelectionRange(title.value.length, title.value.length)
      }
    },
    [activateFromEditor, active, onSettingsRequest, openSearch],
  )

  const titleValidation = useMemo(
    () => (!active || (!active.title && !active.baselineTitle) ? { valid: true as const } : validateDocumentName(active.title)),
    [active],
  )
  const titleError = titleValidation.valid ? undefined : titleValidation.reason

  const updateTitle = useCallback((id: string, title: string) => {
    setTabs((current) => current.map((tab) => (tab.id === id ? { ...editTabTitle(tab, title), preview: false } : tab)))
  }, [])

  const commitGatewaySave = useCallback((tab: WritableWorkspaceTab, result: SaveOutcome, generation: number, snapshot: ProseMirrorNode) => {
    if (generations.current.get(tab.id) !== generation) return
    if (result.kind === 'saved' || result.kind === 'cleanup-warning') {
      setIssue(result.kind === 'cleanup-warning'
        ? { kind: 'cleanup-warning', message: `The new file is safe, but the old copy at ${result.oldPath} could not be removed.` }
        : undefined)
      let baseline = snapshot
      if (result.document.assetsRevoked) {
        applySourceRebases(tab.editor, result.document.sourceRebases ?? [], true)
        if (result.document.document) baseline = tab.editor.schema.nodeFromJSON(result.document.document)
      }
      baselineDocuments.current.set(tab.id, baseline)
      setTabs((current) => current.map((candidate) => (
        candidate.id === tab.id ? adoptGatewayResult(candidate, result.document, baseline) : candidate
      )))
      return
    }
    if (result.kind === 'unchanged' || result.kind === 'cancelled') return
    const messages: Partial<Record<SaveOutcome['kind'], string>> = {
      collision: 'Another document already exists with that name.',
      conflict: 'This file changed on disk. Choose how to resolve the conflict.',
      error: 'The document could not be saved. Your changes remain in the editor.',
      missing: 'The original file is missing. Use Save As to create a new document.',
      'rename-decision': 'The content must be saved before the file can move.',
    }
    setIssue({ kind: result.kind, message: messages[result.kind] ?? 'The document could not be saved.' })
    if (result.kind === 'rename-decision') setRenameCandidate(tab.id)
  }, [])

  const save = useCallback(() => {
    if (!active || active.kind === 'raster' || active.kind === 'external' || !titleValidation.valid || !commitStructuredDraft(active)) return
    pinTab(active.id)
    const generation = (generations.current.get(active.id) ?? 0) + 1
    const snapshot = active.editor.state.doc
    generations.current.set(active.id, generation)
    void gateway.save({
      ...gatewayDocument(active, contentDirty(active)),
      documentDirty: contentDirty(active),
      titleDirty: active.title !== active.baselineTitle,
    }).then((result) => commitGatewaySave(active, result, generation, snapshot))
  }, [active, commitGatewaySave, contentDirty, gateway, pinTab, titleValidation.valid])

  const saveAs = useCallback(() => {
    if (!active || active.kind === 'raster' || active.kind === 'external' || !titleValidation.valid || !commitStructuredDraft(active)) return
    pinTab(active.id)
    const generation = (generations.current.get(active.id) ?? 0) + 1
    const snapshot = active.editor.state.doc
    generations.current.set(active.id, generation)
    void gateway.saveAs(gatewayDocument(active, contentDirty(active))).then((result) => commitGatewaySave(active, result, generation, snapshot))
  }, [active, commitGatewaySave, contentDirty, gateway, pinTab, titleValidation.valid])

  const openDocument = useCallback(() => {
    if (active && !commitStructuredDraft(active)) return
    const reusable = Boolean(active && tabs.length === 1 && active.baselineTitle === '' && !dirty(active))
    void (async () => {
      const targetId = reusable ? active!.id : await gateway.createTabId()
      const result = await gateway.open(targetId)
      if (result.kind !== 'opened') {
        if (!reusable) await gateway.closeTab(targetId)
        return
      }
      const existing = tabs.find((tab) => tab.fileKey === result.document.fileKey)
      if (existing) {
        if (result.document.id !== existing.id) await gateway.closeTab(result.document.id)
        setActiveId(existing.id)
        setRovingId(existing.id)
        return
      }
      const seed = gatewaySeed(result.document)
      const opened = makeTab(seed)
      if (reusable && tabs[0]) {
        disposeTabEditor(tabs[0], editors.current, baselineDocuments.current)
        setTabs([opened])
      } else setTabs((current) => [...insertPinnedBeforePreview(current, opened)])
      setActiveId(opened.id)
      setRovingId(opened.id)
    })()
  }, [active, dirty, gateway, makeTab, tabs])

  const openWorkspaceEntry = useCallback((entry: DirectoryEntry, pinned: boolean, rootId: RootId) => {
    const current = tabsRef.current.find((tab) => tab.id === activeId)
    if (current && !commitStructuredDraft(current)) return
    const activation = ++activationIntent.current
    void (async () => {
      setWorkspaceRetry(undefined)
      const previousActiveId = activeId
      const existing = tabsRef.current.find((tab) => tab.fileKey === entry.fileKey)
      if (existing) {
        if (pinned) pinTab(existing.id)
        setActiveId(existing.id)
        setRovingId(existing.id)
        return
      }

      const preview = tabsRef.current.find((tab) => tab.preview)
      const previewDecision = preparePreviewReplacement(preview ? { dirty: dirty(preview), id: preview.id } : undefined)
      const reusable = previewDecision.reusableId ? preview : undefined
      if (preview && previewDecision.pinExisting) pinTab(preview.id)
      const id = reusable?.id ?? await gateway.createTabId()
      const generation = (generations.current.get(id) ?? 0) + 1
      generations.current.set(id, generation)
      const placeholder = makeTab({
        fileKey: entry.fileKey,
        id,
        path: entry.path,
        preview: !pinned,
        title: displaySeedTitle(entry.name),
      })
      if (reusable) {
        setTabs((current) => current.map((tab) => tab.id === reusable.id ? placeholder : tab))
      } else {
        setTabs((current) => pinned
          ? [...insertPinnedBeforePreview(current, placeholder)]
          : [...current.filter((tab) => !tab.preview), placeholder])
      }
      if (activationIntent.current === activation) {
        setActiveId(id)
        setRovingId(id)
      }

      const rootPath = workspace?.roots.find((root) => root.rootId === rootId)?.path
      if (!rootPath) return
      const result = await gateway.openWorkspace({
        fileKey: entry.fileKey,
        generation,
        id,
        path: entry.path,
        relativePath: logicalRelativePath(rootPath, entry.path),
        rootId,
      })
      if (generations.current.get(id) !== generation) return
      if (result.kind === 'collision' && reusable) {
        disposeTabEditor(placeholder, editors.current, baselineDocuments.current)
        setTabs((current) => current.map((tab) => tab.id === id ? reusable : tab))
        setActiveId(reusable.id)
        setRovingId(reusable.id)
        return
      }
      if (result.kind === 'collision') {
        closeTab(id)
        setActiveId(previousActiveId)
        setRovingId(previousActiveId)
        return
      }
      if (result.kind !== 'opened') {
        if (reusable) {
          disposeTabEditor(reusable, editors.current, baselineDocuments.current)
        }
        const failed = makeTab({ id, preview: !pinned, title: displaySeedTitle(entry.name) })
        disposeTabEditor(placeholder, editors.current, baselineDocuments.current)
        setTabs((current) => current.map((tab) => tab.id === id ? failed : tab))
        setWorkspaceRetry({ entry, pinned, rootId })
        setIssue({ kind: 'error', message: 'This file could not be opened. Its identity or workspace access may have changed.' })
        return
      }
      if (reusable) {
        disposeTabEditor(reusable, editors.current, baselineDocuments.current)
      }
      setWorkspaceRetry(undefined)
      setIssue(undefined)
      const duplicate = tabsRef.current.find((tab) => tab.id !== id && tab.fileKey === result.document.fileKey)
      if (duplicate) {
        closeTab(id)
        if (pinned) pinTab(duplicate.id)
        setActiveId(duplicate.id)
        setRovingId(duplicate.id)
        return
      }
      const replacement = makeTab({ ...gatewaySeed(result.document), preview: !pinned })
      setTabs((current) => current.map((tab) => {
        if (tab.id !== id) return tab
        disposeTabEditor(tab, editors.current, baselineDocuments.current)
        return replacement
      }))
    })()
  }, [activeId, closeTab, dirty, gateway, makeTab, pinTab, workspace])

  const saveTabsSequentially = useCallback(async (dirtyTabs: readonly WorkspaceTab[]): Promise<boolean> => {
    for (const tab of dirtyTabs) {
      if (!isWritableTab(tab)) continue
      if (!commitStructuredDraft(tab)) {
        setIssue({ kind: 'error', message: `Save All stopped at ${tab.title || 'Untitled'} because a JSON number is incomplete.` })
        return false
      }
      const snapshot = tab.editor.state.doc
      const result = await gateway.save({
        ...gatewayDocument(tab, contentDirty(tab)),
        documentDirty: contentDirty(tab),
        titleDirty: tab.title !== tab.baselineTitle,
      })
      if (result.kind !== 'saved' && result.kind !== 'cleanup-warning' && result.kind !== 'unchanged') {
        setIssue({ kind: result.kind, message: `Save All stopped at ${tab.title || 'Untitled'}.` })
        return false
      }
      if (result.kind === 'saved' || result.kind === 'cleanup-warning') {
        baselineDocuments.current.set(tab.id, snapshot)
        setTabs((current) => current.map((candidate) => (
          candidate.id === tab.id ? adoptGatewayResult(candidate, result.document, snapshot) : candidate
        )))
      }
    }
    return true
  }, [contentDirty, gateway])

  const requestWindowClose = useCallback(() => {
    const dirtyTabs = tabs.filter(dirty)
    if (dirtyTabs.length === 0) {
      onCloseWindow?.()
      return
    }
    void gateway.confirmWindowClose(dirtyTabs.map((tab) => tab.title || 'Untitled')).then(async (choice) => {
      if (choice === 'cancel') return
      if (choice === 'discard') {
        onCloseWindow?.()
        return
      }
      if (await saveTabsSequentially(dirtyTabs)) onCloseWindow?.()
    })
  }, [dirty, gateway, onCloseWindow, saveTabsSequentially, tabs])

  useEffect(() => {
    if (closeRequest > handledCloseRequest.current) {
      handledCloseRequest.current = closeRequest
      requestWindowClose()
    }
  }, [closeRequest, requestWindowClose])

  useEffect(() => {
    setSearchOpen(false)
    searchBookmark.current = undefined
  }, [activeId])

  useEffect(() => gateway.onCommand((command) => {
    if (active?.kind === 'csv') document.querySelector<HTMLTextAreaElement>('[data-testid="csv-cell-editor"]')?.blur()
    if (command === 'new') addTab('markdown')
    if (command === 'new-csv') addTab('csv')
    if (command === 'new-json') addTab('json')
    if (command === 'open') openDocument()
    if (command === 'save') save()
    if (command === 'save-all') void saveTabsSequentially(tabs.filter(dirty))
    if (command === 'save-all-for-quit') {
      void saveTabsSequentially(tabs.filter(dirty)).then((success) => gateway.completeQuitSaveAll(success))
    }
    if (command === 'save-as') saveAs()
    if (command === 'close-tab' && active) requestClose(active.id)
    if (command === 'close-window') requestWindowClose()
    if (command === 'find') openSearch()
    if (command === 'settings') onSettingsRequest?.()
  }), [active, addTab, dirty, gateway, onSettingsRequest, openDocument, openSearch, requestClose, requestWindowClose, save, saveAs, saveTabsSequentially, tabs])

  useEffect(() => {
    void gateway.updateMenuState({
      ...(active ? { activeTabId: asTabId(active.id) } : {}),
      tabs: tabs.map((tab) => ({
        dirty: dirty(tab),
        preservation: Boolean(tab.preservation),
        tabId: asTabId(tab.id),
        title: tab.title || 'Untitled',
        titleValid: validateDocumentName(tab.title).valid || (!tab.title && !tab.baselineTitle),
      })),
    })
  }, [active, dirty, gateway, tabs])

  useEffect(() => gateway.onExternalChange((event: ExternalGatewayEvent) => {
    const tab = tabs.find((candidate) => candidate.id === (event.kind === 'changed' ? event.document.id : event.id))
    if (!tab) return
    if (event.kind === 'watch-warning') {
      if (tab.id === activeId) setIssue({ kind: 'error', message: 'Live reload is unavailable. Save still checks the disk version before writing.' })
      return
    }
    if (event.kind === 'missing') {
      if (tab.id === activeId) setIssue({ kind: 'missing', message: 'The original file is missing. Use Save As to create a new document.' })
      return
    }
    if (dirty(tab)) {
      setPendingExternal(event.document)
      if (tab.id === activeId) setIssue({ kind: 'conflict', message: 'This file changed on disk. Choose how to resolve the conflict.' })
      return
    }
    const replacement = makeTab(gatewaySeed(event.document))
    disposeTabEditor(tab, editors.current, baselineDocuments.current)
    setTabs((current) => current.map((candidate) => candidate.id === tab.id ? replacement : candidate))
    void gateway.acceptExternal(event.document)
    setAnnouncement('Document reloaded from disk.')
  }), [activeId, dirty, gateway, makeTab, tabs])

  const reloadExternal = useCallback(() => {
    if (!active || !pendingExternal || active.id !== pendingExternal.id) return
    const replacement = makeTab(gatewaySeed(pendingExternal))
    disposeTabEditor(active, editors.current, baselineDocuments.current)
    setTabs((current) => current.map((candidate) => candidate.id === active.id ? replacement : candidate))
    void gateway.acceptExternal(pendingExternal)
    setPendingExternal(undefined)
    setIssue(undefined)
    setAnnouncement('Document reloaded from disk.')
    requestAnimationFrame(() => focusTabEditor(replacement))
  }, [active, gateway, makeTab, pendingExternal])

  const overwriteExternal = useCallback(() => {
    if (!active || !isWritableTab(active) || !pendingExternal?.diskVersion) return
    const generation = (generations.current.get(active.id) ?? 0) + 1
    const snapshot = active.editor.state.doc
    generations.current.set(active.id, generation)
    void gateway.overwriteExternal({
      ...gatewayDocument(active),
      documentDirty: true,
      titleDirty: active.title !== active.baselineTitle,
    }, pendingExternal.diskVersion).then((result) => {
      commitGatewaySave(active, result, generation, snapshot)
      if (result.kind === 'saved') setPendingExternal(undefined)
    })
  }, [active, commitGatewaySave, gateway, pendingExternal])

  const saveAndRename = useCallback(() => {
    if (!active || !isWritableTab(active)) return
    const generation = (generations.current.get(active.id) ?? 0) + 1
    const snapshot = active.editor.state.doc
    generations.current.set(active.id, generation)
    void gateway.saveAndRename({
      ...gatewayDocument(active),
      documentDirty: true,
      titleDirty: true,
    }).then((result) => {
      commitGatewaySave(active, result, generation, snapshot)
      if (result.kind === 'saved' || result.kind === 'cleanup-warning') setRenameCandidate(undefined)
    })
  }, [active, commitGatewaySave, gateway])

  const retryCleanup = useCallback(() => {
    if (!active) return
    void gateway.retryCleanup(gatewayDocument(active)).then((result) => {
      if (result.kind === 'saved' || result.kind === 'unchanged') setIssue(undefined)
    })
  }, [active, gateway])

  const navigateTabFocus = useCallback(
    (id: string, key: string) => {
      const index = tabs.findIndex((tab) => tab.id === id)
      let nextIndex = index
      if (key === 'ArrowRight') nextIndex = (index + 1) % tabs.length
      if (key === 'ArrowLeft') nextIndex = (index - 1 + tabs.length) % tabs.length
      if (key === 'Home') nextIndex = 0
      if (key === 'End') nextIndex = tabs.length - 1
      const next = tabs[nextIndex]
      if (!next) return
      setRovingId(next.id)
      document.querySelector<HTMLButtonElement>(`[data-document-tab="${CSS.escape(next.id)}"]`)?.focus()
    },
    [tabs],
  )

  return (
    <div className="folder-workspace-layout">
      {workspace ? (
        <WorkspaceSidebar
          {...(active?.fileKey ? { activeFileKey: active.fileKey } : {})}
          forcedColors={workspace.forcedColors}
          {...(workspace.invalidation ? { invalidation: workspace.invalidation } : {})}
          onList={workspace.onList}
          onOpen={openWorkspaceEntry}
          onWidthChange={workspace.onWidthChange}
          reducedMotion={workspace.reducedMotion}
          roots={workspace.roots}
          width={workspace.width}
        />
      ) : null}
      <div className="document-workspace" data-testid="document-workspace" onKeyDownCapture={handleWorkspaceKeyDown}>
      <div
        className="tab-strip"
        data-testid="tab-strip"
        onWheel={(event: WheelEvent<HTMLDivElement>) => {
          event.currentTarget.scrollLeft += event.deltaX || event.deltaY
          event.stopPropagation()
        }}
      >
        <div className="tab-stack">
          <div aria-label="Open documents" className="tab-list" role="tablist">
            {tabs.map((tab) => {
              const isDirty = dirty(tab)
              const selected = tab.id === activeId
              const label = tab.title || 'Untitled'
              return (
                <button
                  aria-controls="active-document-panel"
                  aria-description={tab.preview ? 'Preview tab. Press Cmd/Ctrl+Enter to Keep Open.' : undefined}
                  aria-label={`${label}${tab.preview ? ', Preview' : ''}${isDirty ? ', dirty' : ''}`}
                  aria-selected={selected}
                  className={`document-tab${tab.preview ? ' document-tab-preview' : ''}`}
                  data-document-tab={tab.id}
                  data-testid="document-tab"
                  key={tab.id}
                  onClick={() => {
                    if (active && !commitStructuredDraft(active)) return
                    setActiveId(tab.id)
                    setRovingId(tab.id)
                  }}
                  onDoubleClick={() => pinTab(tab.id)}
                  onKeyDown={(event) => {
                    if ((event.metaKey || event.ctrlKey) && event.key === 'Enter' && tab.preview) {
                      event.preventDefault()
                      pinTab(tab.id)
                    } else if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                      event.preventDefault()
                      navigateTabFocus(tab.id, event.key)
                    } else if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      if (active && !commitStructuredDraft(active)) return
                      setActiveId(tab.id)
                      setRovingId(tab.id)
                    } else if (event.key === 'Tab' && !event.shiftKey && selected) {
                      event.preventDefault()
                      focusTabEditor(tab)
                    }
                  }}
                  role="tab"
                  tabIndex={rovingId === tab.id ? 0 : -1}
                  title={label}
                  type="button"
                >
                  {tab.preview ? <span aria-hidden="true" className="preview-icon">◇</span> : null}
                  <span className="tab-label">{label}</span>
                  {isDirty ? <span aria-hidden="true" className="dirty-dot">●</span> : null}
                </button>
              )
            })}
          </div>
          <div aria-label="Document close controls" className="tab-close-list">
            {tabs.map((tab) => {
              const label = tab.title || 'Untitled'
              return (
                <button
                  aria-label={`Close ${label}`}
                  className="tab-close"
                  data-testid="document-tab-close"
                  key={tab.id}
                  onClick={() => requestClose(tab.id)}
                  type="button"
                >
                  <span aria-hidden="true">×</span>
                </button>
              )
            })}
          </div>
        </div>
        <button aria-label="New file" className="tab-add" data-testid="tab-add" onClick={() => addTab()} type="button">
          <span aria-hidden="true">+</span>
        </button>
        <div aria-hidden="true" className="tab-drag-space" />
      </div>

      {active && active.kind === 'markdown' && !active.preservation ? (
        <WritingToolbar
          editor={active.editor}
          key={`toolbar-${active.id}`}
          mode={toolbarMode}
          onOpenLink={(selection) => linkActions.current?.openEditor(selection)}
          onOpenImage={(selection) => imageActions.current?.openInsertion(selection)}
        />
      ) : null}

      {active && searchOpen && !active.preservation && active.kind !== 'raster' && active.kind !== 'external' ? (
        <SearchPanel editor={active.editor} onClose={closeSearch} request={searchRequest} />
      ) : null}

      {active ? (
        <section
          aria-label={active.title || 'Untitled document'}
          className={`document-surface${active.kind === 'csv' || active.kind === 'json' || active.kind === 'text' ? ' document-surface-full-panel' : ''}`}
          data-testid="active-document-panel"
          id="active-document-panel"
          onMouseDown={(event) => {
            if (active.preservation || active.kind !== 'markdown' || event.button !== 0 || !(event.target instanceof Element)) return
            const surface = event.currentTarget
            if (event.clientX >= surface.getBoundingClientRect().left + surface.clientWidth) return
            if (event.target.closest('button, input, textarea, select, a, dialog, [role="menu"], [role="toolbar"], .document-issue, .preservation-panel')) return
            const titleGutter = surface.querySelector<HTMLElement>('.document-title-gutter')
            const title = surface.querySelector<HTMLInputElement>('[data-testid="document-title"]')
            if (titleGutter && title) {
              const titleBounds = titleGutter.getBoundingClientRect()
              if (event.clientY >= titleBounds.top && event.clientY <= titleBounds.bottom) {
                event.preventDefault()
                title.focus()
                return
              }
            }
            if (event.target.closest('[contenteditable="true"]')) return
            event.preventDefault()
            focusEditorAtClosestLine(active.editor, event.clientY)
          }}
          role="tabpanel"
        >
          <div
            className={`document-page${active.kind === 'csv' || active.kind === 'json' || active.kind === 'text' ? ' document-page-full-panel' : ''}`}
            data-testid="document-page"
          >
            {active.kind !== 'raster' && active.kind !== 'external' ? <div
              className="document-title-gutter"
              data-testid="document-title-gutter"
            >
              <div className="document-title-control">
                {!active.title ? <span aria-hidden="true" className="untitled-fallback">Untitled</span> : null}
                <input
                  aria-describedby={titleError ? 'document-title-error' : undefined}
                  aria-invalid={titleError ? true : undefined}
                  aria-label={active.kind === 'csv'
                    ? 'Document title, .csv extension is fixed'
                    : active.kind === 'json'
                      ? 'Document title, .json extension is fixed'
                      : 'Document title'}
                  className="document-title"
                  data-testid="document-title"
                  onChange={(event) => updateTitle(active.id, event.currentTarget.value.replace(/[\r\n]+/g, ''))}
                  onKeyDown={(event) => {
                    if (event.key === 'Escape') {
                      event.preventDefault()
                      updateTitle(active.id, active.baselineTitle)
                    } else if (event.key === 'Enter' || event.key === 'ArrowDown') {
                      event.preventDefault()
                      if (active.kind === 'csv') {
                        document.querySelector<HTMLElement>('[data-csv-row="0"][data-csv-column="0"]')?.focus()
                      } else if (active.kind === 'json') focusJsonTree()
                      else active.editor.commands.focus('start')
                    }
                  }}
                  onPaste={(event) => {
                    const text = event.clipboardData.getData('text').replace(/[\r\n]+/g, '')
                    if (text !== event.clipboardData.getData('text')) {
                      event.preventDefault()
                      const input = event.currentTarget
                      const start = input.selectionStart ?? input.value.length
                      const end = input.selectionEnd ?? start
                      updateTitle(active.id, `${input.value.slice(0, start)}${text}${input.value.slice(end)}`)
                    }
                  }}
                  placeholder="Untitled"
                  size={active.kind === 'csv' || active.kind === 'json' || active.kind === 'text' ? Math.max(1, active.title.length) : undefined}
                  value={active.title}
                />
                {active.kind === 'csv' ? <span aria-hidden="true" className="csv-title-extension" data-testid="csv-title-extension">.csv</span> : null}
                {active.kind === 'json' ? <span aria-hidden="true" className="csv-title-extension" data-testid="json-title-extension">.json</span> : null}
              </div>
              {titleError ? (
                <p className="title-error" data-testid="title-error" id="document-title-error" role="alert">
                  {titleError}
                </p>
              ) : null}
              {secondaryPath ? (
                <p aria-label={`Folder: ${secondaryPath}`} className="document-secondary-path" data-testid="document-secondary-path" title={secondaryPath}>
                  {secondaryPath}
                </p>
              ) : null}
              {active.kind === 'text' ? <p className="text-language-label" data-testid="text-language-label">{active.language ?? 'Plain text'}</p> : null}
            </div> : null}
            {active.preservation && active.kind === 'text' ? (
              <div className="preservation-panel">
                <p data-testid="preservation-explanation">{active.preservation.display}</p>
                <button data-testid="open-in-default-app" onClick={() => void gateway.openInDefaultApp(active.id)} type="button">Open in Default App</button>
              </div>
            ) : active.preservation ? (
              <div className="preservation-panel">
                <p data-testid="preservation-explanation">Rich editing is disabled to prevent data loss.</p>
                <pre data-testid="preservation-view" tabIndex={0}>{active.preservation.display}</pre>
              </div>
            ) : active.kind === 'csv' ? (
              <CsvGrid
                editor={active.editor}
                header={active.header}
                onError={(message) => setIssue({ kind: 'error', message })}
                onHeaderChange={(header) => setTabs((current) => current.map((tab) => (
                  tab.id === active.id ? { ...tab, header } : tab
                )))}
                onRequestFind={openSearch}
              />
            ) : active.kind === 'json' ? (
              <JsonTree
                editor={active.editor}
                key={`json-${active.id}`}
                onError={(message) => setIssue({ kind: 'error', message })}
                onRequestFind={openSearch}
              />
            ) : active.kind === 'text' ? (
              <div className="text-document" data-testid="text-document">
                <EditorContent data-testid="text-editor" editor={active.editor} />
              </div>
            ) : active.kind === 'raster' ? (
              <div className="raster-document">
                <p data-testid="raster-metadata">{active.raster ? `${active.raster.format} · ${active.raster.width} × ${active.raster.height} · ${active.raster.animated ? 'Animated' : 'Static'}` : 'Raster image'}</p>
                {active.raster?.animated && reducedMotion ? (
                  <p data-testid="raster-motion-warning">Animated image withheld because reduced motion is enabled.</p>
                ) : active.raster ? (
                  <img alt={active.title} data-testid="raster-image" src={active.raster.url} />
                ) : null}
                {active.raster?.animated && reducedMotion ? (
                  <button data-testid="open-in-default-app" onClick={() => void gateway.openInDefaultApp(active.id)} type="button">Open in Default App</button>
                ) : null}
              </div>
            ) : active.kind === 'external' ? (
              <div className="external-document">
                <p data-testid="external-limitation">{active.limitation ?? 'Markzen cannot edit or preview this file type.'}</p>
                <button data-testid="open-in-default-app" onClick={() => void gateway.openInDefaultApp(active.id)} type="button">Open in Default App</button>
              </div>
            ) : (
              <EditorContent data-testid="rich-editor" editor={active.editor} />
            )}
            {!active.preservation && active.kind === 'markdown' ? <TableActions editor={active.editor} key={`tables-${active.id}`} /> : null}
            {!active.preservation && active.kind === 'markdown' ? (
              <ImageActions
                editor={active.editor}
                gateway={gateway}
                key={`images-${active.id}`}
                onIssue={(message) => setIssue({ kind: 'error', message })}
                ref={imageActions}
                tabId={active.id}
              />
            ) : null}
            {!active.preservation && active.kind === 'markdown' ? (
              <LinkActions
                editor={active.editor}
                key={`links-${active.id}`}
                onAnnouncement={setAnnouncement}
                onIssue={(message) => setIssue({ kind: 'error', message })}
                onOpenExternal={onOpenExternal}
                ref={linkActions}
              />
            ) : null}
            {issue ? (
              <aside className="document-issue" data-testid="document-issue" role="alert">
                <p>{issue.message}</p>
                {issue.kind === 'conflict' ? (
                  <div>
                    <button data-testid="conflict-overwrite" onClick={overwriteExternal} type="button">Overwrite Disk</button>
                    <button data-testid="conflict-reload" onClick={reloadExternal} type="button">Reload from Disk</button>
                    <button data-testid="conflict-save-as" onClick={saveAs} type="button">Save Editor As…</button>
                  </div>
                ) : null}
                {issue.kind === 'cleanup-warning' ? (
                  <button data-testid="retry-cleanup" onClick={retryCleanup} type="button">Retry Cleanup</button>
                ) : null}
                {workspaceRetry ? (
                  <button
                    data-testid="workspace-open-retry"
                    onClick={() => openWorkspaceEntry(workspaceRetry.entry, workspaceRetry.pinned, workspaceRetry.rootId)}
                    type="button"
                  >Retry</button>
                ) : null}
              </aside>
            ) : null}
          </div>
        </section>
      ) : (
        <section aria-label="No open documents" className="empty-document-state">
          <p data-testid="empty-document-message">{workspace ? 'Select a file from the sidebar' : 'No open documents'}</p>
          <button data-testid="empty-new-file" onClick={() => addTab()} type="button">New file</button>
        </section>
      )}

      <p aria-live="polite" className="workspace-announcement" data-testid="workspace-announcement">{announcement}</p>

      {renameCandidate && active?.id === renameCandidate ? (
        <RenameDecision
          onCancel={() => {
            updateTitle(active.id, active.baselineTitle)
            setRenameCandidate(undefined)
          }}
          onSave={saveAndRename}
        />
      ) : null}
      </div>
    </div>
  )
}

function applySourceRebases(editor: Editor, rebases: readonly import('../platform/contracts').SourceRebase[], clearAssets = false): void {
  const byId = new Map(rebases.flatMap((entry) => entry.assetId ? [[entry.assetId, entry] as const] : []))
  const bySource = new Map(rebases.filter((entry) => !entry.assetId).map((entry) => [entry.from, entry]))
  const transaction = editor.state.tr
  editor.state.doc.descendants((node, position) => {
    if (node.type.name !== 'image' || typeof node.attrs.src !== 'string') return
    const rebase = (typeof node.attrs.assetId === 'string' ? byId.get(node.attrs.assetId) : undefined) ?? bySource.get(node.attrs.src)
    if ((!rebase || rebase.from !== node.attrs.src) && !clearAssets) return
    transaction.setNodeMarkup(position, undefined, { ...node.attrs, ...(clearAssets ? { assetUrl: null } : {}), ...(rebase && rebase.from === node.attrs.src ? { internal: false, src: rebase.to } : {}) })
  })
  if (transaction.docChanged) editor.view.dispatch(transaction.setMeta('addToHistory', false))
}

function RenameDecision({ onCancel, onSave }: { readonly onCancel: () => void; readonly onSave: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useOverlaySurface('rename-decision', true, true, onCancel)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => { if (element?.open) element.close() }
  }, [])
  return (
    <dialog aria-labelledby="rename-title" className="decision-backdrop" data-testid="rename-dialog" onCancel={(event) => { event.preventDefault(); onCancel() }} ref={dialog}>
      <div className="decision-card">
        <h2 id="rename-title">Save this document before renaming it?</h2>
        <p>The content must be saved before the file can move.</p>
        <button data-testid="rename-save" onClick={onSave} type="button">Save and rename</button>
        <button data-testid="rename-cancel" onClick={onCancel} type="button">Cancel rename</button>
      </div>
    </dialog>
  )
}

async function unsupportedExternalOpen(): Promise<ExternalOpenResult> {
  return { kind: 'unsupported' }
}

function convertTaskMarkerInput(view: EditorView, cursor: number, text: string): boolean {
  if (text !== ' ') return false
  const match = view.state.doc.resolve(cursor).parent.textContent.match(/^\[([ xX])\]$/)
  if (!match) return false
  const transaction = view.state.tr.delete(cursor - 3, cursor)
  const resolved = transaction.doc.resolve(cursor - 3)
  let listDepth = -1
  for (let depth = resolved.depth; depth > 0; depth -= 1) {
    if (resolved.node(depth).type.name === 'bulletList') {
      listDepth = depth
      break
    }
  }
  const taskList = view.state.schema.nodes.taskList
  const taskItem = view.state.schema.nodes.taskItem
  if (listDepth < 1 || !taskList || !taskItem) return false
  const list = resolved.node(listDepth)
  const activeItem = resolved.index(listDepth)
  const items = Array.from({ length: list.childCount }, (_, index) => {
    const item = list.child(index)
    return taskItem.create({ checked: index === activeItem && match[1]?.toLowerCase() === 'x' }, item.content)
  })
  const position = resolved.before(listDepth)
  transaction.replaceWith(position, position + list.nodeSize, taskList.create(null, items))
  view.dispatch(transaction)
  return true
}

function gatewayDocument(tab: WorkspaceTab, documentDirty = tab.contentDirty): GatewayDocument {
  return {
    ...(tab.diskVersion ? { diskVersion: tab.diskVersion } : {}),
    ...(tab.kind === 'csv'
      ? {
        csv: {
          ...(tab.csv ?? {
            dialect: { bom: false, delimiter: ',', newline: 'lf', terminalSeparator: false },
            originalBytes: new Uint8Array(),
          }),
          edited: documentDirty || tab.csv?.edited === true,
          rows: csvRowsFromEditor(tab.editor),
        },
      }
      : tab.kind === 'json'
        ? {
          json: {
            ...(tab.json ?? createEmptyJsonDocument()),
            edited: documentDirty || tab.json?.edited === true,
            root: jsonRootFromEditor(tab.editor),
          },
        }
        : tab.kind === 'text'
          ? {
            language: tab.language ?? 'Plain text',
            ...(tab.managedExtension ? { managedExtension: tab.managedExtension } : {}),
            text: {
              ...(tab.text ?? { encoding: { bom: false, newline: 'lf' }, originalBytes: new Uint8Array() }),
              edited: documentDirty || tab.text?.edited === true,
              text: textFromEditor(tab.editor),
            },
          }
          : tab.kind === 'markdown'
            ? { document: tab.editor.getJSON() as RichDocument }
            : {}),
    ...(tab.fileKey ? { fileKey: tab.fileKey } : {}),
    id: tab.id,
    kind: tab.kind,
    ...(tab.path ? { path: tab.path } : {}),
    ...(tab.preservation?.bytes ? { preservation: { ...tab.preservation, bytes: tab.preservation.bytes } } : {}),
    ...(tab.secondaryPath ? { secondaryPath: tab.secondaryPath } : {}),
    revision: tab.revision,
    title: tab.title,
  }
}

function gatewaySeed(document: GatewayDocument): DocumentSeed {
  const common = {
    ...(document.diskVersion ? { diskVersion: document.diskVersion } : {}),
    ...(document.fileKey ? { fileKey: document.fileKey } : {}),
    id: document.id,
    ...(document.path ? { path: document.path } : {}),
    ...(document.preservation ? { preservation: document.preservation } : {}),
    ...(document.secondaryPath ? { secondaryPath: document.secondaryPath } : {}),
    title: document.title,
  }
  const kind = document.kind ?? (document.csv ? 'csv' : document.json ? 'json' : document.text ? 'text' : 'markdown')
  if (kind === 'csv') return { ...common, ...(document.csv ? { csv: document.csv } : {}), kind }
  if (kind === 'json') return { ...common, ...(document.json ? { json: document.json } : {}), kind }
  if (kind === 'text') return {
    ...common,
    kind,
    language: document.language ?? 'Plain text',
    ...(document.managedExtension ? { managedExtension: document.managedExtension } : {}),
    ...(document.text ? { text: document.text } : {}),
  }
  if (kind === 'raster') return {
    ...common,
    kind,
    raster: document.raster ?? { animated: false, format: 'PNG', height: 0, url: '', width: 0 },
  }
  if (kind === 'external') return { ...common, kind, limitation: document.limitation ?? 'Markzen cannot edit or preview this file type.' }
  return { ...common, ...(document.document ? { document: document.document as JSONContent } : {}), kind: 'markdown' }
}

const displaySeedTitle = (name: string): string => name.replace(/\.(md|markdown|txt|csv|json)$/i, '')
const logicalRelativePath = (root: Path, child: Path): string => {
  const prefix = `${String(root).replace(/[\\/]$/, '')}/`
  return String(child).replaceAll('\\', '/').slice(prefix.replaceAll('\\', '/').length)
}

function workspaceSecondaryPath(path: Path, roots: readonly WorkspaceRootSeed[]): string | undefined {
  const normalizedPath = String(path).replaceAll('\\', '/')
  const containing = roots
    .map((root, index) => ({ index, root, value: String(root.path).replaceAll('\\', '/').replace(/\/$/, '') }))
    .filter(({ value }) => normalizedPath === value || normalizedPath.startsWith(`${value}/`))
    .toSorted((first, second) => second.value.length - first.value.length || first.index - second.index)[0]
  if (!containing) return undefined
  const relative = normalizedPath.slice(containing.value.length + 1)
  const separator = relative.lastIndexOf('/')
  return separator > 0 ? relative.slice(0, separator) : undefined
}

function adoptGatewayResult(tab: WorkspaceTab, document: GatewayDocument, snapshot: ProseMirrorNode): WorkspaceTab {
  if (!isWritableTab(tab)) return tab
  return {
    ...acceptTabBaseline(tab, document.title),
    contentDirty: !persistentDocumentsEqual(tab.editor.state.doc, snapshot),
    ...(document.csv ? { csv: document.csv } : {}),
    ...(document.json ? { json: document.json } : {}),
    ...(document.diskVersion ? { diskVersion: document.diskVersion } : {}),
    ...(document.fileKey ? { fileKey: document.fileKey } : {}),
    ...(document.path ? { path: document.path } : {}),
    ...(document.secondaryPath ? { secondaryPath: document.secondaryPath } : {}),
    title: document.title,
  }
}

function focusEditorAtClosestLine(editor: Editor, clientY: number): void {
  const editorBounds = editor.view.dom.getBoundingClientRect()
  const top = editorBounds.top + 1
  const bottom = Math.max(top, editorBounds.bottom - 1)
  const position = editor.view.posAtCoords({
    left: editorBounds.left + 1,
    top: Math.min(Math.max(clientY, top), bottom),
  })?.pos
  const fallback = clientY < editorBounds.top ? 1 : editor.state.doc.content.size
  editor.chain().focus().setTextSelection(position ?? fallback).run()
}

function persistentDocumentsEqual(left: ProseMirrorNode, right: ProseMirrorNode): boolean {
  if (left.type !== right.type || left.text !== right.text || left.childCount !== right.childCount || left.marks.length !== right.marks.length) return false
  const leftAttrs = { ...left.attrs }
  const rightAttrs = { ...right.attrs }
  delete leftAttrs.assetUrl
  delete leftAttrs.assetId
  delete leftAttrs.loadState
  delete leftAttrs.origin
  delete leftAttrs.sourceKind
  delete leftAttrs.id
  delete rightAttrs.assetUrl
  delete rightAttrs.assetId
  delete rightAttrs.loadState
  delete rightAttrs.origin
  delete rightAttrs.sourceKind
  delete rightAttrs.id
  if (JSON.stringify(leftAttrs) !== JSON.stringify(rightAttrs)) return false
  for (let index = 0; index < left.marks.length; index += 1) if (!left.marks[index]?.eq(right.marks[index]!)) return false
  for (let index = 0; index < left.childCount; index += 1) if (!persistentDocumentsEqual(left.child(index), right.child(index))) return false
  return true
}

function commitStructuredDraft(tab: WorkspaceTab): boolean {
  return tab.kind !== 'json' || commitJsonDraft(tab.editor)
}

function isWritableTab(tab: WorkspaceTab): tab is WritableWorkspaceTab {
  return tab.kind !== 'raster' && tab.kind !== 'external'
}

function disposeTabEditor(
  tab: WorkspaceTab,
  editors: Set<Editor>,
  baselines: Map<string, ProseMirrorNode>,
): void {
  if (isWritableTab(tab)) {
    tab.editor.destroy()
    editors.delete(tab.editor)
  }
  baselines.delete(tab.id)
}

function focusJsonTree(): void {
  document.querySelector<HTMLElement>('[data-testid="json-tree"] [role="treeitem"][tabindex="0"]')?.focus()
}

function focusTabEditor(tab: WorkspaceTab, position?: 'start'): void {
  if (tab.kind === 'json') focusJsonTree()
  else if (isWritableTab(tab)) tab.editor.commands.focus(position)
}

function withImageIds(document: JSONContent): JSONContent {
  const visit = (node: JSONContent): JSONContent => ({
    ...node,
    ...(node.type === 'image' ? { attrs: { ...node.attrs, assetId: typeof node.attrs?.assetId === 'string' ? node.attrs.assetId : crypto.randomUUID() } } : {}),
    ...(node.content ? { content: node.content.map(visit) } : {}),
  })
  return visit(document)
}
