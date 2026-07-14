import { Editor, type JSONContent } from '@tiptap/core'
import type { Node as ProseMirrorNode } from '@tiptap/pm/model'
import type { EditorView } from '@tiptap/pm/view'
import { EditorContent } from '@tiptap/react'
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent, type WheelEvent } from 'react'
import type { SelectionBookmark } from '@tiptap/pm/state'

import { validateDocumentName } from '../documents/filename'
import type { DocumentGatewayPort, ExternalGatewayEvent, GatewayDocument, SaveOutcome } from '../documents/gateway'
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

import './document.css'

export type DocumentSeed = {
  readonly document?: JSONContent
  readonly diskVersion?: DiskVersion
  readonly fileKey?: FileKey
  readonly id: string
  readonly path?: Path
  readonly preservation?: { readonly bytes?: Uint8Array; readonly display: string; readonly kind: 'bytes' | 'text' }
  readonly preview?: boolean
  readonly secondaryPath?: string
  readonly title: string
}

export type DocumentWorkspaceFolder = {
  readonly forcedColors: boolean
  readonly invalidation?: { readonly generation: number; readonly path: Path; readonly rootId: RootId }
  readonly onList: (rootId: RootId, path: Path) => Promise<readonly DirectoryEntry[]>
  readonly onWidthChange: (width: number) => void
  readonly reducedMotion: boolean
  readonly roots: readonly WorkspaceRootSeed[]
  readonly width: number
}

