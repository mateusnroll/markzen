# ADR 0007: unified/remark/rehype for Markdown Processing

**Status:** Accepted  
**Date:** 2026-04  
**Deciders:** Mateus Pinheiro

## Context

The app needs a Markdown processing pipeline for conversion utilities beyond the editor's built-in serialization — e.g., generating preview HTML, processing Markdown for export, or handling edge cases that the editor's serializer doesn't cover.

## Decision

Use the **unified/remark/rehype** ecosystem as the Markdown processing pipeline.

Packages: `unified`, `remark-parse`, `remark-gfm`, `remark-rehype`, `rehype-stringify`.

## Rationale

- De-facto standard Markdown processing pipeline in the JavaScript ecosystem
- Modular plugin architecture — add GFM (tables, task lists, strikethrough) via `remark-gfm`
- Full CommonMark compliance via `remark-parse`
- Used for conversion utilities in `src/lib/markdown.ts`, not for the editor's internal serialization (which is handled by `@tiptap/markdown` — see ADR 0008)

## Consequences

**Positive:**
- Battle-tested, widely used, actively maintained
- Plugin ecosystem covers every Markdown extension
- Clean separation: this pipeline is for utilities/export, not for the live editor

**Negative:**
- Must be careful not to confuse this pipeline with TipTap's serialization layer — they serve different purposes and must not be mixed
