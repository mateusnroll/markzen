# Spec 0008: Formatting Toolbar

**Status:** Draft   **Date:** 2026-07
**Origin:** Old repo `FloatingToolbar.tsx`, `MinimalToolbarButton.tsx`; commits `e1b3951`, `76d6a82` (compact redesign), `291c500` (minimal mode).

## Problem

Not every user knows Markdown syntax, and even those who do want one-click formatting and a visual indicator of the current format. The toolbar must serve that without cluttering the distraction-free writing surface — hence a minimal collapsed mode as the default.

## Non-goals

- The link editing popover UX beyond opening it (spec 0009), table behavior beyond inserting (spec 0010), image behavior beyond opening its popover (spec 0013).
- A fixed top toolbar; per-block (Notion-style) handles; customizable button sets.
- Settings UI for choosing the mode (spec 0014 — this spec consumes the setting).

## Behavior (acceptance criteria)

Both modes float bottom-right above the content and appear only when a tab is open.

Minimal mode (default):

- AC1: Given minimal mode, then a single compact indicator button reflects the caret's current format: `H1`–`H4` or `A`, rendered bold/italic/strikethrough/monospace when those marks are active, with a list marker (`•`, `1`, `☐`) when inside a list.
- AC2: Given the indicator, when clicked, then the full toolbar expands in place; a collapse button (with separator) returns to minimal; switching tabs resets to collapsed.
- AC3: Given minimal mode, when the user presses Cmd/Ctrl+K, then the toolbar expands and the link input opens (the shortcut must not be invisible in minimal mode).

Full toolbar (regular mode, or minimal-expanded):

- AC4: Given the toolbar, then it shows Bold and Italic buttons whose active state tracks the selection and which toggle their mark on click.
- AC5: Given the heading button, when clicked, then a popover offers H1–H4 plus "clear heading" (back to paragraph); the button shows the active level and popover choices apply immediately.
- AC6: Given the ellipsis (…) button, when clicked, then a popover offers Strikethrough, Code, Bullet List, Ordered List, Task List, Blockquote, Link, Table, and Image; each applies its action; the ellipsis renders active when any of those formats is active at the caret.
- AC7: Given an open popover (heading or ellipsis), when the user clicks outside the toolbar, then it closes; opening one popover closes the other.
- AC8: Given the Table button, when clicked, then a 3×3 table with header row is inserted at the caret (detail behavior in spec 0010).
- AC9: Given regular mode is selected in settings, then the full toolbar is always shown (no collapse affordance).

## Edge cases

- Toolbar buttons use `mousedown`-safe handling so clicking them never destroys the editor selection they act on.
- Active-state queries when the selection spans mixed formats.
- Toolbar must not overlap the search panel or table controls when several float simultaneously.

## Test mapping

| AC | Layer |
|----|-------|
| AC1–AC3, AC9 | Browser Mode |
| AC4–AC8 | Browser Mode |
| mode-per-setting wiring | Playwright-vs-vite |

## Open questions

- (none)
