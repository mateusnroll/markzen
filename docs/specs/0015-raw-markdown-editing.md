# Spec 0015: Raw Markdown Editing

**Status:** Implemented   **Date:** 2026-09
**Writer:** `codex:01a074ce-6348-75b2-97c0-49123faf9a39`
**Approver:** `spec-approver:9f5446e3-ebc4-40c7-8e5b-7d8fd0ee7113:f1a7e8bb-7098-45f8-b9e4-6b209d578a3a`
**Approval digest:** `sha256:8cfa93ac20379c056dd37cdec5822113361e02b064a8e6983c6be3198c419000` (exact reviewed Draft before lifecycle metadata; change set `sha256:7330838036fa4b01e04a19d2e6799fe3f2e2e75677c46e0b85d561b72f8b7f1d`; review `9f5446e3-ebc4-40c7-8e5b-7d8fd0ee7113`)
**Origin:** GitHub issue #33, “Raw Markdown editing”; promotes the Raw Markdown backlog item. Specs 0002, 0004, 0005, and 0011 remain prerequisite behavior contracts. Open PR #32 reserves spec number 0014, so this candidate uses the next free number, 0015.

## PRD traceability

| PRD requirement | Spec acceptance criteria |
| --- | --- |
| PRD-R-001 | AC1, AC5–AC7 |
| PRD-R-002 | AC1, AC3 |
| PRD-R-003 | AC1–AC2 |
| PRD-R-004 | AC4 |
| PRD-R-005 | AC8–AC13 |
| PRD-R-006 | AC7, AC36 |
| PRD-R-007 | AC14–AC15, AC21 |
| PRD-R-008 | AC16, AC18 |
| PRD-R-009 | AC17 |
| PRD-R-010 | AC5–AC6, AC17 |
| PRD-R-011 | AC23–AC25, AC27–AC29 |
| PRD-R-012 | AC23–AC24 |
| PRD-R-013 | AC21–AC22, AC26–AC27 |
| PRD-R-014 | AC10, AC15, AC18 |
| PRD-R-015 | AC4, AC15, AC18–AC19 |
| PRD-R-016 | AC2, AC4, AC28, AC32 |
| PRD-R-017 | AC9–AC11 |
| PRD-R-018 | AC20, AC23, AC26 |
| PRD-R-019 | AC26–AC32 |
| PRD-R-020 | AC30–AC31 |
| PRD-R-021 | AC9, AC33, AC37 |
| PRD-R-022 | AC1, AC5, AC8, AC12–AC13, AC17 |
| PRD-R-023 | AC12 |
| PRD-R-024 | AC34–AC35 |

## Problem

Markzen renders supported Markdown through a rich editor, which is appropriate for ordinary writing but hides the source syntax professionals occasionally need to inspect or repair. Users need an explicit, tab-local Raw Markdown mode that can edit source safely without creating a second save path, weakening loss-safety, or turning Markzen into an IDE.

## Non-goals

- A permanently split rich/source view, live two-way synchronization, automatic background conversion, or a document-surface mode control.
- IDE features including completion, diagnostics, linting, minimaps, folding, multiple cursors, language-server integration, configurable editor preferences, or formatting on save.
- Raw editing for invalid UTF-8, byte-preservation documents, generic text, CSV, JSON, raster, external, read-only, or otherwise ineligible tabs.
- Persisting a tab's selected mode, selection, scroll position, or undo history across close, restart, or a new open of the same path.
- Changing Markdown syntax support, canonical rich serialization, image authorization, filesystem access, external-change policy, Save/Save As/Save All ownership, close confirmation, Find semantics, or the generic-text editor contract except where this spec explicitly routes an eligible Markdown tab to Raw mode.
- Providing a plugin API, user-selectable source-editor implementation, or new renderer filesystem, IPC, preload, clipboard, navigation, or network authority.

## Constraints and shared invariants

