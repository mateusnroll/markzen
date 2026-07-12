import { contextBridge, ipcRenderer } from 'electron'

import {
  MARKZEN_API_VERSION,
  type BootstrapPayload,
  type DocumentIntentOutcome,
  type DocumentCommand,
  type DocumentExternalEvent,
  type DocumentWriteRequest,
  type DocumentMenuState,
  type MarkzenApi,
  type PlatformResult,
  type TabId,
  type DiskVersion,
  type WindowState,
} from '../contracts'
import { channels } from './channels'

const invoke = <T>(channel: string, payload: unknown = {}): Promise<PlatformResult<T>> =>
  ipcRenderer.invoke(channel, payload) as Promise<PlatformResult<T>>

const api: MarkzenApi = deepFreeze({
  bootstrap: () => invoke<BootstrapPayload>(channels.bootstrap),
  document: {
    acceptExternal: (tabId: TabId, generation: number, diskVersion: DiskVersion) =>
      invoke<void>(channels.documentAcceptExternal, { diskVersion, generation, tabId }),
    close: (tabId: TabId, generation: number) => invoke<void>(channels.documentClose, { generation, tabId }),
    confirmClose: (tabId: TabId, generation: number, name: string) =>
      invoke<'cancel' | 'discard' | 'save'>(channels.documentConfirmClose, { generation, name, tabId }),
    confirmWindowClose: (dirtyNames: readonly string[]) =>
      invoke<'cancel' | 'discard' | 'save-all'>(channels.documentConfirmWindowClose, { dirtyNames }),
    completeQuitSaveAll: (success: boolean) => invoke<void>(channels.documentQuitSaveAllComplete, { success }),
    createTab: () => invoke<TabId>(channels.documentCreateTab),
    open: (tabId: TabId, generation: number) => invoke<DocumentIntentOutcome>(channels.documentOpen, { generation, tabId }),
    onCommand(listener: (command: DocumentCommand) => void) {
      const wrapped = (_event: Electron.IpcRendererEvent, command: DocumentCommand) => listener(command)
      ipcRenderer.on(channels.documentCommand, wrapped)
      return () => ipcRenderer.removeListener(channels.documentCommand, wrapped)
    },
    onExternalChange(listener: (event: DocumentExternalEvent) => void) {
      const wrapped = (_event: Electron.IpcRendererEvent, external: DocumentExternalEvent) => listener(external)
      ipcRenderer.on(channels.documentExternal, wrapped)
      return () => ipcRenderer.removeListener(channels.documentExternal, wrapped)
    },
    overwriteExternal: (request: DocumentWriteRequest & { readonly diskVersion: DiskVersion }) =>
      invoke<DocumentIntentOutcome>(channels.documentOverwriteExternal, request),
    retryCleanup: (tabId: TabId, generation: number) =>
      invoke<DocumentIntentOutcome>(channels.documentRetryCleanup, { generation, tabId }),
    save: (request: DocumentWriteRequest) => invoke<DocumentIntentOutcome>(channels.documentSave, request),
    saveAndRename: (request: DocumentWriteRequest) => invoke<DocumentIntentOutcome>(channels.documentSaveAndRename, request),
    saveAs: (request: DocumentWriteRequest) => invoke<DocumentIntentOutcome>(channels.documentSaveAs, request),
    updateMenuState: (state: DocumentMenuState) => invoke<void>(channels.documentUpdateMenuState, state),
  },
  version: MARKZEN_API_VERSION,
  window: {
    close: () => invoke<void>(channels.windowClose),
    getState: () => invoke<WindowState>(channels.windowGetState),
    minimize: () => invoke<void>(channels.windowMinimize),
    onState(listener: (state: WindowState) => void) {
      const wrapped = (_event: Electron.IpcRendererEvent, state: WindowState) => listener(state)
      ipcRenderer.on(channels.windowState, wrapped)
      return () => ipcRenderer.removeListener(channels.windowState, wrapped)
    },
    toggleMaximize: () => invoke<void>(channels.windowToggleMaximize),
  },
})

contextBridge.exposeInMainWorld('markzen', api)

function deepFreeze<T>(value: T): T {
  if ((typeof value !== 'object' && typeof value !== 'function') || value === null || Object.isFrozen(value)) return value
  for (const child of Object.values(value as Record<string, unknown>)) deepFreeze(child)
  return Object.freeze(value)
}
