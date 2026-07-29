# ADR 0012: First-class JSON documents

**Status:** Accepted
**Date:** 2026-07-27
**Spec:** [0010 — First-Class JSON Documents](../specs/0010-first-class-json-documents.md)

## Context

JSON must share Markzen's loss-safe document lifecycle while preserving source
order, duplicate property names, exact number lexemes, and malformed bytes.
Standard object conversion loses duplicate members and number spelling. Large,
deep trees also require accessible interaction without mounting the complete
document or storing semantic content in React.

## Decision

### Codec and preservation

- Use one repository-owned bounded recursive-descent parser. It decodes fatal UTF-8
  after the document-byte gate, retains duplicate properties as ordered nodes,
  decodes strings to UTF-16 code units, and stores number source lexemes.
- Retain original bytes for unchanged Save As and rename-only operations. After
  semantic mutation, use one ordered serializer with standard `JSON.stringify`
  string-token escaping, exact number lexemes, detected indentation, dominant
  separator, BOM, and terminal-separator metadata.
- Represent malformed, invalid-encoding, and editable-limit failures as exact
  whole-document preservation. No partial tree or repair mode is exposed.

### Semantic state and identity

- Extend the closed document variants to `markdown`, `csv`, and `json`; every
  variant requires its own payload. Do not introduce a provider registry.
- A JSON ProseMirror document contains ordered object/property, array/item, and
  scalar nodes. Mutations replace or insert only the owning range and form one
  history event.
- Assign transient IDs to roots, properties, and values. Surviving nodes keep
  IDs through transactions so expansion, active row, and Find map
  deterministically. IDs are excluded from semantic equality and serialization.
- Formatting metadata and original bytes remain per-tab persistence metadata.
  Expansion, active row, search, scroll, validation, and inline drafts are view
  metadata.

### Tree and accessibility

- Render one row-first ARIA tree with fixed-height rows, bounded isolated
  previews, measured viewport overscan, and one compact toolbar containing only
  structural actions. Always mount the active or editing row and at most 500
  treeitems.
- Keep scalar name, value, and type editing in the corresponding displayed
  cell. Container rows expose non-interactive type markers and counts instead
  of type replacement. Native text controls own string, number, boolean, and
  null-to-string drafts; a native select owns scalar type replacement.
- Escape visibly presented controls without changing decoded editor values.
  Search current-result excerpts are bounded around the exact match.
- Escape or Cancel is the only inline-draft cancellation. Any other focus leave
  commits one valid changed draft before the action; an invalid number or
  boolean draft retains focus and blocks the action.

### Persistence and authority

- Reuse the existing registry, save coordinator, `DiskVersion` checks,
  failure-atomic writer, watcher, close, and quit paths with captured JSON kind,
  owner, generation, and revision.
- `new-json` is a closed command. Main validates the application sender and
  derives live window/tab authority before validating any renderer correlation
  data. JSON adds no path, filesystem, clipboard, or network capability.

## Consequences

- A custom parser and serializer are required, but their limits and independent
  fixtures make loss behavior reviewable.
- Row-first interaction avoids multi-cell treegrid focus ambiguity and keeps
  structural actions singular.
- Transient IDs add attributes to ProseMirror nodes but remove positional
  identity ambiguity after duplicate insertions and deletions.

## Verification

- Node tests prove parser models, exact limits, canonical goldens, preservation,
  equality, and stale completion policy.
- Browser Mode proves row navigation, cell-targeted editing, atomic limits, Find,
  windowing, literal rendering, and accessibility.
- Playwright-vs-Vite proves mixed-kind lifecycle, stale interaction, watchers,
  conflicts, and save ownership through `MemoryPlatform`.
- Shell smoke proves native commands and filters, transfer gating, exact bytes,
  closed preload shape, sender-derived authority, and native menu routing.
