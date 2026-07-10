# Spec 0005: Folder Mode & File Tree Sidebar

**Status:** Draft   **Date:** 2026-07
**Origin:** Old repo `folderOperations.ts`, `fileSystemStore.ts`, `Sidebar.tsx`, `FileTree*.tsx`; commits `0ee3d66`, `121b2ce` (resizable sidebar), `bb046bd` (nested files fix), `99daa2d` (no click delay). Multi-root is new in the rewrite (the old app was strictly one folder per window).

## Problem

Beyond single files, users work in folders of notes (the Obsidian-style workflow). Opening a folder gives a dedicated window with a navigable file tree that stays fast for large hierarchies. Users also combine sources — a notes vault plus a project's docs folder — so a folder window can hold **multiple root folders**, added one at a time via File → Add Folder….

## Non-goals

- Watching for external changes (spec 0007).
- Peek-vs-pin open semantics (spec 0006 — this spec only requires that clicking a file opens it).
- File tree CRUD (create/delete/rename/move from the sidebar); context menus; drag-and-drop.
- **Removing or reordering roots.** Requires context-menu infrastructure we don't have; since the root set is not persisted, closing the window resets it. Revisit together with tree CRUD.
- **Persisting a window's root set across restarts** (no session restore anywhere yet — spec 0004).
- **Converting a single-file window into a folder window.** Add Folder… is disabled there; Open Folder… (new window) is the path into folder mode.
- Saving/naming multi-root sets as "workspaces".
- File-name fuzzy finder (future spec, old ADR 0011).
- Showing non-Markdown file previews.

## Behavior (acceptance criteria)

Opening a folder window:

- AC1: Given the app, when the user invokes File → Open Folder… (Cmd/Ctrl+Shift+O) and picks a directory, then a new 1200×800 window opens for that folder with the sidebar visible and the tree showing the folder's root entries.
- AC2: Given Open Folder is invoked from a pristine single-file window (one untitled, empty, non-dirty tab), then that window closes itself once the folder window is created.

Multiple roots:

- AC3: Given a folder window, when the user invokes File → Add Folder… (no accelerator) and picks a directory, then it is appended as a new root section at the bottom of the sidebar — expanded, entries loaded — and existing sections are untouched (expansion state, scroll, open tabs).
- AC4: Given the File menu, then Add Folder… is enabled in folder windows and disabled in single-file windows; cancelling its dialog changes nothing.
- AC5: Given each root, then it renders as a section with a header (folder name) that collapses/expands the whole section; sections appear in the order added.
- AC6: Given a directory that is already a root of this window, when the user adds it again, then no duplicate section is created and the existing section is expanded and scrolled into view.
- AC7: Given two roots whose folder names collide (e.g. `~/work/notes` and `~/personal/notes`), then their headers are disambiguated with a parent-path hint; non-colliding roots show the bare name.
- AC8: Given overlapping roots (one root is an ancestor of another, e.g. `/vault` and `/vault/projects`), then both are allowed and their sections are fully independent: expanding or collapsing a directory in one section never changes the other (per-root tree state, even for the same on-disk path).
- AC9: Given a file reachable under several roots, when opened from any of them, then it opens as (or focuses) a single tab — tab identity is the file path — and the tree highlight (AC13) applies to every entry showing that path.
- AC10: Given a file in a folder window, then the filename field's relative-path display (spec 0011) is computed against its deepest containing root; files outside every root (opened via File → Open…) show no relative path.

Tree behavior (per root section):

- AC11: Given a section's tree, then entries sort directories-first, then case-insensitively by name; dotfiles are hidden.
- AC12: Given a collapsed directory, when clicked, then it expands and loads its children lazily (read on first expand, with a loading indicator; already-loaded children re-expand instantly).
- AC13: Given `.md`/`.markdown` files, then they are clickable and open in the editor on single click with no artificial delay; other file types render dimmed and non-interactive; the active tab's file is highlighted.
- AC14: Given a root whose directory becomes unreadable or disappears, then its section shows an unavailable state (name retained) without affecting other sections; if the watcher (spec 0007) later sees it return, the section recovers on next expand.

Sidebar chrome:

- AC15: Given the sidebar edge, when the user drags it, then the sidebar resizes live, clamped to 160–480px, and the width persists across restarts (via settings).
- AC16: Given a folder window, then the tree area scrolls independently (all sections in one scroll), sidebar text is not selectable, and on macOS the sidebar top strip is a window drag region clear of the traffic lights.
- AC17: Given a folder window with no file open yet, then the editor area shows the "Select a file from the sidebar" empty state (no auto-created untitled tab).

## Constraints

- Tree state (expansion, loaded children, loading flags) is keyed **per root**, not by absolute path alone — this is what makes AC8 possible and prevents state bleed between overlapping roots. The old store's global `expandedDirs`/`dirChildren` maps keyed by path cannot express this.
- Each added root gets its own watcher registration (spec 0007); adding a root starts watching it, closing the window disposes all of the window's watchers.

## Edge cases

- Deeply nested files open correctly (old bug `bb046bd`: nested paths broke).
- Folder with thousands of entries: root render stays responsive (lazy loading is the mechanism).
- Directory the app can't read (permissions) → expand fails gracefully, spinner clears.
- Root paths with spaces/non-ASCII survive the menu → main-process → renderer round trip (URL/IPC encoding).
- Symlinked directories must not cause infinite recursion on expand; adding a root that is a symlink to an existing root counts as a duplicate only if the resolved paths match — otherwise treat as distinct (document the choice in the dedupe test).
- Adding the *same* folder once as `/vault` and once as `/vault/` (trailing slash) or with different case on a case-insensitive filesystem → normalize before the duplicate check (AC6).
- Adding an *ancestor* of an existing root (`/vault` after `/vault/projects`) is the mirror of AC8 and equally allowed.
- Many roots (10+): sections just stack and scroll; no layout cliff.
- External events under overlapping roots (one disk change, two sections) must update both sections — covered by per-root watcher routing in spec 0007.
- Dirty tabs are never affected by adding a root (pure sidebar operation).

## Test mapping

| AC | Layer |
|----|-------|
| AC1, AC2 | Shell smoke (real second window) + Playwright-vs-vite (in-page folder boot via `?fixture=`) |
| AC3, AC5, AC6, AC9 | Playwright-vs-vite (`MemoryPlatform` scripted folder dialogs, multi-root fixture) |
| AC4 | Shell smoke (menu enablement) |
| AC7, AC10 | Node (header disambiguation, deepest-root resolution) + Browser Mode |
| AC8 | Node (per-root store keying) + Playwright-vs-vite (overlap journey) |
| AC11, AC12 | Node (store: sort, lazy load, toggle) + Browser Mode (tree rendering) |
| AC13, AC14, AC17 | Playwright-vs-vite |
| AC15, AC16 | Browser Mode |

## Open questions

- (none)
