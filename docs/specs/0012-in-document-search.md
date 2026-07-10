# Spec 0012: In-Document Search

**Status:** Draft   **Date:** 2026-07
**Origin:** Old repo `SearchPanel.tsx`, `searchHighlight.ts` (ProseMirror decorations); commit `e0acd56`.

## Problem

Users need to find text inside the current document. A Cmd/Ctrl+F panel with live highlighting and match navigation is table stakes for any editor.

## Non-goals

- Replace / replace-all.
- Cross-file search (future spec, old ADR 0012).
- Regex or whole-word modes.

## Behavior (acceptance criteria)

- AC1: Given the editor, when the user presses Cmd/Ctrl+F, then a floating search panel opens with its input focused; pressing Cmd/Ctrl+F again (or Escape, or the × button) closes it, clears all highlights, and returns focus to the editor.
- AC2: Given a query typed in the panel, then all case-insensitive matches highlight in the document (debounced while typing), the first match becomes the *current* match with a distinct highlight, and it scrolls into view centered.
- AC3: Given matches, then the panel shows the match count and current position (e.g. "2 of 14"); zero matches shows a "no results" state without clearing the query.
- AC4: Given matches, when the user presses Enter or the next button, then the current match advances cyclically (wraps from last to first) and scrolls into view; Shift+Enter or the previous button goes backwards.
- AC5: Given an active search, when the document is edited, then matches recompute against the new content and the highlight set updates (current index clamped into range).
- AC6: Given search highlights, then they are decorations only — the document content and its serialization are unchanged by searching.

## Edge cases

- Query matching across node boundaries is out (text-node matches only) — but matches inside headings, list items, table cells, and code blocks must all be found.
- Overlapping matches (`aa` in `aaa`) — non-overlapping scan from each match end is fine, but must be deterministic.
- Very common query in a 10k-line doc (thousands of matches) must not freeze typing.
- Panel open while switching tabs: search state does not leak into the other tab.

## Test mapping

| AC | Layer |
|----|-------|
| AC1 | Browser Mode |
| AC2–AC5 | Browser Mode |
| AC6 | Node (serialize with active decorations unchanged) |

## Open questions

- (none)
