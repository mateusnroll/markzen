import { createHash, randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'
import nodePath from 'node:path'
import { watch, type FSWatcher } from 'chokidar'

import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  Menu,
  session,
  type BrowserWindowConstructorOptions,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron'

import {
  asPath,
  asRootId,
  asTabId,
  fail,
  asWindowId,
  ok,
  type BootstrapPayload,
  type ApplicationCommand,
  type DirectoryEntry,
  type PlatformName,
  type DocumentFilePayload,
  type DocumentCommand,
  type DocumentIntentOutcome,
  type DocumentMenuState,
  type DocumentExternalEvent,
  type DocumentWriteRequest,
  type DiskVersion,
  type FileKey,
  type Path,
  type PlatformResult,
  type RootId,
  type TabId,
  type WindowId,
  type WindowState,
  type WindowKind,
  type WorkspaceRootOutcome,
} from '../contracts'
import { OwnerRegistry } from '../ownership'
import { DocumentRegistry, type DocumentOwner } from '../../documents/registry'
import { DocumentWatchState, type WatchToken } from '../../documents/watch-state'
import { SaveCoordinator } from '../../documents/save-coordinator'
import { deriveDocumentFilename, getRecognizedExtension } from '../../documents/filename'
import { resolveWindowSender, validateWindowRequest } from './authority'
import {
  authorizeDocumentRequest,
  validateDocumentRequest,
  type DocumentIdentityRequest,
  type ExternalVersionRequest,
  type ExternalWriteRequest,
  type CloseDecisionRequest,
} from './document-authority'
import { channels } from './channels'
import { APP_ORIGIN, registerApplicationProtocol } from './protocol'
import { RealFileSystem } from './real-fs'
import { buildApplicationMenuTemplate, installApplicationMenu } from './menu'
import { SettingsFileStore } from './settings-store'
import { DEFAULT_SETTINGS, parseSettings, SettingsService, type SettingsLoadResult } from '../../settings/settings'
import { RootRegistry, WorkspaceWatchBatcher, selectContainingRoot } from '../../workspaces/state'
import { validateWorkspaceEntryRequest } from '../../workspaces/authority'

type WindowRecord = {
  closeApproved: boolean
  readonly id: WindowId
  readonly kind: WindowKind
  readonly window: BrowserWindow
}

type MainDocumentRecord = {
  cleanup?: { readonly fileKey: FileKey; readonly path: Path }
  dirty?: boolean
  diskVersion?: DiskVersion
  displayPath?: Path
  fileKey?: FileKey
  readonly generation: number
  path?: Path
  secondaryPath?: string
  title?: string
  readonly tabId: TabId
  readonly windowId: WindowId
}

type MainSaveResult = { readonly ok: true; readonly value: DocumentIntentOutcome }
type MainSaveTask = {
  readonly kind: 'save' | 'save-and-rename' | 'save-as'
  readonly record: MainDocumentRecord
  readonly request: DocumentWriteRequest
  readonly window: WindowRecord
}

const userDataOverride = app.commandLine.getSwitchValue('user-data-dir')
if (userDataOverride) app.setPath('userData', nodePath.resolve(userDataOverride))

const windowsByContents = new Map<number, WindowRecord>()
const owners = new OwnerRegistry<WindowId>()
const documents = new Map<TabId, MainDocumentRecord>()
const documentRegistry = new DocumentRegistry((owner) => focusDocumentOwner(owner))
const documentSaveCoordinators = new Map<TabId, SaveCoordinator<MainSaveTask, MainSaveResult, string>>()
const documentWatchers = new Map<TabId, FSWatcher>()
const documentWatchState = new DocumentWatchState()
const documentWatchTokens = new Map<TabId, WatchToken>()
const menuStates = new Map<WindowId, DocumentMenuState>()
const quitSaveResolvers = new Map<WindowId, (success: boolean) => void>()
const workspaceRoots = new RootRegistry()
const workspaceSnapshots = new Map<string, readonly DirectoryEntry[]>()
const workspaceGenerations = new Map<string, number>()
const pendingFolderWindows = new Set<string>()
let settingsService: SettingsService | undefined
let settingsWarning: string | undefined
let handlersRegistered = false
let allowQuit = false
let quitGuardRunning = false

export function getWindowOptionsForPlatform(platformValue: string = process.platform): BrowserWindowConstructorOptions {
  const platformName = normalizePlatform(platformValue)
  const isMac = platformName === 'darwin'
  return {
    autoHideMenuBar: true,
    backgroundColor: '#f7f5f2',
    frame: isMac,
    height: 800,
    minHeight: 320,
    minWidth: 480,
    show: false,
    title: 'Markzen',
    ...(isMac ? { titleBarStyle: 'hiddenInset' as const, trafficLightPosition: { x: 16, y: 14 } } : {}),
    webPreferences: {
      allowRunningInsecureContent: false,
      contextIsolation: true,
      experimentalFeatures: false,
      navigateOnDragDrop: false,
      nodeIntegration: false,
      preload: nodePath.join(app.getAppPath(), 'dist-electron', 'preload.cjs'),
      sandbox: true,
      webSecurity: true,
      webviewTag: false,
    },
    width: 1200,
  }
}

export async function createMarkzenWindow(kind: WindowKind = 'single-file', initialFolder?: Path): Promise<WindowId> {
  if (!app.isReady()) await app.whenReady()
  const window = new BrowserWindow(getWindowOptionsForPlatform())
  const id = asWindowId(randomUUID())
  const record: WindowRecord = { closeApproved: false, id, kind, window }
  windowsByContents.set(window.webContents.id, record)
  owners.open(id)
  secureWebContents(window.webContents)
  bindWindowEvents(record)
  if (initialFolder) {
    const accepted = await acceptWorkspaceRoot(record, initialFolder)
    if (accepted.kind !== 'added' && accepted.kind !== 'duplicate') {
      record.closeApproved = true
      window.destroy()
      throw new Error('Workspace root could not be opened')
    }
  }
  const ready = new Promise<void>((resolve) => window.once('ready-to-show', () => resolve()))
  await window.loadURL(`${APP_ORIGIN}/`)
  await ready
  if (!window.isDestroyed()) window.show()
  return id
}

export function emitWindowStateForShellTest(windowId: string, state: WindowState): void {
  const record = [...windowsByContents.values()].find((candidate) => candidate.id === windowId)
  if (!record || record.window.isDestroyed()) throw new Error(`Unknown window: ${windowId}`)
  record.window.webContents.send(channels.windowState, state)
}

export async function runRealFsRoundTrip(directory: string, payload: string): Promise<{ cleaned: boolean; payload: string }> {
  const fs = new RealFileSystem()
  const path = asPath(nodePath.join(directory, 'roundtrip.bin'))
  const written = await fs.create(path, new TextEncoder().encode(payload))
  if (!written.ok) throw new Error(`write failed: ${written.error.code}`)
  const read = await fs.read(path)
  if (!read.ok) throw new Error(`read failed: ${read.error.code}`)
  const decoded = new TextDecoder().decode(read.value.bytes)
  const removed = await fs.remove(path)
  if (!removed.ok) throw new Error(`cleanup failed: ${removed.error.code}`)
  let cleaned = false
  try {
    await access(path)
  } catch {
    cleaned = true
  }
  return { cleaned, payload: decoded }
}

async function openFolderForShellTest(): Promise<void> {
  const focused = BrowserWindow.getFocusedWindow()
  await openFolderWorkspace(focused ? windowsByContents.get(focused.webContents.id) : undefined)
}

async function start(): Promise<void> {
  await app.whenReady()
  await registerApplicationProtocol()
  await initializeSettings()
  registerSecurityPolicy()
  registerIpcHandlers()
  installApplicationMenu(normalizePlatform(process.platform), dispatchApplicationCommand)
  if (BrowserWindow.getAllWindows().length === 0) await createMarkzenWindow()
}

function dispatchApplicationCommand(command: ApplicationCommand): void {
  const focused = BrowserWindow.getFocusedWindow()
  const record = focused ? windowsByContents.get(focused.webContents.id) : undefined
  if (command === 'open-folder') {
    void openFolderWorkspace(record)
    return
  }
  if (command === 'add-folder') {
    if (record?.kind === 'workspace') void addFolderToWorkspace(record)
    return
  }
  if (record && !record.window.isDestroyed()) {
    record.window.webContents.send(channels.documentCommand, command)
    return
  }
  if (command === 'new' || command === 'open') {
    void createMarkzenWindow().then((id) => {
      const created = [...windowsByContents.values()].find((candidate) => candidate.id === id)
      created?.window.webContents.send(channels.documentCommand, command)
    })
  }
}

function updateMenuEnablement(): void {
  const menu = Menu.getApplicationMenu()
  if (!menu) return
  const focused = BrowserWindow.getFocusedWindow()
  const record = focused ? windowsByContents.get(focused.webContents.id) : undefined
  const state = record ? menuStates.get(record.id) : undefined
  const active = state?.tabs.find((tab) => tab.tabId === state.activeTabId)
  const enabled: Readonly<Record<string, boolean>> = {
    'add-folder': record?.kind === 'workspace',
    'close-tab': Boolean(state?.tabs.length),
    'close-window': Boolean(record),
    save: Boolean(active?.dirty),
    'save-all': Boolean(state?.tabs.some((tab) => tab.dirty)),
    'save-as': Boolean(active?.titleValid),
  }
  for (const [id, value] of Object.entries(enabled)) {
    const item = menu.getMenuItemById(`markzen-${id}`)
    if (item) item.enabled = value
  }
}

function getApplicationMenuSnapshot(platform: PlatformName): unknown {
  const strip = (items: ReturnType<typeof buildApplicationMenuTemplate>): unknown => items.map((item) => ({
    ...(item.accelerator ? { accelerator: item.accelerator } : {}),
    ...(item.label ? { label: item.label } : {}),
    ...(item.role ? { role: item.role } : {}),
    ...(Array.isArray(item.submenu) ? { submenu: strip(item.submenu) } : {}),
    ...(item.type ? { type: item.type } : {}),
  }))
  return strip(buildApplicationMenuTemplate(platform))
}

const getDocumentWatcherCount = (): number => documentWatchers.size
const getWorkspaceWatcherCount = (): number => workspaceRoots.activeWatchCount()
const getDirtyDocumentCount = (): number => [...documents.values()].filter((document) => document.dirty).length

function registerSecurityPolicy(): void {
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
}

function registerIpcHandlers(): void {
  if (handlersRegistered) return
  handlersRegistered = true
  ipcMain.handle(channels.bootstrap, (event, payload) => withWindow(event, payload, (record) => ok<BootstrapPayload>({
    kind: record.kind,
    platformName: normalizePlatform(process.platform),
    roots: workspaceRoots.values(record.id).map((root) => ({
      entries: workspaceSnapshots.get(rootKey(record.id, root.rootId)) ?? [],
      path: root.path,
      rootId: root.rootId,
    })),
    settings: settingsService?.snapshot() ?? DEFAULT_SETTINGS,
    ...(settingsWarning ? { settingsWarning } : {}),
    state: windowState(record.window),
    windowId: record.id,
  })))
  ipcMain.handle(channels.documentCreateTab, (event, payload) => withWindow(event, payload, (record) => {
    const tabId = asTabId(randomUUID())
    documents.set(tabId, { generation: 0, tabId, windowId: record.id })
    return ok(tabId)
  }))
  ipcMain.handle(channels.settingsPatch, (event, payload) => withAuthorizedWindow(event, () => {
    const service = settingsService
    return service ? service.patch(payload) : fail('unavailable')
  }))
  ipcMain.handle(channels.settingsRetry, (event, payload) => withWindow(event, payload, () => {
    settingsService?.retry()
    return ok(undefined)
  }))
  ipcMain.handle(channels.workspaceAddFolder, (event, payload) => withWindow(event, payload, async (record) => {
    if (record.kind !== 'workspace') return fail('ownership')
    return ok(await addFolderToWorkspace(record))
  }))
  ipcMain.handle(channels.workspaceList, (event, payload) => withAuthorizedWindow(event, async (record) => {
    if (record.kind !== 'workspace') return fail('ownership')
    const parsed = validateWorkspaceEntryRequest(payload)
    if (!parsed.ok) return parsed
    const root = workspaceRoots.authorize(record.id, parsed.value.rootId)
    if (!root.ok) return root
    if (!acceptWorkspaceGeneration(record.id, parsed.value.rootId, `list:${parsed.value.relativePath}`, parsed.value.generation)) return fail('stale')
    const resolved = await resolveWorkspacePath(root.value.path, root.value.fileKey, parsed.value.relativePath, 'directory')
    if (!resolved.ok) return resolved
    const listed = await new RealFileSystem().list(resolved.value.logical)
    if (!listed.ok) return listed
    if (!isWorkspaceGenerationCurrent(record.id, parsed.value.rootId, `list:${parsed.value.relativePath}`, parsed.value.generation)) return fail('stale')
    if (record.window.isDestroyed() || !workspaceRoots.get(record.id, parsed.value.rootId)) return fail('ownership')
    workspaceSnapshots.set(rootKey(record.id, root.value.rootId), listed.value)
    return ok(listed.value)
  }))
  ipcMain.handle(channels.workspaceOpen, (event, payload) => withAuthorizedWindow(event, async (window) => {
    if (window.kind !== 'workspace') return fail('ownership')
    const request = validateWorkspaceOpenRequest(payload)
    if (!request.ok) return request
    const root = workspaceRoots.authorize(window.id, request.value.rootId)
    const document = documents.get(request.value.tabId)
    if (!root.ok || !document || document.windowId !== window.id) return fail('ownership')
    if (!acceptWorkspaceGeneration(window.id, request.value.rootId, `open:${request.value.tabId}`, request.value.generation)) return fail('stale')
    const resolved = await resolveWorkspacePath(root.value.path, root.value.fileKey, request.value.relativePath, 'file')
    if (!isWorkspaceGenerationCurrent(window.id, request.value.rootId, `open:${request.value.tabId}`, request.value.generation)) return fail('stale')
    if (!resolved.ok || resolved.value.fileKey !== request.value.fileKey) {
      releaseRecordIdentity(document)
      return fail(resolved.ok ? 'stale' : resolved.error.code)
    }
    const read = await new RealFileSystem().read(resolved.value.logical)
    if (!isWorkspaceGenerationCurrent(window.id, request.value.rootId, `open:${request.value.tabId}`, request.value.generation)) return fail('stale')
    if (!read.ok || read.value.fileKey !== request.value.fileKey || !isContained(root.value.fileKey, read.value.fileKey)) {
      releaseRecordIdentity(document)
      return fail(read.ok ? 'stale' : read.error.code)
    }
    if (window.window.isDestroyed() || documents.get(request.value.tabId) !== document) return fail('ownership')
    const owner = ownerOf(document)
    const transition = document.fileKey
      ? documentRegistry.replace(document.fileKey, read.value.fileKey, owner)
      : documentRegistry.claim(read.value.fileKey, owner)
    if (!transition.ok) {
      const existing = documentRegistry.owner(read.value.fileKey)
      if (existing) focusDocumentOwner(existing)
      return ok<DocumentIntentOutcome>({ kind: 'collision' })
    }
    adoptRecord(document, read.value)
    document.displayPath = resolved.value.logical
    watchDocument(document)
    return ok<DocumentIntentOutcome>({
      file: filePayload(document, { ...read.value, path: resolved.value.logical }),
      kind: 'opened',
    })
  }))
  ipcMain.handle(channels.workspaceRetryRoot, (event, payload) => withAuthorizedWindow(event, async (record) => {
    const request = validateWorkspaceRetryRequest(payload)
    if (!request.ok || record.kind !== 'workspace') return request.ok ? fail('ownership') : request
    const root = workspaceRoots.authorize(record.id, request.value.rootId)
    if (!root.ok) return root
    if (!acceptWorkspaceGeneration(record.id, request.value.rootId, 'retry-root', request.value.generation)) return fail('stale')
    const refreshed = await refreshWorkspaceRoot(record, root.value.rootId)
    if (!isWorkspaceGenerationCurrent(record.id, request.value.rootId, 'retry-root', request.value.generation)) return fail('stale')
    return ok(refreshed)
  }))
  ipcMain.handle(channels.documentOpen, (event, payload) => withDocument(event, 'open', payload, async (record, window) => {
    const selected = await dialog.showOpenDialog(window.window, {
      filters: [{ extensions: ['md', 'markdown', 'txt'], name: 'Markdown documents' }],
      properties: ['openFile'],
      title: 'Open Markdown Document',
    })
    const selectedPath = selected.filePaths[0]
    if (selected.canceled || !selectedPath) return ok<DocumentIntentOutcome>({ kind: 'cancelled' })
    const read = await new RealFileSystem().read(asPath(selectedPath))
    if (!read.ok) return ok<DocumentIntentOutcome>({ kind: 'error' })
    const owner = ownerOf(record)
    const claimed = documentRegistry.claim(read.value.fileKey, owner)
    if (!claimed.ok) return ok<DocumentIntentOutcome>({ kind: 'collision' })
    if (record.fileKey && record.fileKey !== read.value.fileKey) releaseRecordIdentity(record)
    adoptRecord(record, read.value)
    watchDocument(record)
    return ok<DocumentIntentOutcome>({ file: filePayload(record, read.value), kind: 'opened' })
  }))
  ipcMain.handle(channels.documentConfirmClose, (event, payload) => withDocument(event, 'confirm-close', payload, async (_record, window, request) => {
    if (!isCloseDecisionRequest(request)) return fail('validation')
    const decision = await dialog.showMessageBox(window.window, {
      buttons: ['Save', "Don't Save", 'Cancel'],
      cancelId: 2,
      defaultId: 0,
      message: `Save changes to ${request.name}?`,
      title: 'Close Document',
      type: 'warning',
    })
    return ok(decision.response === 0 ? 'save' : decision.response === 1 ? 'discard' : 'cancel')
  }))
  ipcMain.handle(channels.documentConfirmWindowClose, (event, payload) => withWindow(event, {}, async (window) => {
    const dirtyNames = validateDirtyNames(payload)
    if (!dirtyNames) return fail('validation')
    const subject = dirtyNames.length === 1 ? dirtyNames[0] : `${dirtyNames.length} files`
    const decision = await dialog.showMessageBox(window.window, {
      buttons: ['Save All', "Don't Save", 'Cancel'],
      cancelId: 2,
      defaultId: 0,
      message: `Save changes to ${subject}?`,
      title: 'Close Window',
      type: 'warning',
    })
    return ok(decision.response === 0 ? 'save-all' : decision.response === 1 ? 'discard' : 'cancel')
  }))
  ipcMain.handle(channels.documentUpdateMenuState, (event, payload) => withWindow(event, {}, (window) => {
    const state = validateMenuState(payload, window.id)
    if (!state) return fail('validation')
    menuStates.set(window.id, state)
    for (const tab of state.tabs) {
      const record = documents.get(tab.tabId)
      if (record) {
        record.dirty = tab.dirty
        record.title = tab.title
      }
    }
    updateMenuEnablement()
    return ok(undefined)
  }))
  ipcMain.handle(channels.documentQuitSaveAllComplete, (event, payload) => withWindow(event, {}, (window) => {
    if (!validQuitCompletion(payload)) return fail('validation')
    quitSaveResolvers.get(window.id)?.(payload.success)
    quitSaveResolvers.delete(window.id)
    return ok(undefined)
  }))
  ipcMain.handle(channels.documentSave, (event, payload) => withDocument(event, 'save', payload, async (record, window, request) => {
    if (!isWriteRequest(request)) return fail('validation')
    return scheduleDocumentSave({ kind: 'save', record, request, window })
  }))
  ipcMain.handle(channels.documentSaveAndRename, (event, payload) => withDocument(event, 'save-and-rename', payload, async (record, window, request) => {
    if (!isWriteRequest(request)) return fail('validation')
    return scheduleDocumentSave({ kind: 'save-and-rename', record, request, window })
  }))
  ipcMain.handle(channels.documentSaveAs, (event, payload) => withDocument(event, 'save-as', payload, async (record, window, request) => {
    if (!isWriteRequest(request)) return fail('validation')
    return scheduleDocumentSave({ kind: 'save-as', record, request, window })
  }))
  ipcMain.handle(channels.documentAcceptExternal, (event, payload) => withDocument(event, 'accept-external', payload, async (record, _window, request) => {
    if (!isExternalVersionRequest(request) || !record.path) return fail('validation')
    const read = await new RealFileSystem().read(record.path)
    if (!read.ok || read.value.diskVersion !== request.diskVersion) return fail('stale')
    const token = documentWatchTokens.get(record.tabId)
    if (!token || !documentWatchState.accept(token, read.value.diskVersion)) return fail('stale')
    adoptRecord(record, read.value)
    return ok(undefined)
  }))
  ipcMain.handle(channels.documentOverwriteExternal, (event, payload) => withDocument(event, 'overwrite-external', payload, async (record, _window, request) => {
    if (!isExternalWriteRequest(request) || !record.path) return fail('validation')
    const replaced = await new RealFileSystem().atomicReplace(record.path, request.bytes, request.diskVersion)
    if (!replaced.ok) return ok<DocumentIntentOutcome>({ kind: documentFailure(replaced.error.code) })
    adoptRecord(record, replaced.value)
    watchDocument(record)
    return ok<DocumentIntentOutcome>({ file: filePayload(record, replaced.value), kind: 'saved' })
  }))
  ipcMain.handle(channels.documentRetryCleanup, (event, payload) => withDocument(event, 'retry-cleanup', payload, async (record) => {
    if (!record.cleanup || !record.path) return ok<DocumentIntentOutcome>({ kind: 'unchanged' })
    const removed = await new RealFileSystem().remove(record.cleanup.path)
    if (!removed.ok) {
      const current = await new RealFileSystem().read(record.path)
      return current.ok
        ? ok<DocumentIntentOutcome>({ file: filePayload(record, current.value), kind: 'cleanup-warning', oldPath: record.cleanup.path })
        : ok<DocumentIntentOutcome>({ kind: 'error' })
    }
    documentRegistry.release(record.cleanup.fileKey, ownerOf(record))
    delete record.cleanup
    const current = await new RealFileSystem().read(record.path)
    return current.ok
      ? ok<DocumentIntentOutcome>({ file: filePayload(record, current.value), kind: 'saved' })
      : ok<DocumentIntentOutcome>({ kind: 'error' })
  }))
  ipcMain.handle(channels.documentClose, (event, payload) => withDocument(event, 'close', payload, (record) => {
    disposeDocumentWatcher(record.tabId)
    documentSaveCoordinators.delete(record.tabId)
    releaseRecordIdentity(record)
    documents.delete(record.tabId)
    return ok(undefined)
  }))
  ipcMain.handle(channels.windowGetState, (event, payload) => withWindow(event, payload, (record) => ok(windowState(record.window))))
  ipcMain.handle(channels.windowMinimize, (event, payload) => withWindow(event, payload, (record) => {
    record.window.minimize()
    return ok(undefined)
  }))
  ipcMain.handle(channels.windowToggleMaximize, (event, payload) => withWindow(event, payload, (record) => {
    if (record.window.isMaximized()) record.window.unmaximize()
    else record.window.maximize()
    return ok(undefined)
  }))
  ipcMain.handle(channels.windowClose, (event, payload) => withWindow(event, payload, (record) => {
    record.closeApproved = true
    record.window.close()
    return ok(undefined)
  }))
}

async function initializeSettings(): Promise<void> {
  const store = new SettingsFileStore(app.getPath('userData'))
  await store.recover().catch(() => undefined)
  const read = await store.read()
  let initial: SettingsLoadResult | undefined
  if (read.kind === 'loaded') {
    initial = parseSettings(read.raw)
    if ('corrupt' in initial) {
      await store.quarantineCorrupt().catch(() => undefined)
      settingsWarning = 'Settings could not be loaded; defaults are in use.'
    } else if ('newer' in initial) settingsWarning = 'Settings were created by a newer Markzen version; defaults are in use.'
    else if ('invalid' in initial) settingsWarning = 'Settings could not be loaded; defaults are in use.'
  } else if (read.kind === 'oversized') {
    initial = { oversized: true, snapshot: DEFAULT_SETTINGS }
    settingsWarning = 'Settings are too large to load; defaults are in use.'
  } else if (read.kind === 'error') {
    initial = { invalid: true, snapshot: DEFAULT_SETTINGS }
    settingsWarning = 'Settings could not be read; defaults are in use.'
  }
  settingsService = new SettingsService({
    ...(initial ? { initial } : {}),
    onPersistenceWarning: (active) => {
      settingsWarning = active ? 'Settings could not be saved. Your current preference remains active.' : undefined
      for (const record of windowsByContents.values()) {
        if (!record.window.isDestroyed()) record.window.webContents.send(channels.settingsWarning, settingsWarning)
      }
    },
    write: (bytes) => store.write(bytes),
  })
  settingsService.subscribe((snapshot) => {
    for (const record of windowsByContents.values()) {
      if (!record.window.isDestroyed()) record.window.webContents.send(channels.settingsSnapshot, snapshot)
    }
  })
}

async function openFolderWorkspace(source: WindowRecord | undefined): Promise<void> {
  const key = source?.id ?? 'no-focused-window'
  if (pendingFolderWindows.has(key)) return
  pendingFolderWindows.add(key)
  try {
    const options = { properties: ['openDirectory'] as ['openDirectory'], title: 'Open Folder' }
    const selected = source ? await dialog.showOpenDialog(source.window, options) : await dialog.showOpenDialog(options)
    const selectedPath = selected.filePaths[0]
    if (selected.canceled || !selectedPath) return
    if (source && (source.window.isDestroyed() || ![...windowsByContents.values()].includes(source))) return
    const pristine = source ? isPristineWindow(source) : false
    try {
      await createMarkzenWindow('workspace', asPath(selectedPath))
      if (source && pristine && !source.window.isDestroyed()) {
        source.closeApproved = true
        source.window.close()
      }
    } catch {
      const message = `The folder could not be opened: ${nodePath.basename(selectedPath)}`
      if (source && !source.window.isDestroyed()) await dialog.showMessageBox(source.window, { message, type: 'error' })
      else await dialog.showMessageBox({ message, type: 'error' })
    }
  } finally {
    pendingFolderWindows.delete(key)
  }
}

async function addFolderToWorkspace(record: WindowRecord): Promise<WorkspaceRootOutcome> {
  const key = record.id
  if (pendingFolderWindows.has(key)) return { kind: 'error' }
  pendingFolderWindows.add(key)
  try {
    const selected = await dialog.showOpenDialog(record.window, { properties: ['openDirectory'], title: 'Add Folder' })
    const selectedPath = selected.filePaths[0]
    if (selected.canceled || !selectedPath) return { kind: 'cancelled' }
    if (record.window.isDestroyed() || ![...windowsByContents.values()].includes(record)) return { kind: 'error' }
    const outcome = await acceptWorkspaceRoot(record, asPath(selectedPath))
    if (outcome.kind === 'added' || outcome.kind === 'duplicate') {
      record.window.webContents.send(channels.workspaceEvent, { generation: Date.now(), kind: 'root-added', root: outcome.root })
      return outcome
    }
    await dialog.showMessageBox(record.window, {
      message: `The folder could not be added: ${nodePath.basename(selectedPath)}`,
      type: 'error',
    })
    return { kind: 'error' }
  } finally {
    pendingFolderWindows.delete(key)
  }
}

async function acceptWorkspaceRoot(record: WindowRecord, logicalPath: Path): Promise<WorkspaceRootOutcome> {
  if (record.kind !== 'workspace') return { kind: 'error' }
  const fs = new RealFileSystem()
  const canonical = await fs.canonicalize(logicalPath)
  if (!canonical.ok) return { kind: 'error' }
  const metadata = await fs.stat(logicalPath)
  if (!metadata.ok || metadata.value.kind !== 'directory') return { kind: 'error' }
  const listed = await fs.list(logicalPath)
  if (!listed.ok) return { kind: 'error' }
  const accepted = workspaceRoots.accept(record.id, logicalPath, canonical.value.fileKey)
  const key = rootKey(record.id, accepted.root.rootId)
  if (accepted.kind === 'accepted') {
    workspaceSnapshots.set(key, listed.value)
    await startWorkspaceWatch(record, accepted.root.rootId, logicalPath)
  }
  const entries = workspaceSnapshots.get(key) ?? listed.value
  return {
    kind: accepted.kind === 'accepted' ? 'added' : 'duplicate',
    root: { entries, path: accepted.root.path, rootId: accepted.root.rootId },
  }
}

async function startWorkspaceWatch(record: WindowRecord, rootId: RootId, logicalPath: Path): Promise<void> {
  let pendingRelativePath: string | undefined
  const batcher = new WorkspaceWatchBatcher(() => {
    const relativePath = pendingRelativePath ?? ''
    pendingRelativePath = undefined
    void routeWorkspaceInvalidation(record, rootId, relativePath)
  })
  const watcher = watch(String(logicalPath), { followSymlinks: false, ignoreInitial: true, persistent: true })
  const initialized = new Promise<void>((resolve) => {
    const finish = () => {
      watcher.off('error', finish)
      watcher.off('ready', finish)
      resolve()
    }
    watcher.once('error', finish)
    watcher.once('ready', finish)
  })
  watcher.on('all', (_event, changedPath) => {
    const relative = nodePath.relative(String(logicalPath), String(changedPath)).replaceAll(nodePath.sep, '/')
    if (WorkspaceWatchBatcher.isVisibleInvalidation(relative)) {
      const parent = nodePath.posix.dirname(relative)
      const candidate = parent === '.' ? '' : parent
      pendingRelativePath = pendingRelativePath === undefined ? candidate : commonLogicalAncestor(pendingRelativePath, candidate)
      batcher.invalidate()
    }
  })
  watcher.on('error', () => {
    if (!record.window.isDestroyed()) record.window.webContents.send(channels.workspaceEvent, {
      generation: nextWorkspaceGeneration(record.id, rootId, 'watch-error'),
      kind: 'watch-warning',
      rootId,
    })
  })
  workspaceRoots.attachWatch(record.id, rootId, () => {
    batcher.dispose()
    void watcher.close()
  })
  await initialized
}

async function routeWorkspaceInvalidation(record: WindowRecord, rootId: RootId, relativePath: string): Promise<void> {
  const root = workspaceRoots.get(record.id, rootId)
  if (!root || record.window.isDestroyed()) return
  const listed = await new RealFileSystem().list(root.path)
  if (record.window.isDestroyed() || !workspaceRoots.get(record.id, rootId)) return
  const generation = nextWorkspaceGeneration(record.id, rootId, 'watch')
  if (!listed.ok) {
    record.window.webContents.send(channels.workspaceEvent, { generation, kind: 'root-error', rootId })
    return
  }
  workspaceSnapshots.set(rootKey(record.id, rootId), listed.value)
  record.window.webContents.send(channels.workspaceEvent, {
    generation,
    kind: 'invalidated',
    relativePath,
    rootId,
  })
}

function commonLogicalAncestor(first: string, second: string): string {
  if (!first || !second) return ''
  const left = first.split('/')
  const right = second.split('/')
  const common: string[] = []
  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    if (left[index] !== right[index]) break
    common.push(left[index]!)
  }
  return common.join('/')
}