- Specs 0002 and 0004 remain authoritative for document identity, preview and dirty state, save snapshots and generations, failure atomicity, external-change conflicts, close behavior, command routing, Find, focus, and multi-window ownership. Specs 0005 and 0011 remain authoritative for images and non-Markdown documents. This spec narrows 0002's read-only valid-UTF-8 preservation fallback and no-general-raw-editor exclusions only for eligible Markdown documents.
- Exactly one representation is authoritative for an eligible tab at a time. Rich and Raw editor states may both remain renderer-owned for tab-local history and view restoration, but content crosses the boundary only during an explicit mode switch; React state, Zustand, the main process, and the filesystem never hold a synchronizing shadow document.
- A successful Rich-to-Raw transfer uses the existing Markdown serializer and the tab's current BOM/newline policy to produce the receiving source text, then removes the encoding BOM and normalizes line separators for the editor. A successful Raw-to-Rich transfer uses the existing loss-safety parser with conversion exceptions treated as refusal and is allowed only when it yields the supported rich representation; otherwise Raw remains authoritative and unchanged.
- Raw mode parameterizes and reuses spec 0011's existing renderer-only TipTap/Lowlight literal editor, adding a Markdown grammar profile, soft-wrap presentation, and a non-editable line-number gutter. No second editor framework or IDE service is introduced, and the editor receives no capability-bearing object.
- Mode conversion is one synchronous, tab-owned state transition. Existing owner/generation/revision currency remains authoritative for operations that actually await, including saves and external reload work; conversion does not invent a parallel completion protocol.
- Position transfer uses one pure editor-level content-anchor mapper rather than parser/serializer source maps. Each selection endpoint is represented by bounded Unicode-scalar content before and after it; the mapper selects the matching destination content boundary nearest the same proportional document progress, breaks ties toward the earlier boundary, and falls back to proportionally clamped progress when no anchor matches. Syntax-only Raw positions map to the nearest content boundary and never become a rich selection.
- When transferred content exactly equals the destination editor's current content, its selection, scroll, and undo history are restored. When content differs, the receiving editor is replaced outside undo history, its stale undo/redo history is cleared, and the mapped selection is applied after replacement.
- Raw source is stored internally as Unicode text with LF editor line separators. Saving applies the document's existing newline convention and BOM policy exactly once; no trim, final-newline insertion, reformatting, or rich canonicalization occurs in Raw mode.
- While this spec is Draft or Approved, current implemented fallback and no-Raw behavior remains shipped. The reviewed change set updates the conflicting spec 0002 language and backlog cross-reference; a separate ADR is required only if implementation must depart from the dependency, authority, or single-owner design fixed above.

## Required implementation ripples

Implementation must inspect these affected paths as one coherent change, editing only where approved behavior requires it. Representation-neutral helpers such as SaveCoordinator, DocumentWatchState, and SearchPanel should be reused unchanged when sufficient. Documentation updates and mapped proof remain required:

- `docs/specs/0002-document-lifecycle-and-tabs.md`
- `docs/specs/BACKLOG.md`
- `docs/specs/README.md`
- `src/platform/electron/menu.ts`
- `src/platform/electron/main.ts`
- `src/platform/contracts.ts`
- `src/platform/electron/preload.ts`
- `src/app/document.css`
- `src/documents/raw-markdown.ts`
- `tests/node/raw-markdown.test.ts`
- `tests/browser/raw-markdown.browser.test.tsx`
- `tests/playwright/browser/raw-markdown.spec.ts`
- `tests/playwright/performance/spec0015.performance.spec.ts`
- `src/documents/markdown.ts`
- `src/documents/text-editor.ts`
- `src/documents/tab-state.ts`
- `src/documents/gateway.ts`
- `src/documents/save-coordinator.ts`
- `src/documents/watch-state.ts`
- `src/app/ShellApp.tsx`
- `src/app/DocumentWorkspace.tsx`
- `src/app/SearchPanel.tsx`
- `tests/node/document-model.test.ts`
- `tests/node/document-state.test.ts`
- `tests/browser/writing.browser.test.tsx`
- `tests/browser/shell.browser.test.tsx`
- `tests/playwright/shell/spec0002.shell.spec.ts`

