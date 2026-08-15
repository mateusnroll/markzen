# Spec 0012: Nested List Presentation

**Status:** Implemented   **Date:** 2026-08
**Origin:** Promotes the first in-scope item from `BACKLOG.md`. It extends spec 0002's nested ordered, unordered, and task-list document model and serialization, spec 0004's search and overlay-safe accessibility behavior, and spec 0007's compact list and task-list presentation without changing those implemented contracts.

## Problem

Deep Markdown lists are difficult to scan because indentation alone does not clearly connect a parent item to each nested level, and long subtrees cannot be temporarily set aside while writing. Markzen needs visible nesting guides and accessible per-section disclosure while preserving every descendant as ordinary editable Markdown content.

## Non-goals

- Changing Markdown parsing, canonical serialization, list input rules, Tab/Shift+Tab indentation, list-type formatting commands, task-checkbox behavior, or undo ownership from specs 0002, 0004, and 0007.
- Folding headings, blockquotes, tables, code blocks, top-level leaf items, or any structure other than a list item's directly nested ordered, unordered, or task list.
- Persisting collapse state in settings, document bytes, sidecar files, workspace state, or session restore; closed and newly opened documents start expanded.
- Reordering list items, dragging sections, recursively expanding or collapsing the whole document, or adding a command-palette, menu, toolbar, or global-shortcut action.
- Adding animation, configurable guide styles, touch-specific gestures, new dependencies, preload or IPC capabilities, filesystem authority, or an ADR.

## Constraints and shared invariants

- The feature applies only to editable rich Markdown tabs. Preservation views and CSV, JSON, generic-text, raster, and external document kinds remain unchanged.
- One collapsible section is the set of direct child list nodes inside a list item; it may contain ordered, unordered, task, or mixed descendant lists. The parent item's own leading content remains visible.
- Collapse state is editor-owned presentation state tracked by a ProseMirror plugin and rendered with decorations or node views. It never becomes a document attribute, React/Zustand document state, persisted setting, or serialized Markdown.
- Live collapse entries map through ProseMirror transactions and are discarded when their qualifying parent/subtree no longer exists. The implementation uses existing TipTap/ProseMirror and CSS capabilities without a new dependency or cross-process boundary.
- Guides and controls use logical CSS properties and existing theme tokens so left-to-right and right-to-left content, every supported theme, and forced colors share one behavior.
- The disclosure control is not editable document content and never enters selection, clipboard output, search text, undo history, or serialization.

## Behavior (acceptance criteria)

### Nesting guides and disclosure controls

- AC1: Given nested ordered, unordered, task, or mixed lists in an editable Markdown document, when they render, then each nested list level has one continuous vertical guide aligned with that level's logical indentation while the existing marker, number, or task checkbox remains visible.
- AC2: Given a flat list or a leaf list item, when it renders, then it gains neither a nesting guide nor a disclosure control and its existing spacing and semantics remain unchanged.
- AC3: Given a list item containing at least one direct child list, when it renders expanded, then one compact disclosure button appears in that item's indentation gutter without replacing its marker or checkbox, covering its text, or changing line wrapping beyond the reserved gutter space.
- AC4: Given the disclosure button, when assistive technology inspects it, then it has a stable `Nested items` name, exposes `aria-expanded=true` or `false` accurately, is ordered with its owning list item, and does not cause the list or list-item semantics to be lost.
- AC5: Given a pointer activates an expanded disclosure button, then every direct child list of that item and all of their descendants become visually hidden as one section while the parent item's own content and disclosure remain visible; activating it again restores those lists.
- AC6: Given keyboard focus on a disclosure button, when Enter or Space is pressed outside IME composition, then it performs the same toggle as AC5 and focus remains on that still-live button.
- AC7: Given keyboard-only navigation through the editor, when a collapsible parent is encountered, then its disclosure button is reachable in document order without preventing the existing list-indent and list-outdent commands from operating while focus remains in editable list text.
- AC8: Given one nested section is collapsed while deeper sections had independent expanded or collapsed states, when the parent section is expanded again, then every still-live deeper section returns to its prior state rather than being reset or toggled recursively.
- AC9: Given ordinary themes, forced colors, 480x320 minimum size, 200% zoom, or right-to-left list content, when guides and disclosure buttons render, then indentation remains legible, controls remain reachable and visibly focused, state is distinguishable without color alone, and content does not overflow horizontally because of the added gutter.
- AC10: Given reduced motion is requested, when a section toggles, then descendants appear or disappear without an animated height, scroll, or opacity transition.

