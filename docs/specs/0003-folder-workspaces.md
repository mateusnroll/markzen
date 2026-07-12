# Spec 0003: Folder Workspaces

**Status:** Implemented   **Date:** 2026-07
**Origin:** Consolidates draft specs 0005–0007 and selected behavior from drafts 0011 and 0014. Old-repo sources: `folderOperations.ts`, `fileSystemStore.ts`, `Sidebar.tsx`, `FileTree*.tsx`, `fileOperations.ts`, `tabsStore.ts`, `useFileWatcher.ts`, Rust `fs_watcher.rs`, `settingsStore.ts`, and `settingsPersistence.ts`; commits `0ee3d66`, `121b2ce`, `bb046bd`, `99daa2d`, `73ddd75`, `e89d987`, `c8a5326`, `68d2387`, and `8883f89`; old ADRs 0006, 0010, and 0013. Multi-root workspaces, canonical identities, main-process settings authority, and the async race policy are new in the rewrite.

## Problem

Users work in folders of related Markdown files, often combining several roots in one window. A folder workspace must make those files quick to browse without flooding the tab bar, remain correct while asynchronous reads and external filesystem events race, and preserve its global sidebar preference across windows and restarts.

This milestone owns the folder-window lifecycle, multi-root tree, preview tabs, filesystem invalidation, relative-path title context, sidebar accessibility, and the persistence service required by sidebar width. It consumes milestone 0001's canonical path and window-ownership contracts and milestone 0002's app-wide tab registry.

## Non-goals

- Creating, deleting, renaming, or moving files from the tree; context menus; drag-and-drop.
- Removing or reordering roots after they are added.
- Restoring workspace root sets, expanded directories, open tabs, previews, or scroll positions after restart.
- Converting a non-pristine single-file window into a workspace window; Open Folder creates a new window.
- Naming or saving root sets as reusable workspace files.
- Redefining milestone 0002's open-document reload and explicit external-conflict decisions; this milestone adds directory-tree invalidation and reuses the existing document watcher/coordinator behavior.
- Previewing file types other than the recognized `.md`, `.markdown`, and `.txt` document extensions.
- More than one preview tab in a workspace.
- Changes to milestone 0002's filename editing or on-disk rename behavior; this milestone adds only workspace-relative secondary path context to the existing editable title.
- Theme, toolbar, font, auto-save, spell-check, or general Settings UI; this milestone defines a closed version-1 settings service containing only `sidebarWidth`, and later approved specs extend that typed schema directly.
- File-name fuzzy finding or full-text search.

## Terminology and constraints

- A folder workspace is one main-owned `WindowId` from milestone 0001. Opening the same folder twice creates independent windows, not a second authority identifier.
- A **RootId** is an opaque identifier for one accepted root membership inside a workspace. Tree expansion, loading, invalidation, errors, and watcher state are keyed by RootId plus the entry's logical relative path.
- A **FileKey** and validated `Path` come from milestone 0001's Platform contract. This milestone never reorders lexical normalization and symlink resolution or constructs identity by string manipulation.
- A root retains both its user-facing logical path and its canonical path. Logical paths drive labels and breadcrumbs; canonical paths drive containment, duplicate detection, watcher routing, and FileKeys.
- Tab uniqueness is enforced by FileKey across the entire application. A request from another workspace focuses the existing owner window and tab rather than creating a second editor for the file.
- `Platform.fs.list` is one batched operation. Each returned temporary entry snapshot contains only its name, kind, logical path, and Platform-issued FileKey. Ordinary entries reuse the canonical parent established by the Platform; only symlinks require special resolution. Canonical target paths never cross into the renderer. Watcher invalidation makes affected snapshots stale, and file activation revalidates current identity, type, and canonical root containment before a read or registry transition.
- Every asynchronous folder dialog, workspace bootstrap, directory read, preview read, and watcher refresh carries its owning WindowId/RootId plus a monotonically increasing request generation. Results whose owner was disposed or whose generation is no longer current are ignored. Accepted settings revisions are application-service-owned and outlive the initiating window.
- Main-process filesystem access is exposed through `Platform`; renderer modules do not import Electron, Node filesystem APIs, or chokidar.
- Workspace roots extend the existing `Platform.watch` capability used for exact-document watching. The real adapter uses the already-installed chokidar backend; the memory adapter uses the existing `MemoryWatchPort`. Raw events invalidate directory snapshots and never directly patch renderer tree nodes or document content. Directory symlinks are terminal and root watches never follow them.
- Tree rows are windowed so the DOM size is proportional to the viewport, not the number of loaded entries.
- A single flat version-1 `settings.json` in the platform configuration directory (Electron `userData`) is owned and written only by the main process. Renderers submit closed patches of at most 4 KiB and apply ordered snapshots; they never read or write the file directly. The service reads at most 1 MiB and preserves unknown persisted properties only when their recursive values are JSON data, their keys are not `__proto__`, `prototype`, or `constructor` at any depth, and the total file remains within that bound. There is no version-0 migration or generic schema registry.
- Folder, root, tree-entry, preview, watcher, and settings IPC are narrow application intents. The main process validates the exact live application sender before parsing a closed payload, derives window authority from that sender, and resolves all renderer-provided IDs and generations against main-owned registrations. Renderer paths, FileKeys, RootIds, window kinds, settings keys, and event destinations never grant authority.
- Latency measurements in this milestone run in the existing performance project outside `npm run verify`, report real directory listing separately from deterministic filtering/sorting and rendering, and remain non-blocking until a later approved spec establishes gating baselines. Deterministic behavioral bounds such as DOM row count and invalidation batch count remain blocking at their mapped layers.

