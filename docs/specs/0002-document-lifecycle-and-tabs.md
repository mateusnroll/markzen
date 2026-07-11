# Spec 0002: Document Lifecycle & Tabs

**Status:** Draft   **Date:** 2026-07
**Origin:** Consolidates old specs 0002 (Rich Markdown Editing Core), 0003 (File Operations & Native Menu), 0004 (Tab System), and most of 0011 (Filename Field & Rename); old repo `RichEditor.tsx`, `fileOperations.ts`, `setupMenu.ts`, `tabsStore.ts`, `tabSwitch.ts`, `FilenameField.tsx`, `renameFile.ts`, `FilenameNavigation`, Markdown fixtures and link/table/image extensions; commits `31848ad`, `ca3347c`, `20f0fbe`, `28d1115`, `68d2387`, `0850d7b`, `23b21c7`, `093e3ab`, `5e81b15`, `54e8aee`, `0c858e8`, `f3e8b16`, `8a58532`.

## Problem

The product needs one loss-resistant document lifecycle: parse Markdown into a rich editor, preserve what the editor does not understand, keep independent tab state, and save or rename real files without stale async work or partial failures corrupting them. These foundations must behave consistently in one or many windows before folder navigation, preview tabs, richer link/table/image UX, or external-change watching layer on top.

## Non-goals

- Folder windows, multi-root trees, relative-path title context, preview/peeking tabs, or file-system watching (later specs).
- Proactive reload of files changed on disk, background conflict resolution, or merging external edits. This spec detects a changed or missing source before a destructive write; live reload remains a future spec.
- Toolbar and popover UX, following links, visual table manipulation, image picking or local-image rendering. This spec owns only the baseline link, table, and image document models, inert rendering, and serialization.
- General source/raw-Markdown editing. A read-only whole-document preservation fallback is a safety state, not source mode.
- Semantic editing of frontmatter, footnotes, math, raw HTML, or unknown Markdown extensions. Lossless opaque preservation is in scope.
- Auto-save, recent files, session restore, tab drag-reordering, split views, file-tree CRUD, or deriving filenames from headings.

## Behavior (acceptance criteria)

### Rich Markdown input and rendering

- AC1: Given an empty paragraph, when the user types `# ` through `#### ` character by character, then it becomes the corresponding H1 through H4 heading.
- AC2: Given an empty paragraph, when the user types `- `, `1. `, or `> ` character by character, then it becomes the corresponding bullet list, ordered list, or blockquote.
- AC3: Given an empty paragraph, when the user types `- [ ] ` character by character, then it becomes an unchecked task-list item.
- AC4: Given a task-list item, when the user activates its checkbox, then its checked state changes in the document model.
- AC5: Given a task-list item, when the user presses Tab, then it nests under the preceding eligible task-list item.
- AC6: Given text typed as `**bold**`, `*italic*`, `~~strike~~`, or `` `code` ``, when the closing delimiter is typed, then the matching mark replaces its delimiters.
- AC7: Given an empty paragraph, when the user types a triple-backtick fence or `---`, then it becomes the corresponding code block or horizontal rule.
- AC8: Given source containing H5 or H6, when it is opened, then the heading level remains H5 or H6 even though live heading input stops at H4.
- AC9: Given a supported fixture, when it is rendered, then headings, list markers, task checkboxes, blockquotes, code blocks, horizontal rules, links, tables, images, and inline marks have distinct semantic DOM and visual hierarchy.
- AC10: Given the editor content area, when it renders, then it is centered at a maximum width of 720px with the system sans-serif stack and line-height 1.7.
- AC11: Given a click in the gutter beside document content, when the editor handles it, then the caret moves to the nearest document position.
- AC12: Given a click in the gutter below document content, when the editor handles it, then the caret moves to the end of the document.
- AC13: Given a gutter click, when the editor handles it, then no title, tab, toolbar, or other UI-chrome text becomes selected.
- AC14: Given ordinary typing, selection, or scrolling, when editor transactions run, then the Markdown serializer is not invoked per keystroke or scroll event.
- AC15: Given the controlled 10,000-line performance fixture, when 20 single-character edits are entered, then the measured p95 transaction-to-paint time is at most 100ms.
- AC16: Given the controlled 10,000-line performance fixture, when the editor receives a wheel gesture, then its scroll position changes within 100ms and the gesture does not scroll the tab strip.

