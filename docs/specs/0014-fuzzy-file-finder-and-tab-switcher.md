# Spec 0014: Fuzzy File Finder and Tab Quick Switcher

**Status:** Implemented   **Date:** 2026-08
**Writer:** Codex (GPT-5)
**Approver:** Mateus (user)
**Approval digest:** `sha256:64681aec24cd04dceaa644c44ff305fcb0bdb34b6ca2e2d8aa5aa98ae0dbf2f5`
**Origin:** Promotes the former third in-scope backlog item at the user's request. The backlog carried forward an unimplemented old-repository direction of VS Code-style Cmd/Ctrl+P search, a watcher-maintained flat workspace scan, and `fuzzysort`; after reviewing the first Draft's custom scorer, the user explicitly chose [`fuzzysort`](https://www.npmjs.com/package/fuzzysort). The selected exact release is 4.0.2: an MIT-licensed ESM package with built-in TypeScript declarations, zero runtime dependencies, immutable prepared snapshots, bounded result queries, and library-owned normalization and scoring.

## Problem

Finding a deeply nested file currently requires expanding and navigating the workspace tree, and switching among many open tabs requires repeatedly cycling or scanning a crowded tab strip. Users need fast, keyboard-first access to every actionable workspace file and every live tab without weakening root authority, preview ownership, file classification, or current editor state.

## Non-goals

- Full-text or document-content search, symbol search, command palette behavior, commands mixed into filename results, replace, filename mutation, file creation, or directory navigation.
- File finding in a single-file window, searching outside the current workspace's accepted roots, searching another window's roots, or using recent files that are no longer present in the workspace collection.
- Persisting a file collection, query history, result history, tab MRU order, or any filename/path-derived state across application launches.
- Showing dot-prefixed files or descendants of dot-prefixed directories, traversing directory symlinks, reading file bytes for indexing or ranking, parsing `.gitignore` or another ignore format, or following a file symlink before activation.
- Changing document classification, title, save, external-change, application-wide deduplication, preview/pin, or unsupported-file handoff behavior owned by specs 0002, 0003, and 0009–0011.
- Tab previews, tab closing, tab reordering, cross-window tab movement, session restore, or switching to a tab owned by another window.
- A configurable ranking algorithm, configurable result limit, fuzzy-search settings, online search, telemetry, or a new general filesystem/search capability.

## Constraints and shared invariants

- Specs 0002 and 0003 remain authoritative for tab state, IME commit, structured-draft commit, active-editor focus, application-wide FileKey ownership, root containment, symlink revalidation, preview replacement, watcher batching, root disposal, and stale async completion. Specs 0009–0011 remain authoritative for classification and the editable, raster, and external document variants.
- Each workspace window owns one application-lifetime, memory-only flat collection scoped to its main-assigned WindowId and accepted RootIds. The main process sorts entries once by root insertion order and original code-point relative-path order, then prepares one immutable `fuzzysort.snapshot(entries, { key: entry => entry.relativePath })`; querying returns each original entry as `result.obj`, so no side map or duplicate-path correlation layer exists, and renderer tree expansion state neither supplies nor limits the collection.
- Collection entries contain only the owning RootId, logical relative path, and Platform-issued FileKey from the current filesystem snapshot. Basenames and current disambiguated root labels are derived when a result is constructed; entries and the prepared search snapshot contain no file bytes, document content, canonical target path, persisted label, or authority to open without activation-time revalidation.
- Recursive indexing follows ordinary directories only, applies spec 0003's dot-name exclusion to every path segment, includes regular files and file-symlink rows because every such row is actionable, and treats directory symlinks as terminal exclusions.
- Matching, normalization, and relevance ranking use exact dependency `fuzzysort` 4.0.2, recorded in `package.json` and the lockfile without a version range. Queries call `fuzzysort.go(query, snapshot, { limit: 100, threshold: 0 })`, use `results.total` to report truncation, and post-sort only the returned equal-score results by root insertion order and original code-point relative-path order; Markzen configures no remapping or custom `scoreFn`, runs no unlimited fallback query, and never uses library-generated HTML highlighting.
- File activation factors and reuses the existing workspace-open path and registry transaction with `{ rootId, relativePath, fileKey, pinned }`; the finder adds no activation intent, authority schema, or parallel transaction. Result metadata is display and correlation data only, and main retains sender, live-window/root, current identity/type, and containment validation.
- The file finder and tab switcher are mutually exclusive modal surfaces. Opening either closes any other non-destructive overlay under its existing cancellation rules, while an unrelated destructive confirmation retains priority and blocks the new surface.
- Implementation updates accepted ADRs 0001, 0004, and 0006 only where their capability, tab-activation, and watcher boundaries expand, and adds one narrowly scoped accepted ADR, numbered after the current last ADR, for bounded collection scanning, atomic prepared-snapshot replacement, and the pinned `fuzzysort` configuration.

## Behavior (acceptance criteria)

### File-finder invocation and modal behavior

- AC1: Given a focused workspace window, when File → Go to File… or Cmd/Ctrl+P is invoked and no destructive modal is active, then one modal file finder opens immediately, the named search input receives focus, and the current document, selection, dirty state, preview state, and tab ownership remain unchanged.
- AC2: Given a single-file window or no focused Markzen window, then Go to File… is disabled and Cmd/Ctrl+P creates no window, root, scan, tab, or dialog.
- AC3: Given the file finder is open, when Escape, its named Close action, or an outside dismissal permitted by the shared modal policy occurs, then it closes without activating a result and focus returns to the invoking control or the previously focused editor position if that owner remains live.
- AC4: Given a destructive confirmation, Settings, Find, or the tab switcher is open, when the file finder is requested, then destructive confirmation blocks it, while each non-destructive surface closes through its ordinary cancellation path before the finder opens; at most one modal or non-destructive overlay owns focus.
- AC5: Given active IME composition in the current editor, when the finder is invoked, then the composition commits once to its originating tab before focus moves; given IME composition in the finder input, query evaluation waits for the composition update/end events and never treats intermediate composition key presses as navigation or activation commands.

### Matching, ranking, and result presentation

- AC6: Given a non-empty query, then its trimmed value and every collected logical relative path are passed to pinned `fuzzysort` 4.0.2 without Markzen-defined tokenization, case conversion, character remapping, typo rules, or custom scoring; matching, whitespace behavior, NFKD/diacritic normalization, and lookalike remapping are exactly the dependency's documented behavior.
- AC7: Given matching candidates, then descending `fuzzysort` score determines relevance order and Markzen resolves only equal-score ties by earlier root insertion and then original code-point relative-path order; no parallel exact/prefix/subsequence/path scoring algorithm exists.
- AC8: Given repeated queries over the same prepared filesystem snapshot and pinned dependency version, then the same candidates appear in the same order on macOS, Windows, Linux, MemoryPlatform, and Electron regardless of directory enumeration order or UI locale.
- AC9: Given an empty query, then no arbitrary file list is shown and the finder prompts the user to type a filename or path; no recent-file or usage-derived ranking is constructed.
- AC10: Given more than 100 matches, then only the highest-ranked 100 are returned and rendered, the status states that additional matches exist, and refining the query can reveal previously truncated candidates without changing the index.
- AC11: Given one result, then its primary label is the complete basename and its secondary label is the logical parent path prefixed by spec 0003's disambiguated root label; same-named files in one or several roots remain distinguishable visually and to assistive technology without exposing a canonical target path.
- AC12: Given query text changes rapidly or a prepared snapshot generation changes while queries are pending, then only the newest query against the newest accepted snapshot generation may replace the visible result set, selection, count, or status.

### Index construction, freshness, and failure

- AC13: Given a workspace becomes ready, then its initial recursive collection scan starts asynchronously after the initial root snapshot renders and neither delays workspace-ready nor reads document bytes; opening the finder before the filesystem scan settles shows only an announced indexing state rather than partial results, and the indexing state ends when the immutable prepared snapshot is published without a custom preparation-readiness probe or warm-up query.
- AC14: Given several roots, then one workspace-owned asynchronous scan visits roots in insertion order, performs one ordinary directory-list operation at a time, checks its generation after every await, and publishes one immutable prepared workspace snapshot only after that filesystem scan generation settles; editor, tree, tab, and finder input remain responsive while the existing asynchronous list calls are pending.
- AC15: Given an unreadable, missing, or changed directory during scanning, then the settled snapshot contains complete results from successfully scanned directories, the affected root receives one non-blocking incomplete-index warning and named Retry action, no guessed descendants remain, and restoring access plus Retry rebuilds the workspace snapshot.
- AC16: Given an external visible-file create, delete, rename, or move under a healthy watched root, then the existing batched watcher invalidation marks the prepared snapshot stale and starts one coalesced workspace rebuild within the existing 1,500ms tree-convergence bound; current results remain queryable with stale status until the completed filesystem scan atomically replaces the snapshot, without opening, reading, classifying by content, or changing a tab.
- AC17: Given a watcher failure, then the current prepared snapshot remains queryable but the finder identifies the affected root as potentially stale; the existing explicit root Retry is the only application-owned watcher re-registration path, and a successful retry rebuilds the workspace snapshot.
- AC18: Given a root is added while its workspace and finder remain open, then the current prepared snapshot remains queryable while one rebuild runs, selection remains stable when its FileKey is still present, and the new root appears only when the complete replacement snapshot is published.
- AC19: Given a workspace window or RootId is disposed, then its collection entries, prepared snapshots, scans, queued reads, query work, timers, and result delivery are canceled or ignored and cannot mutate or disclose state to another live window.

### Result navigation and activation

- AC20: Given finder results, then exactly one result is active when results exist; ArrowDown/ArrowUp move cyclically, Home/End move to the first/last result, pointer hover may update the active result, and movement scrolls that result into view without opening a file.
- AC21: Given an active result, when Enter or a primary pointer activation is used, then the mounted finder starts the shared workspace-open flow with preview semantics and closes only after successful activation; Cmd/Ctrl+Enter or the result's named Keep Open action requests pinned semantics instead.
- AC22: Given a result whose current FileKey is already owned in the same window, when activated, then the existing tab is focused and it is promoted only for pinned activation; given ownership is in another window, that owner is focused without changing preview/pin state or creating a duplicate.
- AC23: Given a clean preview exists, when a different unowned result is activated with preview semantics, then the existing preview is reused through spec 0003's atomic replacement; given the preview is dirty or a pinned activation was requested, existing pin-before-replacement and pinned-before-preview ordering remain unchanged.
- AC24: Given current structured editor input cannot commit, including an incomplete JSON numeric draft, when a finder result is activated, then activation is blocked, the finder remains open with an accessible explanation, and neither tab, preview, registry, file, nor query state changes.
- AC25: Given a result disappears, changes identity, becomes a directory, resolves outside its root through a file symlink, or fails current read/classification between indexing and activation, then main rejects the stale activation under spec 0003, no previous preview is invisibly retained or unrelated file opened, and the mounted finder remains unchanged except for an accessible result-specific error and refreshed query.
- AC26: Given activation begins and then the finder query changes, the target root/window is disposed, or a newer activation supersedes it, then the stale completion cannot close the current surface, change focus, replace a preview, register a tab, or expose an error in another generation.

### Tab quick switcher

- AC27: Given the current window has at least two live tabs, when Window → Switch Tab… or Ctrl+Tab is invoked from any focus location and no destructive modal is active, then one modal tab switcher opens with the most recently active other tab selected; the current tab remains active until the selection is committed.
- AC28: Given the tab switcher was opened by holding Ctrl, then repeated Ctrl+Tab moves forward through the current window's in-memory most-recently-used order, Ctrl+Shift+Tab moves backward, and releasing Ctrl activates the selected tab; Escape before release cancels and suppresses release activation.
- AC29: Given the tab switcher is open for pointer, assistive-technology, or non-chord operation, then ArrowDown/ArrowUp, Home/End, pointer selection, Enter, its named Switch action, Escape, and Close provide the same selection, commit, and cancellation outcomes without requiring the user to hold a modifier.
- AC30: Given the current window has fewer than two tabs, then Switch Tab… is disabled and Ctrl+Tab retains the current tab and focus without showing an empty switcher.
- AC31: Given switcher rows, then each names the tab's complete accessible filename or Untitled state, secondary workspace path where present, dirty state, and Preview state; visual truncation does not remove this accessible information.
- AC32: Given a tab activation succeeds by any existing path, then that tab moves to the front of the window-local MRU list while the remaining live tabs retain relative order; new tabs join when first activated, closed tabs are removed, and this order neither reorders the tab strip nor persists after window disposal.
- AC33: Given a tab closes, becomes invalid, or changes title, path, dirty state, or preview state while the switcher is open, then its row updates or disappears, selection moves deterministically to the next row or previous last row, and a disposed TabId cannot be activated.
- AC34: Given switcher commit from an editor, tab control, title field, sidebar, modal command, or another control, then spec 0002's captured editor state, IME/structured-draft commit, focus-origin rules, selection, scroll, undo history, and stale-generation protection apply exactly once; a blocked commit leaves the current tab and switcher open with an accessible explanation.

### Accessibility, security, and measurable performance

- AC35: Given either modal, then it uses a named dialog with one combobox/searchbox and listbox for file finding or one listbox for tab switching, exposes active selection, result position/count, indexing/stale/error status, keyboard instructions, and polite outcome announcements, traps Tab/Shift+Tab only within its visible controls, and restores focus under AC3 or the activated tab's existing focus contract.
- AC36: Given either modal at 480×320, 200% zoom, forced colors, or reduced motion, then input, result labels, secondary paths, status, focus, selection, errors, and actions remain visible or scrollably reachable and distinguishable without color or motion alone; no result row or control requires hover, animation, or horizontal page scrolling.
- AC37: Given the expanded preload surface, then it adds only one bounded query intent plus owner-scoped status/generation events while collection scans remain automatic and main-owned and existing root Retry and workspace-open intents remain authoritative; sender validation occurs before closed query parsing, queries are bounded to 512 Unicode scalar values, result payloads to 100 closed entries, and no new API accepts an absolute path, arbitrary root/window owner, content predicate, glob, regular expression, traversal, raw filesystem operation, canonical target path, activation authority, or renderer-selected event destination.
- AC38: Given a forged, oversized, stale, foreign-window, disposed-generation, or mismatched query payload or status/generation event, then it is rejected or ignored before query, focus, registry, or disclosure work and another owner receives no result or state change; the renderer has no collection-build, scan, watcher, or root-retry command beyond spec 0003's existing intents.
- AC39: Given a synthetic workspace of 50,000 visible files across 20 roots, when CI performs initial scanning, `fuzzysort.snapshot()`, and exact, compact, sparse, whitespace, diacritic, no-match, and 100-plus-result queries, then it verifies the fixture and query families ran and records directory reads, collection/snapshot build duration, query p50/p95/max, maximum renderer-heartbeat gap, and observed result counts in human- and machine-readable artifacts without gating the build on timing values.
- AC40: Given a controlled fixture with exactly 100 open tabs, when CI opens the switcher and traverses every row by chord and listbox navigation, then all 100 fixture rows render in one scrollable listbox with deterministic MRU order and no editor serialization or state loss, while open-to-paint and navigation-to-paint p50/p95/max are recorded without gating the build on timing values; this fixture creates no product-wide tab cap.
- AC41: Given automated tests at any layer, then they use MemoryPlatform fixtures, ordinary controlled directory-list promises, real pinned-dependency snapshots, and controlled watcher events; tests perform no developer-filesystem crawl and finder or switcher behavior makes no network request, telemetry event, document serialization, file write, or settings write.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1–AC5 | Browser Mode | Playwright-vs-vite workspace/surface/IME journey; shell menu enablement |
| AC6–AC12 | Node | Browser Mode listbox presentation and stale-query behavior |
| AC13–AC19 | Node | Playwright-vs-vite indexing status, watcher, add-root, Retry, and disposal journey; shell watcher smoke |
| AC20–AC26 | Playwright-vs-vite | Node ranking/activation generations; shell cross-window, file-symlink, and current-classification smoke |
| AC27–AC34 | Browser Mode | Playwright-vs-vite MRU, mutation, structured-draft, IME, and focus journeys; shell accelerator smoke |
| AC35–AC36 | Browser Mode | Automated accessibility scan; Playwright minimum-size and 200%-zoom journey |
| AC37–AC38 | Node | Static preload/import boundary; shell forged/stale/cross-window negatives |
| AC39–AC40 | CI | Node deterministic-order and operation-bound assertions; Browser Mode bounded-DOM assertion |
| AC41 | Static | Node injected-scheduler and transport-negative assertions |

## Open questions

- (none)
