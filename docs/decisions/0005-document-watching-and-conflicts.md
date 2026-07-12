# ADR 0005: Document watching and external-change conflicts

**Status:** Accepted  
**Date:** 2026-07-11  
**Spec:** [0002 — Document Lifecycle & Tabs](../specs/0002-document-lifecycle-and-tabs.md)

## Context

Open files can change outside Markzen. Watcher APIs are noisy, may coalesce or duplicate events, and cannot establish trustworthy content by themselves. Clean tabs should follow disk automatically while dirty tabs must preserve both versions until the user decides.

## Decision

### Watch ownership and invalidation

- A main-owned chokidar service watches the exact display path for each registered path-backed tab. One `{ WindowId, TabId, generation }` registration owns one disposer.
- Watch events contain no document state and grant no authority. They only invalidate the owning tab and trigger a fresh versioned read through the registered path.
- Open, rename, Save As, close, and window disposal replace or remove the watcher idempotently. Watch errors leave editing available and surface a typed warning.

### Ordering and self events

- Every refresh captures watcher generation and expected key/path. Only the newest live generation may apply.
- The persistence coordinator records the version installed by an app-originated transaction. Watch refreshes equal to that version are acknowledged as self-events without resetting history or reopening conflicts.
- Duplicate invalidations while a refresh is pending coalesce into one required follow-up read.

### Clean reload and dirty conflict

- A clean tab atomically adopts a newly parsed disk model as its baseline and resets history while retaining tab identity.
- A dirty tab preserves its editor state and records the newest observed disk version in one persistent conflict state.
- Overwrite Disk captures the editor snapshot and uses the normal immediate version check plus atomic writer. Reload from Disk adopts the newest successfully parsed disk state. Save Editor As uses normal Save As, preserves the original disk file, and transfers registry/watch ownership to the new document.
- A conflict action whose read, dialog, or write generation becomes stale cannot clear or replace a newer conflict.

## Consequences

- Watching improves responsiveness but never replaces the pre-write version check.
- The exact-path watcher is reused by milestone 0003's root watcher service rather than creating a second backend.
- Clean reload intentionally resets undo history because the adopted disk state is a new external baseline.

## Verification

- Node tests cover invalidation coalescing, generations, self-event correlation, and action transitions.
- Playwright with MemoryPlatform covers clean reload, all three dirty decisions, stale reads, watcher failure, and focus.
- Shell smoke covers real watcher registration/disposal and app-originated save/rename events.
