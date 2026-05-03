import { open } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTabsStore } from "../store/tabsStore";
import { useFileSystemStore } from "../store/fileSystemStore";

function extractFolderName(path: string): string {
  return path.split("/").pop()?.split("\\").pop() ?? path;
}

function isEmptySingleFileWindow(): boolean {
  if (useFileSystemStore.getState().folderPath) return false;
  const { tabs } = useTabsStore.getState();
  return tabs.length === 1 && !tabs[0].filePath && !tabs[0].isDirty && !tabs[0].content;
}

export async function openFolder(): Promise<void> {
  const selected = await open({ directory: true });
  if (!selected) return;

  const shouldCloseThis = isEmptySingleFileWindow();

  const label = "folder-" + crypto.randomUUID();
  const webview = new WebviewWindow(label, {
    url: "/?folder=" + encodeURIComponent(selected),
    title: extractFolderName(selected) + " — Markzen",
    width: 1200,
    height: 800,
    titleBarStyle: "overlay",
  });

  webview.once("tauri://created", async () => {
    await invoke("setup_window_decorum");
  });

  if (shouldCloseThis) {
    getCurrentWindow().destroy();
  }
}
