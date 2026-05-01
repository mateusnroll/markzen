import { useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { useEditorStore } from "../../store/editorStore";
import { useFileStore } from "../../store/fileStore";
import { editorRef } from "../../lib/editorRef";

export function RichEditor() {
  const setReady = useEditorStore((s) => s.setReady);

  const editor = useEditor({
    extensions: [StarterKit, Markdown],
    onCreate: () => setReady(true),
    onUpdate: () => {
      useFileStore.getState().setDirty(true);
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
