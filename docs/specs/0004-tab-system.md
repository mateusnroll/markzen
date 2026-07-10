# Spec 0004: Tab System

**Status:** Draft   **Date:** 2026-07
**Origin:** Old repo `tabsStore.ts`, `TabBar.tsx`, `tabSwitch.ts`; commits `5e81b15` (EditorState snapshots), `54e8aee` (new-file button), `0c858e8` (empty state), `f3e8b16` (scroll containment), `3de9feb` (no text selection).

## Problem

Users work on several documents at once. Tabs must switch instantly without losing anything invisible-but-precious: undo history, cursor position, scroll position, and unsaved edits.

## Non-goals

- Peeking/preview tabs (spec 0006 layers onto this).
- Tab reordering by drag; tab pinning (in the "keep-open" sense); split view.
- A tab quick switcher (future spec, old ADR 0011).
- Session restore across app restarts.

## Behavior (acceptance criteria)

- AC1: Given multiple open tabs, when the user clicks a tab (or presses Enter/Space on it), then it activates and its document appears.
- AC2: Given a tab where the user typed and undid some edits, when they switch away and back, then the full undo/redo history is intact (the tab stores an editor-state snapshot; one shared editor instance swaps states).
- AC3: Given a tab scrolled mid-document, when the user switches away and back, then the scroll position is restored and the editor regains focus.
- AC4: Given an active tab that is closed, when it was not the last tab, then the neighbor at the same index (or the new last tab) becomes active with its state restored.
- AC5: Given the last remaining tab is closed, then the editor area shows an empty state ("Open a file or create a new one" in single-file windows; "Select a file from the sidebar" in folder windows) and the previous document's content is not visible.
- AC6: Given a tab, then its label is the filename (max-width truncated) or "Untitled"; a dirty tab shows a dot that swaps to the × close button on hover; closing is always possible via that button.
- AC7: Given more tabs than fit, when the user scrolls the tab bar horizontally (including macOS trackpad), then the tab strip scrolls without the gesture leaking into the editor, and tab labels are never text-selectable.
- AC8: Given the tab bar, then a + button at the end creates a new untitled tab (same behavior as Cmd/Ctrl+N), and the bar doubles as a window drag region in the empty area.
- AC9: Given a single-file window with no tabs at launch, then one untitled tab is created automatically.

## Edge cases

- Rapid tab switching must not interleave state saves (content of tab A written into tab B).
- Closing a tab that is mid-IME composition.
- A tab whose file was deleted on disk still switches/closes cleanly.
- 30+ open tabs: switching stays O(1) perceptible.

## Test mapping

| AC | Layer |
|----|-------|
| AC1, AC4, AC6 | Browser Mode (tab bar component + store) |
| AC2, AC3, AC5, AC9 | Playwright-vs-vite |
| AC7 | Playwright-vs-vite (wheel event dispatch) |
| AC8 | Browser Mode |
| store transitions (add/close/active selection) | Node (store unit tests) |

## Open questions

- (none)