## Behavior (acceptance criteria)

### Workspace windows and roots

- AC1: Given the app, when the user chooses File → Open Folder… (Cmd/Ctrl+Shift+O) and selects a readable directory, then a new 1200×800 workspace window becomes ready with that directory as its first expanded root; workspace-ready means the renderer booted, the initial settings snapshot applied, the root was canonicalized, and its initial directory snapshot rendered successfully.
- AC2: Given the Open Folder dialog, when the user cancels it, then no window, workspace, root, tab, or setting changes.
- AC3: Given Open Folder is invoked from a pristine single-file window containing one empty non-dirty untitled tab, when the new workspace window reports ready, then the pristine source window closes.
- AC4: Given Open Folder is invoked from any live source window, when window creation, root canonicalization, or the initial root read fails before workspace-ready, then the source window remains unchanged, the attempted workspace window and every allocated root/watcher are disposed, and an accessible error identifies the failed folder.
- AC5: Given one workspace already contains a folder, when the same folder is opened with Open Folder again, then a second independent workspace window is created.
- AC6: Given the application menu, then Add Folder… is enabled only while a workspace window is focused.
- AC7: Given the Add Folder dialog in a workspace, when the user cancels it, then that workspace's roots and UI state are unchanged.
- AC8: Given a workspace, when the user adds a new readable directory, then a new expanded root section is appended after the existing sections.
- AC9: Given dirty tabs, tree expansion, tree scroll, and an active preview in a workspace, when a distinct root is added, then those existing states are unchanged.
- AC10: Given a newly created workspace and its accepted roots, then the workspace uses its main-assigned WindowId and each accepted root has a distinct opaque RootId.
- AC11: Given a directory already present as a root in a workspace, when an equivalent canonical path is added, then no new RootId or watcher is created and the existing root is expanded and scrolled into view.
- AC12: Given root path aliases that milestone 0001's Platform canonicalization reports as the same canonical directory, when added, then duplicate detection treats them as the same root without applying an independent lexical rewrite.
- AC13: Given two symlink paths resolving to the same existing directory, when both are added to one workspace, then duplicate detection treats them as the same root.
- AC14: Given one root is an ancestor of another, when both are added, then both receive independent RootIds and independent tree state.
- AC15: Given a descendant root is already present, when its ancestor is added later, then the ancestor is accepted as a separate root.
- AC16: Given several accepted roots, then root sections remain in insertion order.
- AC17: Given roots with the same final folder name, then each header adds the shortest parent-path suffix that makes its visible label unique.
- AC18: Given a file reachable through multiple entries or workspaces, when any entry opens it, then exactly one tab exists application-wide for its revalidated FileKey and every losing request focuses that owner.
- AC19: Given the active FileKey appears through several roots or symlink aliases, then every visible entry for that FileKey shows the active-file state.
- AC20: Given two workspaces concurrently activate aliases that revalidate to the same FileKey, then exactly one request reserves and opens it while the other focuses that owner without creating duplicate editor state.

### Tree loading and filesystem paths