async function refreshWorkspaceRoot(record: WindowRecord, rootId: RootId): Promise<WorkspaceRootOutcome> {
  const root = workspaceRoots.get(record.id, rootId)
  if (!root) return { kind: 'error' }
  const listed = await new RealFileSystem().list(root.path)
  if (!listed.ok) return { kind: 'error' }
  workspaceSnapshots.set(rootKey(record.id, rootId), listed.value)
  await startWorkspaceWatch(record, rootId, root.path)
  return { kind: 'duplicate', root: { entries: listed.value, path: root.path, rootId } }
}

type WorkspaceOpenRequest = {
  readonly fileKey: FileKey
  readonly generation: number
  readonly relativePath: string
  readonly rootId: RootId
  readonly tabId: TabId
}

function validateWorkspaceOpenRequest(value: unknown): PlatformResult<WorkspaceOpenRequest> {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'fileKey,generation,relativePath,rootId,tabId') return fail('validation')
  const entry = validateWorkspaceEntryRequest({ generation: value.generation, relativePath: value.relativePath, rootId: value.rootId })
  if (
    !entry.ok ||
    typeof value.fileKey !== 'string' || value.fileKey.length < 1 || value.fileKey.length > 4_096 || value.fileKey.includes('\0') ||
    typeof value.tabId !== 'string' || value.tabId.length < 1 || value.tabId.length > 128
  ) return fail('validation')
  return ok({ ...entry.value, fileKey: value.fileKey as FileKey, tabId: asTabId(value.tabId) })
}

