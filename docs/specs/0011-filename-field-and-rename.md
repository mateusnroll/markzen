# Spec 0011: Filename Field & Rename

**Status:** Draft   **Date:** 2026-07
**Origin:** Old repo `FilenameField.tsx`, `renameFile.ts`, `FilenameNavigation` extension; commits `8a58532` (editable filename), `68d2387` (focus flows).

## Problem

iA Writer-style documents treat the filename as the document's title. Users should name and rename a file where they're already looking — an editable title above the content — instead of hunting through Save As dialogs or a file manager.

## Non-goals

- Renaming from the sidebar/file tree.
- Deriving the filename from the first heading automatically.
- Moving files between directories (rename is same-directory only).

## Behavior (acceptance criteria)

- AC1: Given an open file, then an editable title above the content shows the filename without its `.md`/`.markdown` extension; an untitled tab shows an "Untitled" placeholder.
- AC2: Given a folder window with a nested file open, then the title area also shows the file's directory path relative to its containing root — the deepest one when roots overlap (spec 0005 AC10) — and files outside every root show no relative path (read-only display).
- AC3: Given the user edits the title to a new name, then the tab becomes dirty with a pending rename; the file on disk is *not* touched yet.
- AC4: Given a pending rename, when the user saves (Cmd/Ctrl+S), then the file is renamed on disk (new name + `.md`) before content is written; the tab, tab-bar label, and sidebar reflect the new path.
- AC5: Given a pending rename to an invalid name (empty, containing `/ \ : * ? " < > |` or control chars, or `.`/`..`), when saving, then the save is aborted with a visible error and the file is untouched.
- AC6: Given the target name already exists in the directory, when saving, then the rename fails with a visible error — except pure case changes of the same file, which are allowed (case-insensitive filesystems).
- AC7: Given an untitled tab whose title was typed, when Save runs, then the Save As dialog defaults to `<typed-name>.md`.
- AC8: Given the title field, then Enter or ArrowDown commits the edit and moves focus to the start of the document; Escape reverts to the original name and clears the pending rename; pasting strips newlines.
- AC9: Given the caret on the first visual line of the document, when the user presses ArrowUp, then focus moves to the end of the title field; clicking the gutter at the title's height focuses the title.

## Edge cases

- Rename + content edit in one save: rename happens first; if it fails, content is not written to either path.
- File renamed externally while a rename is pending.
- Blur with a half-typed name keeps it pending (dirty), it does not auto-commit to disk.
- Unicode names, names ending in `.md` typed by the user (avoid `name.md.md`).

## Test mapping

| AC | Layer |
|----|-------|
| AC1, AC2, AC8 | Browser Mode |
| AC3, AC4, AC7 | Playwright-vs-vite |
| AC5, AC6 | Node (validation) + Playwright-vs-vite (abort journey) |
| AC9 | Browser Mode |
| one real-disk rename | Shell smoke |

## Open questions

- Where does the rename error surface (toast? inline under the field?) — old app only logged to console, which is not acceptable this time.