- AC21: Given a loaded directory, then its children sort directories first and otherwise with `Intl.Collator('en-US', { usage: 'sort', sensitivity: 'base', numeric: false })`, with original code-point order as the deterministic tie-breaker.
- AC22: Given directory entries whose names begin with `.`, then those entries do not appear in the tree.
- AC23: Given a directory that has never been expanded, then rendering its collapsed row performs no child-directory read.
- AC24: Given an unloaded collapsed directory, when it is expanded, then its row exposes a loading state until that generation's read settles.
- AC25: Given a directory whose current snapshot is already loaded and valid, when it is collapsed and expanded again, then it reopens without another filesystem read.
- AC26: Given a directory read is pending, when a newer collapse, invalidation, or re-expansion supersedes it, then the stale result cannot replace the newer tree state.
- AC27: Given a directory read fails because it is unreadable, then its loading indicator clears and its row exposes an accessible error without affecting sibling directories.
- AC28: Given a directory previously failed to load, when the user activates Retry after access is restored, then a new generation loads its children.
- AC29: Given a `.md`, `.markdown`, or `.txt` entry matched case-insensitively, when activated, then it opens through the workspace preview policy.
- AC30: Given another file type, then its row is visibly subdued, exposes `aria-disabled="true"`, and activation performs no open operation.
- AC31: Given a workspace has no open tab, then the editor pane shows “Select a file from the sidebar” and no stale document content.
- AC32: Given a root header is collapsed, then all of that RootId's descendant rows are removed from the visible tree without discarding their valid cached snapshots.
- AC33: Given an accepted root becomes unreadable, missing, or no longer a directory, then its header remains in place and exposes an unavailable state without changing other roots.
- AC34: Given an unavailable root becomes readable again, when the native watcher reports recovery or the user retries successfully, then the root snapshot is invalidated and the expanded root reloads.
- AC35: Given a deeply nested recognized document file, when each ancestor is expanded and the file is activated, then the correct FileKey opens.
- AC36: Given root and entry paths containing spaces or non-ASCII characters, when they pass through dialog, main process, watcher, and renderer boundaries, then their logical labels and FileKeys remain correct.
- AC37: Given any directory symlink in a root snapshot, then it is rendered as a terminal linked-folder row whose accessible description says that its target must be added as a root; it has no expansion state and starts no child read.
- AC38: Given a directory symlink is circular, aliases an in-root directory, or resolves outside the canonical root, then it creates no recursive traversal or watcher authority and discloses no canonical target path.
- AC39: Given two logical entries resolve through symlinks to the same existing recognized document file, then both entries receive the same FileKey.

### Document title context

- AC40: Given an open `.md`, `.markdown`, or `.txt` file, then the existing editable document title continues to show its filename without the recognized extension, matched case-insensitively.
- AC41: Given an open file contained by several overlapping roots, then the title's secondary path is computed against the deepest canonical containing root.
- AC42: Given two containing roots are equally deep, then the root added earliest supplies the title's secondary path.
- AC43: Given an open file is outside every root in its workspace, then the title shows no secondary relative path.
- AC44: Given an open file is directly inside its selected root, then the title shows no empty, dot, or slash-only secondary path.
- AC45: Given a nested file, then the secondary path uses `/` separators, may be visually middle-truncated, and exposes the complete logical relative directory to assistive technology and in a tooltip.

### Preview and pinned tabs

- AC46: Given a workspace tree, when a recognized document file is single-clicked or activated with the preview command, then the sole preview tab is selected immediately in a target-specific loading state unless revalidation finds an application-wide owner, in which case that owner is focused.
- AC47: Given a preview tab, then it is right-most and is distinguished from pinned tabs by an icon and accessible “Preview” description in addition to italic styling.
- AC48: Given an existing clean preview A, when file B is previewed and its current identity and containment revalidate successfully, then the same tab identity is reused and the registry transition from A to B follows AC126.
- AC49: Given a preview unexpectedly has a dirty editor state, when another preview is requested, then the dirty preview is pinned before the new preview is created or reused.
- AC50: Given a preview tab, when its document or pending filename first changes through typing, a checkbox, undo/redo, rename input, or any persistent editor command, then it is synchronously pinned before the mutation can be exposed to preview replacement; selection, focus, hover, and search decorations do not pin it.
- AC51: Given a preview tab, when Save is invoked, then it is pinned before the save transaction starts.
- AC52: Given a file shown in the preview tab, when its tree row is double-clicked, then that same tab is pinned.
- AC53: Given a preview tab header, when it is double-clicked, then that tab is pinned.
- AC54: Given keyboard or assistive-technology focus in a preview tab, when its accessible Keep Open action is invoked, then that tab is pinned.
- AC55: Given a preview tab exists, when a new pinned tab opens, then the pinned tab is inserted immediately before the preview.
- AC56: Given a tree alias revalidates to a FileKey already open in the same workspace, when it is activated, then the existing tab is focused and it is promoted only when the activation requested pinned semantics.
- AC57: Given a FileKey already open as the preview, when a pin command targets it, then the existing preview is promoted rather than reopened.
- AC58: Given the preview is the last tab, when it closes, then the editor returns to the workspace empty state.
- AC59: Given a preview read is pending and the user activates a pinned tab before it settles, then a successful result updates only the preview's stored state, does not overwrite the active editor, and does not steal focus.
- AC60: Given preview A's read is pending, when preview B is requested and B resolves first, then A's later result is ignored.
- AC61: Given the browser emits the single-clicks preceding a double-click, when a file is double-clicked, then one tab is opened and pinned without a duplicate final read.
- AC62: Given preview B's revalidation or read fails after a clean preview A was targeted for replacement, then A's registry ownership is released, neither A nor B remains invisibly owned by that preview, and the selected non-path-backed preview shows a B-specific accessible error with Retry and no previous file content.
- AC63: Given a preview read is pending, when its workspace or target tab is disposed, then the eventual result causes no tab or editor update.

