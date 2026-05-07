import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useFileSystemStore } from "../store/fileSystemStore";

interface FolderChangedPayload {
  root: string;
  paths: string[];
}

export function useFileWatcher(folderPath: string | null) {
  useEffect(() => {
    if (!folderPath) return;

    let unlisten: (() => void) | null = null;
    let cancelled = false;

    async function setup() {
      const unlistenFn = await listen<FolderChangedPayload>(
        "folder-changed",
        (event) => {
          if (event.payload.root === folderPath) {
            useFileSystemStore.getState().refreshDirs(event.payload.paths);
          }
        },
      );

      if (cancelled) {
        unlistenFn();
        return;
      }

      unlisten = unlistenFn;

      try {
        await invoke("start_watching", { path: folderPath });
      } catch {
        unlisten();
        unlisten = null;
      }
    }

    setup();

    return () => {
      cancelled = true;
      unlisten?.();
      invoke("stop_watching", { path: folderPath }).catch(() => {});
    };
  }, [folderPath]);
}
