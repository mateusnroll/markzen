import type { Editor } from "@tiptap/react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { readTextFile, writeTextFile } from "@tauri-apps/plugin-fs";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useFileStore } from "../store/fileStore";

export function extractFilename(path: string): string {
  return path.split("/").pop()?.split("\\").pop() ?? path;
}

export function updateWindowTitle(filePath: string | null, isDirty: boolean): void {
  const name = filePath ? extractFilename(filePath) : "Untitled";
  const dirty = isDirty ? " — Edited" : "";
  getCurrentWindow().setTitle(`${name}${dirty} — Markzen`);
}

export async function openFile(editor: Editor): Promise<void> {
  const selected = await open({
    multiple: false,
    filters: [{ name: "Markdown", extensions: ["md", "markdown", "txt"] }],
  });

  if (!selected) return;

  const content = await readTextFile(selected);
  editor.commands.setContent(content, { emitUpdate: false, contentType: "markdown" });

  const { setFilePath, setDirty } = useFileStore.getState();
  setFilePath(selected);
  setDirty(false);
  updateWindowTitle(selected, false);
}

export async function saveFile(editor: Editor): Promise<void> {
  const { filePath } = useFileStore.getState();

  if (!filePath) {
    return saveFileAs(editor);
  }

  const markdown = editor.getMarkdown();
  await writeTextFile(filePath, markdown);

  useFileStore.getState().setDirty(false);
  updateWindowTitle(filePath, false);
}

export async function saveFileAs(editor: Editor): Promise<void> {
  const { filePath } = useFileStore.getState();

  const selected = await save({
    ...(filePath ? { defaultPath: filePath } : {}),
    filters: [{ name: "Markdown", extensions: ["md"] }],
  });

  if (!selected) return;

  const markdown = editor.getMarkdown();
  await writeTextFile(selected, markdown);

  const { setFilePath, setDirty } = useFileStore.getState();
  setFilePath(selected);
  setDirty(false);
  updateWindowTitle(selected, false);
}
