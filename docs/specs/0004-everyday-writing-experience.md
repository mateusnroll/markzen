# Spec 0004: Everyday Writing Experience

**Status:** Implemented   **Date:** 2026-07
**Origin:** Consolidates former Draft specs 0008 (formatting toolbar), 0009 (links), 0012 (in-document search), and the user-facing portions of 0014 (settings and theming). Prior behavior was researched from the origins recorded in those drafts; no old-repository artifacts are copied here. Approval incorporates the 2026-07 review of formatting completeness, link accessibility and safety, search semantics, overlay simplicity, non-blocking performance, settings ownership, cross-spec gates, and proof mappings.

## Problem

Once document and workspace safety are established, everyday writing still needs discoverable formatting, intentional link interaction, fast in-document search, and preferences that apply consistently across windows. These controls must preserve the editor selection they act on, coexist without covering one another, and remain fully operable without a pointer while keeping renderer navigation and privileged URL opening behind explicit user intent.

## Non-goals

- Table and image toolbar actions or controls (milestone 0005).
- A fixed top toolbar, customizable button sets, or per-block Notion-style handles.
- Internal wiki links, backlinks, link previews, or following relative and fragment-only destinations inside Markzen.
- Replace, replace-all, regular-expression, whole-word, or cross-file search.
- Full Unicode case folding beyond the normalized ECMAScript matching contract below.
- Font, line-width, auto-save, spell-check, or unsafe-link confirmation-bypass settings.
- Rendering Markdown links as semantic `<a>` elements; this milestone keeps a focusable `span` representation while preserving a later migration path.
- Source-mode editing of Markdown link syntax.

## Constraints and shared invariants

- A small renderer overlay coordinator owns only surface registration, owner/generation, topmost dismissal, focus return, and cleanup. Settings and the existing rename decision use modal dialog semantics; toolbar and link surfaces use anchored popover primitives; Find remains a non-modal panel. Presentation, positioning, and focus behavior stay local to each primitive instead of sharing one general overlay renderer.
- Commands that move DOM focus away from the editor capture a ProseMirror selection bookmark, map it through intervening transactions while its owner remains current, act on that bookmark, and restore an appropriate editor selection afterward.
- The main-process settings service from milestone 0003 remains authoritative. This milestone adds theme and toolbar consumers to every window; renderers never read or write `settings.json` directly.
- All default navigation is prevented in the renderer. This milestone introduces one typed `openExternal` application intent; the renderer never receives Electron's `shell`, a generic URL opener, a confirmation-bypass flag, or a generic IPC send method.
- Link-opening classification is a shared pure policy based on the WHATWG `URL` API. A credential-free absolute `http:`, `https:`, or `mailto:` destination is safe. A bare DNS hostname is safe after an in-memory `https://` normalization. Credential-bearing HTTP(S), `file:`, and non-executable custom absolute schemes are confirmable. Relative paths, fragment-only values, malformed/control-character values, and executable or renderer-local schemes including `javascript:`, `data:`, and `blob:` are non-openable.
- Main owns the warning for confirmable destinations and delegates to the operating-system handler only after the user chooses Open Anyway in that native warning. Renderer state cannot assert that confirmation occurred. Later preference work may bypass this warning only for the confirmable class; it may never make non-openable destinations openable.
- A link destination may parse, edit, and serialize even when Markzen does not follow it. Editing support never implies permission to open a scheme, and opening normalization never rewrites stored Markdown.
- Links remain `span` elements in this milestone but expose link semantics, sequential keyboard focus, a visible focus state, and standard Enter activation. Their model and tests must not depend on span-only structure so a later spec can migrate them to native anchors without changing stored Markdown or opening policy.
- Implementing this milestone narrows milestone 0002 AC166 from a temporary fully inert gate to the permanent no-ambient-navigation floor. This spec owns explicit safe and confirmed external opening, and milestone 0002 has been reapproved with that narrower gate.
- Theme colors are expressed as shared tokens and include focus, search, error, disabled, blocked-content, and overlay states in light, dark, system, and forced-color modes.
- Search performance remains on the existing non-blocking CI performance path. Measurements and artifacts must be produced, but timing values do not fail `npm run verify` or CI in this milestone.
- Implementation updates ADR 0001 for the external-opening trust boundary, ADR 0003 for explicitly guarded link activation, and ADR 0007 for the expanded version-1 settings schema and app-wide theme delivery. A new overlay ADR is unnecessary unless implementation discovers a durable choice not fixed by this contract.

## Behavior (acceptance criteria)

### Formatting toolbar