### Tree, splitter, and preview accessibility

- AC64: Given a root section header, then it is a named button exposing `aria-expanded`, the disambiguated root label, and the complete logical root path.
- AC65: Given an expanded root, then its file hierarchy uses `tree`/`treeitem` semantics with accurate `aria-level` and directory `aria-expanded` values.
- AC66: Given focus within a root tree, then exactly one visible tree item participates in the tab order and ArrowUp, ArrowDown, Home, and End move that roving focus without opening a file.
- AC67: Given tree focus on a directory, then ArrowRight expands or enters it and ArrowLeft collapses it or moves focus to its parent.
- AC68: Given printable-key input in a focused tree, then typeahead moves focus to the next visible sibling whose label has that case-insensitive prefix.
- AC69: Given a focused recognized document tree item, when Enter or Space is pressed, then it opens through preview semantics.
- AC70: Given a focused recognized document tree item, when Cmd/Ctrl+Enter is pressed, then it opens or promotes a pinned tab.
- AC71: Given the active FileKey has several visible aliases, then each alias exposes `aria-current="page"` while keyboard focus remains singular.
- AC72: Given tree loading, read failure, watcher failure, or root recovery, then the affected root or row exposes `aria-busy`/`aria-describedby` as applicable and a polite live region announces the state change once.
- AC73: Given the sidebar splitter, then it has keyboard focus, `role="separator"`, vertical orientation, and accurate `aria-valuemin`, `aria-valuemax`, and `aria-valuenow` values.
- AC74: Given pointer drag on the splitter, then sidebar width updates live and remains clamped to 160–480 CSS pixels.
- AC75: Given keyboard focus on the splitter, then ArrowLeft/ArrowRight change width by 10px, Shift modifies the step to 40px, Home selects 160px, and End selects 480px.
- AC76: Given a workspace sidebar, then its tree scrolls independently of the tab/editor pane.
- AC77: Given ordinary sidebar labels and empty space, then dragging does not select text while header buttons, tree items, and the splitter retain their expected selection and focus behavior.
- AC78: Given a macOS workspace window, then no sidebar-specific drag strip is added and the existing top-chrome drag region from spec 0001 remains outside the traffic-light exclusion zone and operable above the workspace.

### Watcher invalidation and lifecycle

- AC79: Given a root is accepted, then the main process starts exactly one logical `Platform.watch` subscription owned by its WindowId and RootId; the real adapter may consolidate backend watcher objects without changing logical ownership.
- AC80: Given a duplicate-root add is deduplicated, then no additional watcher registration or retry loop is created.
- AC81: Given an external create, delete, rename, or move affects a loaded expanded directory, then the visible snapshot refreshes within 1,500ms.
- AC82: Given an external event affects a loaded collapsed directory, then its cached snapshot is marked stale without an eager read and its next expansion reads fresh children.
- AC83: Given an external event affects a directory whose children have never been loaded, then no child-directory read is started.
- AC84: Given any number of raw events for one root within a 300ms trailing window, then they produce at most one invalidation batch, with a 750ms maximum wait under a continuous stream.
- AC85: Given one disk change lies below two overlapping roots, then each covering RootId receives its own invalidation.
- AC86: Given an event is tagged for a different WindowId or RootId, then it cannot mutate the receiving tree state.
- AC87: Given a watcher event concerns only a hidden dotfile and does not change a visible ancestor's availability, then it causes no visible-tree refresh.
- AC88: Given a refresh read is pending, when a newer watcher batch invalidates the same directory, then the older refresh result is ignored.
- AC89: Given the watched root itself is deleted or renamed away, then its root section becomes unavailable without an application-owned retry loop or crash loop.
- AC90: Given a missing watched root returns, when the native backend reports recovery or the user invokes Retry successfully, then it becomes available and refreshes if expanded.
- AC91: Given `Platform.watch` registration or runtime watching fails, then the root exposes a non-blocking watcher warning while manual lazy reads and Retry remain usable.
- AC92: Given watcher failure persists, then Markzen schedules no automatic watcher retry; an explicit Retry immediately attempts one new registration, and another failure leaves the warning and manual lazy reads available.
- AC93: Given a workspace closes, then every watcher, debounce timer, and pending watcher-owned refresh for its WindowId is disposed.
- AC94: Given a disposed WindowId or RootId, then later watcher callbacks and read completions are ignored.
- AC95: Given the existing `MemoryPlatform.watch`, when a test registers root watchers and emits a normalized synthetic event, then only active matching registrations receive it, the event drives the same invalidation, batching, explicit-retry, and disposal logic as the real adapter, and disposing a registration decreases the harness's observable active-watcher count.
- AC96: Given an app-originated save or rename emits filesystem events, then the tree converges through normal invalidation without duplicating a tab, demoting a pinned tab, or marking an editor dirty.

