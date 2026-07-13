import { Menu, type MenuItemConstructorOptions } from 'electron'

import type { ApplicationCommand, PlatformName } from '../contracts'

export function installApplicationMenu(platform: PlatformName, dispatch: (command: ApplicationCommand) => void): void {
  Menu.setApplicationMenu(Menu.buildFromTemplate(buildApplicationMenuTemplate(platform, dispatch)))
}

export function buildApplicationMenuTemplate(
  platform: PlatformName,
  dispatch: (command: ApplicationCommand) => void = () => undefined,
): MenuItemConstructorOptions[] {
  const mac = platform === 'darwin'
  const file: MenuItemConstructorOptions = {
    label: 'File',
    submenu: [
      command('New File', 'CmdOrCtrl+N', 'new', dispatch),
      command('Open…', 'CmdOrCtrl+O', 'open', dispatch),
      command('Open Folder…', 'CmdOrCtrl+Shift+O', 'open-folder', dispatch),
      command('Add Folder…', undefined, 'add-folder', dispatch),
      { type: 'separator' },
      command('Save', 'CmdOrCtrl+S', 'save', dispatch),
      command('Save As…', 'CmdOrCtrl+Shift+S', 'save-as', dispatch),
      command('Save All', undefined, 'save-all', dispatch),
      { type: 'separator' },
      command('Close Tab', 'CmdOrCtrl+W', 'close-tab', dispatch),
      command('Close Window', 'CmdOrCtrl+Shift+W', 'close-window', dispatch),
      ...(!mac ? [{ type: 'separator' as const }, { accelerator: platform === 'win32' ? 'Alt+F4' : 'Ctrl+Q', role: 'quit' as const }] : []),
    ],
  }
  const edit: MenuItemConstructorOptions = {
    label: 'Edit',
    submenu: [
      { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
      { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' },
    ],
  }
  return [
    ...(mac ? [{ label: 'Markzen', submenu: [{ role: 'about' as const }, { type: 'separator' as const }, { role: 'hide' as const }, { accelerator: 'Cmd+Q', role: 'quit' as const }] }] : []),
    file,
    edit,
    ...(!mac ? [{ label: 'Help', submenu: [{ role: 'about' as const }] }] : []),
  ]
}

const command = (
  label: string,
  accelerator: string | undefined,
  intent: ApplicationCommand,
  dispatch: (command: ApplicationCommand) => void,
): MenuItemConstructorOptions => ({
  ...(accelerator ? { accelerator } : {}),
  click: () => dispatch(intent),
  id: `markzen-${intent}`,
  label,
})