function validateWorkspaceRetryRequest(value: unknown): import('../contracts').PlatformResult<{ readonly generation: number; readonly rootId: RootId }> {
  if (!isRecord(value) || Object.keys(value).sort().join(',') !== 'generation,rootId') return fail('validation')
  if (!Number.isSafeInteger(value.generation) || (value.generation as number) < 0 || typeof value.rootId !== 'string') return fail('validation')
  return ok({ generation: value.generation as number, rootId: asRootId(value.rootId) })
}

async function resolveWorkspacePath(
  rootPath: Path,
  rootKeyValue: FileKey,
  relativePath: string,
  kind: 'directory' | 'file',
): Promise<import('../contracts').PlatformResult<{ readonly fileKey: FileKey; readonly logical: Path }>> {
  const logical = asPath(relativePath ? nodePath.join(String(rootPath), ...relativePath.split('/')) : String(rootPath))
  const fs = new RealFileSystem()
  const canonical = await fs.canonicalize(logical)
  if (!canonical.ok) return canonical
  if (!isContained(rootKeyValue, canonical.value.fileKey)) return fail('ownership')
  const metadata = await fs.stat(logical)
  if (!metadata.ok) return metadata
  if (metadata.value.kind !== kind) return fail(kind === 'file' ? 'not-file' : 'not-directory')
  return ok({ fileKey: canonical.value.fileKey, logical })
}