### Settings authority and sidebar persistence

- AC97: Given a closed version-1 settings patch containing `sidebarWidth`, then the main-process settings service validates it, applies it to the authoritative snapshot, and assigns a strictly increasing revision before acknowledging it.
- AC98: Given this milestone's settings schema, then `schemaVersion` is integer `1`, while `sidebarWidth` defaults to 240 and accepts only finite numbers clamped and rounded to an integer from 160 through 480.
- AC99: Given a renderer receives a settings snapshot whose revision is not newer than its applied revision, then it ignores that stale snapshot.
- AC100: Given two windows submit valid settings patches near-simultaneously, then the main process serializes their acceptance into distinct strictly increasing revisions without dropping either acknowledgement.
- AC101: Given two windows change the same key near-simultaneously, then the patch accepted later by the main process wins and every window converges to it.
- AC102: Given two live workspace windows in the real Electron shell, when one accepts a sidebar-width patch, then the other applies that authoritative revision within 250ms.
- AC103: Given first launch has no platform configuration directory, then the directory is created only when the first settings write is committed.
- AC104: Given rapid accepted setting patches, then persistence waits 300ms after the latest patch and writes one snapshot for that burst.
- AC105: Given revision N is being written when revision N+1 is accepted, then completion of N does not mark N+1 persisted and a later write commits N+1.
- AC106: Given a settings write succeeds, then atomic replacement leaves either the previous complete valid JSON document or the new complete valid JSON document, never a partial file.
- AC107: Given a valid version-1 settings object contains an invalid `sidebarWidth`, then that preference alone falls back to its default while safe unknown persisted properties remain eligible under AC108.
- AC108: Given an in-bounds valid settings object contains recursively safe unknown own-properties, then those properties survive the next rewrite unchanged; dangerous keys, non-finite numbers, non-JSON values, and data beyond the size bound are never retained.
- AC109: Given `settings.json` is syntactically corrupt, then startup moves it to `settings.json.corrupt-<timestamp>` and loads defaults without crashing.
- AC110: Given valid persisted `sidebarWidth`, then the main process supplies it in the bootstrap snapshot before the first workspace window is revealed.
- AC111: Given the splitter accepts a new width, then the local workspace applies it in the same animation frame.
- AC112: Given a normal application quit with an unpersisted settings revision, then the main process flushes that revision before completing quit.
- AC113: Given the final quit-time flush fails or exceeds 2,000ms, then the previous valid settings file remains intact and quit completes without hanging indefinitely.
- AC114: Given a settings write fails while the app remains open, then the authoritative in-memory value remains active, persistence remains pending for retry, and an accessible non-blocking warning with an explicit Retry action is shown once for the consecutive failure episode ending at the next success.

### Measurable performance

- AC115: Given a real directory and an equivalent synthetic snapshot containing 10,000 entries, when the CI performance journey runs three times, then it records real batched `Platform.fs.list` duration separately from deterministic filtering and sorting duration in the job summary and artifact without gating the build.
- AC116: Given a loaded tree with 10,000 entries, then no more than 300 `treeitem` rows exist in the DOM at once.
- AC117: Given an immediate MemoryPlatform directory response, when a directory with 10,000 entries expands in the CI performance journey, then time to first visible rows is recorded without gating the build.
- AC118: Given a cached preview editor state, when its tab activates in the CI performance journey, then activation-to-paint time is recorded without gating the build.
- AC119: Given 1,000 watcher events for one root arrive within one second, then at most two invalidation batches are produced for that root.
- AC120: Given 20 roots and 20,000 loaded logical entries, when tree keyboard and wheel inputs run in the CI performance journey, then their input-to-viewport-update times are recorded without gating the build.

### Settings recovery, preview registry, and adaptive presentation

