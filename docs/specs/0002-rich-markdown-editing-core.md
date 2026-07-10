# Spec 0002: Rich Markdown Editing Core

**Status:** Draft   **Date:** 2026-07
**Origin:** Old repo `RichEditor.tsx`, commits `31848ad`, `ca3347c` (list indicators), `20f0fbe` (task lists), `28d1115` (typography), `68d2387` (gutter clicks), `0850d7b` (fixtures); old ADRs 0003, 0007, 0008.

## Problem

The product's core is an inline WYSIWYG Markdown editor: Markdown syntax converts to rich nodes as you type, and documents round-trip to disk as clean Markdown. Everything else in the app hangs off this editor, and its serialization integrity is the data-loss guard.

## Non-goals

- Toolbar UI (spec 0008), links UX (0009), tables UX (0010), images (0013), in-doc search (0012).
- Source/raw-Markdown mode (future spec; old ADR 0004 — never built).
- Frontmatter, footnotes, math, syntax highlighting inside code blocks.
- Persisting editor content anywhere but ProseMirror state (store sync is on blur/save only).

## Behavior (acceptance criteria)

Input rules (typed character-by-character; `setContent` bypasses them, so tests must type):

- AC1: Given an empty paragraph, when the user types `# ` through `#### `, then the block becomes a heading of that level (H1–H4 used by the UI; H5–H6 still parse from disk).
- AC2: Given an empty paragraph, when the user types `- `, `1. `, or `> `, then the block becomes a bullet list, ordered list, or blockquote respectively.
- AC3: Given an empty paragraph, when the user types `- [ ] `, then it becomes a task-list item whose checkbox toggles by click, and nesting via Tab works.
- AC4: Given text, when the user wraps it while typing as `**bold**`, `*italic*`, `~~strike~~`, or `` `code` ``, then the corresponding mark is applied and the syntax characters disappear.
- AC5: Given an empty paragraph, when the user types ` ``` ` or `---`, then a code block or horizontal rule is created.

Serialization (the data-loss guard):

- AC6: Given every file in the Markdown fixture corpus, when it is parsed to a document and serialized back, then `parse(serialize(doc))` equals `parse(original)` (round-trip integrity over headings, lists, task lists, blockquotes, code blocks, hr, emphasis, escapes, hard breaks, images, tables).
- AC7: Given a document edited in the editor, when it is serialized, then the output is GFM-flavored Markdown with tight lists, and raw HTML in source files is not parsed as HTML.

Rendering & focus model:

- AC8: Given a fixture document opened in the editor, then headings, lists (with visible markers), task checkboxes, blockquotes, code blocks, and horizontal rules render with the intended visual hierarchy.
- AC9: Given the editor pane, when the user clicks in the gutter beside or below the content, then the caret is placed at the nearest document position (end of doc when clicking below), and the click never selects UI chrome text.
- AC10: Given typing or scrolling in a long (10k-line) document, then input latency stays fluid (no per-keystroke serialization; content syncs to the store on blur only).
- AC11: Given the editor content area, then it renders centered at a max width of 720px with the system sans-serif stack, line-height ≈1.7, and heading hierarchy expressed by size/weight only.

## Constraints

- Two independent layers, never confused: input rules (live typing) vs. `@tiptap/markdown` serialization (disk I/O). Never disable `enableInputRules`; never serialize on keystroke.
- Serialization uses the official `@tiptap/markdown` — not the community `tiptap-markdown`, not remark round-tripping.

## Edge cases

- Malformed Markdown (unclosed code fence, broken table) must load without throwing — fall back to literal text.
- Escaped characters (`\*not bold\*`) survive round-trip (fixture: `escapes-special-chars.md`).
- Hard breaks and trailing whitespace semantics (fixture: `hard-breaks-whitespace.md`).
- Empty document serializes to empty string, not `\n` garbage.
- Non-ASCII text and emoji round-trip byte-identically.

## Test mapping

| AC | Layer |
|----|-------|
| AC1–AC5 | Browser Mode (character-by-character typing) |
| AC6, AC7 | Node (whole fixture corpus) |
| AC8, AC11 | Browser Mode |
| AC9 | Browser Mode |
| AC10 | Playwright-vs-vite (perf smoke, coarse threshold) |

## Open questions

- (none)