The exact implementation remains downstream of approval. No code artifact is included in this spec-review change set.

## Behavior (acceptance criteria)

### Eligibility, entry, and tab ownership

- AC1: Given the focused window's active tab is writable Markdown backed by a path or is untitled Markdown and its content is editable UTF-8, when the native View menu is shown, then it contains a Raw Markdown checkbox command with Cmd/Ctrl+E, enabled exactly when that tab is eligible, and checked exactly when that eligible tab is in Raw mode; for every other active tab or no focused window it is disabled and unchecked.
- AC2: Given two native windows with different active-tab eligibility or modes, when focus changes between them, then the native Raw Markdown command's enabled and checked state recomputes from only the newly focused owner, and activating the menu item or accelerator dispatches to only that window.
- AC3: Given an eligible tab, when the user invokes View → Raw Markdown or Cmd/Ctrl+E, then the command toggles that tab between Rich and Raw without opening a dialog, writing a file, changing its path/title, or changing another tab.
- AC4: Given a tab is in Raw mode, when the user switches away and returns, then its Raw mode, selection, scroll position, notices, and current undo/redo history are restored; closing the tab or application discards those view states and reopening starts under the ordinary open routing rules.
- AC5: Given a path-backed or untitled Markdown document contains valid UTF-8 that the loss-safety parser classifies as unsupported or ambiguous for Rich editing, when it opens, then it opens directly in editable Raw mode with a clear non-modal notice that Rich mode is unavailable until the source can be converted safely.
- AC6: Given opening bytes are invalid UTF-8 or require exact byte preservation, then the document remains in 0002's read-only byte-preservation mode, Raw Markdown is disabled, and no decoding, replacement character, or write occurs.
- AC7: Given a generic-text, CSV, JSON, raster, external, read-only, or otherwise ineligible document, then this feature neither changes its editor/routing nor exposes an enabled Raw Markdown command.

### Raw editor behavior

- AC8: Given an eligible tab in Raw mode, then one full-panel source editor exposes the complete Markdown as editable text with Markdown syntax highlighting, visible line numbers, soft wrapping, ordinary caret and range selection, scrolling, and an accessible name that includes the document title and Raw Markdown mode.
- AC9: Given focus is in Raw mode, then typing, deletion, cut/copy/paste, Select All, native platform word/line navigation, and IME composition behave as standard text editing and Markdown syntax is inert: links do not navigate, images do not load, HTML does not execute, and syntax does not grant authority.
- AC10: Given Raw edits, when Undo or Redo is invoked through the standard menu or shortcut, then it traverses only Raw history in normal order; Rich history remains independent and cannot mutate the authoritative Raw source.
- AC11: Given focus is in Raw mode, when Find is invoked, then spec 0004's existing Find surface searches the exact Raw source, preserves its case-insensitive literal/wrapping semantics and match status, and restores a valid Raw selection/focus when dismissed.
- AC12: Given Raw mode at the 480×320 minimum window, 200% zoom, forced colors, reduced motion, or a long unbroken source line, then the editor, line numbers, selection/focus, notice, and Find surface remain visible or scrollably reachable, soft wrap does not require horizontal scrolling for ordinary editing, and meaning does not depend on color or motion alone.
- AC13: Given Raw mode is inspected for accessibility, then its editable region, line-number presentation, notice, command state, focus order, selection, and status updates expose valid roles, names, descriptions, and contrast with no serious automated accessibility violation; decorative syntax spans and line numbers do not pollute the editable value read by assistive technology.

### Explicit representation transfer