- AC121: Given a renderer submits an unknown setting key, a non-object patch, a non-finite value, a prototype-pollution key, a payload above 4 KiB, or extra properties, then the main process rejects the whole patch without changing the snapshot, revision, file, or any window.
- AC122: Given valid settings JSON with a newer unsupported schema version, when it loads, then runtime defaults apply, the original file is not overwritten, and an accessible warning reports that the settings were created by a newer Markzen version.
- AC123: Given a settings revision is accepted and its initiating window closes before persistence, then the application-owned settings service still broadcasts and persists that revision unless a newer accepted revision supersedes it.
- AC124: Given failure or interruption before settings replacement completes, then the previous complete valid `settings.json` remains readable and any recognizable staging file is recovered or removed on the next startup.
- AC125: Given a settings write failure while the app remains open, then automatic retries use 1s, 2s, 4s, 8s, 16s, and at most 30s thereafter; an explicit Retry runs immediately and success resets the delay.
- AC126: Given the app-wide registry is asked to replace preview ownership A with B, then it either commits the complete A-to-B transition or, when B is owned or the request is stale, leaves A unchanged; it never exposes a partial ownership state.
- AC127: Given workspace tree, preview, watcher-warning, and splitter UI in forced-colors or reduced-motion mode, then every state remains distinguishable, focus remains visible, and non-essential expansion/loading animations are disabled.

### Platform directory-listing contract

- AC128: Given `MemoryPlatform.fs.list`, when a test lists an in-memory directory, then its one batched result contains each entry's name, file/directory/symlink kind, logical path, and Platform-issued FileKey but no canonical target path; typed `not-found`, `not-directory`, `permission-denied`, `unavailable`, and `io` failures match the real adapter, while sorting and hidden-file filtering remain application behavior.

### Reporting and resolved lifecycle, authority, and accessibility behavior

- AC129: Given CI for this milestone, when the real-listing, filtering/sorting, expansion, preview-activation, and large-tree input journeys run, then they execute outside `npm run verify`, publish a human-readable job summary and machine-readable artifact, and remain explicitly non-blocking regardless of measured values.
- AC130: Given the expanded preload API and production TypeScript, when its static surface is inspected, then it exposes one typed method per workspace or settings intent and no raw Electron/Node object, arbitrary IPC send/invoke, raw filesystem list/read/watch method, renderer-selected event destination, or generic path-based capability.
- AC131: Given any workspace, root, tree-entry, preview, watcher, or settings IPC request, when it reaches the main process, then the exact application-origin main-frame sender is validated before a closed payload schema is parsed and before any dialog, filesystem, registry, watcher, settings, or window operation begins.
- AC132: Given a valid sender with a forged, stale, foreign, or mismatched WindowId, RootId, TabId, FileKey, logical path, window kind, settings revision, or operation generation, or an entry containing traversal or resolving outside its registered canonical root, when authorization runs, then the request is rejected without reading, watching, opening, focusing, mutating, or disclosing another owner or out-of-root resource.
- AC133: Given a directory result, preview result, watcher invalidation, settings snapshot, folder error, or registry-focus event, when main routes it, then only its live owning window/root/tab receives the minimum logical data required and a disposed or superseded generation cannot mutate state or disclose a canonical target path.
- AC134: Given a workspace window bootstrap or Add Folder command, then the main process derives the live window kind and owner from its registration; renderer-provided state cannot enable Add Folder, allocate a RootId, or convert a single-file window into a workspace.
- AC135: Given Add Folder selects a path that cannot be canonicalized, read, or confirmed as a directory, when the operation settles, then no RootId or watcher is retained, all existing workspace state is unchanged, and an accessible error identifies the failed folder.
- AC136: Given a folder chooser is already pending for one source window, when Open Folder or Add Folder is invoked again for that same window, then no second chooser or overlapping root transaction starts; other windows remain independent.
- AC137: Given a folder chooser, workspace bootstrap, initial read, or Add Folder read is pending, when its source or destination window closes or its generation is superseded, then the late completion creates no window, root, watcher, error, or UI state.
- AC138: Given no Markzen window is focused, then Open Folder… remains enabled and a successful selection creates one workspace window, while Add Folder… remains disabled; a pre-ready failure retains no window and reports the folder through a main-owned accessible error dialog.
- AC139: Given a single-file or workspace window, when its main-owned kind changes only through creation/disposal, then menu enablement, bootstrap data, root authority, and teardown follow that registered kind without trusting renderer claims.
- AC140: Given any Markzen window, when New File is invoked, then a new ordinary pinned untitled tab is inserted before an existing preview; its first persistent content or title change makes it dirty and milestone 0002's save and close guards apply.
- AC141: Given any Markzen window, when Open… selects a document not already owned, then it opens as an ordinary pinned tab before an existing preview and never uses preview replacement semantics.
- AC142: Given Open… selects an alias of a document already owned by any tab or window, then that existing owner is focused and no preview is promoted or duplicate tab created; only tree activation uses preview semantics.
- AC143: Given preview B is selected and loading, when the user activates another tab before B settles, then B remains the preview target but success, failure, or Retry cannot reactivate it or steal focus.
- AC144: Given preview replacement of A by B succeeds and B is unowned, then the main registry reserves B and releases A atomically with the tab's adopted B state; no observer can claim both or see the tab own neither during the successful transition.
- AC145: Given preview replacement targets B and revalidation finds B already owned, then its existing owner is focused and the preview retains A's identity, content, registry ownership, and clean state.
- AC146: Given a recognized file symlink is activated, when its current canonical target is revalidated inside the owning root, then that target opens under normal preview/pin and FileKey rules; if it resolves outside, is circular, missing, or changes during revalidation, then no read or registry transition occurs and the row exposes an accessible error without disclosing the target path.
- AC147: Given a workspace at the 480×320 minimum window size or 200% renderer zoom, then the sidebar uses a responsive effective width that may shrink below the stored 160px preference only as needed to keep the tree, splitter, tab controls, editor, and errors reachable; the stored preference is unchanged and restored when space returns.
- AC148: Given responsive sidebar clamping or virtual scrolling changes the rendered viewport, then separator values describe the effective width, the focused tree item remains mounted or focus moves deterministically to the nearest visible owner, and keyboard navigation resumes without a lost or duplicate tab stop.
- AC149: Given pointer resize loses capture, is cancelled, the window blurs, or the workspace disposes before pointer-up, then drag listeners and transient selection/cursor state are removed and the latest accepted clamped width remains authoritative.
- AC150: Given valid settings JSON whose top level is not a plain object, or whose `schemaVersion` is missing, non-integer, or less than `1`, then defaults apply, the original file is not overwritten automatically, and an accessible warning explains that settings could not be loaded; newer integer versions follow AC122.
- AC151: Given settings cannot be read, moved aside after syntax corruption, or parsed within the 1 MiB limit, then startup uses defaults without crashing, preserves the original file when possible, and reports one accessible warning without treating the unreadable data as a writable current snapshot.
- AC152: Given splitter pointer movement produces more than one valid width per animation frame, then the local workspace renders the latest clamped width in that frame while at most one closed settings patch per frame is submitted to main; AC104 still coalesces the resulting accepted revisions for disk persistence.