- AC1: Given no active tab, when the editor area is empty, then no formatting toolbar is rendered or exposed to assistive technology.
- AC2: Given the default Minimal toolbar mode and an active tab, when the caret or selection changes within one block/list context, then one compact indicator reports the active block type, list type, and inline marks in text without relying only on font styling or symbols.
- AC3: Given a selection spanning incompatible block or list contexts, when the Minimal indicator updates, then it reports a named Mixed block state while continuing to report uniform and mixed inline-mark state accurately.
- AC4: Given content parsed as H5 or H6, when the caret enters it, then the Minimal indicator reports H5 or H6 accurately even though the heading picker offers only paragraph and H1–H4.
- AC5: Given the Minimal indicator, when it is activated by pointer, Enter, or Space, then the complete toolbar expands in place and its named collapse control returns it to the compact state.
- AC6: Given an expanded Minimal toolbar, when the active tab changes, then menus close and the newly active tab starts collapsed.
- AC7: Given the Regular toolbar mode and an active tab, then the complete toolbar remains visible and exposes no collapse affordance.
- AC8: Given Bold or Italic and an eligible saved selection, when its button is activated, then the mark toggles across that selection in one undoable editor transaction and focus returns to the resulting editor selection.
- AC9: Given Strikethrough or Inline Code and an eligible saved selection, when its menu action is activated, then the mark toggles across that selection in one undoable editor transaction and focus returns to the resulting editor selection.
- AC10: Given a selection whose entire range has an inline mark, when toolbar state is computed, then the matching toggle reports pressed; a partially marked range reports the accessible mixed value.
- AC11: Given a mixed inline-mark selection, when its inline-format toggle is activated, then the mark is applied to the entire eligible range rather than removed from the marked portion.
- AC12: Given the heading trigger, when activated, then a popover offers paragraph and H1–H4, reports the current or Mixed choice, and applies the selected block type to the saved selection in one undoable transaction.
- AC13: Given Bullet List, Ordered List, Task List, or Blockquote and an eligible saved selection, when its action is activated, then the selected blocks toggle into or out of that structure in one undoable transaction without discarding their inline marks.
- AC14: Given the ellipsis trigger, when activated, then it offers Strikethrough, Inline Code, Bullet List, Ordered List, Task List, Blockquote, and Link—only actions implemented by this milestone.
- AC15: Given a toolbar command that is invalid at the saved selection, when the toolbar renders, then that action is disabled and its accessible description states why it is unavailable.
- AC16: Given Minimal mode and Cmd/Ctrl+K while the caret is not in a link, then the toolbar expands and opens the link editor without losing the editor selection.
- AC17: Given keyboard focus enters the toolbar, then it exposes toolbar semantics, arrow keys move roving focus, Home/End move to the first/last control, and Enter/Space activates the focused control.
- AC18: Given a toggle, popup trigger, or disabled action, when exposed to assistive technology, then it has an accessible name and communicates pressed, mixed, expanded, and unavailable state as applicable.
- AC19: Given an open toolbar menu, when Escape is pressed outside IME composition, then only that menu closes and focus returns to its trigger; a second Escape follows the coordinator's next topmost behavior.
- AC20: Given an open toolbar menu, when the user clicks outside it, switches tabs, scrolls its editor pane, closes the owning window, or invalidates its saved selection, then the menu closes and cannot act on stale state.
- AC21: Given a formatting command on a preview tab, when the command changes content, then normal milestone 0003 preview promotion pins the tab once; opening, inspecting, cancelling, or invoking a disabled command does not pin it.

### Links

