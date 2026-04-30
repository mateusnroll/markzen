# ADR 0004: Dual-Mode Editing (Rich + Source)

**Status:** Accepted  
**Date:** 2026-04  
**Deciders:** Mateus Pinheiro

## Context

Power users expect the ability to work in raw Markdown when needed (complex tables, frontmatter, precise formatting). A rich-only editor would alienate this audience. The Obsidian model (toggle between reading/editing/source views) has proven that dual-mode is expected.

## Decision

Implement a **dual-mode editor**: TipTap as the default rich/WYSIWYG editor, with a toggle to a raw Markdown source editor powered by **CodeMirror 6**.

The toggle is per-tab (each tab remembers its mode) and is activated via Cmd/Ctrl+E or a toolbar button.

## Content Synchronization

When the user toggles modes, `EditorPane.tsx` orchestrates the handoff:

```
Rich → Source: editor.getMarkdown() → CodeMirror.setState()
Source → Rich: CodeMirror.state.doc → editor.setContent()
```

**Critical rules:**
- Do NOT sync on every CodeMirror keystroke into TipTap — only on mode switch. Constant re-parsing destroys cursor position and undo history.
- Each mode maintains its own independent undo history stack.
- If the Markdown is malformed (unclosed code fences, broken tables), `setContent` must not throw — wrap in try/catch and fall back to inserting raw text.

## Consequences

**Positive:**
- Satisfies both casual writers (rich mode) and power users (source mode)
- Matches established UX patterns (Obsidian, Typora)
- CodeMirror 6 is best-in-class for source editing with Markdown syntax highlighting

**Negative:**
- Two editor instances per tab increases complexity
- Content synchronization on mode switch can have edge cases with malformed Markdown
- Must maintain consistent keyboard shortcuts across both editor implementations