### Independent document model and lossless serialization

- AC17: Given each serialization fixture, when the production parser reads its source, then the result equals an independently authored expected semantic model that was not produced by the parser under test.
- AC18: Given each independently authored expected semantic model, when the production serializer writes it, then the bytes equal an independently authored golden Markdown file that was not produced by the serializer under test.
- AC19: Given each golden Markdown file, when it is reparsed, then the result equals that fixture's independently authored expected semantic model.
- AC20: Given supported edited content, when it is serialized, then its canonical output is GFM Markdown with tight lists and the fixture-defined whitespace and delimiter choices.
- AC21: Given an empty document model, when it is serialized, then the result is the empty string.
- AC22: Given escaped Markdown punctuation, when it is parsed and serialized, then the expected model and golden output retain literal punctuation rather than creating marks or blocks.
- AC23: Given hard breaks and meaningful trailing whitespace, when they are parsed and serialized, then their semantics and fixture-defined bytes are retained.
- AC24: Given non-ASCII text or emoji, when it is parsed and serialized as UTF-8, then its Unicode scalar values are unchanged.
- AC25: Given an inline Markdown link with nested marks and an optional title, when it is parsed and serialized, then its text, `href`, title, and nested marks match the expected model and golden output.
- AC26: Given a GFM table with a header, alignment metadata, empty cells, or escaped pipes, when it is parsed and serialized, then those properties match the expected model and golden output.
- AC27: Given a Markdown image with alt text, source, and optional title, when it is parsed and serialized, then those three source attributes match the expected model and golden output.
- AC28: Given raw HTML in otherwise supported Markdown, when it is parsed, then it becomes an opaque raw node rather than an executable HTML node.
- AC29: Given a document containing raw HTML, when it is rendered in the editor, then no element, script, event handler, navigation, or network request described by that HTML executes.
- AC30: Given a safely delimited unsupported Markdown construct, when the surrounding document is parsed and serialized after no edit to that construct, then its exact original source slice is emitted by its opaque node.
- AC31: Given an opaque raw node, when supported content elsewhere is edited and saved, then the opaque node's source slice is emitted byte-for-byte unchanged.
- AC32: Given an opaque raw node selected as a whole node, when the user explicitly deletes it, then only that node's preserved source slice is removed.
- AC33: Given malformed Markdown that cannot be segmented without guessing, when it is opened, then the parser selects whole-document preservation fallback instead of producing a partial rich document.
- AC34: Given source for which parse coverage cannot account for every source byte as supported syntax or an opaque node, when it is opened, then the parser selects whole-document preservation fallback.
- AC35: Given whole-document preservation fallback, when it is displayed, then the complete literal source is visible in a read-only preservation view with an inline explanation that rich editing is disabled to prevent data loss.
- AC36: Given a tab in whole-document preservation fallback, when Save or Save As is invoked, then no dialog or disk write starts and an accessible explanation states that saving is blocked because Markzen cannot prove a lossless edit.

### File identity and opening

