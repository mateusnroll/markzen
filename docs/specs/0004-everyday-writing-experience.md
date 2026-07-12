# Spec 0004: Everyday Writing Experience

**Status:** Draft   **Date:** 2026-07
**Origin:** Consolidates former Draft specs 0008 (formatting toolbar), 0009 (links), 0012 (in-document search), and the user-facing portions of 0014 (settings and theming). Prior behavior was researched from the origins recorded in those drafts; no old-repository artifacts are copied here.

## Problem

Once document and workspace safety are established, everyday writing still needs discoverable formatting, safe link interaction, fast in-document search, and preferences that apply consistently across windows. These controls must preserve the editor selection they act on, coexist without covering one another, and remain fully operable without a pointer.

## Non-goals

- Table and image toolbar actions or controls (milestone 0005).
- A fixed top toolbar, customizable button sets, or per-block Notion-style handles.
- Internal wiki links, backlinks, link previews, or following relative/fragment links inside Markzen.
- Replace, replace-all, regular-expression, whole-word, or cross-file search.
- Font, line-width, auto-save, or spell-check settings.
- Source-mode editing of Markdown link syntax.

## Constraints and shared invariants

- The toolbar, link popover, search panel, and settings dialog use one overlay system for stacking, viewport collision, outside-click handling, Escape priority, and cleanup on tab/window changes.
- Commands that move DOM focus away from the editor capture a ProseMirror selection bookmark. They act on that bookmark and restore an appropriate editor selection afterward.
- The main-process settings service from milestone 0003 remains authoritative. This milestone adds theme and toolbar consumers; renderers never read or write `settings.json` directly.
- All default navigation is prevented in the renderer. This milestone introduces one validated `openExternal` application capability; the renderer never receives Electron's `shell`, a generic URL opener, or a generic IPC send method.
- A link destination may serialize even when Markzen does not follow it. Editing support never implies permission to open a scheme.
- Implementing this milestone replaces milestone 0002's temporary inert-link AC166 and its negative tests with this spec's explicit user-intent, scheme-validation, no-ambient-navigation, and system-handler coverage; the milestone 0002 spec must be narrowed and reapproved as part of that change.
- Theme colors are expressed as shared tokens and include focus, search, error, disabled, blocked-content, and overlay states in light, dark, system, and forced-color modes.

## Behavior (acceptance criteria)

### Formatting toolbar

- AC1: Given no active tab, when the editor area is empty, then no formatting toolbar is rendered or exposed to assistive technology.
- AC2: Given the default Minimal toolbar mode and an active tab, when the caret or selection changes, then one compact indicator reports the active block type, list type, and inline marks without relying only on font styling or symbols.
- AC3: Given content parsed as H5 or H6, when the caret enters it, then the Minimal indicator reports H5 or H6 accurately even though the heading picker offers only paragraph and H1–H4.
- AC4: Given the Minimal indicator, when it is activated by pointer or keyboard, then the complete toolbar expands in place and its collapse control returns it to the compact state.
- AC5: Given an expanded Minimal toolbar, when the active tab changes, then menus close and the new tab starts collapsed.
- AC6: Given the Regular toolbar mode, when a tab is active, then the complete toolbar remains visible and has no collapse affordance.
- AC7: Given Bold or Italic, when its button is activated, then the mark toggles across the saved selection and focus returns to the resulting editor selection.
- AC8: Given a selection whose entire range has a mark, when toolbar state is computed, then the matching toggle reports active; a partially marked range reports an accessible mixed state.
- AC9: Given a mixed selection and an inline-format toggle, when it is activated, then the mark is applied to the entire range rather than unpredictably removed from part of it.
- AC10: Given the heading trigger, when activated, then a popover offers paragraph and H1–H4, reports the current choice, and applies the selected block type to the saved selection.
- AC11: Given the ellipsis trigger, when activated, then it offers Strikethrough, Inline Code, Bullet List, Ordered List, Task List, Blockquote, and Link—only actions implemented by this milestone.
- AC12: Given a toolbar command that is invalid at the current selection, when the toolbar renders, then that action is disabled and exposes why it is unavailable.
- AC13: Given the Minimal mode and Cmd/Ctrl+K, when the caret is not in a link, then the toolbar expands and opens the link editor without losing the editor selection.
- AC14: Given the toolbar, when it receives keyboard focus, then it exposes toolbar semantics, arrow keys move roving focus, Home/End move to the first/last control, and Enter/Space activates the focused control.
- AC15: Given a toggle or popup trigger, when exposed to assistive technology, then it has an accessible name and communicates pressed, mixed, expanded, and unavailable state as applicable.
- AC16: Given an open toolbar menu, when Escape is pressed, then only that menu closes and focus returns to its trigger; a second Escape follows the containing overlay's normal behavior.
- AC17: Given an open toolbar menu, when the user clicks outside it, switches tabs, scrolls its editor pane, or closes the owning window, then the menu closes and cannot act on a stale selection.