- AC22: Given a link in the editor, when the user plain-clicks it, then Markzen places the caret and never navigates, opens a system handler, or creates a window.
- AC23: Given rendered links, then each remains a `span` in this milestone, has link semantics and an accessible name, participates in sequential Tab and Shift+Tab order in document order, and shows focus without changing document content.
- AC24: Given keyboard focus on a link, when Enter is pressed, then it performs the same explicit Open request as the popover's Open action; Space opens the link-actions popover without following the destination.
- AC25: Given the user holds the platform follow-link modifier over the editor, when links are available, then they gain pointer and focus affordances until the modifier is released or the window blurs, and the intent is announced without relying on the cursor alone.
- AC26: Given a safe link destination, when the user explicitly chooses Open, Cmd/Ctrl+clicks it, presses Cmd/Ctrl+Enter with the caret inside it, or presses Enter on its focused link span, then the validated destination is sent once to the system handler.
- AC27: Given a syntactically valid bare DNS hostname such as `example.com`, optionally followed by a port, path, query, or fragment, when explicitly opened, then it is normalized in memory to `https://example.com…` without rewriting its visible text or stored Markdown.
- AC28: Given a credential-bearing HTTP(S), `file:`, or non-executable custom absolute URL, when Open is explicitly requested, then main shows one window-modal native warning containing the full destination and named Open Anyway and Cancel choices without invoking the system handler yet.
- AC29: Given that unsafe-destination warning, when Cancel, the native close affordance, or Escape is chosen, then no system-handler call occurs and focus returns to the live originating Markzen window.
- AC30: Given that unsafe-destination warning and a still-live originating window/request, when Open Anyway is chosen, then main delegates the unchanged destination once to the system handler.
- AC31: Given a relative path, fragment-only value, malformed/control-character destination, `javascript:`, `data:`, or `blob:` URL, when Open is explicitly requested, then no warning or system-handler call occurs and an accessible non-blocking unsupported-destination message appears.
- AC32: Given a forged, stale, foreign, duplicated, or confirmation-bypass external-opening request, when it reaches main, then main rejects it without showing a warning or invoking the system handler.
- AC33: Given any link, when it is parsed, rendered, hovered, focused, selected, or changed programmatically, then no destination opens without one of AC26 or AC28's explicit user actions.
- AC34: Given the renderer receives an anchor click, middle click, modified click other than AC26, drag navigation, or `window.open` request, then default renderer navigation and popup creation remain blocked.
- AC35: Given the pointer rests on a link for 300 ms or the link receives keyboard focus, when the interactive link popover opens, then it identifies the full destination to assistive technology and offers Open, Edit, and Remove.
- AC36: Given the pointer moves between a link and its popover, when neither is hovered or focused for 150 ms, then the popover closes; pane scroll, tab change, link deletion, owner invalidation, or window close removes it immediately.
- AC37: Given Edit from the link popover, when the editor opens, then the full contiguous link range is selected and its current destination is prefilled without removing nested inline marks.
- AC38: Given Remove from the link popover, when activated, then only the full contiguous link mark is removed in one undoable transaction and its text plus other marks remain.
- AC39: Given selected text or a caret inside a word, when Cmd/Ctrl+K or the Link action is invoked, then the link editor opens for that range.
- AC40: Given a collapsed caret at whitespace and a non-empty destination is submitted, then its trimmed submitted text becomes both visible link text and stored destination without safe-opening normalization.
- AC41: Given the caret is inside an existing link, when Cmd/Ctrl+K or the Link action is invoked, then the link editor opens prefilled for the full contiguous link; removal remains an explicit action.
- AC42: Given the link editor and a destination containing only whitespace, then Apply is disabled with an accessible explanation; arbitrary non-empty relative, fragment, custom, or otherwise non-openable destination text remains editable and serializable.
- AC43: Given the link editor, when Enter or Apply succeeds, then one undoable editor transaction applies the link; Escape or outside-click cancels without changing content.
- AC44: Given the link editor moved focus from the document, when it applies, cancels, or closes, then the editor selection is restored to the relevant mapped range and the owning preview tab is pinned only if content changed.
- AC45: Given adjacent links or a link at the end of the document, when one is edited or removed, then selection does not bleed into the adjacent link or beyond the document.
- AC46: Given a system-handler failure after an allowed or confirmed Open request, when the promise rejects, then Markzen stays on the document and displays a non-blocking accessible error.
- AC47: Given an unsafe-destination warning whose originating window closes or request generation becomes stale before its result commits, when the warning resolves, then the destination is not opened and no other window receives its result.
- AC48: Given a document containing standard inline links, optional titles, nested marks, escaped URL punctuation, Unicode, relative paths, fragments, or custom schemes, when edited and saved, then milestone 0002's serialization guarantees remain satisfied.

### In-document search