## Implementation ADR requirements

At the start of this milestone, before the corresponding production subsystem is written, one or more accepted ADRs record the following decisions and their platform-test strategy:

1. **Workspace use of foundational identity:** RootId allocation/lifetime; use of milestone 0001 WindowId, validated Path, and FileKey contracts; batched list snapshots; ordinary-entry identity from a canonical parent; special symlink resolution; activation-time identity and containment revalidation; logical versus canonical root paths; symlink roots, terminal directory symlinks, file aliases, and containment boundaries without redefining Platform canonicalization.
2. **Async ownership:** generation tokens, cancellation/disposal, workspace-ready handshake and failure teardown, serialized per-window folder dialogs, preview promotion and registry-transition ordering, active-versus-inactive editor updates, lazy-read cache states, and stale-result suppression.
3. **Watcher architecture:** reuse of `Platform.watch`; chosen chokidar version and options; refusal to follow directory symlinks; raw-event normalization; logical per-root batching and invalidation; expanded versus collapsed refresh; self-event correlation; backend-native recovery plus explicit Retry without application backoff; root return; and deterministic disposal.
4. **Settings persistence:** closed version-1 patch/schema without legacy migration or a generic registry; main-process revision ordering; renderer bootstrap; per-frame patch coalescing; write generations; same-directory temp file, flush, atomic replace, and directory flush where supported; corrupt/newer-version handling; bounded safe unknown-key preservation; retry; and bounded quit flush.
5. **Large-tree rendering and measurement:** windowing strategy, responsive sidebar behavior, stable row identity and focus restoration, separation of real listing from deterministic filtering/sorting, the CI reference runner, and non-blocking performance instrumentation used for AC115 and AC117–AC120.

The implementation also updates accepted ADR 0001 with the workspace/settings intent schemas, sender-first validation, main-owned window-kind and RootId authority, activation-time containment revalidation, minimal event routing, payload limits, and targeted forged/stale/out-of-root shell negatives.

## Test mapping

