import { Menu, Submenu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { editorRef } from "./editorRef";
import { openFile, saveFile, saveFileAs, newFile } from "./fileOperations";
import { openFolder } from "./folderOperations";
import { useTabsStore } from "../store/tabsStore";
import { closeTabAndFocus } from "./tabSwitch";

export async function setupMenu(): Promise<void> {
  const newFileItem = await MenuItem.new({
    id: "file-new",
    text: "New File",
    accelerator: "CmdOrCtrl+N",
    action: () => {
      if (editorRef.current) newFile(editorRef.current);
    },
  });

  const openItem = await MenuItem.new({
    id: "file-open",
    text: "Open File...",
    accelerator: "CmdOrCtrl+O",
    action: () => {
      if (editorRef.current) openFile(editorRef.current);
    },
  });

  const openFolderItem = await MenuItem.new({
    id: "file-open-folder",
    text: "Open Folder...",
    accelerator: "CmdOrCtrl+Shift+O",
    action: () => {
      openFolder();
    },
  });

  const saveItem = await MenuItem.new({
    id: "file-save",
    text: "Save",
    accelerator: "CmdOrCtrl+S",
    action: () => {
      if (editorRef.current) saveFile(editorRef.current);
    },
  });

  const saveAsItem = await MenuItem.new({
    id: "file-save-as",
    text: "Save As...",
    accelerator: "CmdOrCtrl+Shift+S",
    action: () => {
      if (editorRef.current) saveFileAs(editorRef.current);
    },
  });

  const closeTabItem = await MenuItem.new({
    id: "file-close-tab",
    text: "Close Tab",
    accelerator: "CmdOrCtrl+W",
    action: () => {
      const { activeTabId } = useTabsStore.getState();
      if (!activeTabId || !editorRef.current) return;
      closeTabAndFocus(editorRef.current, activeTabId);
    },
  });

  const appSubmenu = await Submenu.new({
    text: "Markzen",
    items: [
      await PredefinedMenuItem.new({ item: { About: null } }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Services" }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Hide" }),
      await PredefinedMenuItem.new({ item: "HideOthers" }),
      await PredefinedMenuItem.new({ item: "ShowAll" }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Quit" }),
    ],
  });

  const fileSubmenu = await Submenu.new({
    text: "File",
    items: [
      newFileItem,
      await PredefinedMenuItem.new({ item: "Separator" }),
      openItem,
      openFolderItem,
      await PredefinedMenuItem.new({ item: "Separator" }),
      saveItem,
      saveAsItem,
      await PredefinedMenuItem.new({ item: "Separator" }),
      closeTabItem,
      await PredefinedMenuItem.new({ item: "CloseWindow" }),
    ],
  });

  const editSubmenu = await Submenu.new({
    text: "Edit",
    items: [
      await PredefinedMenuItem.new({ item: "Undo" }),
      await PredefinedMenuItem.new({ item: "Redo" }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "Cut" }),
      await PredefinedMenuItem.new({ item: "Copy" }),
      await PredefinedMenuItem.new({ item: "Paste" }),
      await PredefinedMenuItem.new({ item: "Separator" }),
      await PredefinedMenuItem.new({ item: "SelectAll" }),
    ],
  });

  const menu = await Menu.new({
    items: [appSubmenu, fileSubmenu, editSubmenu],
  });

  await menu.setAsAppMenu();
}
