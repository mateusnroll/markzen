# ADR 0013: Other file types

**Status:** Accepted

**Date:** 2026-08-02

**Specs:** [0002 — Document Lifecycle & Tabs](../specs/0002-document-lifecycle-and-tabs.md), [0003 — Folder Workspaces](../specs/0003-folder-workspaces.md), [0009 — First-Class CSV Documents](../specs/0009-first-class-csv-documents.md), [0011 — Other File Types](../specs/0011-other-file-types.md)

## Context

The existing gateway represented Markdown, CSV, and JSON with optional fields.
Extending that shape would allow impossible combinations and would accidentally
give writable editor behavior to raster and unsupported files. Generic text
also needs exact byte preservation when unchanged, deterministic newline
serialization when edited, and bounded parsing before editor construction.

## Decision

- One ordered, case-insensitive classifier is shared by browser and Electron
  adapters. Specialized Markdown, CSV, and JSON suffixes win, followed by exact
  generic-text basenames, basename prefixes, generic-text suffixes, raster
  suffixes, and finally `external`.
- Gateway, IPC, seed, and live-tab values are closed discriminated unions.
  Markdown, CSV, JSON, and text variants are writable; raster and external
  variants are view-only and cannot enter save, rename, editor-command, or
  watcher-mutation paths that are not explicitly allowed by the spec.
- Generic text uses strict UTF-8, records BOM and the dominant newline style,
  normalizes CRLF and LF into the editor while preserving lone CR literally,
  and returns original bytes for an unchanged save or Save As. Edited output
  restores the recorded BOM and newline style. Size, line-count, and longest-line
  bounds are checked atomically before editor construction and after each
  proposed transaction.
- Generic text uses the existing minimal ProseMirror text primitives with one
  history owner. It deliberately has no syntax highlighting, line numbers,
  language service, or executable semantics; the language label is descriptive.
- Raster tabs reuse ADR 0009 validation and exact-resource bearers. External
  tabs register only identity and display metadata, read no content bytes, start
  no document watcher, and can request only a main-owned confirmed OS handoff.

## Consequences

- Adding another supported kind requires changing a closed classifier and its
  union variants rather than registering a runtime provider.
- View-only documents participate in identity, tabs, preview/pin, close, and
  focus while remaining structurally unable to serialize or mutate content.
- Large, invalid, or otherwise unrepresentable text opens a non-lossy
  preservation/handoff view instead of constructing a partial editor model.

## Verification

- Node tests cover every classifier row and precedence, strict decoding,
  newline/BOM goldens, exact unchanged serialization, limits, and stale-owner
  guards.
- Browser tests cover literal editing, history, search, bound rejection,
  raster metadata, reduced motion, view-only command eligibility, and handoff UI.
- Browser journeys cover mixed workspaces and watcher ownership; performance
  records bounded text open/search/edit/history measurements.
- Packaged shell tests cover native filters, real paths, raster bearer denial,
  main-owned handoff confirmation, no external read/watch, and forged intents.