| AC | Primary layer |
|----|---------------|
| AC1 | Shell smoke |
| AC2 | Playwright-vs-vite |
| AC3 | Shell smoke |
| AC4 | Shell smoke |
| AC5 | Shell smoke |
| AC6 | Shell smoke |
| AC7 | Playwright-vs-vite |
| AC8 | Playwright-vs-vite |
| AC9 | Playwright-vs-vite |
| AC10 | Node |
| AC11 | Playwright-vs-vite |
| AC12 | Node |
| AC13 | Node |
| AC14 | Playwright-vs-vite |
| AC15 | Playwright-vs-vite |
| AC16 | Browser Mode |
| AC17 | Node |
| AC18 | Shell smoke |
| AC19 | Browser Mode |
| AC20 | Shell smoke |
| AC21 | Node |
| AC22 | Node |
| AC23 | Node |
| AC24 | Browser Mode |
| AC25 | Node |
| AC26 | Node |
| AC27 | Browser Mode |
| AC28 | Playwright-vs-vite |
| AC29 | Playwright-vs-vite |
| AC30 | Browser Mode |
| AC31 | Playwright-vs-vite |
| AC32 | Browser Mode |
| AC33 | Playwright-vs-vite |
| AC34 | Playwright-vs-vite |
| AC35 | Playwright-vs-vite |
| AC36 | Shell smoke |
| AC37 | Node |
| AC38 | Playwright-vs-vite |
| AC39 | Node |
| AC40 | Browser Mode |
| AC41 | Node |
| AC42 | Node |
| AC43 | Browser Mode |
| AC44 | Browser Mode |
| AC45 | Browser Mode |
| AC46 | Playwright-vs-vite |
| AC47 | Browser Mode |
| AC48 | Playwright-vs-vite |
| AC49 | Node |
| AC50 | Browser Mode |
| AC51 | Playwright-vs-vite |
| AC52 | Playwright-vs-vite |
| AC53 | Browser Mode |
| AC54 | Browser Mode |
| AC55 | Node |
| AC56 | Playwright-vs-vite |
| AC57 | Node |
| AC58 | Playwright-vs-vite |
| AC59 | Playwright-vs-vite |
| AC60 | Playwright-vs-vite |
| AC61 | Browser Mode |
| AC62 | Playwright-vs-vite |
| AC63 | Node |
| AC64 | Browser Mode |
| AC65 | Browser Mode |
| AC66 | Browser Mode |
| AC67 | Browser Mode |
| AC68 | Browser Mode |
| AC69 | Browser Mode |
| AC70 | Browser Mode |
| AC71 | Browser Mode |
| AC72 | Browser Mode |
| AC73 | Browser Mode |
| AC74 | Browser Mode |
| AC75 | Browser Mode |
| AC76 | Browser Mode |
| AC77 | Browser Mode |
| AC78 | Shell smoke |
| AC79 | Node |
| AC80 | Node |
| AC81 | Shell smoke |
| AC82 | Node |
| AC83 | Node |
| AC84 | Node |
| AC85 | Node |
| AC86 | Node |
| AC87 | Node |
| AC88 | Node |
| AC89 | Playwright-vs-vite |
| AC90 | Playwright-vs-vite |
| AC91 | Playwright-vs-vite |
| AC92 | Node |
| AC93 | Node |
| AC94 | Node |
| AC95 | Node |
| AC96 | Playwright-vs-vite |
| AC97 | Node |
| AC98 | Node |
| AC99 | Node |
| AC100 | Node |
| AC101 | Node |
| AC102 | Shell smoke |
| AC103 | Node |
| AC104 | Node |
| AC105 | Node |
| AC106 | Node |
| AC107 | Node |
| AC108 | Node |
| AC109 | Node |
| AC110 | Shell smoke |
| AC111 | Browser Mode |
| AC112 | Shell smoke |
| AC113 | Node |
| AC114 | Playwright-vs-vite |
| AC115 | CI |
| AC116 | Browser Mode |
| AC117 | CI |
| AC118 | CI |
| AC119 | Node |
| AC120 | CI |
| AC121-AC126 | Node |
| AC127 | Browser Mode |
| AC128 | Node |
| AC129 | CI |
| AC130 | Static |
| AC131-AC134 | Node |
| AC135 | Playwright-vs-vite |
| AC136-AC137 | Node |
| AC138 | Shell smoke |
| AC139 | Node |
| AC140-AC141 | Playwright-vs-vite |
| AC142 | Shell smoke |
| AC143 | Playwright-vs-vite |
| AC144-AC145 | Node |
| AC146 | Playwright-vs-vite |
| AC147-AC149 | Browser Mode |
| AC150-AC151 | Node |
| AC152 | Browser Mode |

Supporting coverage is explicit: AC36 exercises the complete real dialog/main/watcher/renderer path; AC128 exercises real directory listing and symlink identity in shell smoke; AC130-AC134 include forged, stale, cross-window, traversal, out-of-root, payload-limit, and canonical-target-disclosure negatives in shell smoke; AC140-AC142 include native menu routing in shell smoke; and AC147-AC149 include minimum-size and 200%-zoom Playwright journeys plus the automated accessibility scan.

## Open questions

- (none — implementation-shaping choices are fixed above and must be recorded with rationale in the required ADRs.)