- AC37: Given path spellings that identify the same existing file through `.`/`..`, separator, trailing-separator, symlink, Unicode, or platform-appropriate case aliases, when `Platform.fs` resolves them, then it returns the same opaque `FileKey` and may retain different display paths.
- AC38: Given two paths with only a textual prefix in common, when Platform containment and relative-path helpers compare them, then containment is decided by canonical path segments rather than string prefix.
- AC39: Given a single-file window launched without an explicit file, when it initializes, then it contains one active empty untitled tab.
- AC40: Given File -> New File, Cmd/Ctrl+N, or the tab-bar add button, when it is invoked, then a distinct active empty untitled tab is created.
- AC41: Given File -> Open..., when its native dialog is configured, then the selectable extensions are `.md`, `.markdown`, and `.txt`.
- AC42: Given an Open dialog, when it is cancelled, then no tab, active selection, or registry entry changes.
- AC43: Given one pristine empty untitled tab, when a file is opened into its window, then that tab is reused rather than adding another tab.
- AC44: Given a requested `FileKey` already open in the same window, when Open is invoked for any alias of it, then its existing tab is focused.
- AC45: Given a requested `FileKey` already open in another window, when Open is invoked for any alias of it, then the owning window and tab are focused and no duplicate tab is created.
- AC46: Given two windows concurrently request aliases of the same file, when the app-wide registry resolves both requests, then exactly one path-backed tab owns its `FileKey` and the other request focuses it.
- AC47: Given a file that disappears between dialog selection and read, when Open completes, then a visible tab-local error is shown and no path-backed tab is registered.
- AC48: Given bytes that are not valid UTF-8, when the file is opened, then the tab enters a read-only byte-preservation view that uses a reversible escaped-byte representation, retains the original bytes, and blocks Save/Save As without introducing replacement characters.
- AC49: Given a 10MB UTF-8 Markdown file, when it is opened in the performance journey, then it completes within five seconds and the renderer heartbeat has no gap longer than 250ms.
- AC50: Given a valid path containing spaces or non-ASCII characters, when it is opened, then its bytes, display path, and `FileKey` survive dialog, IPC, and tab registration unchanged.
- AC51: Given a file read in flight, when its target tab closes, is repointed, or advances its load generation, then that stale completion cannot change visible content, dirty state, title, or the active tab.

### Tab state, IME, and accessibility

- AC52: Given several tabs, when the user clicks one, then it becomes active and displays its own document.
- AC53: Given a focused tab, when the user presses Enter or Space, then it becomes active and displays its own document.
- AC54: Given edits and undo operations in a tab, when the user switches away and back, then that tab's full undo and redo history is restored.
- AC55: Given a selection and caret in a tab, when the user switches away and back, then that tab's selection and caret are restored.
- AC56: Given a scrolled tab, when the user switches away and back, then its scroll position is restored and editor focus returns.
- AC57: Given unsaved edits in several tabs, when the user switches repeatedly, then each document and dirty revision remains associated only with its owning tab.
- AC58: Given rapid tab switches with state captures in flight, when their completions arrive out of order, then an older generation cannot write one tab's state into another.
- AC59: Given the active tab closes while other tabs remain, when close completes, then the neighbor at the same index or the new last tab becomes active.
- AC60: Given an inactive clean tab closes, when close completes, then the active tab does not change.
- AC61: Given the last tab closes, when close completes, then no previous document remains visible and the configured empty state is shown.
- AC62: Given a tab, when its label renders, then it shows its filename or `Untitled` and truncates visually without changing its accessible name.
- AC63: Given a dirty tab, when its tab control renders, then dirty state is conveyed textually to assistive technology and its named close action remains keyboard reachable when the visual dot replaces the close icon.
- AC64: Given more tabs than fit, when the tab strip receives horizontal wheel or trackpad input, then it scrolls without propagating that gesture to the editor.
- AC65: Given pointer interaction with the tab strip, when the pointer drags across labels, then tab-label text is not selected.
- AC66: Given empty tab-bar space, when the user drags it, then the native window drag region moves the window without making tab controls draggable regions.
- AC67: Given 30 open tabs, when the controlled performance test activates each tab once, then every activation paints the selected document within 100ms.
- AC68: Given active IME composition, when a tab switch is requested, then the composed text is committed once to its originating tab before the switch.
- AC69: Given active IME composition, when Save is requested, then the composed text is committed once before the save revision is captured.
- AC70: Given active IME composition, when tab or window close is requested, then the composed text is committed once before dirty-state evaluation and any close prompt.
- AC71: Given a path-backed tab whose source disappeared on disk, when the user switches to or closes it, then the tab remains usable and close behavior follows its in-memory dirty state.
- AC72: Given the tab strip, when assistive technology inspects it, then it exposes one `tablist`, one selected `tab`, and each tab's selected, dirty, filename, and untitled states.
- AC73: Given keyboard focus in the tab list, when Left/Right or Home/End is pressed, then roving focus moves to the corresponding enabled tab without requiring pointer input.
- AC74: Given the tab strip's close and add controls, when reached by keyboard, then each has a stable accessible name and activates with Enter or Space.

