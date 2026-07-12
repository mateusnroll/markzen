# ADR 0002: Document identity and failure-atomic persistence

**Status:** Accepted  
**Date:** 2026-07-11  
**Spec:** [0002 — Document Lifecycle & Tabs](../specs/0002-document-lifecycle-and-tabs.md)

## Context

Open documents must remain unique across windows, detect external changes before destructive writes, and never expose partially written Markdown. Save, Save As, rename, close-triggered saves, and conflict overwrites share these requirements and can overlap for one tab.

## Decision

### Identity and versions

- The main document registry maps each canonical `FileKey` to one live `{ WindowId, TabId }` owner or one short-lived reservation. It serializes reserve/adopt/release operations so two aliases cannot both win.
- `FileKey` remains canonical path identity from ADR 0001; hard-link paths remain distinct. Display paths never key registry state.
- A `DiskVersion` is a branded digest of the observed file bytes plus relevant stat metadata. Reads return bytes, canonical identity, display path, and the version from one main-side operation.
- Immediately before destination replacement, the writer performs a fresh versioned read/stat and compares the expected version or expected absence. This is deliberately best effort: no lock spans the check and rename.

### Failure-atomic writer

- Write serialized bytes to a uniquely named same-directory staging file opened exclusively, sync the staging file, and close it before installation.
- Recheck the expected destination version immediately before installation, then rename the staging file over the destination. Sync the containing directory where Node and the platform support it; an unsupported directory sync is not reported as a failed document write after installation.
- Before installation, every error removes or leaves only a recognizable staging file and preserves the prior destination bytes. After installation, the new destination is authoritative.
- Same-path Save never mutates the source in place. Save As leaves the source untouched. Rename-plus-save installs the complete destination first and then removes the source, so cleanup failure leaves two complete copies and a recoverable warning.
- An unchanged rename uses a filesystem move without serializing or rewriting bytes. Pure-case rename on a case-insensitive volume uses a unique intermediate sibling name only when the platform cannot perform it directly.

### Reservations and adoption

- Target reservation precedes staging. A target owned by another tab focuses that owner and aborts; an exact current path becomes Save; another alias of the current key is rejected.
- Successful Save As or rename adopts the new key, path, version, and tab baseline in the same registry critical section that releases the old key. A stale completion cannot release a newer reservation.
- Closing releases ownership only after close decisions commit. Cancelled closes retain it.

## Consequences

- The writer uses more filesystem calls than direct `writeFile`, but all document writes share one reviewable transaction.
- Version checking detects ordinary editor/external races but intentionally does not claim compare-and-swap protection.
- Cleanup artifacts and post-install duplicate copies are safer than rollback that could delete the only complete destination.

## Verification

- Node tests cover versions, reservations, coalescing, failure points, stale generations, exact-byte rename, and registry adoption.
- MemoryPlatform exposes deterministic failure points only through its test harness.
- Shell smoke covers real replacement, existing-target overwrite, pure-case rename where applicable, permissions, cleanup recovery, and two-window ownership.
