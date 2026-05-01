import type { Editor } from "@tiptap/react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useTabsStore, getActiveTab } from "../store/tabsStore";
import { switchTab } from "./tabSwitch";

export function extractFilename(path: string): string {
  return path.split("/").pop()?.split("\\").pop() ?? path;
}

export function updateWindowTitle(): void {
  const tab = getActiveTab();
  const name = tab?.filePath ? extractFilename(tab.filePath) : "Untitled";
  const dirty = tab?.isDirty ? " — Edited" : "";
  getCurrentWindow().setTitle(`${name}${dirty} — Markzen`);
}

export async function openFile(editor: Editor): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
  });

  if (!selected) return;

  const store = useTabsStore.getState();
  const existing = store.tabs.find((t) => t.filePath === selected);
  if (existing) {
    if (existing.id !== store.activeTabId) {
      switchTab(editor, store.activeTabId!, existing.id);
    }
    return;
  }

  const content = await readTextFile(selected);

  const activeTab = getActiveTab();
  const reuseActive =
    activeTab && !activeTab.filePath && !activeTab.isDirty && !activeTab.content;

  if (reuseActive) {
    editor.commands.setContent(content, {
      emitUpdate: false,
      contentType: "markdown",
    });
    store.updateTab(activeTab.id, {
      filePath: selected,
      content,
      isDirty: false,
      editorState: null,
    });
  } else {
    const prevActiveId = store.activeTabId;
    if (prevActiveId) {
      useTabsStore.getState().updateTab(prevActiveId, {
        editorState: editor.state,
        content: editor.getMarkdown(),
      });
    }
    store.addTab({ filePath: selected, content });
    editor.commands.setContent(content, {
      emitUpdate: false,
      contentType: "markdown",
    });
  }

  editor.commands.focus("start");
  updateWindowTitle();
}

export async function saveFile(editor: Editor): Promise<void> {
  const tab = getActiveTab();
  if (!tab) return;

  if (!tab.filePath) {
    return saveFileAs(editor);
  }

  const markdown = editor.getMarkdown();
  await writeTextFile(tab.filePath, markdown);

  useTabsStore.getState().updateTab(tab.id, { isDirty: false, content: markdown });
  updateWindowTitle();
}

export async function saveFileAs(editor: Editor): Promise<void> {
  const tab = getActiveTab();
  if (!tab) return;

  const selected = await save({
    ...(tab.filePath ? { defaultPath: tab.filePath } : {}),
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });

  if (!selected) return;

  const markdown = editor.getMarkdown();
  await writeTextFile(selected, markdown);

  useTabsStore.getState().updateTab(tab.id, {
    filePath: selected,
    isDirty: false,
    content: markdown,
  });
  updateWindowTitle();
}

export async function openFileFromTree(
  editor: Editor,
  filePath: string,
): Promise<void> {
  const store = useTabsStore.getState();
  const existing = store.tabs.find((t) => t.filePath === filePath);
  if (existing) {
    if (existing.id !== store.activeTabId) {
      switchTab(editor, store.activeTabId!, existing.id);
    }
    return;
  }

  const content = await readTextFile(filePath);

  const activeTab = getActiveTab();
  const reuseActive =
    activeTab && !activeTab.filePath && !activeTab.isDirty && !activeTab.content;

  if (reuseActive) {
    editor.commands.setContent(content, {
      emitUpdate: false,
      contentType: "markdown",
    });
    store.updateTab(activeTab.id, {
      filePath,
      content,
      isDirty: false,
      editorState: null,
    });
  } else {
    const prevActiveId = store.activeTabId;
    if (prevActiveId) {
      store.updateTab(prevActiveId, {
        editorState: editor.state,
        content: editor.getMarkdown(),
      });
    }
    store.addTab({ filePath, content });
    editor.commands.setContent(content, {
      emitUpdate: false,
      contentType: "markdown",
    });
  }

  editor.commands.focus("start");
  updateWindowTitle();
}

export function newFile(editor: Editor): void {
  const store = useTabsStore.getState();
  const currentId = store.activeTabId;

  if (currentId) {
    store.updateTab(currentId, {
      editorState: editor.state,
      content: editor.getMarkdown(),
    });
  }

  store.addTab();
  editor.commands.setContent("", { emitUpdate: false, contentType: "markdown" });
  updateWindowTitle();
}