### Filename field and pending rename

- AC75: Given a path-backed `.md`, `.markdown`, or `.txt` tab, when its title renders, then it is editable and shows the basename without that recognized extension.
- AC76: Given an untitled tab, when its title renders empty, then it exposes `Untitled` as its placeholder and accessible name.
- AC77: Given a path-backed title edited to a different valid name, when input changes, then the tab becomes dirty with a pending rename and no disk path changes yet.
- AC78: Given a half-edited valid title, when the title field blurs, then its pending rename and dirty state remain without touching disk.
- AC79: Given title-field focus, when Enter is pressed, then the pending title remains and focus moves to the start of the document.
- AC80: Given title-field focus, when ArrowDown is pressed, then the pending title remains and focus moves to the start of the document.
- AC81: Given a pending title edit, when Escape is pressed, then the original displayed name is restored and that pending rename is cleared without discarding unrelated content edits.
- AC82: Given text containing line breaks, when it is pasted into the title field, then the line breaks are removed before the pending name is stored.
- AC83: Given the caret on the first visual editor line, when ArrowUp is pressed, then focus moves to the end of the title field.
- AC84: Given a gutter click at the title's vertical position, when it is handled, then the title field receives focus.
- AC85: Given an empty name, `.`, `..`, a control character, a slash, a backslash, `:`, `*`, `?`, `"`, `<`, `>`, `|`, a trailing space/dot, or a platform-reserved device name, when filename validation runs, then it returns an invalid result.
- AC86: Given an invalid pending name, when Save is invoked, then saving is aborted and an inline error attached to the title field identifies the validation problem.
- AC87: Given a pending name whose target is a different existing file, when Save is invoked, then saving is aborted and an inline collision error is attached to the title field.
- AC88: Given a pending pure-case change of the same `FileKey` on a case-insensitive filesystem, when Save succeeds, then the displayed spelling and disk entry adopt the requested case.
- AC89: Given a path-backed tab whose current recognized extension is not replaced in the title input, when rename succeeds, then `.md`, `.markdown`, or `.txt` is preserved respectively.
- AC90: Given a title ending in `.md`, `.markdown`, or `.txt` matched case-insensitively, when its target filename is derived, then that explicit suffix replaces the hidden managed extension and appears exactly once; otherwise the edited value is the stem and the existing recognized suffix is preserved.
- AC91: Given a valid Unicode title, when rename succeeds, then the Unicode name is preserved in the display path and on disk.
- AC92: Given an untitled tab with a typed title lacking an extension, when Save opens Save As, then the suggested filename is that title plus `.md`.

### Failure-atomic save, Save As, and rename

