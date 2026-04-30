# ADR 0003: TipTap (ProseMirror) as Rich Editor Core

**Status:** Accepted  
**Date:** 2026-04  
**Deciders:** Mateus Pinheiro

## Context

Building a production-grade Markdown editor from scratch is a multi-year engineering effort. The product requires an inline WYSIWYG editing experience comparable to iA Writer — rendered, beautiful reading while editing, not a split-pane preview.

Two credible open-source editor frameworks exist: TipTap (ProseMirror-based) and CodeMirror 6.

## Decision

Use **TipTap 3.x** (built on ProseMirror) as the primary rich editor.

## Comparison

| | TipTap | CodeMirror 6 |
|---|---|---|
| Paradigm | Rich/WYSIWYG (renders formatted output) | Source code editor (plaintext + syntax highlighting) |
| Architecture | ProseMirror-based; headless, React-first | Modular, framework-agnostic |
| Markdown support | Via extensions (StarterKit covers all standard syntax) | Via markdown-specific language extension |
| Extensibility | Very high; can access ProseMirror APIs directly | Very high; functional composition model |
| Benchmarks | Notion-style editing | Obsidian's editor pane (source mode) |
| License | MIT | MIT |
| Downloads | 1.8M+ monthly npm downloads | — |

## Consequences

**Positive:**
- Enables the iA Writer-style inline WYSIWYG experience that is the product's core differentiator
- Headless (no imposed UI) — full control over styling and layout
- React-first API with `@tiptap/react`
- ProseMirror foundation is battle-tested at scale (New York Times, Atlassian)
- `StarterKit` extension provides all standard Markdown input rules out of the box
- MIT licensed
- TipTap 3.x is required for React 19 peer dependency support (v2.x only declares React 17/18)

**Negative:**
- ProseMirror's document model is not Markdown — requires a serialization layer (see ADR 0008)
- Learning curve for ProseMirror's transaction/plugin system when building custom extensions
- `@tiptap/markdown` is flagged as early release — requires round-trip testing to catch edge cases

**Critical implementation detail:**
The rich editor has two completely independent systems that must both work:
1. **Input Rules (Layer 1)** — transforms Markdown syntax as the user types into rich nodes, via `addInputRules()` in each TipTap extension. Fires on every keystroke.
2. **Serialization (Layer 2)** — converts ProseMirror document to/from Markdown strings for disk I/O and mode-switching. Uses `@tiptap/markdown`.

These two layers are not aware of each other. Never attempt to implement live Markdown typing by running the serializer on each keystroke — this destroys cursor position, undo history, and performance.
