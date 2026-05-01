import { create } from "zustand";
import type { Tab } from "../types/tab";

interface TabsState {
  tabs: Tab[];
  activeTabId: string | null;
  addTab: (opts?: { filePath?: string; content?: string }) => string;
  closeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (
    id: string,
    patch: Partial<
      Pick<
        Tab,
        | "filePath"
        | "content"
        | "editorState"
        | "isDirty"
        | "scrollTop"
        | "editorMode"
      >
    >,
  ) => void;
}

function createTab(opts?: { filePath?: string; content?: string }): Tab {
  return {
    id: crypto.randomUUID(),
    filePath: opts?.filePath ?? null,
    content: opts?.content ?? "",
    editorState: null,
    isDirty: false,
    scrollTop: 0,
    editorMode: "rich",
  };
}

export const useTabsStore = create<TabsState>((set, get) => ({
  tabs: [],
  activeTabId: null,

  addTab: (opts) => {
    const tab = createTab(opts);
    set((s) => ({
      tabs: [...s.tabs, tab],
      activeTabId: tab.id,
    }));
    return tab.id;
  },

  closeTab: (id) => {
    const { tabs, activeTabId, addTab } = get();
    const index = tabs.findIndex((t) => t.id === id);
    if (index === -1) return;

    const remaining = tabs.filter((t) => t.id !== id);

    if (remaining.length === 0) {
      set({ tabs: [] });
      addTab();
      return;
    }

    const needsNewActive = activeTabId === id;
    const nextActiveId = needsNewActive
      ? remaining[Math.min(index, remaining.length - 1)]!.id
      : activeTabId;

    set({ tabs: remaining, activeTabId: nextActiveId });
  },

  setActiveTab: (id) => set({ activeTabId: id }),

  updateTab: (id, patch) =>
    set((s) => ({
      tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...patch } : t)),
    })),
}));

export function getActiveTab(): Tab | undefined {
  const { tabs, activeTabId } = useTabsStore.getState();
  return tabs.find((t) => t.id === activeTabId);
}
