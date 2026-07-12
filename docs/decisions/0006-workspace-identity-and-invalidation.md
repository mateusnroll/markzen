# ADR 0006: Workspace identity, listing, preview ownership, and invalidation

**Status:** Accepted
**Date:** 2026-07-12
**Spec:** [0003 — Folder Workspaces](../specs/0003-folder-workspaces.md)

## Context

Folder workspaces add main-owned roots, lazy directory trees, preview-tab identity replacement, and recursive invalidation on top of the application-wide document registry. Renderer-visible paths must remain display data, directory snapshots can become stale immediately, and symlinks must not extend root authority.

## Decision

### Roots and directory snapshots

- The main process allocates each `RootId` and registers it under one live workspace `WindowId`. A root record retains its selected logical path, canonical directory identity, insertion index, watcher generation, and availability state.
- `Platform.fs.list` performs one batched directory read. It returns entry name, kind, logical path, and opaque Platform-issued `FileKey`, never a canonical target path.
- For ordinary children, the Platform derives identity from the already-canonical parent plus the entry name under the volume's case rules. Only symlinks require target resolution.
- A list result is a temporary snapshot. Watcher invalidation marks the owning directory snapshot stale; it never patches tree nodes directly.
- Every file activation revalidates the registered root, logical relative path, current type, FileKey, and canonical containment. The renderer cannot turn a snapshot path or key into authority.

### Symlinks and containment

- Directory symlinks are terminal rows. Root watchers use chokidar options that do not follow them.
- File symlinks may open only when activation-time canonicalization proves the target remains inside the owning root. Missing, circular, changed, or out-of-root targets return one non-disclosing blocked result.
- Root symlinks selected through the native folder chooser remain valid roots because canonicalization happens before the `RootId` is accepted.

### Async ownership and preview replacement

- Folder dialogs are serialized per source window. Workspace bootstrap, list, preview, and refresh operations capture window/root/tab ownership plus a monotonically increasing generation before awaiting.
- A workspace becomes ready only after renderer boot, settings bootstrap, root canonicalization, initial listing, and successful initial render acknowledgement.
- Replacing preview A with B uses one registry operation: reserve B, adopt B in the preview record, then release A as one synchronous critical section. An owned or stale B leaves A unchanged. A failed revalidation/read releases clean A and leaves a non-path-backed retry state.
- Results apply to the captured tab record, never to whichever tab is active when they settle. A later user activation is not reversed.

### Watch invalidation

- Extend the existing `Platform.watch` contract with normalized root-relative invalidations and error/recovery callbacks. MemoryPlatform exposes equivalent synthetic events and active-subscription observation only through its harness.
- One logical subscription belongs to each accepted root. The real adapter may consolidate native watcher objects without changing ownership or disposal behavior.
- Raw events are batched per root using a 300 ms trailing delay and 750 ms maximum wait. Expanded loaded directories refresh; collapsed loaded directories become stale; unloaded directories remain unread.
- Markzen adds no watcher retry timer. Native backend recovery and an explicit user Retry are the only re-registration paths.

## Consequences

- Renderer tree state remains useful for display and focus but never authorizes filesystem access.
- Batched listing avoids one `realpath` call per ordinary entry while preserving Platform-owned identity.
- Terminal directory symlinks deliberately trade alias browsing for a small, reviewable containment boundary.
- Preview replacement requires an explicit registry primitive but avoids hidden or duplicate ownership during races.

## Verification

- Node tests cover RootId ownership, batched identity, containment revalidation, registry replacement, invalidation batching, explicit retry, and stale disposal.
- Playwright-vs-Vite covers lazy trees, preview races, failures, aliases, and MemoryPlatform invalidations.
- Shell smoke covers real folder dialogs, real listing and watcher behavior, cross-window deduplication, and out-of-root symlink negatives.
