import { useState, useRef, useCallback, useEffect } from "react";
import { createPortal } from "react-dom";
import { type Editor } from "@tiptap/react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { normalizeUrl } from "../../lib/url";

interface LinkHoverTooltipProps {
  editor: Editor;
  onEditLink: () => void;
}

function ExternalLinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
      <polyline points="15 3 21 3 21 9" />
      <line x1="10" y1="14" x2="21" y2="3" />
    </svg>
  );
}

function PencilIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

function UnlinkIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="m18.84 12.25 1.72-1.71h-.02a5.004 5.004 0 0 0-.12-7.07 5.006 5.006 0 0 0-6.95 0l-1.72 1.71" />
      <path d="m5.17 11.75-1.71 1.71a5.004 5.004 0 0 0 .12 7.07 5.006 5.006 0 0 0 6.95 0l1.71-1.71" />
      <line x1="8" y1="2" x2="8" y2="5" />
      <line x1="2" y1="8" x2="5" y2="8" />
      <line x1="16" y1="19" x2="16" y2="22" />
      <line x1="19" y1="16" x2="22" y2="16" />
    </svg>
  );
}

function truncateUrl(url: string, maxLen = 40): string {
  if (url.length <= maxLen) return url;
  return url.slice(0, maxLen - 1) + "…";
}

export function LinkHoverTooltip({ editor, onEditLink }: LinkHoverTooltipProps) {
  const [hoveredLink, setHoveredLink] = useState<{
    href: string;
    rect: DOMRect;
    element: HTMLAnchorElement;
  } | null>(null);
  const [visible, setVisible] = useState(false);
  const showTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const tooltipRef = useRef<HTMLDivElement>(null);

  const clearTimers = useCallback(() => {
    if (showTimerRef.current) clearTimeout(showTimerRef.current);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  const scheduleHide = useCallback(() => {
    clearTimers();
    hideTimerRef.current = setTimeout(() => {
      setVisible(false);
      setHoveredLink(null);
    }, 150);
  }, [clearTimers]);

  const cancelHide = useCallback(() => {
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
  }, []);

  useEffect(() => {
    const editorDom = editor.view.dom;

    const handleMouseOver = (e: Event) => {
      const target = (e as MouseEvent).target as HTMLElement;
      const link = target.closest("a") as HTMLAnchorElement | null;
      if (!link) return;
      const href = link.getAttribute("href");
      if (!href) return;

      cancelHide();
      clearTimers();
      showTimerRef.current = setTimeout(() => {
        setHoveredLink({ href, rect: link.getBoundingClientRect(), element: link });
        setVisible(true);
      }, 300);
    };

    const handleMouseOut = (e: Event) => {
      const target = (e as MouseEvent).relatedTarget as HTMLElement | null;
      if (target?.closest("a") || target?.closest(".link-hover-tooltip")) return;
      scheduleHide();
    };

    editorDom.addEventListener("mouseover", handleMouseOver);
    editorDom.addEventListener("mouseout", handleMouseOut);

    return () => {
      editorDom.removeEventListener("mouseover", handleMouseOver);
      editorDom.removeEventListener("mouseout", handleMouseOut);
      clearTimers();
    };
  }, [editor, clearTimers, cancelHide, scheduleHide]);

  useEffect(() => {
    const handleScroll = () => {
      setVisible(false);
      setHoveredLink(null);
    };
    const editorScroll = editor.view.dom.closest(".editor-pane");
    editorScroll?.addEventListener("scroll", handleScroll);
    return () => editorScroll?.removeEventListener("scroll", handleScroll);
  }, [editor]);

  const handleOpen = useCallback(() => {
    if (hoveredLink) openUrl(normalizeUrl(hoveredLink.href));
  }, [hoveredLink]);

  const handleEdit = useCallback(() => {
    if (!hoveredLink) return;
    const { element } = hoveredLink;
    const pos = editor.view.posAtDOM(element, 0);
    const end = pos + element.textContent!.length;
    editor.chain().focus().setTextSelection({ from: pos, to: end }).run();
    setVisible(false);
    setHoveredLink(null);
    onEditLink();
  }, [hoveredLink, editor, onEditLink]);

  const handleRemove = useCallback(() => {
    if (!hoveredLink) return;
    const { element } = hoveredLink;
    const pos = editor.view.posAtDOM(element, 0);
    const end = pos + element.textContent!.length;
    editor.chain().focus().setTextSelection({ from: pos, to: end }).unsetLink().run();
    setVisible(false);
    setHoveredLink(null);
  }, [hoveredLink, editor]);

  if (!visible || !hoveredLink) return null;

  const { rect } = hoveredLink;

  return createPortal(
    <div
      ref={tooltipRef}
      className="link-hover-tooltip"
      style={{ top: rect.bottom + 4, left: rect.left }}
      onMouseEnter={cancelHide}
      onMouseLeave={scheduleHide}
    >
      <span className="link-hover-url" title={hoveredLink.href}>
        {truncateUrl(hoveredLink.href)}
      </span>
      <div className="link-hover-actions">
        <button type="button" onClick={handleOpen} title="Open link">
          <ExternalLinkIcon />
        </button>
        <button type="button" onClick={handleEdit} title="Edit link">
          <PencilIcon />
        </button>
        <button type="button" onClick={handleRemove} title="Remove link">
          <UnlinkIcon />
        </button>
      </div>
    </div>,
    document.body,
  );
}