function isContained(root: FileKey, candidate: FileKey): boolean {
  const relative = nodePath.relative(String(root), String(candidate))
  return relative === '' || (!relative.startsWith(`..${nodePath.sep}`) && relative !== '..' && !nodePath.isAbsolute(relative))
}

function acceptWorkspaceGeneration(windowId: WindowId, rootId: RootId, operation: string, generation: number): boolean {
  const key = `${windowId}:${rootId}:${operation}`
  const current = workspaceGenerations.get(key) ?? -1
  if (generation < current) return false
  workspaceGenerations.set(key, generation)
  return true
}

function isWorkspaceGenerationCurrent(windowId: WindowId, rootId: RootId, operation: string, generation: number): boolean {
  return workspaceGenerations.get(`${windowId}:${rootId}:${operation}`) === generation
}

function nextWorkspaceGeneration(windowId: WindowId, rootId: RootId, operation: string): number {
  const key = `${windowId}:${rootId}:${operation}`
  const next = (workspaceGenerations.get(key) ?? 0) + 1
  workspaceGenerations.set(key, next)
  return next
}

function rootKey(windowId: WindowId, rootId: RootId): string {
  return `${windowId}:${rootId}`
}

function isPristineWindow(record: WindowRecord): boolean {
  const state = menuStates.get(record.id)
  const tab = state?.tabs[0]
  if (!state || state.tabs.length !== 1 || !tab || tab.dirty) return false
  const document = documents.get(tab.tabId)
  return Boolean(document && !document.fileKey)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function scheduleDocumentSave(task: MainSaveTask): Promise<MainSaveResult> {
  let coordinator = documentSaveCoordinators.get(task.record.tabId)
  if (!coordinator) {
    coordinator = new SaveCoordinator(
      async ({ snapshot }) => {
        if (documents.get(snapshot.record.tabId) !== snapshot.record) return ok<DocumentIntentOutcome>({ kind: 'error' })
        if (snapshot.kind === 'save-and-rename') return saveAndRenameDocument(snapshot.record, snapshot.request)
        return saveDocument(snapshot.record, snapshot.window, snapshot.request, snapshot.kind === 'save-as')
      },
      (result) => ['saved', 'cleanup-warning', 'unchanged'].includes(result.value.kind),
    )
    documentSaveCoordinators.set(task.record.tabId, coordinator)
  }
  return coordinator.save({ revision: saveRequestRevision(task.kind, task.request), snapshot: task })
}

function saveRequestRevision(kind: MainSaveTask['kind'], request: DocumentWriteRequest): string {
  return createHash('sha256')
    .update(kind)
    .update(request.title)
    .update(request.documentDirty ? '1' : '0')
    .update(request.titleDirty ? '1' : '0')
    .update(request.bytes)
    .digest('hex')
}

async function saveDocument(
  record: MainDocumentRecord,
  window: WindowRecord,
  request: DocumentWriteRequest,
  forceSaveAs: boolean,
): Promise<{ readonly ok: true; readonly value: DocumentIntentOutcome }> {
  if (forceSaveAs || !record.path || !record.diskVersion) return saveDocumentAs(record, window, request)
  if (!request.documentDirty && !request.titleDirty) return ok({ kind: 'unchanged' })
  const currentName = nodePath.basename(record.path)
  const targetName = deriveDocumentFilename(request.title, getRecognizedExtension(currentName))
  const titleChanged = targetName !== currentName
  if (titleChanged && request.documentDirty) return ok({ kind: 'rename-decision' })
  const fs = new RealFileSystem()
  if (titleChanged) {
    const target = asPath(nodePath.join(nodePath.dirname(record.path), targetName))
    const canonical = await fs.canonicalize(target)
    if (canonical.ok) {
      const targetOwner = documentRegistry.owner(canonical.value.fileKey)
      if (targetOwner && (targetOwner.tabId !== record.tabId || targetOwner.windowId !== record.windowId)) {
        focusDocumentOwner(targetOwner)
        return ok({ kind: 'collision' })
      }
    }
    const moved = await fs.move(record.path, target, record.diskVersion)
    if (!moved.ok) return ok({ kind: documentFailure(moved.error.code) })
    const adopted = documentRegistry.adopt(record.fileKey!, moved.value.fileKey, ownerOf(record))
    if (!adopted.ok) return ok({ kind: 'collision' })
    adoptRecord(record, moved.value)
    watchDocument(record)
    return ok({ file: filePayload(record, moved.value), kind: 'saved' })
  }
  const replaced = await fs.atomicReplace(record.path, request.bytes, record.diskVersion)
  if (!replaced.ok) return ok({ kind: documentFailure(replaced.error.code) })
  adoptRecord(record, replaced.value)
  watchDocument(record)
  return ok({ file: filePayload(record, replaced.value), kind: 'saved' })
}

async function saveDocumentAs(
  record: MainDocumentRecord,
  window: WindowRecord,
  request: DocumentWriteRequest,
): Promise<{ readonly ok: true; readonly value: DocumentIntentOutcome }> {
  const selected = await dialog.showSaveDialog(window.window, {
    buttonLabel: 'Save As',
    defaultPath: deriveDocumentFilename(request.title, undefined),
    filters: [{ extensions: ['md'], name: 'Markdown document' }],
    message: 'A new document will be created from the current tab.',
    title: 'Save Current Tab As',
  })
  if (selected.canceled || !selected.filePath) return ok({ kind: 'cancelled' })
  const path = asPath(selected.filePath)
  const fs = new RealFileSystem()
  const existing = await fs.read(path)
  let expected: DiskVersion | 'missing' = 'missing'
  if (existing.ok) {
    const targetOwner = documentRegistry.owner(existing.value.fileKey)
    if (targetOwner && (targetOwner.tabId !== record.tabId || targetOwner.windowId !== record.windowId)) {
      focusDocumentOwner(targetOwner)
      return ok({ kind: 'collision' })
    }
    if (record.fileKey === existing.value.fileKey && record.path === existing.value.path) {
      if (!record.diskVersion) return ok({ kind: 'missing' })
      const samePath = await fs.atomicReplace(record.path, request.bytes, record.diskVersion)
      if (!samePath.ok) return ok({ kind: documentFailure(samePath.error.code) })
      adoptRecord(record, samePath.value)
      watchDocument(record)
      return ok({ file: filePayload(record, samePath.value), kind: 'saved' })
    }
    if (record.fileKey === existing.value.fileKey) return ok({ kind: 'collision' })
    const confirmation = await dialog.showMessageBox(window.window, {
      buttons: ['Replace', 'Cancel'],
      cancelId: 1,
      defaultId: 1,
      message: 'A file already exists at this location.',
      title: 'Replace Existing File?',
      type: 'warning',
    })
    if (confirmation.response !== 0) return ok({ kind: 'cancelled' })
    expected = existing.value.diskVersion
  } else if (existing.error.code !== 'not-found') return ok({ kind: 'error' })
  const canonical = await fs.canonicalize(path)
  if (!canonical.ok) return ok({ kind: 'error' })
  const owner = ownerOf(record)
  const reservation = documentRegistry.claim(canonical.value.fileKey, owner)
  if (!reservation.ok) return ok({ kind: 'collision' })
  const replaced = await fs.atomicReplace(path, request.bytes, expected)
  if (!replaced.ok) {
    documentRegistry.release(canonical.value.fileKey, owner)
    return ok({ kind: documentFailure(replaced.error.code) })
  }
  if (record.fileKey) documentRegistry.release(record.fileKey, owner)
  adoptRecord(record, replaced.value)
  watchDocument(record)
  return ok({ file: filePayload(record, replaced.value), kind: 'saved' })
}

async function saveAndRenameDocument(
  record: MainDocumentRecord,
  request: DocumentWriteRequest,
): Promise<{ readonly ok: true; readonly value: DocumentIntentOutcome }> {
  if (!record.path || !record.diskVersion || !record.fileKey) return ok({ kind: 'missing' })
  const fs = new RealFileSystem()
  const latest = await fs.read(record.path)
  if (!latest.ok) return ok({ kind: documentFailure(latest.error.code) })
  if (latest.value.diskVersion !== record.diskVersion) return ok({ kind: 'conflict' })
  const targetName = deriveDocumentFilename(request.title, getRecognizedExtension(nodePath.basename(record.path)))
  const target = asPath(nodePath.join(nodePath.dirname(record.path), targetName))
  const canonical = await fs.canonicalize(target)
  if (!canonical.ok) return ok({ kind: 'error' })
  if (canonical.value.fileKey === record.fileKey) return ok({ kind: 'collision' })
  const owner = ownerOf(record)
  const reservation = documentRegistry.claim(canonical.value.fileKey, owner)
  if (!reservation.ok) return ok({ kind: 'collision' })
  const written = await fs.atomicReplace(target, request.bytes, 'missing')
  if (!written.ok) {
    documentRegistry.release(canonical.value.fileKey, owner)
    return ok({ kind: documentFailure(written.error.code) })
  }
  const oldPath = record.path
  const oldKey = record.fileKey
  const removed = await fs.remove(oldPath)
  if (removed.ok) documentRegistry.release(record.fileKey, owner)
  adoptRecord(record, written.value)
  watchDocument(record)
  if (!removed.ok) {
    record.cleanup = { fileKey: oldKey, path: oldPath }
    return ok({ file: filePayload(record, written.value), kind: 'cleanup-warning', oldPath })
  }
  return ok({ file: filePayload(record, written.value), kind: 'saved' })
}

function withDocument(
  event: IpcMainInvokeEvent,
  intent: 'accept-external' | 'close' | 'confirm-close' | 'open' | 'overwrite-external' | 'retry-cleanup' | 'save' | 'save-and-rename' | 'save-as',
  payload: unknown,
  operation: (
    record: MainDocumentRecord,
    window: WindowRecord,
    request: CloseDecisionRequest | DocumentIdentityRequest | DocumentWriteRequest | ExternalVersionRequest | ExternalWriteRequest,
  ) => unknown,
): unknown {
  return withAuthorizedWindow(event, (window) => {
    const validated = validateDocumentRequest(intent, payload)
    if (!validated.ok) return validated
    const record = documents.get(validated.value.tabId)
    if (!record) return fail('ownership')
    const authorized = authorizeDocumentRequest(record, window.id, validated.value.tabId, validated.value.generation)
    return authorized.ok ? operation(record, window, validated.value) : authorized
  })
}

function withAuthorizedWindow(event: IpcMainInvokeEvent, operation: (record: WindowRecord) => unknown): unknown {
  const frame = event.senderFrame
  const authorized = resolveWindowSender(
    {
      contentsId: event.sender.id,
      isMainFrame: frame !== null && frame === event.sender.mainFrame,
      url: frame?.url ?? '',
    },
    windowsByContents,
    APP_ORIGIN,
    (record) => !record.window.isDestroyed(),
  )
  return authorized.ok ? operation(authorized.value) : authorized
}

function ownerOf(record: MainDocumentRecord): DocumentOwner {
  return { tabId: record.tabId, windowId: record.windowId }
}

function focusDocumentOwner(owner: DocumentOwner): void {
  const window = [...windowsByContents.values()].find((candidate) => candidate.id === owner.windowId)?.window
  if (window && !window.isDestroyed()) window.focus()
}

function releaseRecordIdentity(record: MainDocumentRecord): void {
  disposeDocumentWatcher(record.tabId)
  if (record.fileKey) documentRegistry.release(record.fileKey, ownerOf(record))
  if (record.cleanup) documentRegistry.release(record.cleanup.fileKey, ownerOf(record))
  delete record.cleanup
  delete record.fileKey
  delete record.path
  delete record.diskVersion
  delete record.displayPath
  delete record.secondaryPath
}

function adoptRecord(record: MainDocumentRecord, file: { readonly diskVersion: DiskVersion; readonly fileKey: FileKey; readonly path: Path }): void {
  record.diskVersion = file.diskVersion
  record.fileKey = file.fileKey
  record.path = file.path
  const context = workspaceSecondaryPath(record.windowId, file.path)
  if (context) record.secondaryPath = context
  else delete record.secondaryPath
}

function filePayload(
  record: MainDocumentRecord,
  file: { readonly bytes: Uint8Array; readonly diskVersion: DiskVersion; readonly fileKey: FileKey; readonly path: Path },
): DocumentFilePayload {
  return {
    ...file,
    path: record.displayPath ?? file.path,
    ...(record.secondaryPath ? { secondaryPath: record.secondaryPath } : {}),
    tabId: record.tabId,
  }
}

function workspaceSecondaryPath(windowId: WindowId, canonicalFile: Path): string | undefined {
  const root = selectContainingRoot(workspaceRoots.values(windowId), canonicalFile)
  if (!root) return undefined
  const relative = nodePath.relative(String(root.fileKey), String(canonicalFile)).replaceAll(nodePath.sep, '/')
  const directory = nodePath.posix.dirname(relative)
  return directory === '.' || directory === '/' ? undefined : directory
}

function isWriteRequest(value: DocumentIdentityRequest | DocumentWriteRequest): value is DocumentWriteRequest {
  return 'bytes' in value
}

function isExternalVersionRequest(
  value: CloseDecisionRequest | DocumentIdentityRequest | DocumentWriteRequest | ExternalVersionRequest | ExternalWriteRequest,
): value is ExternalVersionRequest {
  return 'diskVersion' in value && !('bytes' in value)
}

function isExternalWriteRequest(
  value: CloseDecisionRequest | DocumentIdentityRequest | DocumentWriteRequest | ExternalVersionRequest | ExternalWriteRequest,
): value is ExternalWriteRequest {
  return 'diskVersion' in value && 'bytes' in value
}

function isCloseDecisionRequest(
  value: CloseDecisionRequest | DocumentIdentityRequest | DocumentWriteRequest | ExternalVersionRequest | ExternalWriteRequest,
): value is CloseDecisionRequest {
  return 'name' in value
}

function watchDocument(record: MainDocumentRecord): void {
  disposeDocumentWatcher(record.tabId)
  if (!record.path || !record.diskVersion) return
  const token = documentWatchState.repoint(record.tabId, record.path, record.diskVersion)
  documentWatchTokens.set(record.tabId, token)
  const watcher = watch(String(record.path), { ignoreInitial: true, persistent: true })
  const invalidate = () => { void routeWatcherInvalidation(token) }
  watcher.on('add', invalidate)
  watcher.on('change', invalidate)
  watcher.on('unlink', invalidate)
  watcher.on('error', () => {
    if (documentWatchState.fail(token).kind === 'warning') {
      routeExternalEvent(record, { kind: 'watch-warning', tabId: record.tabId })
    }
  })
  documentWatchers.set(record.tabId, watcher)
}

async function routeWatcherInvalidation(token: WatchToken): Promise<void> {
  const tabId = token.tabId
  const record = documents.get(tabId)
  if (!record?.path) return
  const capturedPath = record.path
  const read = await new RealFileSystem().read(capturedPath)
  const current = documents.get(tabId)
  if (current !== record || current.path !== capturedPath) return
  if (!read.ok) {
    if (read.error.code === 'not-found') routeExternalEvent(record, { kind: 'missing', tabId })
    else routeExternalEvent(record, { kind: 'watch-warning', tabId })
    return
  }
  const decision = documentWatchState.invalidate(token, read.value.diskVersion, Boolean(record.dirty))
  if (decision.kind !== 'reload' && decision.kind !== 'conflict') return
  routeExternalEvent(record, { file: filePayload(record, read.value), kind: 'changed' })
}

function routeExternalEvent(record: MainDocumentRecord, event: DocumentExternalEvent): void {
  const window = [...windowsByContents.values()].find((candidate) => candidate.id === record.windowId)?.window
  if (window && !window.isDestroyed() && documents.get(record.tabId) === record) {
    window.webContents.send(channels.documentExternal, event)
  }
}

function disposeDocumentWatcher(tabId: TabId): void {
  const watcher = documentWatchers.get(tabId)
  documentWatchers.delete(tabId)
  if (watcher) void watcher.close()
  documentWatchState.dispose(tabId)
  documentWatchTokens.delete(tabId)
}

function documentFailure(code: string): Exclude<DocumentIntentOutcome['kind'], 'cleanup-warning' | 'opened' | 'saved'> {
  if (code === 'conflict') return 'conflict'
  if (code === 'not-found') return 'missing'
  if (code === 'already-exists') return 'collision'
  return 'error'
}

function validateDirtyNames(payload: unknown): readonly string[] | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  const record = payload as Record<string, unknown>
  if (Object.keys(record).length !== 1 || !Array.isArray(record.dirtyNames)) return undefined
  if (record.dirtyNames.length < 1 || record.dirtyNames.length > 100) return undefined
  return record.dirtyNames.every((name) => typeof name === 'string' && name.length > 0 && name.length <= 255)
    ? record.dirtyNames as string[]
    : undefined
}