- AC49: Given an active editor, when Cmd/Ctrl+F is invoked, then a non-modal search panel opens with its labeled input focused and its text selected when a prior query exists.
- AC50: Given an active editor, when the native Edit → Find command is invoked, then it produces the same renderer state as AC49 in the focused Markzen window and never targets another window.
- AC51: Given the search panel is already open, when Cmd/Ctrl+F or Edit → Find is invoked again, then it remains open, focuses its input, and selects the existing query without changing decorations or document selection.
- AC52: Given an open search panel, when Escape outside IME composition or its named close button is activated, then it closes, clears decorations, and restores the prior mapped editor selection.
- AC53: Given an empty query, when the panel is open, then it shows no highlights, no current result, and disabled navigation controls.
- AC54: Given a non-empty query, when its 150 ms debounce completes, then all deterministic non-overlapping, case-insensitive matches within each text block are decorated without changing the document; contiguous visible text separated only by inline-mark boundaries can match.
- AC55: Given Unicode query and document text, when compared, then both use NFC normalization followed by ECMAScript locale-independent lowercase conversion, and normalization/lowercase offset maps return decorations to the correct source ranges; equivalences outside that contract are not promised.
- AC56: Given matches first appear, then the first document match is current, is visually distinct without color alone, and scrolls into view as near the viewport center as bounds permit.
- AC57: Given matches, when the panel renders, then it shows and politely announces the current position and total; zero matches announces “No results” without clearing the query.
- AC58: Given a current match, when Enter or Next is activated, then selection advances cyclically; Shift+Enter or Previous moves cyclically backward.
- AC59: Given the current match changes, when navigation finishes, then it scrolls into view without forced smooth motion when reduced motion is requested.
- AC60: Given an active query and document changes, then a generation-scoped rescan replaces decorations for the latest query/document only and stale scans cannot overwrite newer results.
- AC61: Given edits while a current match exists, then its mapped surviving range remains current where possible; otherwise the first result at or after its prior mapped start becomes current, wrapping to the first result when necessary.
- AC62: Given a query spans separate block nodes, table cells, or other non-contiguous text blocks, then it does not match across that boundary; headings, paragraphs, list items, table cells, and code-block text remain searchable within each block.
- AC63: Given `aa` in `aaa`, when matches are calculated, then the deterministic non-overlapping result starts at the first character and resumes after the matched range.
- AC64: Given the panel is open and the user switches tabs, then it closes and no query, current index, decoration, focus-return target, or pending scan leaks to either tab.
- AC65: Given a controlled 10,000-line fixture containing at least 5,000 matches, when its query settles in the CI performance project, then total settle time and every observed long task are recorded in the job summary and machine-readable artifact without their values affecting build status.
- AC66: Given any search lifecycle, when the active rich document is serialized before, during, and after search, then the produced bytes are identical because decorations never enter document content.
- AC67: Given search controls and result status, when used by keyboard or assistive technology, then controls have names and disabled states, and result changes are announced through a polite live region without moving focus.
- AC68: Given IME composition in the search input, when composing text or pressing Escape, Enter, or Shift+Enter before composition ends, then Markzen neither closes nor navigates results; one debounced search begins after the committed query is available.
- AC69: Given there is no active rich editor, when Find is invoked, then no search panel opens and the native command is disabled when main has current menu state.

### Settings and theming

- AC70: Given the app menu, when Settings… or Cmd/Ctrl+, is invoked, then one settings dialog opens in the focused Markzen window; invoking it again focuses the existing dialog rather than duplicating it.
- AC71: Given the settings dialog, when opened, then it has modal dialog semantics, a name, initial focus, contained Tab navigation, an inert background, and a named close button.
- AC72: Given the settings dialog, when Escape, its close button, or backdrop is activated, then it closes without reverting already accepted settings and focus returns to the command's live prior origin.
- AC73: Given Theme changes among System, Light, and Dark, when the main-process settings service accepts the one-key patch, then the current window recolors immediately without reloading and every other window applies the accepted revision.
- AC74: Given a persisted non-default theme, when a Markzen window starts, then main supplies the validated settings snapshot and matching BrowserWindow background before the first visible renderer paint so the wrong theme never flashes.
- AC75: Given Theme is System, when OS appearance changes while the app runs, then every open window updates; explicit Light or Dark ignores later OS changes, returning to System applies the current OS appearance, and closed windows receive no later update.
- AC76: Given forced-color or high-contrast mode, when any theme is active, then native and custom controls, focus indicators, search states, errors, blocked content, and overlays remain distinguishable.
- AC77: Given Toolbar mode changes between Minimal and Regular, when the accepted revision arrives, then every active editor applies it immediately and any incompatible open toolbar menu closes safely.
- AC78: Given a settings persistence failure from milestone 0003, then the existing global accessible warning remains the only warning path, states that active preferences may not survive restart, retains Retry, and remains available whether the settings dialog is open or closed.
- AC79: Given this milestone extends persisted settings, then `theme` accepts only `system`, `light`, or `dark` with default `system`; an invalid persisted value falls back only that key while an invalid requested patch rejects wholly through milestone 0003 rules.
- AC80: Given this milestone extends persisted settings, then `toolbarMode` accepts only `minimal` or `regular` with default `minimal`; an invalid persisted value falls back only that key while an invalid requested patch rejects wholly through milestone 0003 rules.
- AC81: Given a settings patch rejects or its acknowledgement becomes stale, then no renderer applies the rejected/stale value, the dialog reflects the latest authoritative snapshot, and an accessible non-blocking error is exposed for rejection.

