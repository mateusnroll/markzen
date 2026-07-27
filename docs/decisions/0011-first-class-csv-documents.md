# ADR 0011: First-class CSV documents

**Status:** Accepted
**Date:** 2026-07-26
**Spec:** [0009 — First-Class CSV Documents](../specs/0009-first-class-csv-documents.md)

## Context

CSV must share Markzen's loss-safe document lifecycle while remaining literal
tabular data rather than Markdown or a spreadsheet engine. Real files use
comma, semicolon, and tab delimiters plus CRLF, LF, and legacy bare-CR record
separators. Large but bounded matrices require accessible interaction without
mounting the complete document.

## Decision

### Codec and preservation

- Use one repository-owned state-machine codec parameterized by delimiter. A
  quote-aware sample of at most 20 logical records selects comma, semicolon, or
  tab with spec 0009's deterministic presence/count/precedence policy.
- Decode strict UTF-8 after recognizing one optional BOM. Count all limits in
  UTF-8 bytes, including the BOM and canonical mutation output. Reject malformed
  quoting, ragged rows, or exceeded bounds as whole-document exact-byte
  preservation.
- Treat CRLF as one record separator and unquoted LF or bare CR as separators.
  Quoted CR and LF remain field text. Record-separator metadata counts all three
  conventions; first encounter breaks a dominance tie.
- Retain original bytes for unchanged Save As and rename-only operations. After
  the first content mutation, serialize canonically with the detected delimiter,
  retained BOM, dominant separator, and retained terminal-separator state.
- Reuse the codec with an explicit tab delimiter, LF separators, and no terminal
  separator for clipboard matrices.

### Semantic state and persistence

- A CSV ProseMirror document contains records and literal text fields only.
  Mutations are one history transaction and baseline equality compares only the
  semantic matrix. Dialect metadata and original bytes are per-tab persistence
  metadata; header, selection, search, and scroll are view metadata.
- Extend the existing discriminated tab/gateway payload with `markdown` and
  `csv` variants. The existing registry, save coordinator, DiskVersion checks,
  failure-atomic writer, watcher, close, and quit paths remain shared and
  kind-aware.

### Grid and accessibility

- Use dependency-free scroll arithmetic with fixed 32px rows and 180px columns,
  overscan in both axes, and an absolute canvas. Always include the active or
  editing cell and mount at most 600 data cells.
- Keep synthetic row numbers and column letters presentational. ARIA row and
  column counts and indexes describe only CSV data. Header mode changes editable
  first-record cells from `gridcell` to `columnheader`; it never changes content.
- Display one clipped line with embedded newlines shown as `↵`. A bounded
  coordinate/value preview labels navigation cells; a size-capped scrollable
  textarea overlays the mounted active cell and exposes the complete value in
  edit mode.
- Browser clipboard events and the existing native edit-command routing are the
  only clipboard boundary. No preload clipboard or filesystem capability is
  added.

## Consequences

- Fixed geometry makes two-axis windowing and focus restoration deterministic
  but intentionally does not auto-size columns or rows.
- Exact unchanged Save As requires retaining bounded original bytes alongside
  the semantic model.
- The codec is small but security-sensitive and therefore has independently
  authored matrices, goldens, exact-bound tests, and no repair path.

## Verification

- Node tests prove codec models, goldens, limits, literal values, baseline
  equality, and stale completion policy.
- Browser Mode tests prove grid roles, navigation/edit modes, selection,
  clipboard, structural mutations, Find, windowing, and accessibility.
- Playwright-vs-Vite tests prove shared lifecycle, watchers, conflicts, and stale
  interactive work with MemoryPlatform.
- Shell smoke proves native commands/dialog filters, the 32 MiB transfer gate,
  closed preload shape, sender-derived authority, real bytes, and menu routing.