function validateMenuState(payload: unknown, windowId: WindowId): DocumentMenuState | undefined {
  if (typeof payload !== 'object' || payload === null || Array.isArray(payload)) return undefined
  const value = payload as Record<string, unknown>
  if (!Array.isArray(value.tabs) || value.tabs.length > 100) return undefined
  if (value.activeTabId !== undefined && typeof value.activeTabId !== 'string') return undefined
  const tabs: Array<DocumentMenuState['tabs'][number]> = []
  for (const candidate of value.tabs) {
    if (typeof candidate !== 'object' || candidate === null || Array.isArray(candidate)) return undefined
    const tab = candidate as Record<string, unknown>
    if (Object.keys(tab).sort().join(',') !== 'dirty,preservation,tabId,title,titleValid') return undefined
    if (typeof tab.tabId !== 'string' || documents.get(asTabId(tab.tabId))?.windowId !== windowId) return undefined
    if (typeof tab.dirty !== 'boolean' || typeof tab.preservation !== 'boolean' || typeof tab.titleValid !== 'boolean') return undefined
    if (typeof tab.title !== 'string' || tab.title.length > 255) return undefined
    tabs.push({ dirty: tab.dirty, preservation: tab.preservation, tabId: asTabId(tab.tabId), title: tab.title, titleValid: tab.titleValid })
  }
  const activeTabId = typeof value.activeTabId === 'string' ? asTabId(value.activeTabId) : undefined
  if (activeTabId && !tabs.some((tab) => tab.tabId === activeTabId)) return undefined
  return { ...(activeTabId ? { activeTabId } : {}), tabs }
}

