# Spec 0013: Images

**Status:** Draft   **Date:** 2026-07
**Origin:** Old repo `imageExtension.ts`, image popover in `FloatingToolbar.tsx`, `pathUtils.ts`; commit `04f8c18`.

## Problem

Notes reference images — screenshots on disk next to the note, or remote URLs. The editor must insert them via the toolbar, store portable *relative* paths in the Markdown, and still render the actual pixels from disk inside the app.

## Non-goals

- Paste/drag-and-drop image insertion; copying inserted images into the note's folder.
- Resize handles, captions, alignment.
- Asset management (orphan detection, renaming referenced files).

## Behavior (acceptance criteria)

- AC1: Given the toolbar Image action, when invoked, then a popover offers "From disk" and "From URL".
- AC2: Given "From disk", when the user picks an image (png/jpg/jpeg/gif/webp/svg filter), then it is inserted with a path *relative to the current file* (e.g. `./shot.png`, `../img/shot.png`); for an untitled tab in a folder window with exactly one root, relative to that root; otherwise (no folder, or multiple roots — spec 0005 — where the untitled file's future home is unknowable) the absolute path is used.
- AC3: Given "From URL", when the user enters a URL and confirms, then the image node is inserted with that URL untouched; Escape or outside-click cancels either mode.
- AC4: Given a Markdown file referencing local images (relative or absolute paths), when opened, then the images render from disk, resolved against the file's location — while the *serialized* Markdown keeps the original relative path (display resolution never rewrites the source).
- AC5: Given remote (`http(s)://`) or `data:` sources, then they render as-is with no path resolution.
- AC6: Given an image in the document, then `![alt](src)` (plus optional title) round-trips through serialization, and clicking the image selects it as a node (deletable, draggable).
- AC7: Given the same document opened from a different working directory or after moving the folder, then relative references still resolve (resolution is per-file, not per-app-cwd).

## Constraints

- Rendering local files in Electron must go through a dedicated safe protocol (or equivalent) scoped to user-opened locations — never by disabling `webSecurity`.

## Edge cases

- Referenced file missing on disk → broken-image state, no crash, serialization untouched.
- Paths with spaces and non-ASCII characters (URL-encoding at render, raw in Markdown).
- `..` traversal that escapes the folder root still renders (files may legitimately live outside), but protocol scoping decides the policy — decide before implementation.
- SVG rendering is subject to the same protocol policy (script-bearing SVGs).

## Test mapping

| AC | Layer |
|----|-------|
| AC1–AC3 | Browser Mode (scripted dialog on the platform fake) |
| AC4, AC5, AC7 | Browser Mode (resolution logic) + Node (path utils) |
| AC6 | Node (images fixture round-trip) + Browser Mode |
| real disk rendering via safe protocol | Shell smoke |

## Open questions

- Protocol scoping policy for paths outside the opened folder (render vs. block) — security call to make explicitly.