### Presentation-state lifecycle and document integrity

- AC11: Given a disclosure toggle, when it completes, then no document change, dirty revision, preview-tab promotion, save eligibility, or document undo/redo entry is created, and the next Undo or Redo still targets the same content edit it targeted before the toggle.
- AC12: Given any combination of expanded and collapsed sections, when the document is serialized or saved with Save or Save As, then the bytes and semantic model are the same as if every section were expanded, including every hidden descendant.
- AC13: Given collapse state in one open tab, when the user switches tabs and later returns, then the state remains attached only to that tab's live editor and does not affect another tab showing equal list content.
- AC14: Given a collapsed document is closed and reopened, the application restarts, or a clean/external-conflict reload replaces the editor document from disk, when the replacement document appears, then every qualifying section starts expanded and no stale collapse entry affects it.
- AC15: Given document edits map a still-live qualifying parent to a new position, when the transaction commits, then its collapse state follows that parent; a newly created parent starts expanded, and an entry is discarded when its parent or direct child list disappears.
- AC16: Given a disclosure button has DOM focus when an edit removes or replaces its owning collapsible parent, when the control is disposed, then focus moves to the closest valid mapped position in the editor and no detached control continues receiving actions.

### Hidden descendants, selection, search, and editing

- AC17: Given the current editor selection intersects descendants that an invoked disclosure would hide, when collapse commits, then the editor selection becomes a caret at the end of the parent item's leading text block before those descendants are hidden, while DOM focus remains on the disclosure and document content is unchanged.
- AC18: Given a section is collapsed, when pointer placement, caret navigation, programmatic selection restoration, or a non-whole-document selection would enter or cross its hidden descendants, then Markzen first expands the minimum collapsed ancestor sections needed to make the resulting selection visible.
- AC19: Given at least one collapsed section, when editor-wide Select All is invoked, then every collapsed section expands before the full document selection is exposed, so subsequent Copy, Cut, Delete, or replacement never operates on content that remains invisible.
- AC20: Given Find has matches inside collapsed descendants, when a hidden match becomes the current result, then its collapsed ancestors expand before the match is highlighted and scrolled into view; non-ancestor sections keep their state, the revealed ancestors remain expanded after Find closes, and search still changes no document content.
- AC21: Given Undo, Redo, or another content transaction changes descendants of a collapsed section, when the result is presented, then each affected collapsed ancestor expands in the same UI update so no content mutation remains hidden; the content transaction retains its existing history and dirty-state behavior.

### Performance boundary

- AC22: Given a controlled Markdown fixture with 10,000 list items distributed across at least 1,000 collapsible parents, when the document first renders and one parent section is collapsed and expanded, then CI records initial render time, toggle-to-paint time, and the maximum renderer-heartbeat gap in the existing human-readable and machine-readable performance reports without applying a pass/fail threshold.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1–AC10 | Browser Mode | Playwright-vs-vite nested-list journey; AC4, AC7, and AC9 automated accessibility scan |
| AC11–AC16 | Browser Mode | AC12 Node serialization golden; Playwright-vs-vite tab-switch and reload journey |
| AC17–AC21 | Browser Mode | Playwright-vs-vite Find, selection, and history journey |
| AC22 | CI | Playwright performance artifact |

## Open questions

- (none)
