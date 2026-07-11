import { contextBridge, ipcRenderer } from 'electron'

import {
  MARKZEN_API_VERSION,
  type BootstrapPayload,
  type MarkzenApi,
  type PlatformResult,
  type WindowState,
} from '../contracts'
import { channels } from './channels'

const invoke = <T>(channel: string): Promise<PlatformResult<T>> => ipcRenderer.invoke(channel, {}) as Promise<PlatformResult<T>>

const api: MarkzenApi = deepFreeze({
  bootstrap: () => invoke<BootstrapPayload>(channels.bootstrap),
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
