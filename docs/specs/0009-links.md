# Spec 0009: Links

**Status:** Draft   **Date:** 2026-07
**Origin:** Old repo `TauriLinkOpener` (in `RichEditor.tsx`), `LinkHoverTooltip.tsx`, link popover in `FloatingToolbar.tsx`, `url.ts`; commits `a66f6ec` (hybrid click model), `752c4f1` (system browser).

## Problem

Links in a WYSIWYG editor have a fundamental tension: clicking must both *edit* (place the caret) and *follow* (open the URL). The hybrid model — plain click edits, mod+click follows, hover reveals actions — resolves it, and URLs must open in the system browser, never inside the app window.

## Non-goals

- Internal wiki-style links between notes (`[[...]]`); link auto-completion; backlinks.
- Fetching titles/previews of linked pages.
- Markdown link syntax editing (that's source mode, future spec).

## Behavior (acceptance criteria)

- AC1: Given a link in the document, when the user plain-clicks it, then the caret is placed (no navigation, no new window).
- AC2: Given a link, when the user Cmd/Ctrl+clicks it, then the URL opens in the system default browser via `Platform.shell.openExternal`; scheme-less hrefs (`example.com`) are normalized to `https://`.
- AC3: Given the user holds Cmd/Ctrl over the editor, then links style as followable (pointer affordance) until the key is released or the window blurs.
- AC4: Given the cursor hovers a link for ~300ms, then a tooltip appears below it showing the (truncated) URL and three actions: Open, Edit, Remove; it stays while hovered and hides shortly after the pointer leaves link and tooltip, or when the pane scrolls.
- AC5: Given the tooltip's Edit action, then the whole link text is selected and the URL input popover opens pre-filled with the current href; the Remove action unsets the link across its full text.
- AC6: Given selected text (or caret in a word), when the user presses Cmd/Ctrl+K or the toolbar Link button, then the URL input popover opens anchored to the selection; Enter applies the link, Escape cancels, clicking outside cancels.
- AC7: Given the caret is inside an existing link, when the user presses Cmd/Ctrl+K or the toolbar Link button, then the link is removed (toggle semantics).
- AC8: Given a document with links, when serialized, then standard `[text](url)` Markdown is produced, and parsing it back preserves the links (round-trip).

## Edge cases

- Link at the very end of the document (tooltip positioning, select-to-end).
- Nested marks (bold text inside a link) survive edit/remove.
- `mailto:`, `file:`, and other schemes pass through normalization untouched.
- Two adjacent links must be edited independently (selection must not bleed).
- Tooltip must not linger after the link is deleted mid-hover.

## Test mapping

| AC | Layer |
|----|-------|
| AC1–AC3 | Browser Mode (`openExternal` asserted on the platform fake) |
| AC4, AC5 | Browser Mode (clock control for hover delays) |
| AC6, AC7 | Browser Mode |
| AC8 | Node (round-trip over links fixture) |
| real system-browser open | Shell smoke (one journey) |

## Open questions

- (none)