- AC14: Given Rich is authoritative, when the user switches to Raw, then the current rich snapshot is serialized once through the existing loss-safe Markdown serializer and installed atomically as the Raw source in one synchronous transition owned by that tab.
- AC15: Given a Rich-to-Raw transfer yields source identical to the Raw editor's current content, then the prior Raw selection, scroll, and history are restored; given it differs, stale Raw history is cleared and the Rich selection is mapped under the content-anchor constraint.
- AC16: Given Raw is authoritative and its source parses to the supported rich representation, when the user switches to Rich, then the parsed snapshot becomes authoritative atomically, the Raw notice clears, and later saving follows existing rich canonical serialization.
- AC17: Given Raw source cannot be converted loss-safely to the supported rich representation, when a switch to Rich is requested, then Raw remains authoritative with byte-for-byte-equivalent Unicode source, path, dirty state, selection, scroll, and history preserved, and a clear non-modal notice explains that Rich mode is unavailable without claiming the file was saved.
- AC18: Given a Raw-to-Rich transfer yields a rich document structurally equal to the Rich editor's current document, then the prior Rich selection, scroll, and history are restored; given it differs, stale Rich history is cleared and the Raw selection is mapped under the content-anchor constraint.
- AC19: Given a collapsed or ranged selection transfers between modes, then each endpoint uses the deterministic content-anchor rule, the resulting endpoints remain ordered and within the destination document, and the range collapses only when both endpoints resolve to the same nearest representable boundary.
- AC20: Given either editor has an active IME composition, when mode switch, tab switch, Save, Save As, Save All, or close capture begins, then composition is committed exactly once before the authoritative snapshot is captured; the committed text is neither omitted nor duplicated.
- AC21: Given the user toggles modes without changing authoritative content, then the operation creates no dirty transition, preview pin, save request, filesystem write, or synthetic undo event; a tab already dirty remains dirty for its existing reason.

### Dirty state, saving, and recovery

- AC22: Given Raw is authoritative, when the user changes source text, then the tab synchronously becomes content-dirty and a preview tab pins before later tab/save/close logic can observe it; returning the text exactly to its accepted baseline clears only content dirtiness allowed by the existing title/content dirty model.
- AC23: Given Save, Save As, Save All, or close-with-save captures a Raw tab, then it captures mode, source revision, exact Unicode source, path/title state, BOM/newline policy, and generation synchronously and writes bytes produced by applying only that encoding policy; spaces, escapes, syntax spelling, Unicode, and presence or absence of a final newline otherwise remain exactly as authored.
- AC24: Given a Raw document uses CRLF or a UTF-8 BOM under the existing document encoding policy, when it saves, then every editor LF is emitted as CRLF and the BOM is preserved exactly once; a document without those properties does not acquire them.
- AC25: Given no content or title differs from the accepted baseline, when Save or Save All runs in Raw mode, then the existing unchanged result performs no write; mode choice, selection, scroll, notice, and history alone never make a document dirty.
- AC26: Given a save captured Raw revision N and the user edits or changes mode before it completes, then a successful completion may accept only the captured bytes/path/title baseline and cannot clear the later revision, replace either editor, change mode, move focus, or make the tab falsely clean.
- AC27: Given Raw Save or Save As is canceled, conflicts, or fails, then the source, path/title ownership, mode, selection, history, dirty state, and recoverable editor remain intact, and existing failure-atomic notices/actions apply without a second write path.
- AC28: Given Save All includes eligible Rich tabs, Raw tabs, and other writable document kinds, then each tab contributes one owner-bound snapshot through the existing coordinator; completion order cannot apply one tab's baseline, notice, mode, or bytes to another tab.
- AC29: Given a dirty Raw tab is closed, a window closes, or quitting is requested, then existing close-confirmation and save/discard/cancel behavior uses the current Raw snapshot; cancellation keeps the same tab and recoverable Raw editor state.
- AC30: Given an externally changed eligible Markdown file is clean, when existing reload handling accepts the change, then the new bytes are routed afresh: supported content opens Rich and valid unsupported/ambiguous UTF-8 opens Raw, both editor histories and obsolete transfer state reset, and invalid UTF-8 follows byte-preservation behavior.
- AC31: Given an externally changed eligible Markdown file is dirty in either mode, then existing conflict handling prevents automatic replacement and overwrite; choosing the existing reload/discard path routes the external bytes as in AC30, while keeping local content preserves the current authoritative editor and dirty state.
- AC32: Given save, external reload, or another genuinely asynchronous operation completes after its tab closed, changed path identity, changed generation or authoritative revision, or lost window ownership, then existing completion-currency rules ignore it so it cannot resurrect the tab, mutate another tab, write stale bytes, or steal focus; mode conversion itself never awaits.

