# Architecture decisions

Accepted architecture decisions for the Electron rewrite live here. Specs define observable behavior; ADRs record the implementation choices and tradeoffs used to satisfy those specs.

| ADR | Status | Decision |
|---|---|---|
| [0001](0001-electron-security-and-capabilities.md) | Accepted | Electron security, application origin, capability boundary, window authority, and production fuse posture |
| [0002](0002-document-identity-and-persistence.md) | Accepted | Disk versions, application-wide document registration, reservations, and failure-atomic persistence |
| [0003](0003-markdown-serialization-integrity.md) | Accepted | TipTap Markdown semantic models, source coverage, opaque nodes, and preservation fallback |
| [0004](0004-tab-state-and-persistence-scheduling.md) | Accepted | Per-tab editor ownership, revisions, baseline equality, IME boundaries, and save scheduling |
| [0005](0005-document-watching-and-conflicts.md) | Accepted | Exact-document watching, invalidation, self-event correlation, and external-change conflicts |
| [0006](0006-workspace-identity-and-invalidation.md) | Accepted | Root identity, batched listing, preview ownership replacement, symlink containment, and watcher invalidation |
| [0007](0007-settings-persistence.md) | Accepted | Main-owned settings schema, revisions, atomic persistence, recovery, retry, and quit flushing |
| [0008](0008-accessible-windowed-workspace-tree.md) | Accepted | Accessible tree windowing, responsive sidebar behavior, and non-blocking performance measurement |
| [0009](0009-local-raster-asset-capabilities.md) | Accepted | Exact-resource local raster bearers, trusted path authorization, validation, protocol policy, and revocation |
