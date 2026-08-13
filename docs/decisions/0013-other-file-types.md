# ADR 0013: Other file types

**Status:** Accepted

**Date:** 2026-08-12

**Specs:** [0002 — Document Lifecycle & Tabs](../specs/0002-document-lifecycle-and-tabs.md), [0003 — Folder Workspaces](../specs/0003-folder-workspaces.md), [0009 — First-Class CSV Documents](../specs/0009-first-class-csv-documents.md), [0011 — Other File Types](../specs/0011-other-file-types.md)

## Context

The existing gateway represented Markdown, CSV, and JSON with optional fields. Extending that shape would allow impossible combinations and would accidentally give writable editor behavior to raster and unsupported files. Generic text also needs exact byte preservation when unchanged, deterministic newline serialization when edited, and bounded parsing before editor construction. After the first implementation, product testing established that path rules alone were too restrictive: otherwise-unrecognized valid UTF-8 files should use the same literal editor, and known languages should gain syntax coloring without expanding filesystem authority or persistent document state.

## Decision

- One ordered, case-insensitive path classifier is shared by browser and Electron adapters. Specialized Markdown, CSV, and JSON suffixes win, followed by exact generic-text basenames, basename prefixes, generic-text suffixes, raster suffixes, and finally a content candidate. Main stats candidates before reading, rejects sources above the transfer ceiling, and uses fatal bounded UTF-8 decoding to choose editable Plain text or a byte-free external handoff.
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
- Generic text uses the existing minimal ProseMirror text primitives with one history owner. A single pure language-label lookup selects an optional grammar from Lowlight's bundled common registry. The renderer replaces the ordinary code block with version-matched TipTap CodeBlockLowlight only when that lookup succeeds, preventing automatic detection for Plain text and unsupported labels. Token decorations are synchronous presentation and never enter serialization, history, search text, clipboard text, dirty equality, IPC, or main-owned records.
- CSV, JSON, and generic text reuse one full-panel surface, page, and compact title-row layout. Text adds only its scrollable no-wrap editor, language label, and token colors.
- Raster tabs reuse ADR 0009 validation and exact-resource bearers. External tabs register only identity and display metadata, start no document watcher, and can request only a main-owned confirmed OS handoff. A content candidate may be read once within the transfer ceiling for classification, but invalid or over-limit candidate bytes never cross into the renderer or external payload.

## Consequences

- Adding another supported kind requires changing a closed classifier and its
  union variants rather than registering a runtime provider.
- View-only documents participate in identity, tabs, preview/pin, close, and
  focus while remaining structurally unable to serialize or mutate content.
- A path-classified or already-open large, invalid, or otherwise unrepresentable text file opens a non-lossy preservation/handoff view instead of constructing a partial editor model. An initial content candidate with the same failure becomes external with the precise reason and no transferred bytes.
- Grammar choice remains reproducible from the captured language label, so adding highlighting does not create a second field that can drift across renderer, preload, and main-process boundaries.

## Verification

- Node tests cover every classifier row and precedence, the complete label-to-grammar mapping, fallback UTF-8 classification, strict decoding, newline/BOM goldens, exact unchanged serialization, limits, and stale-owner guards.
- Browser tests cover literal editing, CodeBlockLowlight tokens and fallback, history, search, shared full-panel layout, bound rejection, raster metadata, reduced motion, view-only command eligibility, and handoff UI.
- Browser journeys cover highlighted known languages, unrecognized valid UTF-8, invalid candidates, mixed workspaces, and watcher ownership; performance records highlighted and unhighlighted text open/search/edit/history measurements.
- Packaged shell tests cover native filters, real bounded content probing, above-ceiling no-read fallback, raster bearer denial, main-owned handoff confirmation, byte-free external payloads, no external watcher, and forged intents.
