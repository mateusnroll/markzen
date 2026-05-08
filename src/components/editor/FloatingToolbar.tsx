import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { type Editor } from "@tiptap/react";

interface FloatingToolbarProps {
  editor: Editor;
  linkInputVisible: boolean;
  setLinkInputVisible: (visible: boolean) => void;
}

interface ToolbarButton {
  icon: React.ReactNode;
  title: string;
  action: () => void;
  isActive: () => boolean;
}

function BoldIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
      <path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z" />
    </svg>
  );
}

function ItalicIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="19" y1="4" x2="10" y2="4" />
      <line x1="14" y1="20" x2="5" y2="20" />
      <line x1="15" y1="4" x2="9" y2="20" />
    </svg>
  );
}

function StrikethroughIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 4H9a3 3 0 0 0-3 3c0 1.4.8 2.6 2 3.2" />
      <path d="M15 13.8c1.2.6 2 1.8 2 3.2a3 3 0 0 1-3 3H8" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </svg>
  );
}

function CodeIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="16 18 22 12 16 6" />
      <polyline points="8 6 2 12 8 18" />
    </svg>
  );
}

function BulletListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="9" y1="6" x2="20" y2="6" />
      <line x1="9" y1="12" x2="20" y2="12" />
      <line x1="9" y1="18" x2="20" y2="18" />
      <circle cx="4.5" cy="6" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="12" r="1" fill="currentColor" stroke="none" />
      <circle cx="4.5" cy="18" r="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function OrderedListIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <line x1="10" y1="6" x2="20" y2="6" />
      <line x1="10" y1="12" x2="20" y2="12" />
      <line x1="10" y1="18" x2="20" y2="18" />
      <text x="3" y="7.5" fontSize="7" fontWeight="600" fill="currentColor" stroke="none" fontFamily="sans-serif">1</text>
      <text x="3" y="13.5" fontSize="7" fontWeight="600" fill="currentColor" stroke="none" fontFamily="sans-serif">2</text>
      <text x="3" y="19.5" fontSize="7" fontWeight="600" fill="currentColor" stroke="none" fontFamily="sans-serif">3</text>
    </svg>
  );
}

function BlockquoteIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V20c0 1 0 1 1 1z" />
      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3c0 1 0 1 1 1z" />
    </svg>
  );
}

function LinkIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
      <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
    </svg>
  );
}

function HeadingIcon({ level }: { level: number }) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4v16" />
      <path d="M4 12h12" />
      <path d="M16 4v16" />
      <text x="20" y="20" fontSize="8" fontWeight="700" fill="currentColor" stroke="none" fontFamily="sans-serif">{level}</text>
    </svg>
  );
}

function LinkInputPopover({
  editor,
  onClose,
}: {
  editor: Editor;
  onClose: () => void;
}) {
  const [url, setUrl] = useState(editor.getAttributes("link").href ?? "");
  const inputRef = useCallback((node: HTMLInputElement | null) => {
    if (node) node.focus();
  }, []);
  const popoverRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const updatePosition = useCallback(() => {
    const { from, to } = editor.state.selection;
    const start = editor.view.coordsAtPos(from);
    const end = editor.view.coordsAtPos(to);
    const centerX = (start.left + end.right) / 2;
    setPos({ top: start.top - 8, left: centerX });
  }, [editor]);

  const submit = useCallback(() => {
    const trimmed = url.trim();
    if (trimmed) {
      editor.chain().focus().setLink({ href: trimmed }).run();
    }
    onClose();
  }, [url, editor, onClose]);

  const cancel = useCallback(() => {
    onClose();
    editor.commands.focus();
  }, [onClose, editor]);

  useEffect(() => {
    updatePosition();
  }, [updatePosition]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        cancel();
      }
    };
    document.addEventListener("mousedown", handleMouseDown);
    return () => document.removeEventListener("mousedown", handleMouseDown);
  }, [cancel]);

  if (!pos) return null;

  return createPortal(
    <div
      ref={popoverRef}
      className="link-input-popover"
      style={{ top: pos.top, left: pos.left }}
    >
      <input
        ref={inputRef}
        type="url"
        placeholder="https://..."
        value={url}
        onChange={(e) => setUrl(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
          if (e.key === "Escape") cancel();
        }}
      />
      <button type="button" onClick={submit} title="Apply link">
        &#x2713;
      </button>
    </div>,
    document.body,
  );
}

export function FloatingToolbar({ editor, linkInputVisible, setLinkInputVisible }: FloatingToolbarProps) {

  const handleLink = useCallback(() => {
    if (editor.isActive("link")) {
      editor.chain().focus().unsetLink().run();
      return;
    }
    setLinkInputVisible(true);
  }, [editor]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        handleLink();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [handleLink]);

  const groups: ToolbarButton[][] = [
    [
      { icon: <BoldIcon />, title: "Bold", action: () => editor.chain().focus().toggleBold().run(), isActive: () => editor.isActive("bold") },
      { icon: <ItalicIcon />, title: "Italic", action: () => editor.chain().focus().toggleItalic().run(), isActive: () => editor.isActive("italic") },
      { icon: <StrikethroughIcon />, title: "Strikethrough", action: () => editor.chain().focus().toggleStrike().run(), isActive: () => editor.isActive("strike") },
      { icon: <CodeIcon />, title: "Code", action: () => editor.chain().focus().toggleCode().run(), isActive: () => editor.isActive("code") },
    ],
    [
      { icon: <HeadingIcon level={1} />, title: "Heading 1", action: () => editor.chain().focus().toggleHeading({ level: 1 }).run(), isActive: () => editor.isActive("heading", { level: 1 }) },
      { icon: <HeadingIcon level={2} />, title: "Heading 2", action: () => editor.chain().focus().toggleHeading({ level: 2 }).run(), isActive: () => editor.isActive("heading", { level: 2 }) },
      { icon: <HeadingIcon level={3} />, title: "Heading 3", action: () => editor.chain().focus().toggleHeading({ level: 3 }).run(), isActive: () => editor.isActive("heading", { level: 3 }) },
      { icon: <HeadingIcon level={4} />, title: "Heading 4", action: () => editor.chain().focus().toggleHeading({ level: 4 }).run(), isActive: () => editor.isActive("heading", { level: 4 }) },
    ],
    [
      { icon: <BulletListIcon />, title: "Bullet List", action: () => editor.chain().focus().toggleBulletList().run(), isActive: () => editor.isActive("bulletList") },
      { icon: <OrderedListIcon />, title: "Ordered List", action: () => editor.chain().focus().toggleOrderedList().run(), isActive: () => editor.isActive("orderedList") },
      { icon: <BlockquoteIcon />, title: "Blockquote", action: () => editor.chain().focus().toggleBlockquote().run(), isActive: () => editor.isActive("blockquote") },
    ],
    [
      { icon: <LinkIcon />, title: "Link", action: handleLink, isActive: () => editor.isActive("link") },
    ],
  ];

  return (
    <div className="floating-toolbar">
      {groups.map((group, gi) => (
        <div key={gi} className="floating-toolbar-group">
          {group.map((btn) => (
            <button
              key={btn.title}
              type="button"
              className={`floating-toolbar-btn${btn.isActive() ? " is-active" : ""}`}
              onClick={btn.action}
              title={btn.title}
            >
              {btn.icon}
            </button>
          ))}
        </div>
      ))}
      {linkInputVisible && (
        <LinkInputPopover
          editor={editor}
          onClose={() => setLinkInputVisible(false)}
        />
      )}
    </div>
  );
}
