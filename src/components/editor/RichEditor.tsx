import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { Markdown } from "@tiptap/markdown";
import { useEditorStore } from "../../store/editorStore";
import { sampleContent } from "../../lib/sampleContent";

export function RichEditor() {
  const setReady = useEditorStore((s) => s.setReady);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Markdown,
    ],
    content: sampleContent,
    contentType: "markdown",
    onCreate: () => setReady(true),
    onDestroy: () => setReady(false),
  });

  if (!editor) {
    return null;
  }

  return <EditorContent editor={editor} />;
}
