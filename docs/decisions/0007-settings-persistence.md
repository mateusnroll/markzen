# ADR 0007: Main-owned ordered settings persistence

**Status:** Accepted
**Date:** 2026-07-12
**Spec:** [0003 — Folder Workspaces](../specs/0003-folder-workspaces.md)

## Context

Sidebar width is global across windows and survives restart. Later milestones add theme and toolbar preferences, including pre-paint main-process behavior, so renderer-owned storage would create competing authorities and cannot supply all window bootstrap state.

## Decision

### Schema and authority

- The main process owns one application-lifetime `SettingsService`. Version 1 initially contains `sidebarWidth`; later approved specs extend the closed TypeScript schema and validator directly.
- There is no generic schema registry and no version-0 migration. Runtime patches are closed objects of at most 4 KiB. Unknown keys, extra properties, dangerous keys, non-finite values, and invalid shapes reject the entire patch.
- The service reads at most 1 MiB. Safe unknown persisted JSON properties survive rewrites for downgrade compatibility, but `__proto__`, `prototype`, and `constructor` are discarded at every depth.
- Each accepted patch receives the next process-local revision. Main serializes acceptance, broadcasts the complete authoritative snapshot, and renderer consumers ignore non-newer revisions.

### Writes and recovery

- Accepted revisions apply in memory before persistence. A 300 ms trailing debounce collapses a burst; only a completion for the latest captured persisted revision marks the service clean.
- Settings use a dedicated same-directory failure-atomic JSON writer built on the same low-level staging, flush, replacement, directory-flush, and startup-recovery rules as document persistence without entering document registry or save-coordinator authority.
- Syntax-corrupt input is moved to an epoch-timestamped `.corrupt-*` sibling when possible. Unsupported newer versions, invalid top-level/version shapes, oversized input, and unreadable input are left untouched and load defaults with one warning.
- Write failures retain the authoritative memory snapshot and retry with bounded exponential backoff. Explicit Retry runs immediately. Normal quit waits at most two seconds for the latest revision, then exits without damaging the previous valid file.

### Renderer interaction

- Bootstrap includes the validated snapshot before a workspace is revealed.
- Splitter movement updates the local clamped width in the current animation frame and submits at most one patch per frame. Main remains authoritative for cross-window ordering and persistence.
- Accepted settings revisions outlive the initiating window; window disposal removes only its subscription.

## Consequences

- One service orders all windows and supports later pre-paint consumers without speculative plugin infrastructure.
- Preference writes cost more than `localStorage`, but corruption, partial writes, quit races, and downgrade preservation have deterministic outcomes.
- The schema remains intentionally small and closed.

## Verification

- Node tests cover parsing, safe unknown data, patch rejection, revisions, debounce/write generations, recovery, retry, and bounded quit flush.
- Browser tests cover optimistic same-frame sizing, revision ordering, warnings, and resize coalescing.
- Shell smoke covers real `userData` bootstrap, cross-window broadcast, atomic files, and quit flushing.