type WorkspaceTab = {
  readonly baselineTitle: string
  readonly contentDirty: boolean
  readonly editor: Editor
  readonly diskVersion?: DiskVersion
  readonly fileKey?: FileKey
  readonly id: string
  readonly path?: Path
  readonly preservation?: { readonly bytes?: Uint8Array; readonly display: string; readonly kind: 'bytes' | 'text' }
  readonly preview: boolean
  readonly revision: number
  readonly secondaryPath?: string
  readonly title: string
}

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
}: {
  readonly closeRequest?: number
  readonly gateway: DocumentGatewayPort
  readonly initialTabs?: readonly DocumentSeed[]
  readonly onCloseWindow?: () => void
  readonly onOpenExternal?: (destination: string) => Promise<ExternalOpenResult>
  readonly onSettingsRequest?: () => void
  readonly toolbarMode?: ToolbarMode
  readonly workspace?: DocumentWorkspaceFolder
}) {
  const editors = useRef(new Set<Editor>())
  const baselineDocuments = useRef(new Map<string, ProseMirrorNode>())
  const [renameCandidate, setRenameCandidate] = useState<string>()
  const [issue, setIssue] = useState<{ readonly kind: SaveOutcome['kind']; readonly message: string }>()
  const [pendingExternal, setPendingExternal] = useState<GatewayDocument>()
  const [announcement, setAnnouncement] = useState('')
  const [workspaceRetry, setWorkspaceRetry] = useState<{ readonly entry: DirectoryEntry; readonly pinned: boolean; readonly rootId: RootId }>()
  const generations = useRef(new Map<string, number>())
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
        id: seed.id,
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
    (tab: WorkspaceTab) => isTabDirty(tab),
    [],
  )

  const pinTab = useCallback((id: string) => {
    setTabs((current) => current.map((tab) => tab.id === id ? { ...tab, preview: false } : tab))
  }, [])

  const openSearch = useCallback(() => {
    if (!active || active.preservation) return
    if (!searchOpen) searchBookmark.current = active.editor.state.selection.getBookmark()
    setSearchOpen(true)
    setSearchRequest((value) => value + 1)
  }, [active, searchOpen])

  const closeSearch = useCallback(() => {
    setSearchOpen(false)
    if (!active || !searchBookmark.current) return
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
        closing.editor.destroy()
        generations.current.set(id, (generations.current.get(id) ?? 0) + 1)
        editors.current.delete(closing.editor)
        baselineDocuments.current.delete(id)
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
      if (!dirty(tab)) {
        closeTab(id)
        return
      }
      void gateway.confirmClose(id, tab.title || 'Untitled').then((choice) => {
        if (choice === 'discard') closeTab(id)
        if (choice !== 'save') return
        const generation = (generations.current.get(tab.id) ?? 0) + 1
        const snapshot = tab.editor.state.doc
        generations.current.set(tab.id, generation)
        void gateway.save({
          ...gatewayDocument(tab),
          documentDirty: tab.contentDirty,
          titleDirty: tab.title !== tab.baselineTitle,
        }).then((result) => {
          if (result.kind === 'saved' || result.kind === 'cleanup-warning') {
            if (generations.current.get(tab.id) !== generation) return
            baselineDocuments.current.set(tab.id, snapshot)
            setTabs((current) => current.map((candidate) => (
              candidate.id === tab.id ? adoptGatewayResult(candidate, result.document, snapshot) : candidate
            )))
            const latest = tabsRef.current.find((candidate) => candidate.id === id)
            if (latest?.editor.state.doc.eq(snapshot) && latest.title === result.document.title) closeTab(id)
            else setIssue({ kind: 'error', message: 'Newer changes remain open and still need a close decision.' })
          } else if (result.kind === 'unchanged' && !dirty(tab)) closeTab(id)
          else setIssue({ kind: result.kind, message: 'The document remains open because saving did not complete.' })
        })
      })
    },
    [closeTab, dirty, gateway, tabs],
  )

  const addTab = useCallback(() => {
    const append = (id: string) => {
      const tab = makeTab({ id, title: '' })
      setTabs((current) => [...insertPinnedBeforePreview(current, tab)])
      setActiveId(tab.id)
      setRovingId(tab.id)
    }
    void gateway.createTabId().then(append)
  }, [gateway, makeTab])

  const activateFromEditor = useCallback(
    (offset: number) => {
      if (tabs.length < 2 || activeIndex < 0) return
      const next = tabs[(activeIndex + offset + tabs.length) % tabs.length]
      if (!next) return
      setActiveId(next.id)
      setRovingId(next.id)
      requestAnimationFrame(() => next.editor.commands.focus())
    },
    [activeIndex, tabs],
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
      if (event.key === 'ArrowUp' && active?.editor.state.selection.from === 1) {
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

  const commitGatewaySave = useCallback((tab: WorkspaceTab, result: SaveOutcome, generation: number, snapshot: ProseMirrorNode) => {
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
    if (!active || !titleValidation.valid) return
    pinTab(active.id)
    const generation = (generations.current.get(active.id) ?? 0) + 1
    const snapshot = active.editor.state.doc
    generations.current.set(active.id, generation)
    void gateway.save({
      ...gatewayDocument(active),
      documentDirty: active.contentDirty,
      titleDirty: active.title !== active.baselineTitle,
    }).then((result) => commitGatewaySave(active, result, generation, snapshot))
  }, [active, commitGatewaySave, gateway, pinTab, titleValidation.valid])

  const saveAs = useCallback(() => {
    if (!active || !titleValidation.valid) return
    pinTab(active.id)
    const generation = (generations.current.get(active.id) ?? 0) + 1
    const snapshot = active.editor.state.doc
    generations.current.set(active.id, generation)
    void gateway.saveAs(gatewayDocument(active)).then((result) => commitGatewaySave(active, result, generation, snapshot))
  }, [active, commitGatewaySave, gateway, pinTab, titleValidation.valid])

  const openDocument = useCallback(() => {
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
        tabs[0].editor.destroy()
        editors.current.delete(tabs[0].editor)
        baselineDocuments.current.delete(tabs[0].id)
        setTabs([opened])
      } else setTabs((current) => [...insertPinnedBeforePreview(current, opened)])
      setActiveId(opened.id)
      setRovingId(opened.id)
    })()
  }, [active, dirty, gateway, makeTab, tabs])

  const openWorkspaceEntry = useCallback((entry: DirectoryEntry, pinned: boolean, rootId: RootId) => {
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
      setActiveId(id)
      setRovingId(id)

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
        placeholder.editor.destroy()
        editors.current.delete(placeholder.editor)
        baselineDocuments.current.delete(placeholder.id)
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
          reusable.editor.destroy()
          editors.current.delete(reusable.editor)
        }
        baselineDocuments.current.delete(id)
        const failed = makeTab({ id, preview: !pinned, title: displaySeedTitle(entry.name) })
        placeholder.editor.destroy()
        editors.current.delete(placeholder.editor)
        setTabs((current) => current.map((tab) => tab.id === id ? failed : tab))
        setWorkspaceRetry({ entry, pinned, rootId })
        setIssue({ kind: 'error', message: 'This file could not be opened. Its identity or workspace access may have changed.' })
        return
      }
      if (reusable) {
        reusable.editor.destroy()
        editors.current.delete(reusable.editor)
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
        tab.editor.destroy()
        editors.current.delete(tab.editor)
        baselineDocuments.current.delete(tab.id)
        return replacement
      }))
    })()
  }, [activeId, closeTab, dirty, gateway, makeTab, pinTab, workspace])

  const saveTabsSequentially = useCallback(async (dirtyTabs: readonly WorkspaceTab[]): Promise<boolean> => {
    for (const tab of dirtyTabs) {
      const snapshot = tab.editor.state.doc
      const result = await gateway.save({
        ...gatewayDocument(tab),
        documentDirty: tab.contentDirty,
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
  }, [gateway])

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
    if (command === 'new') addTab()
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
    tab.editor.destroy()
    editors.current.delete(tab.editor)
    baselineDocuments.current.delete(tab.id)
    setTabs((current) => current.map((candidate) => candidate.id === tab.id ? replacement : candidate))
    void gateway.acceptExternal(event.document)
    setAnnouncement('Document reloaded from disk.')
  }), [activeId, dirty, gateway, makeTab, tabs])

  const reloadExternal = useCallback(() => {
    if (!active || !pendingExternal || active.id !== pendingExternal.id) return
    const replacement = makeTab(gatewaySeed(pendingExternal))
    active.editor.destroy()
    editors.current.delete(active.editor)
    baselineDocuments.current.delete(active.id)
    setTabs((current) => current.map((candidate) => candidate.id === active.id ? replacement : candidate))
    void gateway.acceptExternal(pendingExternal)
    setPendingExternal(undefined)
    setIssue(undefined)
    setAnnouncement('Document reloaded from disk.')
    requestAnimationFrame(() => replacement.editor.commands.focus())
  }, [active, gateway, makeTab, pendingExternal])

  const overwriteExternal = useCallback(() => {
    if (!active || !pendingExternal?.diskVersion) return
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
    if (!active) return
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
      <div className="document-command-row">
        <button data-testid="open-document" onClick={openDocument} type="button">Open</button>
        <button data-testid="save-document" disabled={!active || !titleValidation.valid || Boolean(active.preservation)} onClick={save} type="button">
          Save
        </button>
        <button data-testid="save-as-document" disabled={!active || !titleValidation.valid} onClick={saveAs} type="button">Save As</button>
        {active?.preview ? <button data-testid="preview-keep-open" onClick={() => pinTab(active.id)} type="button">Keep Open</button> : null}
      </div>
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
                  aria-label={`${label}${tab.preview ? ', Preview' : ''}${isDirty ? ', dirty' : ''}`}
                  aria-selected={selected}
                  className={`document-tab${tab.preview ? ' document-tab-preview' : ''}`}
                  data-document-tab={tab.id}
                  data-testid="document-tab"
                  key={tab.id}
                  onClick={() => {
                    setActiveId(tab.id)
                    setRovingId(tab.id)
                  }}
                  onDoubleClick={() => pinTab(tab.id)}
                  onKeyDown={(event) => {
                    if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) {
                      event.preventDefault()
                      navigateTabFocus(tab.id, event.key)
                    } else if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault()
                      setActiveId(tab.id)
                      setRovingId(tab.id)
                    } else if (event.key === 'Tab' && !event.shiftKey && selected) {
                      event.preventDefault()
                      tab.editor.commands.focus()
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
        <button aria-label="New file" className="tab-add" data-testid="tab-add" onClick={addTab} type="button">
          <span aria-hidden="true">+</span>
        </button>
        <div aria-hidden="true" className="tab-drag-space" />
      </div>

      {active && !active.preservation ? (
        <WritingToolbar
          editor={active.editor}
          key={`toolbar-${active.id}`}
          mode={toolbarMode}
          onOpenLink={(selection) => linkActions.current?.openEditor(selection)}
          onOpenImage={(selection) => imageActions.current?.openInsertion(selection)}
        />
      ) : null}

      {active && searchOpen && !active.preservation ? (
        <SearchPanel editor={active.editor} onClose={closeSearch} request={searchRequest} />
      ) : null}

      {active ? (
        <section aria-label={active.title || 'Untitled document'} className="document-surface" id="active-document-panel" role="tabpanel">
          <div
            className="document-page"
            data-testid="document-page"
            onMouseDown={(event) => {
              if (event.target !== event.currentTarget || active.preservation) return
              event.preventDefault()
              const position = active.editor.view.posAtCoords({ left: event.clientX, top: event.clientY })?.pos
              active.editor.chain().focus().setTextSelection(position ?? active.editor.state.doc.content.size).run()
            }}
          >
            <div
              className="document-title-gutter"
              onMouseDown={(event) => {
                if (event.target === event.currentTarget) {
                  event.preventDefault()
                  document.querySelector<HTMLInputElement>('[data-testid="document-title"]')?.focus()
                }
              }}
            >
              {!active.title ? <span aria-hidden="true" className="untitled-fallback">Untitled</span> : null}
              <input
                aria-describedby={titleError ? 'document-title-error' : undefined}
                aria-invalid={titleError ? true : undefined}
                aria-label="Document title"
                className="document-title"
                data-testid="document-title"
                onChange={(event) => updateTitle(active.id, event.currentTarget.value.replace(/[\r\n]+/g, ''))}
                onKeyDown={(event) => {
                  if (event.key === 'Escape') {
                    event.preventDefault()
                    updateTitle(active.id, active.baselineTitle)
                  } else if (event.key === 'Enter' || event.key === 'ArrowDown') {
                    event.preventDefault()
                    active.editor.commands.focus('start')
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
                value={active.title}
              />
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
            </div>
            {active.preservation ? (
              <div className="preservation-panel">
                <p data-testid="preservation-explanation">Rich editing is disabled to prevent data loss.</p>
                <pre data-testid="preservation-view" tabIndex={0}>{active.preservation.display}</pre>
              </div>
            ) : (
              <EditorContent data-testid="rich-editor" editor={active.editor} />
            )}
            {!active.preservation ? <TableActions editor={active.editor} key={`tables-${active.id}`} /> : null}
            {!active.preservation ? (
              <ImageActions
                editor={active.editor}
                gateway={gateway}
                key={`images-${active.id}`}
                onIssue={(message) => setIssue({ kind: 'error', message })}
                ref={imageActions}
                tabId={active.id}
              />
            ) : null}
            {!active.preservation ? (
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
          <button data-testid="empty-new-file" onClick={addTab} type="button">New file</button>
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

function gatewayDocument(tab: WorkspaceTab): GatewayDocument {
  return {
    ...(tab.diskVersion ? { diskVersion: tab.diskVersion } : {}),
    document: tab.editor.getJSON() as RichDocument,
    ...(tab.fileKey ? { fileKey: tab.fileKey } : {}),
    id: tab.id,
    ...(tab.path ? { path: tab.path } : {}),
    ...(tab.preservation?.bytes ? { preservation: { ...tab.preservation, bytes: tab.preservation.bytes } } : {}),
    ...(tab.secondaryPath ? { secondaryPath: tab.secondaryPath } : {}),
    revision: tab.revision,
    title: tab.title,
  }
}

function gatewaySeed(document: GatewayDocument): DocumentSeed {
  return {
    ...(document.diskVersion ? { diskVersion: document.diskVersion } : {}),
    ...(document.document ? { document: document.document as JSONContent } : {}),
    ...(document.fileKey ? { fileKey: document.fileKey } : {}),
    id: document.id,
    ...(document.path ? { path: document.path } : {}),
    ...(document.preservation ? { preservation: document.preservation } : {}),
    ...(document.secondaryPath ? { secondaryPath: document.secondaryPath } : {}),
    title: document.title,
  }
}

const displaySeedTitle = (name: string): string => name.replace(/\.(md|markdown|txt)$/i, '')
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
  return {
    ...acceptTabBaseline(tab, document.title),
    contentDirty: !persistentDocumentsEqual(tab.editor.state.doc, snapshot),
    ...(document.diskVersion ? { diskVersion: document.diskVersion } : {}),
    ...(document.fileKey ? { fileKey: document.fileKey } : {}),
    ...(document.path ? { path: document.path } : {}),
    ...(document.secondaryPath ? { secondaryPath: document.secondaryPath } : {}),
    title: document.title,
  }
}

function persistentDocumentsEqual(left: ProseMirrorNode, right: ProseMirrorNode): boolean {
  if (left.type !== right.type || left.text !== right.text || left.childCount !== right.childCount || left.marks.length !== right.marks.length) return false
  const leftAttrs = { ...left.attrs }
  const rightAttrs = { ...right.attrs }
  delete leftAttrs.assetUrl
  delete leftAttrs.assetId
  delete leftAttrs.loadState
  delete rightAttrs.assetUrl
  delete rightAttrs.assetId
  delete rightAttrs.loadState
  if (JSON.stringify(leftAttrs) !== JSON.stringify(rightAttrs)) return false
  for (let index = 0; index < left.marks.length; index += 1) if (!left.marks[index]?.eq(right.marks[index]!)) return false
  for (let index = 0; index < left.childCount; index += 1) if (!persistentDocumentsEqual(left.child(index), right.child(index))) return false
  return true
}

function withImageIds(document: JSONContent): JSONContent {
  const visit = (node: JSONContent): JSONContent => ({
    ...node,
    ...(node.type === 'image' ? { attrs: { ...node.attrs, assetId: typeof node.attrs?.assetId === 'string' ? node.attrs.assetId : crypto.randomUUID() } } : {}),
    ...(node.content ? { content: node.content.map(visit) } : {}),
  })
  return visit(document)
}
