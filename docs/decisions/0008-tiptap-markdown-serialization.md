# ADR 0008: @tiptap/markdown for Editor Serialization

**Status:** Accepted  
**Date:** 2026-04  
**Deciders:** Mateus Pinheiro

## Context

The editor needs bidirectional conversion between Markdown strings (on disk) and TipTap's internal ProseMirror JSON document. This happens on file open, file save, and mode switch (rich ↔ source). This is "Layer 2" of the editor architecture (see ADR 0003).

Two options exist: the official `@tiptap/markdown` extension, or the community `tiptap-markdown` package.

## Decision

Use **`@tiptap/markdown`** (the official TipTap extension). Do NOT use the community `tiptap-markdown` package.

## Serialization API

```typescript
// File open: parse Markdown from disk into the editor
editor.commands.setContent(markdownString, { contentType: 'markdown' })

// Save: serialize editor content to Markdown string
const markdownString = editor.getMarkdown()
```

## Configuration

```typescript
Markdown.configure({
  html: false,        // don't parse raw HTML in Markdown
  tightLists: true,   // compact list output
})
```

## Consequences

**Positive:**
- Official extension, maintained by the TipTap team
- Uses MarkedJS as tokenizer — reliable Markdown parsing
- Single API for both directions (`setContent` / `getMarkdown`)

**Negative:**
- Flagged as early release by TipTap docs — potential edge cases with complex Markdown
- Must run round-trip integrity tests during Phase 1 to catch serializer gaps early

**Critical constraints:**
- The community `tiptap-markdown` package has a different API (`editor.storage.markdown.getMarkdown()`) and would conflict — never install both
- Round-trip integrity: `parse(serialize(doc))` must produce the same document. Any round-trip failures are critical bugs (data loss on save)
- Never run the serializer on every keystroke — it is for disk I/O and mode switching only
