import { Menu, Submenu, MenuItem, PredefinedMenuItem } from "@tauri-apps/api/menu";
import { editorRef } from "./editorRef";
import { openFile, saveFile, saveFileAs } from "./fileOperations";

export async function setupMenu(): Promise<void> {
  const openItem = await MenuItem.new({
    id: "file-open",
    text: "Open...",
    accelerator: "CmdOrCtrl+O",
    action: () => {
      if (editorRef.current) openFile(editorRef.current);
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
      openItem,
      await PredefinedMenuItem.new({ item: "Separator" }),
      saveItem,
      saveAsItem,
      await PredefinedMenuItem.new({ item: "Separator" }),
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