- AC93: Given an editor transaction that changes persistent document content, when it commits, then the owning tab's document revision advances and the tab becomes dirty.
- AC94: Given a dirty path-backed tab with an unchanged `DiskVersion`, when Save succeeds, then the saved revision's serialized bytes replace that file and the saved revision becomes clean.
- AC95: Given a pristine path-backed tab without a pending rename, when Save is invoked, then no disk write occurs and no error is shown.
- AC96: Given an untitled tab, when Save is invoked, then it runs the Save As dialog with a default `.md` extension.
- AC97: Given Save As to an unoccupied target, when its commit succeeds, then the source file remains unchanged, the target contains the saved bytes, and the tab adopts the target identity.
- AC98: Given a Save As dialog, when it is cancelled, then no file, title, dirty revision, `FileKey`, or image source changes.
- AC99: Given same-path Save fails before atomic replacement, when the coordinator reports failure, then the original file remains byte-for-byte unchanged and the tab remains dirty.
- AC100: Given Save As fails before atomic target replacement, when the coordinator reports failure, then any pre-existing target remains byte-for-byte unchanged and the tab retains its original identity.
- AC101: Given a pending same-directory rename and content edits, when their coordinated save succeeds, then the target contains the saved revision, the old path is absent, and the tab adopts the target identity as one committed outcome.
- AC102: Given a pending same-directory rename and content edits, when the transaction fails before the destination is installed, then the old path and bytes remain available, the target remains absent or unchanged, and the tab retains its pending rename and dirty revision.
- AC103: Given a write to a read-only location, when Save fails, then a visible tab-local error is shown and the dirty revision is retained.
- AC104: Given the current source has a different `DiskVersion` from the one read or last saved by the tab, when Save or rename begins, then the operation stops before writing and shows a tab-local external-change conflict.
- AC105: Given an external-change conflict, when the user explicitly chooses Overwrite and the conditional retry succeeds, then the saved revision replaces the newly observed version and becomes clean.
- AC106: Given a path-backed source that is missing at Save or rename time, when the coordinator checks its `DiskVersion`, then it does not silently recreate the path and offers Save As or Cancel.
- AC107: Given a Save As target changes after the user approves it but before commit, when its conditional replacement runs, then it aborts without overwriting the newer target.
- AC108: Given a Save As or rename target whose `FileKey` is already owned by any tab in any window, when reservation is attempted, then the operation aborts and the owning window/tab is focused.
- AC109: Given Save As selects an existing target that is not an already-open `FileKey`, when overwrite confirmation is declined, then the target and tab remain unchanged.
- AC110: Given Save, Save As, and rename requests for one tab, when they overlap, then one shared per-tab coordinator executes their disk commits serially.
- AC111: Given a save captures revision N and the user edits to revision N+1 while its write is in flight, when N succeeds, then N+1 remains dirty.
- AC112: Given the user invokes Save again after making newer edits while a save is in flight, when the first save succeeds, then the coordinator schedules exactly one follow-up for the revision captured by that second Save; edits after the second command remain dirty.
- AC113: Given repeated Save commands while the same revision is already queued or in flight, when the coordinator processes them, then they coalesce without duplicate writes of that revision.
- AC114: Given an in-flight save fails or conflicts, when it completes, then no automatic follow-up write runs until the user makes another explicit save/conflict choice.
- AC115: Given an async save completion whose tab, path, or operation generation is no longer current, when it resolves, then it cannot clear dirty state, repoint the tab, replace content, or release another tab's reservation.
- AC116: Given a successful Save As or rename, when the tab adopts its new `FileKey`, then the app-wide registry changes ownership from old key to new key atomically with the tab update.
- AC117: Given a parsed document with a relative local image source, when Save As moves the document to another directory, then the saved Markdown rebases that source so it resolves to the same absolute asset.
- AC118: Given a parsed document with an absolute, `http:`, `https:`, or `data:` image source, when Save As changes the document directory, then that source is unchanged.
- AC119: Given Save As with image rebasing fails or is cancelled, when control returns to the editor, then the in-memory image sources and original tab identity are unchanged.
- AC120: Given an edited UTF-8 file whose original newlines are uniformly LF or uniformly CRLF, when it is saved, then the same newline convention is used throughout its serialized output.
- AC121: Given an edited UTF-8 file with mixed newline conventions, when it is saved, then serializer-generated text uses the original dominant convention, with the first encountered convention breaking a tie, while every opaque preserved source slice retains its exact original bytes.
- AC122: Given a UTF-8 file with a byte-order mark, when edited content is saved, then the output retains one UTF-8 byte-order mark.
- AC123: Given a newly created document, when it is first saved, then its encoding is UTF-8 without a byte-order mark and its newlines are LF.

### Close decisions and Save All

- AC124: Given a clean tab, when Close Tab is invoked, then it closes without a save prompt.
- AC125: Given a dirty tab, when Close Tab is invoked, then a native prompt names that document and offers Save, Don't Save, and Cancel.
- AC126: Given a dirty-tab close prompt, when Save completes successfully, then the tab closes.
- AC127: Given a dirty-tab close prompt, when Save is cancelled, conflicts, or fails, then the tab remains open and dirty.
- AC128: Given a dirty-tab close prompt, when Don't Save is chosen, then the tab closes without a disk write.
- AC129: Given a dirty-tab close prompt, when Cancel is chosen, then the tab, active selection, and disk remain unchanged.
- AC130: Given a window with no dirty tabs, when Close Window is invoked, then it closes without a save prompt.
- AC131: Given a window with exactly one dirty tab, when Close Window is invoked, then its native prompt names that document and offers Save All, Don't Save, and Cancel.
- AC132: Given a window with N dirty tabs where N is greater than one, when Close Window is invoked, then its native prompt states `N files` and offers Save All, Don't Save, and Cancel.
- AC133: Given a window-close prompt, when Save All successfully saves every dirty tab, then the window closes after the last success.
- AC134: Given Save All where any tab is cancelled, conflicts, or fails, when the batch settles, then the window remains open and each already-saved revision remains clean.
- AC135: Given a window-close prompt, when Don't Save is chosen, then the window closes without writing any dirty tab.
- AC136: Given a window-close prompt, when Cancel is chosen, then the window, tabs, active selection, and disk remain unchanged.

