# ADR 0003: Markdown serialization integrity

**Status:** Accepted  
**Date:** 2026-07-11  
**Spec:** [0002 — Document Lifecycle & Tabs](../specs/0002-document-lifecycle-and-tabs.md)

## Context

TipTap's editor model is semantic while Markdown contains alternate spellings, unsupported extensions, raw HTML, byte-order marks, and meaningful source slices. Rich editing is allowed only when every input byte can be represented without silent loss.

## Decision

### Supported semantic model

- Use the official `@tiptap/markdown` manager with explicit Markdown content type, GFM enabled, and four-space indentation. StarterKit plus task-list, table, link, and inert-image schema extensions define the supported model.
- Independently authored source, expected JSON, and golden Markdown fixtures are the oracle. Production parser or serializer output never refreshes them.
- Edited supported content serializes canonically according to Spec 0002's fixture contract. The editor never serializes on transactions, selection, focus, or scrolling.

### Coverage and opaque source

- Decode UTF-8 with fatal error handling and track BOM and newline metadata separately.
- Lex the source into ordered tokens and prove that their raw ranges concatenate to the complete decoded source without gaps, overlap, or reordering.
- Supported token ranges enter the TipTap semantic model. A completely bounded unsupported top-level range becomes an atom-like opaque node containing its exact source.
- Raw HTML always uses the opaque node; it is never passed through TipTap HTML parsing or inserted into the DOM.
- If any unsupported construct is nested where an exact independent range cannot be proven, or coverage fails, use whole-document preservation fallback. Invalid UTF-8 uses byte-preservation fallback.

### Serialization envelope

- Opaque nodes render through collision-resistant placeholders. After TipTap canonical serialization, placeholders are replaced with their exact source slices before encoding.
- Serializer-generated newline sequences adopt the document's uniform or dominant convention; opaque slices retain their original bytes. BOM state is reapplied exactly once.
- In this milestone link nodes never navigate and image nodes render non-fetching placeholders. Image source strings are not interpreted or rebased.

## Consequences

- Some valid Markdown opens read-only until a later schema supports it, favoring data safety over partial editing.
- Canonical output may change harmless source spelling for supported edited content, while opaque source remains exact.
- Whole-document preservation and byte preservation share Save As/rename mechanics but never enter rich editing.

## Verification

- Node fixtures independently prove parse, serialize, reparse, newline, BOM, Unicode, table, link, image, raw, opaque, malformed, and fallback behavior.
- Browser tests prove semantic rendering, opaque deletion, preservation explanations, and inert content.
- Playwright request observation proves that links/images/raw HTML cause no ambient navigation or fetch.
