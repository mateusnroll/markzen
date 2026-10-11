# ADR 0015: Bounded workspace file index

**Status:** Accepted  
**Date:** 2026-08-23  
**Spec:** [0014 — Fuzzy File Finder and Tab Quick Switcher](../specs/0014-fuzzy-file-finder-and-tab-switcher.md)

## Context

Quick file lookup needs a complete workspace-wide filename collection without giving the renderer recursive filesystem authority or coupling ranking to expanded tree state. Rebuilds must preserve usable results while watcher-driven scans are pending, and duplicate relative paths across roots must retain their owning identity.

## Decision

- Each workspace window owns one memory-only `WorkspaceFinder` in main. It recursively calls the existing controlled directory-list operation sequentially, excludes dot names and directory symlinks, and records only `RootId`, logical relative path, and `FileKey`.
- A completed generation is sorted by root insertion and code-point path order and atomically published as `fuzzysort.snapshot(entries, { key: entry => entry.relativePath })`. The original entry is recovered through `result.obj`; no correlation map or custom scoring layer exists.
- Queries use pinned `fuzzysort` 4.0.2 with `{ limit: 100, threshold: 0 }`. Main validates a single string of at most 512 Unicode scalar values after sender authorization. Only returned equal scores receive the pre-established deterministic tie order.
- Watch invalidation marks the current snapshot stale before starting a replacement scan. The old immutable snapshot remains queryable. Window disposal invalidates pending generations and releases both entries and snapshots.
- The preload exposes only `queryFiles(query)` plus the existing owner-scoped workspace event stream. Activation continues through the existing workspace-open transaction and revalidates identity, type, and containment.

## Consequences

The renderer cannot initiate scans, select roots, submit paths or predicates, or use results as opening authority. Initial and replacement scans cost one sequential traversal per workspace generation; this deliberately favors a small auditable ownership model over parallel traversal machinery. Early queries can cause fuzzysort to finish its private snapshot preparation synchronously, because the dependency exposes no readiness signal.