### Shared surface coordination and layout

- AC82: Given toolbar, search, link, settings, or existing rename-decision UI at a narrow supported window size or high zoom, when an active surface would leave the viewport or cover another active control, then its own primitive flips, clamps, or reflows so controls remain reachable.
- AC83: Given several registered renderer surfaces, when Escape is pressed outside IME composition, then only the topmost dismissible surface closes; modal Settings or rename remains above non-modal editor surfaces and makes the rest of the renderer inert.
- AC84: Given Settings or rename becomes modal while non-modal editor surfaces are open, then the coordinator closes those editor surfaces before the modal becomes interactive; closing the modal does not resurrect them.
- AC85: Given a tab switch, editor-pane scroll, window resize, zoom change, owner disposal, or owning node deletion, when an anchored surface remains valid, then it repositions; otherwise it closes and cannot act on stale state.
- AC86: Given the main-owned unsafe-destination warning, then it remains outside the renderer coordinator, is modal only to its live originating BrowserWindow, and its result follows AC29–AC30 and AC47 ownership rules.

### External-opening capability

- AC87: Given the expanded preload API and production TypeScript, when its static surface is inspected, then it exposes one typed `openExternal(destination)` application intent and no Electron shell object, generic URL opener, confirmation-bypass field, arbitrary IPC method, or renderer-selected event destination.
- AC88: Given a safe destination from AC26, when the typed application intent reaches main, then main validates the live application-origin main-frame sender before parsing a closed, bounded payload, independently reclassifies the destination, and delegates the normalized destination once without navigating a Markzen window.
- AC89: Given a confirmable destination from AC28, when the typed application intent reaches main, then main independently reclassifies it, presents the exact native warning fixed by AC28, and delegates only after AC30's accepted result.
- AC90: Given a non-openable destination from AC31, malformed/oversized payload, or extra property, when invocation is attempted, then main returns a typed rejection without showing a warning or calling the operating-system shell.
- AC91: Given the operating-system handler rejects or the sender/window/request becomes stale before completion, then the typed result reaches only the live originating window, cannot mutate another owner, and reports failure without renderer navigation.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1–AC21 | Browser Mode | Playwright-vs-vite toolbar-mode and preview-promotion journey |
| AC22–AC25 | Browser Mode | Automated accessibility scan |
| AC26 | Browser Mode | Shell smoke safe-handler journey |
| AC27 | Node | Browser Mode bare-host interaction |
| AC28–AC30 | Shell smoke | Node destination classification |
| AC31 | Browser Mode | AC90 Node rejection |
| AC32 | Node | Shell smoke forged/stale/bypass negatives |
| AC33–AC45 | Browser Mode | AC34 shell navigation/popup denial; AC48 Node goldens |
| AC46 | Browser Mode | Shell smoke rejected-handler journey |
| AC47 | Shell smoke | Node owner/generation policy |
| AC48 | Node | Browser Mode edit/save assertion |
| AC49 | Browser Mode | Playwright-vs-vite Find journey |
| AC50 | Shell smoke | Browser Mode command-state assertion |
| AC51–AC64 | Browser Mode | Playwright-vs-vite tab-switch journey |
| AC65 | CI | Playwright performance artifact |
| AC66–AC68 | Browser Mode | AC66 Node serialization fixture; automated accessibility scan |
| AC69 | Shell smoke | Browser Mode no-active-editor assertion |
| AC70 | Shell smoke | Browser Mode singleton dialog component |
| AC71–AC73 | Browser Mode | AC71 automated accessibility scan; AC73 Playwright-vs-vite multi-window fake |
| AC74–AC75 | Shell smoke | Browser Mode theme-consumer states |
| AC76–AC78 | Browser Mode | Automated accessibility scan |
| AC79–AC80 | Node | Browser Mode default consumers |
| AC81 | Browser Mode | Node patch rejection and revision ordering |
| AC82–AC85 | Browser Mode | Playwright-vs-vite resize/zoom/modal journey |
| AC86 | Shell smoke | — |
| AC87 | Static | Shell smoke preload-surface assertion |
| AC88–AC90 | Node | Shell smoke safe, confirmed, and rejected handler journeys |
| AC91 | Node | Shell smoke sender/window disposal and handler failure |

## Open questions

- (none)
