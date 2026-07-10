# Spec 0006: Peeking (Preview) Tabs

**Status:** Draft   **Date:** 2026-07
**Origin:** Old repo commits `73ddd75` (peeking tabs), `e89d987` (clear editor on last peek close); `fileOperations.ts` `openFileAsPreview`/`openFileAsPinned`, `tabsStore.pinTab`.

## Problem

Browsing many files from the sidebar shouldn't explode the tab bar. VS Code's answer — a single reusable *preview* tab that each single-clicked file replaces, promoted to a real tab on intent — is the expected behavior for folder-mode navigation.

## Non-goals

- Any change to single-file windows (peeking exists only where a file tree does).
- Multiple simultaneous peek tabs.
- Peek for files opened via Open… dialog or Cmd/Ctrl+N (those always open pinned).

## Behavior (acceptance criteria)

- AC1: Given a folder window, when the user single-clicks a file in the tree, then it opens in the peek tab: label in italics, positioned as the right-most tab.
- AC2: Given an existing peek tab, when the user single-clicks a different file, then the peek tab is *reused* — same tab, new file/content — not a second tab.
- AC3: Given a file, when the user double-clicks it in the tree, then it opens as (or the existing peek is promoted to) a pinned tab with a normal label.
- AC4: Given the peek tab, when the user edits its content or saves it, then it is promoted to pinned.
- AC5: Given the peek tab's header, when double-clicked, then the tab is pinned.
- AC6: Given a peek tab plus new pinned tabs being opened, then pinned tabs insert *before* the peek tab, keeping the peek right-most.
- AC7: Given a file already open in any tab (pinned or peek), when clicked again in the tree, then that tab is focused instead of opening a duplicate; a double-click on a file open as peek pins it.
- AC8: Given the peek tab is the last tab, when it is closed, then the editor clears to the folder empty state (old bug `e89d987`: stale content lingered).

## Edge cases

- Single-click on file A while peek shows dirty-but-unpinned content — cannot happen (edit pins, AC4), but the reuse path must still guard against clobbering a dirty tab.
- Peek tab active vs. inactive when replaced (content swap must hit the live editor only when active).
- Double-click that follows a single-click (the single-click already opened the peek; the double must pin, not re-open).

## Test mapping

| AC | Layer |
|----|-------|
| AC1–AC7 | Playwright-vs-vite (tree + tab bar journeys) |
| AC8 | Playwright-vs-vite |
| pin/insert-order store logic | Node (store unit tests) |

## Open questions

- (none)