function validQuitCompletion(payload: unknown): payload is { readonly success: boolean } {
  return typeof payload === 'object' && payload !== null && !Array.isArray(payload) &&
    Object.keys(payload).length === 1 && 'success' in payload && typeof payload.success === 'boolean'
}

async function guardQuit(): Promise<void> {
  await settingsService?.flush(2_000)
  const dirty = [...documents.values()].filter((document) => document.dirty)
  if (dirty.length === 0) {
    allowQuit = true
    app.quit()
    return
  }
  const allWindows = [...windowsByContents.values()]
  const focused = BrowserWindow.getFocusedWindow()
  const focusedRecord = focused ? windowsByContents.get(focused.webContents.id) : undefined
  const ordered = focusedRecord ? [focusedRecord, ...allWindows.filter((record) => record !== focusedRecord)] : allWindows
  const parent = focusedRecord?.window ?? allWindows.at(-1)?.window
  const options = {
    buttons: ['Save All', "Don't Save All", 'Cancel'],
    cancelId: 2,
    defaultId: 0,
    message: `${allWindows.length} ${allWindows.length === 1 ? 'window' : 'windows'} and ${dirty.length} dirty ${dirty.length === 1 ? 'tab' : 'tabs'} will close.`,
    title: 'Quit Markzen?',
    type: 'warning' as const,
  }
  const choice = parent ? await dialog.showMessageBox(parent, options) : await dialog.showMessageBox(options)
  if (choice.response === 2) return
  if (choice.response === 0) {
    for (const record of ordered) {
      if (![...documents.values()].some((document) => document.windowId === record.id && document.dirty)) continue
      if (!(await requestQuitSaveAll(record))) return
    }
  }
  allowQuit = true
  app.quit()
}

