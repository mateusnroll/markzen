import type { EditorState } from "@tiptap/pm/state";

export interface Tab {
  readonly id: string;
  filePath: string | null;
  content: string;
  editorState: EditorState | null;
  isDirty: boolean;
  scrollTop: number;
  editorMode: "rich" | "source";
}