### Links

- AC18: Given a link in the editor, when the user plain-clicks it, then Markzen places the caret and never navigates or creates a window.
- AC19: Given a syntactically valid, credential-free `http:`, `https:`, or `mailto:` link, when the user explicitly chooses Open, Cmd/Ctrl+clicks it, or presses Cmd/Ctrl+Enter with the caret inside it, then the validated destination is sent once to the system handler.
- AC20: Given a syntactically valid bare hostname such as `example.com`, when explicitly opened, then it is normalized to `https://example.com` without rewriting the stored Markdown.
- AC21: Given a relative path, fragment, `file:`, `javascript:`, `data:`, credential-bearing or malformed URL, or custom scheme, when Open is explicitly requested, then `openExternal` is not invoked and an accessible non-blocking unsupported-destination message appears.
- AC22: Given any link, when it is parsed, rendered, hovered, focused, selected, or changed programmatically, then no destination opens without one of AC19's explicit user actions.
- AC23: Given the renderer receives an anchor click, middle click, modified click other than AC19, or `window.open` request, when its destination is handled, then default renderer navigation remains blocked.
- AC24: Given the user holds the platform follow-link modifier over the editor, when links are available, then they gain a pointer/focus affordance until the modifier is released or the window blurs; the same intent is announced without relying on the cursor alone.
- AC25: Given the pointer rests on a link for 300 ms or keyboard focus invokes link actions, when the interactive link popover opens, then it shows the full URL to assistive technology and offers Open, Edit, and Remove.
- AC26: Given the pointer moves between a link and its popover, when neither is hovered or focused for 150 ms, then the popover closes; pane scroll, tab change, link deletion, or window close removes it immediately.
- AC27: Given Edit from the link popover, when the editor opens, then the full contiguous link range is selected and its current destination is prefilled without removing nested inline marks.
- AC28: Given Remove from the link popover, when activated, then only the full contiguous link mark is removed and its text plus other marks remain.
- AC29: Given selected text or a caret inside a word, when Cmd/Ctrl+K or the Link action is invoked, then the link editor opens for that range.
- AC30: Given a collapsed caret at whitespace, when a destination is submitted, then the normalized destination text becomes both visible link text and destination.
- AC31: Given the caret inside an existing link, when Cmd/Ctrl+K or the Link action is invoked, then the link editor opens prefilled for the full link; removal remains an explicit action.
- AC32: Given the link editor, when Enter/Apply succeeds, then one undoable editor transaction applies the link; Escape or outside-click cancels without changing content.
- AC33: Given the link editor moved focus from the document, when it applies, cancels, or closes, then the editor selection is restored to the relevant range and the owning preview tab is pinned only if content changed.
- AC34: Given adjacent links or a link at the end of the document, when one is edited or removed, then selection does not bleed into the adjacent link or beyond the document.
- AC35: Given a system-handler failure after an allowed Open request, when the promise rejects, then Markzen stays on the document and displays a non-blocking accessible error.
- AC36: Given a document containing standard inline links, optional titles, nested marks, escaped URL punctuation, Unicode, relative paths, or fragments, when edited and saved, then milestone 0002's serialization guarantees remain satisfied.

### In-document search

- AC37: Given an active editor, when Cmd/Ctrl+F or Edit → Find is invoked, then a non-modal search panel opens with its labeled input focused.
- AC38: Given the search panel is already open, when Cmd/Ctrl+F is invoked again, then the panel closes, all decorations clear, and the prior editor selection regains focus.
- AC39: Given an open search panel, when Escape or its named close button is activated outside IME composition, then it closes, clears decorations, and restores the prior editor selection.
- AC40: Given an empty query, when the panel is open, then it shows no highlights, no current result, and disabled navigation controls.
- AC41: Given a non-empty query, when its 150 ms debounce completes, then all non-overlapping, case-insensitive matches within individual text nodes are decorated without changing the document.
- AC42: Given Unicode text, when matching case-insensitively, then deterministic Unicode case folding preserves correct source offsets and combining characters are compared in normalized form.
- AC43: Given matches, when results first appear, then the first document match is current, is visually distinct without color alone, and scrolls into view as near the viewport center as bounds permit.
- AC44: Given matches, when the panel renders, then it shows and announces the current position and total; zero matches announces “No results” without clearing the query.
- AC45: Given a current match, when Enter or Next is activated, then selection advances cyclically; Shift+Enter or Previous moves cyclically backward.
- AC46: Given a current match changes, when navigation finishes, then it scrolls into view without forced smooth motion when reduced motion is requested.
- AC47: Given an active query, when the document changes, then a generation-scoped rescan replaces decorations for the latest query/document only; stale scans cannot overwrite newer results.
- AC48: Given an edit removes or inserts matches, when results update, then the surviving current match is retained where possible, otherwise the nearest next match becomes current.
- AC49: Given a query spanning separate text nodes—including a boundary created by differing marks—when searched, then it does not match; headings, list items, table cells, and code-block text remain searchable within each text node.
- AC50: Given `aa` in `aaa`, when matches are calculated, then the deterministic non-overlapping result starts at the first character and resumes after the matched range.
- AC51: Given the panel is open and the user switches tabs, when the new tab activates, then the panel closes and no query, current index, or decoration leaks to either tab.
- AC52: Given a 10,000-line fixture containing at least 5,000 matches, when a query settles, then results appear within 500 ms on the CI performance project and no single search task blocks the main thread for more than 100 ms.
- AC53: Given any search lifecycle, when the document is serialized before, during, and after search, then the bytes produced are identical because decorations never enter document state.
- AC54: Given search controls and result status, when used by keyboard or assistive technology, then controls have names/disabled states and result changes are announced through a polite live region without moving focus.

