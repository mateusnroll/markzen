# Spec 0007: File System Watcher

**Status:** Draft   **Date:** 2026-07
**Origin:** Old repo `fs_watcher.rs` (notify + 500ms debounce), `useFileWatcher.ts`, `fileSystemStore.refreshDirs`; commit `c8a5326`; old ADR 0010. Rust `notify` is replaced by a main-process TypeScript watcher behind `Platform.fs.watch`.

## Problem

Files change outside the app — git operations, other editors, sync tools. The sidebar must reflect external creates, deletes, renames, and moves without a manual refresh, and without hammering the fs on bulk operations.

## Non-goals

- Reloading *open document content* changed externally (conflict handling is its own future spec — this is sidebar-only).
- Watching anything outside the opened folder root.
- Persisting tree state across restarts.

## Behavior (acceptance criteria)

- AC1: Given a folder window with a directory expanded, when a file or folder is created, deleted, or renamed inside it externally, then the tree updates within ~1s without user action.
- AC2: Given a *collapsed* directory whose children were previously loaded, when it changes externally, then its cache is invalidated and fresh children load on next expand (no eager re-read).
- AC3: Given a bulk operation (e.g. `git checkout` touching 100 files), then events are debounced (~500ms) so the tree refreshes in one or a few batches, not once per file.
- AC4: Given multiple watched roots — across windows or several roots in one window (spec 0005) — then each root's tree section reacts only to events under that root (events carry the watched root; foreign events are ignored). One disk change under overlapping roots updates every section that covers it.
- AC5: Given a folder window is closed, then all of its watchers (one per root) are disposed (no leaked watchers; verified via the platform fake's active-watcher count).
- AC6: Given `MemoryPlatform`, then tests can synthesically emit watch events and observe the same refresh behavior as the real watcher (the watcher contract lives in the `Platform` interface).

## Edge cases

- The watched root itself is deleted or renamed → sidebar empties gracefully, no crash loop.
- Events for dotfiles (hidden in the tree) don't cause visible churn.
- Rapid expand/collapse during a pending refresh must not resurrect stale children.
- Watcher backend failure (e.g. too many open files) degrades silently to manual state — app remains usable.

## Test mapping

| AC | Layer |
|----|-------|
| AC1 | Shell smoke (one real-fs journey) |
| AC2, AC3, AC4, AC6 | Playwright-vs-vite / Node (store `refreshDirs` units with synthetic events) |
| AC5 | Node (fake watcher registry) |

## Open questions

- Watcher library for the Electron main process: `fs.watch` semantics differ per-OS; `chokidar` (or `@parcel/watcher`) likely needed for rename fidelity — decide via an ADR at implementation time.
