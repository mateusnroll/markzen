# Spec 0003: File Operations & Native Menu

**Status:** Draft   **Date:** 2026-07
**Origin:** Old repo `fileOperations.ts`, `setupMenu.ts`, `tabSwitch.ts` (dirty prompts); commits `23b21c7`, `093e3ab`.

## Problem

The editor is useless without opening and saving real files. This spec covers the New/Open/Save/Save As lifecycle, dirty-state tracking, and the native application menu that hosts these commands — the first feature that exercises `Platform.fs` and `Platform.dialog` end to end.

## Non-goals

- Tabs beyond what open/new implicitly require (spec 0004 owns tab semantics).
- Folder mode / sidebar (spec 0005).
- Rename-via-filename-field (spec 0011).
- Auto-save; recent-files list; drag-and-drop file open.

## Behavior (acceptance criteria)

- AC1: Given the app, when the user invokes File → New File (Cmd/Ctrl+N) or the tab-bar + button, then a new empty "Untitled" tab opens and becomes active.
- AC2: Given the app, when the user invokes File → Open… (Cmd/Ctrl+O), then a native open dialog filtered to `md`, `markdown`, `txt` appears; choosing a file loads its content into the editor.
- AC3: Given a pristine active tab (untitled, empty, not dirty), when a file is opened, then it loads into that tab instead of creating a new one.
- AC4: Given a file that is already open in some tab, when the user opens it again, then the existing tab is focused — no duplicate tab.
- AC5: Given a tab with a file path, when the user edits, then the tab shows a dirty indicator; Save (Cmd/Ctrl+S) writes the serialized Markdown to that path and clears the indicator.
- AC6: Given an untitled tab, when the user invokes Save, then the Save As flow runs: a native save dialog (default extension `.md`) chooses the path, the file is written, and the tab adopts the path and filename.
- AC7: Given any tab, when the user invokes Save As… (Cmd/Ctrl+Shift+S), then the content is written to the newly chosen path and the tab re-points to it.
- AC8: Given a dirty tab, when the user closes it (Cmd/Ctrl+W or the × button), then a native confirm dialog warns that unsaved changes in *that file* will be lost; cancel keeps the tab, confirm closes it.
- AC9: Given a window with N dirty tabs, when the user closes the window, then a single confirm summarizes (one filename for N=1, "N files" otherwise); cancel aborts the close.
- AC10: Given the app menu, then it contains: app menu (About, Settings…, Hide, Quit), File (New, Open…, Open Folder…, Add Folder… — enablement per spec 0005 — Save, Save As…, Close Tab, Close Window) with the standard accelerators, and Edit with native Undo/Redo/Cut/Copy/Paste/Select All that operate on the focused editor.
- AC11: Given a dialog is cancelled (open, save, or confirm), then state is unchanged — no tab created, no file written, nothing closed.

## Edge cases

- Reading a file that disappears between dialog and read → error surfaced, no broken tab.
- Saving to a read-only location → error surfaced, tab stays dirty.
- Opening a non-UTF-8 or extremely large (10 MB) file — must not hang the UI.
- Non-ASCII and space-containing paths throughout.
- Save with no changes (not dirty) is a no-op write but not an error.

## Test mapping

| AC | Layer |
|----|-------|
| AC1–AC9, AC11 | Playwright-vs-vite (`MemoryPlatform` scripted dialogs) |
| AC10 | Shell smoke (menu structure + accelerator dispatch) |
| AC5 write content correctness | Node (serialize-on-save unit) |

## Open questions

- Should Cmd/Ctrl+W with a single remaining tab close the window (macOS convention) or leave an empty state? Old app left the empty state (spec 0004 AC6 assumes that).