### Settings and theming

- AC55: Given the app menu, when Settings… or Cmd/Ctrl+, is invoked, then one settings dialog opens in the focused Markzen window; invoking it again focuses the existing dialog rather than duplicating it.
- AC56: Given the settings dialog, when opened, then it has dialog semantics, a name, initial focus, contained Tab navigation, an inert background, and a named close button.
- AC57: Given the settings dialog, when Escape, its close button, or backdrop is activated, then it closes without reverting already applied settings and focus returns to the command's prior origin.
- AC58: Given Theme is changed among System, Light, and Dark, when the main-process settings service accepts the patch, then the current window recolors immediately without reloading and every other window applies the accepted revision.
- AC59: Given a persisted non-default theme, when a Markzen window starts, then the main process supplies the validated settings snapshot and matching BrowserWindow background before the first visible renderer paint, so the wrong theme never flashes.
- AC60: Given Theme is System, when OS appearance changes while the app runs, then every open window updates; switching away removes no required listener and closing a window disposes its listener.
- AC61: Given forced-color or high-contrast mode, when any theme is active, then native and custom controls, focus indicators, search states, errors, and overlays remain distinguishable.
- AC62: Given Toolbar mode changes between Minimal and Regular, when the accepted revision arrives, then every active editor applies it immediately and any incompatible open toolbar menu closes safely.
- AC63: Given a settings persistence error reported by milestone 0003, when the dialog is open or closed, then runtime preferences remain applied and an accessible non-blocking warning states that they may not survive restart.

### Shared overlay layout

- AC64: Given toolbar, search, link, and settings UI at a narrow supported window size or high zoom, when two transient surfaces would overlap or leave the viewport, then the overlay system flips, clamps, or reflows them so active controls remain reachable.
- AC65: Given several transient surfaces, when Escape is pressed outside IME composition, then only the topmost dismissible surface closes; modal Settings remains above non-modal editor overlays.
- AC66: Given a tab switch, editor-pane scroll, window resize, zoom change, or owning node deletion, when an anchored overlay remains valid, then it repositions; otherwise it closes and cannot act on stale state.
- AC67: Given this milestone extends the settings schema, then `theme` accepts only `system`, `light`, or `dark` with default `system`, and `toolbarMode` accepts only `minimal` or `regular` with default `minimal`; invalid persisted or requested values fall back or reject through milestone 0003's per-key rules.

### External-opening capability

- AC68: Given the typed `openExternal` application capability and a syntactically valid, credential-free `https:`, `http:`, or `mailto:` URL supplied by one of AC19's explicit user actions, when the capability is invoked, then the main process validates the live sender and delegates that URL once to the operating-system handler without navigating a Markzen window.
- AC69: Given the typed `openExternal` application capability and a relative path, fragment, `javascript:`, `data:`, `file:`, malformed, credential-bearing, or unapproved custom-scheme URL, when invocation is attempted, then it returns a typed rejection and does not call the operating-system shell.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1–AC17 | Browser Mode | Playwright-vs-vite toolbar-mode journey |
| AC18 | Browser Mode | — |
| AC19 | Browser Mode | Shell smoke system-handler journey |
| AC20–AC36 | Browser Mode | AC36 Node golden fixtures |
| AC37–AC51 | Browser Mode | Playwright-vs-vite tab-switch journey |
| AC52 | Browser Mode | — |
| AC53 | Node | Browser Mode active-search assertion |
| AC54 | Browser Mode | Automated accessibility scan |
| AC55 | Shell smoke | Browser Mode dialog component |
| AC56–AC58 | Browser Mode | Automated accessibility scan |
| AC59 | Shell smoke | — |
| AC60–AC63 | Browser Mode | AC58 Playwright-vs-vite multi-window fake |
| AC64–AC66 | Browser Mode | Playwright-vs-vite resize/zoom journey |
| AC67 | Node | Browser Mode default-consumer assertion |
| AC68–AC69 | Node | AC68 Shell smoke system-handler journey |

## Open questions

- (none)