### Native menu and command routing

- AC137: Given the native application menu at this milestone, when it is inspected, then it contains the app menu (About, Hide, Quit), File (New File, Open..., Save, Save As..., Save All, Close Tab, Close Window), and Edit (Undo, Redo, Cut, Copy, Paste, Select All); later milestones add folder, Find, and Settings commands only when their behavior exists.
- AC138: Given native menu accelerators at this milestone, when they are inspected, then New, Open, Save, Save As, Close Tab, Close Window, and standard Edit commands use platform-appropriate Cmd/Ctrl accelerators; Save All remains available without reserving a new global accelerator.
- AC139: Given several windows, when a menu command is invoked, then the main process derives its target from the focused live window and never trusts a renderer-supplied window identifier.
- AC140: Given focus in the rich editor or filename field, when a native Undo, Redo, Cut, Copy, Paste, or Select All command is invoked, then it operates on that focused control.
- AC141: Given menu enablement is recomputed, when no eligible tab or window action exists, then Save, Save As, Save All, and Close Tab expose the disabled state defined by this spec.

### Post-commit rename recovery

- AC142: Given rename-plus-save installed the complete destination but deleting the old source fails, when recovery begins, then the tab adopts the safe destination, the old copy remains available, and a persistent warning names both paths and offers Retry Cleanup and Reveal; Markzen never deletes the destination to simulate rollback.
- AC143: Given a pending valid same-directory rename with no content edit, when Save succeeds, then the coordinator installs the unchanged committed bytes at the destination, removes the source, adopts the destination identity, and clears only the captured pending title.
- AC144: Given Save As targets an existing unopened file, when the user accepts overwrite and its observed `DiskVersion` remains current, then failure-atomic replacement succeeds, the original source is untouched, and the tab adopts the target identity.
- AC145: Given Close Tab or Close Window is requested while a prior save is in flight, when that save settles, then close proceeds without another prompt only if the relevant tab is clean; failure, conflict, cancellation, or newer dirty edits keep the UI open and run the normal close decision.
- AC146: Given a path-backed tab or window actually closes after every close decision succeeds, when disposal commits, then the app-wide registry releases each closed `FileKey`; a canceled close retains ownership.
- AC147: Given Quit is invoked with dirty tabs across one or more windows, then one app-wide decision lists the dirty-document count and offers Save All, Don't Save All, and Cancel before any window is disposed.
- AC148: Given app-wide Quit chooses Save All, when every document save succeeds, then all windows dispose their document resources, all `FileKey` ownership is released, and the process exits; any save failure/conflict/cancellation aborts Quit without undoing completed saves.
- AC149: Given app-wide Quit chooses Don't Save All or there are no dirty tabs, when document close guards finish, then every window and scoped resource is disposed and the process exits on macOS, Windows, and Linux; later milestones may add their own bounded app-owned flush guard before exit.

### Dialog testability and production isolation

- AC150: Given a non-packaged shell-smoke process started with the dedicated dialog-test flag, when the test harness queues a native-dialog result, then the next matching Open, Save, or confirmation dialog consumes that result in FIFO order without displaying native UI.
- AC151: Given a packaged production artifact, when it starts with the dialog-test flag or receives a dialog-debug-hook-shaped IPC request, then no dialog-scripting hook is registered or callable and normal application behavior remains unchanged.
- AC152: Given `MemoryPlatform.dialog`, when several typed dialog results are queued, then matching dialog calls consume them in FIFO order and cancellation is represented without application-state mutation.
- AC153: Given a repository browser fixture extended by this milestone declares dialog state, when the browser application boots with that known fixture, then `MemoryPlatform.dialog` loads exactly the declared queue in addition to the fixture's milestone 0001 filesystem and window state.