async function requestQuitSaveAll(record: WindowRecord): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    const timeout = setTimeout(() => {
      quitSaveResolvers.delete(record.id)
      resolve(false)
    }, 60_000)
    quitSaveResolvers.set(record.id, (success) => {
      clearTimeout(timeout)
      resolve(success)
    })
    record.window.webContents.send(channels.documentCommand, 'save-all-for-quit' satisfies DocumentCommand)
  })
}

function withWindow(event: IpcMainInvokeEvent, payload: unknown, operation: (record: WindowRecord) => unknown): unknown {
  return withAuthorizedWindow(event, (record) => {
    const validated = validateWindowRequest(payload, record.id)
    return validated.ok ? operation(record) : validated
  })
}

function secureWebContents(contents: WebContents): void {
  contents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`${APP_ORIGIN}/`)) event.preventDefault()
  })
  contents.on('will-attach-webview', (event) => event.preventDefault())
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))
}

function bindWindowEvents(record: WindowRecord): void {
  const contentsId = record.window.webContents.id
  const emit = () => {
    if (!record.window.isDestroyed()) record.window.webContents.send(channels.windowState, windowState(record.window))
  }
  const guardClose = (event: Electron.Event) => {
    if (allowQuit || record.closeApproved || !menuStates.has(record.id)) return
    event.preventDefault()
    if (!record.window.isDestroyed()) record.window.webContents.send(channels.documentCommand, 'close-window' satisfies DocumentCommand)
  }
  record.window.on('close', guardClose)
  record.window.on('maximize', emit)
  record.window.on('unmaximize', emit)
  record.window.on('minimize', emit)
  record.window.on('restore', emit)
  record.window.on('focus', emit)
  record.window.on('blur', emit)
  record.window.on('focus', updateMenuEnablement)
  record.window.on('blur', updateMenuEnablement)
  owners.track(record.id, () => {
    record.window.removeListener('close', guardClose)
    record.window.removeListener('maximize', emit)
    record.window.removeListener('unmaximize', emit)
    record.window.removeListener('minimize', emit)
    record.window.removeListener('restore', emit)
    record.window.removeListener('focus', emit)
    record.window.removeListener('blur', emit)
    record.window.removeListener('focus', updateMenuEnablement)
    record.window.removeListener('blur', updateMenuEnablement)
  })
  record.window.once('closed', () => {
    for (const document of documents.values()) {
      if (document.windowId === record.id) {
        releaseRecordIdentity(document)
        documentSaveCoordinators.delete(document.tabId)
        documents.delete(document.tabId)
      }
    }
    windowsByContents.delete(contentsId)
    for (const root of workspaceRoots.values(record.id)) {
      const key = rootKey(record.id, root.rootId)
      workspaceSnapshots.delete(key)
    }
    workspaceRoots.disposeWindow(record.id)
    menuStates.delete(record.id)
    owners.dispose(record.id)
  })
}

function windowState(window: BrowserWindow): WindowState {
  return {
    focused: window.isFocused(),
    status: window.isMinimized() ? 'minimized' : window.isMaximized() ? 'maximized' : 'normal',
  }
}

function normalizePlatform(value: string): PlatformName {
  if (value === 'darwin' || value === 'win32') return value
  return 'linux'
}

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', (event) => {
  if (allowQuit) return
  event.preventDefault()
  if (quitGuardRunning) return
  quitGuardRunning = true
  void guardQuit().finally(() => { quitGuardRunning = false })
})

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createMarkzenWindow()
})

Object.defineProperty(app, 'markzenShellHarness', {
  configurable: false,
  enumerable: false,
  value: Object.freeze({ createMarkzenWindow, emitWindowStateForShellTest, getApplicationMenuSnapshot, getDirtyDocumentCount, getDocumentWatcherCount, getWindowOptionsForPlatform, getWorkspaceWatcherCount, openFolderForShellTest, runRealFsRoundTrip }),
  writable: false,
})

void start()
