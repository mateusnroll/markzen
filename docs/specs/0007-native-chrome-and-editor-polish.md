# Spec 0007: Native Chrome and Editor Polish

**Status:** Implemented   **Date:** 2026-07
**Origin:** Retrospective contract for the 2026-07 `$polish` session. This spec supersedes only the platform-chrome presentation in spec 0001 AC7–AC13, the editor presentation and gutter-focus details in spec 0002 AC9–AC13 and AC84, and the macOS workspace drag-strip decision in spec 0003 AC78. The remaining security, lifecycle, persistence, editor-state, serialization, and workspace contracts stay unchanged.

## Problem

Markzen's desktop shell consumes a separate title bar even where the operating system can place native window controls inside application chrome, and its folder, toolbar, and editor presentation looks inconsistent across themes. The writing surface also wastes space, exposes browser-default focus and scrolling decoration, and renders common Markdown structures with spacing and alignment that do not resemble a conventional text editor.

## Non-goals

- Adding, removing, or changing native File-menu commands, accelerators, save behavior, dialogs, or filesystem authority.
- Moving Open Folder into the sidebar or adding a Settings/sidebar action area.
- Replacing Linux renderer-owned window controls or adding new window-control IPC.
- Adding font, font-size, line-width, scrollbar, or editor-layout preferences.
- Changing Markdown parsing, serialization, document semantics, input rules, undo ownership, or table/task-list mutation behavior.
- Adding formatting commands, configurable toolbar buttons, a fixed top toolbar, or per-block controls.
- Creating a production Stoic workspace fixture or packaging demo Markdown as renderer assets.

## Constraints and shared invariants

- macOS and Windows use Electron's native caption controls and documented hidden-title-bar APIs; Linux continues to use the existing renderer controls and typed native window intents.
- Native or renderer drag regions use `app-region: drag`, while every interactive descendant remains non-draggable. No new preload, IPC, persistence, or filesystem capability is introduced.
- The native File menu remains the only application-level Open, Save, and Save As surface after their renderer buttons are removed.
- Theme colors reuse the existing shared tokens and effective-theme delivery. Windows native-caption colors update from the same authoritative theme/system-appearance state.
- Editor click routing acts only on the current live editor and existing title input, ignores non-primary buttons, interactive controls, preservation mode, and the vertical scrollbar, and does not serialize or mutate document content by itself.
- All visual changes retain keyboard operation, accessible names/states, forced-colors behavior, reduced-motion behavior, and the 480×320 minimum-window/200%-zoom guarantees from earlier specs.
- No ADR is required: the implementation uses existing Electron-native title-bar facilities, existing renderer components, and CSS presentation without creating a new durable subsystem or trust boundary.

## Behavior (acceptance criteria)

### Native window chrome

- AC1: Given a macOS folder workspace, when its window renders, then the separate Markzen title bar is absent and the native traffic lights occupy a 40px draggable row at the top of the left sidebar before the first root, with no horizontal divider beneath that row and no overlap with tree controls.
- AC2: Given a macOS single-file window, when its window renders, then the separate Markzen title bar is absent and the native traffic-light exclusion space occupies the left side of the 40px tab strip before the first tab without overlapping tab controls.
- AC3: Given a Windows single-file or folder window, when its window renders, then the separate Markzen title bar and renderer window buttons are absent, native minimize/maximize/close controls occupy the right side of the 40px tab strip, and tab content reserves Electron's reported title-bar overlay safe area.
- AC4: Given Windows with explicit Light, explicit Dark, or System theme, when the accepted theme or effective system appearance changes, then the native title-bar overlay background and symbol colors update to match the renderer without reloading the window.
- AC5: Given Linux, when a Markzen window renders, then the existing renderer title bar remains visible and its named minimize, maximize/restore, and close buttons retain their pointer, keyboard, state, focus, and native-operation behavior.
- AC6: Given any platform variant at 480×320 or 200% renderer zoom, when the user drags empty native-chrome space or operates adjacent tabs, tree controls, or window controls, then drag and interactive regions remain distinct, visible, reachable, and non-overlapping.

### File commands and preview promotion

- AC7: Given any Markzen renderer, when the document workspace renders, then it exposes no Open, Save, or Save As command strip or buttons; those existing commands remain available through the native File menu and their established accelerators.
- AC8: Given a workspace preview tab, when the user double-clicks its tab or focuses it and presses Cmd/Ctrl+Enter, then the same tab becomes pinned; the tab's accessible description names the keyboard Keep Open path without adding a separate file-command row.

### Workspace and formatting surfaces

- AC9: Given a folder workspace in Light, Dark, System, or forced-colors mode, when the sidebar renders, then its background, text, muted/disabled rows, hover/current rows, border, and focus/splitter states derive from the shared theme tokens and remain distinguishable.
- AC10: Given an editable active tab, when the formatting toolbar renders, then it floats vertically 8px from the editor's right edge using outlined icons; collapsed Minimal mode exposes a named formatting-summary control plus a named ellipsis expansion control, and expanded Minimal or Regular mode exposes the complete existing controls without covering the tab strip.
- AC11: Given keyboard focus in the vertical formatting toolbar, when ArrowUp/ArrowDown or ArrowLeft/ArrowRight is pressed, then roving focus moves cyclically among enabled controls; Home and End move to the first and last enabled controls.
- AC12: Given a saved selection in an H1–H4 heading or paragraph, when the heading trigger renders and a supported different level or Paragraph is valid, then the trigger remains enabled and the chosen type replaces the current block type in one existing undoable transaction.

### Writing surface and structured content

- AC13: Given an editable document, when its writing surface renders, then the page background and shadow blend into the editor background, the centered page has a responsive width capped at 860px with readable side padding, and no separate paper container is visible.
- AC14: Given ordinary editor paragraphs and ordered or unordered lists, when they render, then body text uses the system sans-serif stack at 16px and line-height 1.45, paragraph/list block gaps are zero, and headings use line-height 1.25 with more block spacing above than below while the first heading has no added top gap.
- AC15: Given flat or nested task lists, when they render, then normal list bullets are absent, every native checkbox aligns with its task text on one row, nested tasks retain a 24px indentation, checked state remains native and operable, and accessible checkbox labels remain unchanged.
- AC16: Given an editable Markdown table, when it renders in any theme, then it remains full-width and rectangular with collapsed 1px theme-token borders around every cell, 6px vertical/8px horizontal cell padding, and top-aligned cell content.
- AC17: Given ordinary theme mode, when the document title or rich editor receives focus, then no browser-default rectangular focus outline surrounds the editable surface; forced-colors mode retains a visible title-field focus indicator, and editor caret/selection remain visible.
- AC18: Given a primary-button click on otherwise empty editable-surface space, when the click is horizontally outside the scrollbar and not on an interactive control, then title-height clicks focus the title while all other clicks focus the editor at the beginning of the closest visual line; the entire routed surface shows a text cursor and preservation mode remains unchanged.
- AC19: Given the document pane in any theme, when content does not overflow then no scrollbar is shown; when it overflows, a thin theme-aware scrollbar appears with transparent track/corner and a stronger thumb hover state, while forced-colors mode delegates scrollbar colors to the user agent.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1–AC6 | Shell smoke | Browser Mode platform-layout assertions for AC1–AC3 and AC5 |
| AC7 | Browser Mode | Shell smoke native-menu command assertion |
| AC8–AC19 | Browser Mode | Playwright-vs-vite Stoic/example journeys for representative layout |

## Open questions

- (none)
