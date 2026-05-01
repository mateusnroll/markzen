import type { Editor } from "@tiptap/react";
import { confirm } from "@tauri-apps/plugin-dialog";
import { useTabsStore } from "../store/tabsStore";
import { extractFilename } from "./fileOperations";

function getScrollContainer(): HTMLElement | null {
  return document.querySelector(".ProseMirror")?.parentElement ?? null;
}

export function switchTab(
  editor: Editor,
  fromTabId: string,
  toTabId: string,
): void {
  if (fromTabId === toTabId) return;

  const store = useTabsStore.getState();
  const targetTab = store.tabs.find((t) => t.id === toTabId);
  if (!targetTab) return;

  const scrollTop = getScrollContainer()?.scrollTop ?? 0;
  store.updateTab(fromTabId, {
    editorState: editor.state,
    content: editor.getMarkdown(),
    scrollTop,
  });

  if (targetTab.editorState) {
    editor.view.updateState(targetTab.editorState);
  } else {
    editor.commands.setContent(targetTab.content, {
      emitUpdate: false,
      contentType: "markdown",
    });
    editor.commands.focus("end");
  }

  store.setActiveTab(toTabId);

  requestAnimationFrame(() => {
    editor.view.focus();
    const container = getScrollContainer();
    if (container) container.scrollTop = targetTab.scrollTop;
  });
}

export function loadTabIntoEditor(editor: Editor, tabId: string): void {
  const tab = useTabsStore.getState().tabs.find((t) => t.id === tabId);
  if (!tab) return;

  if (tab.editorState) {
    editor.view.updateState(tab.editorState);
  } else {
    editor.commands.setContent(tab.content, {
      emitUpdate: false,
      contentType: "markdown",
    });
    editor.commands.focus("end");
  }

  requestAnimationFrame(() => {
    editor.view.focus();
  });
}

export function getDirtyTabCount(): number {
  return useTabsStore.getState().tabs.filter((t) => t.isDirty).length;
}

export async function confirmCloseWindow(): Promise<boolean> {
  const dirtyCount = getDirtyTabCount();
  if (dirtyCount === 0) return true;

  if (dirtyCount === 1) {
    const dirty = useTabsStore.getState().tabs.find((t) => t.isDirty)!;
    const name = dirty.filePath ? extractFilename(dirty.filePath) : "Untitled";
    return confirm(
      `Are you sure you want to close ${name}? Unsaved changes will be lost.`,
      { title: "Markzen", kind: "warning" },
    );
  }

  return confirm(
    `Are you sure you want to close Markzen? Unsaved changes in ${dirtyCount} files will be lost.`,
    { title: "Markzen", kind: "warning" },
  );
}

export async function closeTabAndFocus(
  editor: Editor,
  tabId: string,
): Promise<void> {
  const store = useTabsStore.getState();
  const tab = store.tabs.find((t) => t.id === tabId);
  if (!tab) return;

  if (tab.isDirty) {
    const name = tab.filePath ? extractFilename(tab.filePath) : "Untitled";
    const ok = await confirm(
      `Are you sure you want to close ${name}? Unsaved changes will be lost.`,
      { title: "Markzen", kind: "warning" },
    );
    if (!ok) return;
  }

  if (tabId === store.activeTabId) {
    store.updateTab(tabId, {
      editorState: editor.state,
      content: editor.getMarkdown(),
    });
  }

  store.closeTab(tabId);

  const next = useTabsStore.getState();
  if (next.activeTabId) {
    loadTabIntoEditor(editor, next.activeTabId);
  }
}
