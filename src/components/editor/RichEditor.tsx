import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { useEditorStore } from "../../store/editorStore";
import { useTabsStore } from "../../store/tabsStore";
import { editorRef } from "../../lib/editorRef";

export function RichEditor() {
  const setReady = useEditorStore((s) => s.setReady);

  const editor = useEditor({
    extensions: [StarterKit, Markdown, Table, TableRow, TableCell, TableHeader],
    onCreate: () => setReady(true),
    onUpdate: () => {
      const { activeTabId, updateTab } = useTabsStore.getState();
      if (activeTabId) {
        updateTab(activeTabId, { isDirty: true });
      }
    },
    onBlur: ({ editor: e }) => {
      const { activeTabId, updateTab } = useTabsStore.getState();
      if (activeTabId) {
        updateTab(activeTabId, { content: e.getMarkdown() });
      }
    },
    onDestroy: () => setReady(false),
  });

  useEffect(() => {
    editorRef.current = editor;
    return () => {
      editorRef.current = null;
    };
  }, [editor]);

  if (!editor) {
    return null;
  }

  return <EditorContent editor={editor} />;
}