### Security, proof, and performance

- AC33: Given arbitrary Raw Markdown containing HTML, script-like text, remote URLs, local paths, embedded data, malformed delimiters, or extremely nested syntax, then editing, highlighting, finding, remaining in Raw, and failed conversion perform no navigation, resource fetch, HTML execution, filesystem read, dialog, IPC, preload call, or capability acquisition beyond existing user-initiated lifecycle operations. Successful entry into Rich restores existing Rich image behavior under specs 0005–0006.
- AC34: Given independently authored boundary fixtures for supported Markdown, unsupported/ambiguous valid UTF-8, invalid UTF-8, BOM/no-BOM, LF/CRLF, escapes, raw HTML, tables, images, lists, Unicode including combining characters and surrogate pairs, malformed syntax, and representative content-anchor matches, duplicates, and misses, then parse/serialize classification, Raw save fidelity, conversion refusal, and deterministic selection transfer prove the safety boundary without deriving expected output from the production parser, serializer, or mapper.
- AC35: Given the repository's controlled large Markdown workloads and current document-size bounds, when Raw opens, edits near the beginning/middle/end, finds, switches modes, scrolls, and saves, then interactions remain responsive enough to complete the existing non-blocking performance project, no operation performs network work, and ordinary Raw edits do not invoke whole-document rich parsing or serialization until an explicit mode switch or save requires it.
- AC36: Given static dependency, import-boundary, and bundle verification, then Raw mode reuses the existing TipTap/Lowlight literal-editor stack without adding a second source-editor framework, IDE service, network-capable extension, or capability-bearing renderer import.
- AC37: Given packaged-shell Raw editing and conversion journeys, then Electron security invariants remain green and public-network observation records zero requests while opening Raw mode, editing, finding, attempting failed and successful conversion, saving, and closing.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1–AC2 | Shell smoke | Node menu-template and focused-owner policy where pure |
| AC3–AC4 | Playwright-vs-vite | Browser Mode tab-state coverage |
| AC5–AC7 | Playwright-vs-vite | Node open-routing classification |
| AC8–AC13 | Browser Mode | Playwright-vs-vite complete Raw editing/Find journey; automated accessibility scan |
| AC14–AC19 | Browser Mode | Node boundary-map and transfer-policy fixtures |
| AC20 | Browser Mode | Playwright-vs-vite mode/tab/save/close composition journey |
| AC21–AC22 | Browser Mode | Playwright-vs-vite preview/dirty journey |
| AC23–AC25 | Node | Playwright-vs-vite Save/Save All journey; shell smoke for real BOM/newline bytes |
| AC26–AC29 | Playwright-vs-vite | Node save-coordinator generation proof |
| AC30–AC32 | Playwright-vs-vite | Node routing and completion-currency proof |
| AC33 | Playwright-vs-vite | Static capability-boundary checks; public-network observation |
| AC34 | Node | Browser Mode selection-transfer coverage |
| AC35 | CI | Browser Mode controlled-workload interactions |
| AC36 | Static | CI dependency and bundle inspection |
| AC37 | Shell smoke | CI packaged-security and public-network artifact |

## Open questions

- (none)