## Constraints

- `Platform.fs.read` returns bytes, an opaque app-wide `FileKey`, and an opaque `DiskVersion`. Renderer code never derives identity or authority from path strings. The Platform owns canonical equality, segment-safe containment and relative paths, existing-parent handling for missing targets, symlink resolution, and actual filesystem case rules.
- The Electron main process owns a registry with at most one path-backed tab per `FileKey` across all windows. It derives caller identity from the IPC sender and routes focus, reservation, write, and release operations only to live registered windows and tabs.
- One per-tab persistence coordinator owns Save, Save As, pending rename, overwrite confirmation, target reservation, image rebasing, and close-triggered saves. Disk replacement is conditional on `DiskVersion` and failure-atomic: before destination install, failures preserve committed bytes; after destination install, rename cleanup failure may leave two complete copies but never zero.
- Every async load, dialog, state capture, serialization, and persistence request captures its owning window/tab ID, operation generation, document revision, `FileKey`, and, when applicable, `DiskVersion` before awaiting. Cancellation is opportunistic; checking ownership and generation before commit is mandatory.
- Dialog scripting is enabled only for a non-packaged process with the explicit test flag. Its queue and controls are exposed through the test harness rather than the application-facing port, and the production artifact contains no registered debug IPC capability.
- Input rules and disk serialization are separate layers. Tests exercise input rules by typing character by character; file loading uses document parsing and bypasses input rules. The serializer never runs on each editor transaction.
- Canonical edited Markdown uses the official `@tiptap/markdown` pipeline, extended only through explicit supported or opaque-preservation nodes. The fixture expected models and golden files are hand-authored test oracles and must never be refreshed automatically from production parser/serializer output.
- Parsing must account for every source byte as supported syntax or opaque source before enabling rich editing. Failure to prove complete coverage selects whole-document preservation fallback.
- The implementation change must create ADRs for: (1) `FileKey`/`DiskVersion`, app-wide registration, and conditional atomic replacement; (2) semantic-model, source-coverage, opaque-node, and whole-document preservation strategy; and (3) tab generations, document revisions, IME commit boundaries, and coalesced persistence scheduling. The ADRs record implementation mechanisms without weakening these observable requirements.

## Test mapping

| AC | Primary layer |
|----|---------------|
| AC1-AC14 | Browser Mode |
| AC15-AC16 | Playwright-vs-vite |
| AC17-AC28 | Node |
| AC29 | Browser Mode |
| AC30-AC34 | Node |
| AC35 | Browser Mode |
| AC36 | Browser Mode |
| AC37-AC38 | Node |
| AC39-AC44 | Playwright-vs-vite |
| AC45-AC46 | Shell smoke |
| AC47-AC51 | Playwright-vs-vite |
| AC52-AC53 | Browser Mode |
| AC54-AC58 | Playwright-vs-vite |
| AC59-AC66 | Browser Mode |
| AC67-AC71 | Playwright-vs-vite |
| AC72-AC74 | Browser Mode |
| AC75-AC84 | Browser Mode |
| AC85 | Node |
| AC86-AC88 | Playwright-vs-vite |
| AC89-AC90 | Node |
| AC91-AC98 | Playwright-vs-vite |
| AC99-AC102 | Node |
| AC103-AC109 | Playwright-vs-vite |
| AC110-AC115 | Node |
| AC116 | Shell smoke |
| AC117-AC123 | Node |
| AC124-AC136 | Playwright-vs-vite |
| AC137-AC141 | Shell smoke |
| AC142 | Playwright-vs-vite |
| AC143-AC145 | Playwright-vs-vite |
| AC146 | Node |
| AC147-AC149 | Shell smoke |
| AC150-AC151 | Shell smoke |
| AC152 | Node |
| AC153 | Playwright-vs-vite |

## Open questions

- (none)
