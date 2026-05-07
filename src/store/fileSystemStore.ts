import { create } from "zustand";
import { readDir } from "@tauri-apps/plugin-fs";
import type { FileTreeEntry } from "../types/fileTree";

interface FileSystemState {
  folderPath: string | null;
  expandedDirs: Set<string>;
  dirChildren: Record<string, FileTreeEntry[]>;
  loadingDirs: Record<string, boolean>;
  setFolderPath: (path: string) => Promise<void>;
  toggleDir: (dirPath: string) => Promise<void>;
  refreshDirs: (changedPaths: string[]) => Promise<void>;
}

function sortEntries(entries: FileTreeEntry[]): FileTreeEntry[] {
  return [...entries].sort((a, b) => {
    if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1;
    return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
  });
}

async function loadChildren(dirPath: string): Promise<FileTreeEntry[]> {
  const raw = await readDir(dirPath);
  const entries: FileTreeEntry[] = raw
    .filter((e) => !e.name.startsWith("."))
    .map((e) => ({
      name: e.name,
      path: dirPath + "/" + e.name,
      isDirectory: e.isDirectory,
    }));
  return sortEntries(entries);
}

export const useFileSystemStore = create<FileSystemState>((set, get) => ({
  folderPath: null,
  expandedDirs: new Set<string>(),
  dirChildren: {},
  loadingDirs: {},

  setFolderPath: async (path) => {
    set({ folderPath: path, expandedDirs: new Set<string>(), dirChildren: {} });
    await get().toggleDir(path);
  },

  refreshDirs: async (changedPaths) => {
    const { expandedDirs, dirChildren, folderPath } = get();
    if (!folderPath) return;

    const toRefresh: string[] = [];
    const toInvalidate: string[] = [];

    for (const changed of changedPaths) {
      if (expandedDirs.has(changed) || changed === folderPath) {
        toRefresh.push(changed);
      } else if (changed in dirChildren) {
        toInvalidate.push(changed);
      }
    }

    if (toInvalidate.length > 0) {
      set((s) => {
        const next = { ...s.dirChildren };
        for (const p of toInvalidate) delete next[p];
        return { dirChildren: next };
      });
    }

    if (toRefresh.length > 0) {
      const results = await Promise.all(
        toRefresh.map(async (dir) => ({
          dir,
          children: await loadChildren(dir),
        })),
      );
      set((s) => {
        const next = { ...s.dirChildren };
        for (const { dir, children } of results) {
          next[dir] = children;
        }
        return { dirChildren: next };
      });
    }
  },

  toggleDir: async (dirPath) => {
    const { expandedDirs, dirChildren } = get();

    if (expandedDirs.has(dirPath)) {
      const next = new Set(expandedDirs);
      next.delete(dirPath);
      set({ expandedDirs: next });
      return;
    }

    const next = new Set(expandedDirs);
    next.add(dirPath);

    if (dirChildren[dirPath]) {
      set({ expandedDirs: next });
      return;
    }

    set({
      expandedDirs: next,
      loadingDirs: { ...get().loadingDirs, [dirPath]: true },
    });

    try {
      const children = await loadChildren(dirPath);
      set((s) => ({
        dirChildren: { ...s.dirChildren, [dirPath]: children },
        loadingDirs: { ...s.loadingDirs, [dirPath]: false },
      }));
    } catch {
      set((s) => ({
        loadingDirs: { ...s.loadingDirs, [dirPath]: false },
      }));
    }
  },
}));
