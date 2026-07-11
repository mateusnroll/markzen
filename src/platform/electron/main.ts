import { randomUUID } from 'node:crypto'
import { access } from 'node:fs/promises'
import nodePath from 'node:path'

import {
  app,
  BrowserWindow,
  ipcMain,
  session,
  type BrowserWindowConstructorOptions,
  type IpcMainInvokeEvent,
  type WebContents,
} from 'electron'

import {
  asPath,
  asWindowId,
  ok,
  type BootstrapPayload,
  type PlatformName,
  type WindowId,
  type WindowState,
} from '../contracts'
import { OwnerRegistry } from '../ownership'
import { resolveWindowSender, validateWindowRequest } from './authority'
import { channels } from './channels'
import { APP_ORIGIN, registerApplicationProtocol } from './protocol'
import { RealFileSystem } from './real-fs'

type WindowRecord = {
  readonly id: WindowId
  readonly window: BrowserWindow
}

const userDataOverride = app.commandLine.getSwitchValue('user-data-dir')
if (userDataOverride) app.setPath('userData', nodePath.resolve(userDataOverride))

const windowsByContents = new Map<number, WindowRecord>()
const owners = new OwnerRegistry<WindowId>()
let handlersRegistered = false

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

export async function createMarkzenWindow(): Promise<WindowId> {
  if (!app.isReady()) await app.whenReady()
  const window = new BrowserWindow(getWindowOptionsForPlatform())
  const id = asWindowId(randomUUID())
  const record = { id, window }
  windowsByContents.set(window.webContents.id, record)
  owners.open(id)
  secureWebContents(window.webContents)
  bindWindowEvents(record)
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

async function start(): Promise<void> {
  await app.whenReady()
  await registerApplicationProtocol()
  registerSecurityPolicy()
  registerIpcHandlers()
  if (BrowserWindow.getAllWindows().length === 0) await createMarkzenWindow()
}

function registerSecurityPolicy(): void {
  session.defaultSession.setPermissionCheckHandler(() => false)
  session.defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
}

function registerIpcHandlers(): void {
  if (handlersRegistered) return
  handlersRegistered = true
  ipcMain.handle(channels.bootstrap, (event, payload) => withWindow(event, payload, (record) => ok<BootstrapPayload>({
    platformName: normalizePlatform(process.platform),
    state: windowState(record.window),
    windowId: record.id,
  })))
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
    record.window.close()
    return ok(undefined)
  }))
}

function withWindow(event: IpcMainInvokeEvent, payload: unknown, operation: (record: WindowRecord) => unknown): unknown {
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
  if (!authorized.ok) return authorized
  const validated = validateWindowRequest(payload, authorized.value.id)
  if (!validated.ok) return validated
  return operation(authorized.value)
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
  record.window.on('maximize', emit)
  record.window.on('unmaximize', emit)
  record.window.on('minimize', emit)
  record.window.on('restore', emit)
  record.window.on('focus', emit)
  record.window.on('blur', emit)
  owners.track(record.id, () => {
    record.window.removeListener('maximize', emit)
    record.window.removeListener('unmaximize', emit)
    record.window.removeListener('minimize', emit)
    record.window.removeListener('restore', emit)
    record.window.removeListener('focus', emit)
    record.window.removeListener('blur', emit)
  })
  record.window.once('closed', () => {
    windowsByContents.delete(contentsId)
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

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) void createMarkzenWindow()
})

Object.defineProperty(app, 'markzenShellHarness', {
  configurable: false,
  enumerable: false,
  value: Object.freeze({ createMarkzenWindow, emitWindowStateForShellTest, getWindowOptionsForPlatform, runRealFsRoundTrip }),
  writable: false,
})

void start()
