import { useEffect } from "react";
import { useEditor, EditorContent, Extension } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { Table } from "@tiptap/extension-table";
import { TableRow } from "@tiptap/extension-table-row";
import { TableCell } from "@tiptap/extension-table-cell";
import { TableHeader } from "@tiptap/extension-table-header";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEditorStore } from "../../store/editorStore";
import { useTabsStore } from "../../store/tabsStore";
import { editorRef } from "../../lib/editorRef";

const TauriLinkOpener = Extension.create({
  name: "tauriLinkOpener",
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("tauriLinkOpener"),
        props: {
          handleDOMEvents: {
            click(_view, event) {
              const target = event.target as HTMLElement;
              const link = target.closest("a");
              if (!link) return false;
              const href = link.getAttribute("href");
              if (href) {
                event.preventDefault();
                event.stopPropagation();
                openUrl(href);
                return true;
              }
              return false;
            },
          },
        },
      }),
    ];
  },
});

export function RichEditor() {
  const setReady = useEditorStore((s) => s.setReady);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        link: { openOnClick: false, HTMLAttributes: { target: null } },
      }),
      Markdown,
      Table,
      TableRow,
      TableCell,
      TableHeader,
      TauriLinkOpener,
    ],
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
