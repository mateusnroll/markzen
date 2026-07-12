# Spec 0002: Document Lifecycle & Tabs

**Status:** Implemented   **Date:** 2026-07
**Origin:** Consolidates old specs 0002 (Rich Markdown Editing Core), 0003 (File Operations & Native Menu), 0004 (Tab System), and most of 0011 (Filename Field & Rename); old repo `RichEditor.tsx`, `fileOperations.ts`, `setupMenu.ts`, `tabsStore.ts`, `tabSwitch.ts`, `FilenameField.tsx`, `renameFile.ts`, `FilenameNavigation`, Markdown fixtures and link/table/image extensions; commits `31848ad`, `ca3347c`, `20f0fbe`, `28d1115`, `68d2387`, `0850d7b`, `23b21c7`, `093e3ab`, `5e81b15`, `54e8aee`, `0c858e8`, `f3e8b16`, `8a58532`.

## Problem

The product needs one loss-resistant document lifecycle: parse Markdown into a rich editor, preserve what the editor does not understand, keep independent tab state, observe open files for external changes, and save or rename real files without stale async work or partial failures corrupting them. These foundations must behave consistently in one or many windows before folder navigation, preview tabs, or richer link/table/image UX layer on top.

## Non-goals

- Folder windows, multi-root trees, relative-path title context, preview/peeking tabs, or directory-tree watching (later specs).
- Automatic merging of editor and external disk edits. This spec detects external document changes and offers explicit keep-editor, keep-disk, or preserve-both decisions.
- Toolbar and popover UX, following links, visual table manipulation, image picking or local-image rendering. This spec owns only the baseline link, table, and image document models, inert rendering, and serialization.
- General source/raw-Markdown editing. A read-only whole-document preservation fallback is a safety state, not source mode.
- Semantic editing of frontmatter, footnotes, math, raw HTML, or unknown Markdown extensions. Lossless opaque preservation is in scope.
- Auto-save, recent files, session restore, tab drag-reordering, split views, file-tree CRUD, or deriving filenames from headings.
- Enforcing performance thresholds in CI or selecting the dedicated target machine that will eventually gate them. This milestone records comparable measurements in CI without failing the build on their values.

## Behavior (acceptance criteria)

### Rich Markdown input and rendering

- AC1: Given an empty paragraph, when the user types `# ` through `#### ` character by character, then it becomes the corresponding H1 through H4 heading.
- AC2: Given an empty paragraph, when the user types `- `, `1. `, or `> ` character by character, then it becomes the corresponding bullet list, ordered list, or blockquote.
- AC3: Given an empty paragraph, when the user types `- [ ] ` character by character, then it becomes an unchecked task-list item.
- AC4: Given a task-list item, when the user activates its checkbox, then its checked state changes in the document model.
- AC5: Given a task-list item, when the user presses Tab, then it nests under the preceding eligible task-list item.
- AC6: Given text typed as `**bold**`, `*italic*`, `~~strike~~`, or `` `code` ``, when the closing delimiter is typed, then the matching mark replaces its delimiters.
- AC7: Given an empty paragraph, when the user types three backticks followed by a space or types the third character of `---` character by character, then it becomes the corresponding code block or horizontal rule using TipTap's documented input-rule trigger.
- AC8: Given source containing H5 or H6, when it is opened, then the heading level remains H5 or H6 even though live heading input stops at H4.
- AC9: Given a supported fixture, when it is rendered, then headings, list markers, task checkboxes, blockquotes, code blocks, horizontal rules, inert links, inert image placeholders, tables, and inline marks have distinct semantic DOM and visual hierarchy.
- AC10: Given the editor content area, when it renders, then it is centered at a maximum width of 720px with the system sans-serif stack and line-height 1.7.
- AC11: Given a click in the gutter beside document content, when the editor handles it, then the caret moves to the nearest document position.
- AC12: Given a click in the gutter below document content, when the editor handles it, then the caret moves to the end of the document.
- AC13: Given a gutter click, when the editor handles it, then no title, tab, toolbar, or other UI-chrome text becomes selected.
- AC14: Given ordinary typing, selection, or scrolling, when editor transactions run, then the Markdown serializer is not invoked per keystroke or scroll event.
- AC15: Given the controlled 10,000-line performance fixture in CI, when 20 single-character edits are entered, then the p50, p95, and maximum transaction-to-paint times are recorded in the job summary and downloadable performance artifact without their values affecting the build result.
- AC16: Given the controlled 10,000-line performance fixture, when the editor receives a wheel gesture, then the editor scrolls, the gesture does not scroll the tab strip, and CI records the gesture-to-scroll time without applying a pass/fail threshold.

### Independent document model and lossless serialization

- AC17: Given each serialization fixture, when the production parser reads its source, then the result equals an independently authored expected semantic model that was not produced by the parser under test.
- AC18: Given each independently authored expected semantic model, when the production serializer writes it, then the bytes equal an independently authored golden Markdown file that was not produced by the serializer under test.
- AC19: Given each golden Markdown file, when it is reparsed, then the result equals that fixture's independently authored expected semantic model.
- AC20: Given supported edited content, when it is serialized, then its canonical output is GFM Markdown with tight lists and the delimiter, indentation, escaping, and whitespace choices in the approved Markdown fixture contract below.
- AC21: Given an empty document model, when it is serialized, then the result is the empty string.
- AC22: Given escaped Markdown punctuation, when it is parsed and serialized, then the expected model and golden output retain literal punctuation rather than creating marks or blocks.
- AC23: Given hard breaks and meaningful trailing whitespace, when they are parsed and serialized, then their semantics and fixture-defined bytes are retained.
- AC24: Given non-ASCII text or emoji, when it is parsed and serialized as UTF-8, then its Unicode scalar values are unchanged.
- AC25: Given an inline Markdown link with nested marks and an optional title, when it is parsed and serialized, then its text, `href`, title, and nested marks match the expected model and golden output.
- AC26: Given a GFM table with a header, alignment metadata, empty cells, or escaped pipes, when it is parsed and serialized, then those properties match the expected model and golden output.
- AC27: Given a Markdown image with alt text, source, and optional title, when it is parsed and serialized, then those three source attributes match the expected model and golden output.
- AC28: Given raw HTML in otherwise supported Markdown, when it is parsed, then it becomes an opaque raw node rather than an executable HTML node.
- AC29: Given a document containing raw HTML, when it is rendered in the editor, then no element, script, event handler, navigation, or network request described by that HTML executes.
- AC30: Given an unsupported construct whose complete source range is identified without a gap, overlap, or guessed boundary under the Markdown fixture contract, when surrounding supported content is edited and serialized, then its exact original source slice is emitted by one opaque node.
- AC31: Given an opaque raw node, when supported content elsewhere is edited and saved, then the opaque node's source slice is emitted byte-for-byte unchanged.
- AC32: Given an opaque raw node selected as a whole node, when the user explicitly deletes it, then only that node's preserved source slice is removed.
- AC33: Given malformed Markdown that cannot be segmented without guessing, when it is opened, then the parser selects whole-document preservation fallback instead of producing a partial rich document.
- AC34: Given source for which parse coverage cannot account for every source byte as supported syntax or an opaque node, when it is opened, then the parser selects whole-document preservation fallback.
- AC35: Given whole-document preservation fallback, when it is displayed, then the complete literal source is visible in a read-only preservation view with an inline explanation that rich editing is disabled to prevent data loss.
- AC36: Given a tab in whole-document preservation fallback, when Save is invoked without a pending rename, then no disk write occurs; when Save As is invoked, its exact original bytes may be copied to a new document and adopted by the tab; rich content editing remains blocked.

#### Markdown fixture contract

The independently authored expected models and golden files are derived from the official [TipTap Markdown documentation](https://tiptap.dev/docs/editor/markdown/getting-started/basic-usage), [CommonMark 0.31.2 specification](https://spec.commonmark.org/0.31.2/), and [GitHub Flavored Markdown specification](https://github.github.com/gfm/), not from production parser or serializer output. The fixture author writes the source, expected semantic model, and canonical golden independently before using the production pipeline against them.

| Fixture family | Required source coverage | Canonical edited output |
|---|---|---|
| Blocks | ATX H1-H6, paragraphs, blockquotes, thematic breaks, fenced code with and without language, tight and nested ordered/unordered lists | ATX headings, `---` thematic break, triple-backtick fences, `>` blockquotes, `-` bullets, `1.` ordered-list markers, four-space nested indentation |
| Inline marks | Emphasis, strong, combined marks, strike, code spans, escapes, Unicode, emoji, hard and soft breaks | `*emphasis*`, `**strong**`, `~~strike~~`, the shortest valid backtick code-span fence, CommonMark escapes, two-space hard breaks |
| GFM | Task lists, rectangular tables, alignment, empty cells, escaped pipes | `- [ ]`/`- [x]` tasks; one delimiter row for tables with `:---`, `:---:`, `---:`, or `---`; escaped literal pipes |
| Links and images | Nested marks, optional titles, relative and absolute destinations, escaped punctuation, empty alt text | Inline `[text](destination "title")` and `![alt](source "title")`; source strings are preserved unless the user edits them or milestone 0005 explicitly rebases them |
| Preservation | Raw HTML, frontmatter, footnotes, math, directives, reference definitions not representable by the active schema, unknown extensions | One exact opaque source slice only when token/source boundaries prove complete coverage; otherwise whole-document preservation fallback |
| Malformed and ambiguous | Unclosed fences/delimiters, overlapping or missing token ranges, constructs whose source cannot be assigned once | Whole-document preservation fallback; no guessed partial rich document |

Canonical output uses one blank line between adjacent block nodes, no trailing spaces except the two spaces encoding a hard break, and the newline/BOM policy in AC120-AC123. A source fixture may use alternate valid CommonMark/GFM spellings; its independently authored golden uses the canonical edited form above unless an opaque slice preserves the source exactly.

### File identity and opening

- AC37: Given repeated versioned reads of one `FileKey`, when bytes and relevant metadata remain unchanged, then `Platform.fs` returns the same opaque `DiskVersion`; when a content change is observed, it returns a different `DiskVersion`. Canonical alias behavior remains owned by implemented Spec 0001 AC43-AC45.
- AC38: Given two paths with only a textual prefix in common, when Platform containment and relative-path helpers compare them, then containment is decided by canonical path segments rather than string prefix.
- AC39: Given a single-file window launched without an explicit file, when it initializes, then it contains one active empty untitled tab.
- AC40: Given File -> New File, Cmd/Ctrl+N, or the tab-bar add button, when it is invoked, then a distinct active empty untitled tab is created.
- AC41: Given File -> Open..., when its native dialog is configured, then the selectable extensions are `.md`, `.markdown`, and `.txt`.
- AC42: Given an Open dialog, when it is cancelled, then no tab, active selection, or registry entry changes.
- AC43: Given one pristine empty untitled tab, when a file is opened into its window, then that tab is reused rather than adding another tab.
- AC44: Given a requested `FileKey` already open in the same window, when Open is invoked for any alias of it, then its existing tab is focused.
- AC45: Given a requested `FileKey` already open in another window, when Open is invoked for any alias of it, then the owning window and tab are focused and no duplicate tab is created.
- AC46: Given two windows concurrently request aliases of the same file, when the app-wide registry resolves both requests, then exactly one live path-backed tab owns its `FileKey` and the other request focuses it; if the winning load fails before ownership commits, its reservation is released and no request focuses a dead or unregistered tab.
- AC47: Given a file that disappears between dialog selection and read, when Open completes, then a visible tab-local error is shown and no path-backed tab is registered.
- AC48: Given bytes that are not valid UTF-8, when the file is opened, then the tab enters a read-only byte-preservation view that displays each non-printable or invalid byte as `\xNN`, retains the exact original bytes, permits only exact-byte rename or Save As, and never introduces replacement characters.
- AC49: Given the controlled 10MB UTF-8 Markdown fixture in CI, when it is opened in the performance journey, then total open time and the maximum renderer-heartbeat gap are recorded in the job summary and downloadable performance artifact without their values affecting the build result.
- AC50: Given a valid path containing spaces or non-ASCII characters, when it is opened, then its bytes, display path, and `FileKey` survive dialog, IPC, and tab registration unchanged.
- AC51: Given a file read in flight, when its target tab closes, is repointed, or advances its load generation, then that stale completion cannot change visible content, dirty state, title, or the active tab.

### Tab state, IME, and accessibility

- AC52: Given several tabs, when the user clicks one, then it becomes active and displays its own document.
- AC53: Given keyboard focus on a tab control, when the user presses Enter or Space, then it becomes selected, displays its own document, and retains focus on that selected tab control so Tab moves into the restored editor.
- AC54: Given edits and undo operations in a tab, when the user switches away and back, then that tab's full undo and redo history is restored.
- AC55: Given a selection and caret in a tab, when the user switches away and back, then that tab's selection and caret are restored.
- AC56: Given a tab switch invoked while focus is already in the editor, when the destination tab activates, then its scroll position, selection, and caret are restored and focus remains in its editor; activation from the tab list instead follows AC53.
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
- AC67: Given 30 open tabs in CI, when the controlled performance test activates each tab once, then p50, p95, and maximum activation-to-paint times are recorded in the job summary and downloadable performance artifact without their values affecting the build result.
- AC68: Given active IME composition, when a tab switch is requested, then the composed text is committed once to its originating tab before the switch.
- AC69: Given active IME composition, when Save is requested, then the composed text is committed once before the save revision is captured.
- AC70: Given active IME composition, when tab or window close is requested, then the composed text is committed once before dirty-state evaluation and any close prompt.
- AC71: Given a path-backed tab whose source disappeared on disk, when the user switches to or closes it, then the tab remains usable and close behavior follows its in-memory dirty state.
- AC72: Given the tab strip, when assistive technology inspects it, then it exposes one `tablist`, one selected `tab`, and each tab's selected, dirty, filename, and untitled states.
- AC73: Given keyboard focus in the tab list, when Left/Right or Home/End is pressed, then roving focus moves to the corresponding enabled tab without activating it; Enter or Space activates it under AC53.
- AC74: Given the tab strip's close and add controls, when reached by keyboard, then each has a stable accessible name and activates with Enter or Space.

### Filename field and pending rename

- AC75: Given a path-backed `.md`, `.markdown`, or `.txt` tab, when its title renders, then it is editable and shows the basename without that recognized extension.
- AC76: Given an untitled tab, when its title renders empty, then the input retains the stable accessible name `Document title` and exposes `Untitled` as its placeholder and visible fallback label.
- AC77: Given a path-backed or untitled title edited to a different valid name, when input changes, then the tab becomes dirty with a pending title; a path-backed tab has a pending rename, and no disk path changes yet.
- AC78: Given a half-edited valid title, when the title field blurs, then its pending rename and dirty state remain without touching disk.
- AC79: Given title-field focus, when Enter is pressed, then the pending title remains and focus moves to the start of the document.
- AC80: Given title-field focus, when ArrowDown is pressed, then the pending title remains and focus moves to the start of the document.
- AC81: Given a pending title edit, when Escape is pressed, then the original displayed name is restored and the pending title/rename is cleared; the tab becomes clean only when its content also equals the last opened or committed baseline.
- AC82: Given text containing line breaks, when it is pasted into the title field, then the line breaks are removed before the pending name is stored.
- AC83: Given the caret on the first visual editor line, when ArrowUp is pressed, then focus moves to the end of the title field.
- AC84: Given a gutter click at the title's vertical position, when it is handled, then the title field receives focus.
- AC85: Given an empty name, `.`, `..`, a control character, a slash, a backslash, `:`, `*`, `?`, `"`, `<`, `>`, `|`, a trailing space/dot, or the case-insensitive Windows device stem `CON`, `PRN`, `AUX`, `NUL`, `COM1`-`COM9`, or `LPT1`-`LPT9` with or without an extension, when filename validation runs on any platform, then it returns an invalid result.
- AC86: Given an invalid pending name, when it is entered, then the title edit remains dirty and an inline error attached to the title field immediately identifies the validation problem; Save and Save As are blocked until the name is corrected or reverted.
- AC87: Given a pending name whose target is a different existing file, when Save is invoked, then saving is aborted and an inline collision error is attached to the title field.
- AC88: Given a pending pure-case change of the same `FileKey` on a case-insensitive filesystem, when Save succeeds, then the displayed spelling and disk entry adopt the requested case.
- AC89: Given a path-backed tab whose current recognized extension is not replaced in the title input, when rename succeeds, then `.md`, `.markdown`, or `.txt` is preserved respectively.
- AC90: Given a title ending in `.md`, `.markdown`, or `.txt` matched case-insensitively, when its target filename is derived, then that explicit suffix replaces the hidden managed extension and appears exactly once; otherwise the edited value is the stem and the existing recognized suffix is preserved.
- AC91: Given a valid Unicode title, when rename succeeds, then the Unicode name is preserved in the display path and on disk.
- AC92: Given an untitled tab with a typed title lacking an extension, when Save opens Save As, then the suggested filename is that title plus `.md`.

### Failure-atomic save, Save As, and rename

- AC93: Given an editor transaction that changes persistent document content, when it commits, then the owning tab's document revision advances and dirty state equals whether the current persistent document model or pending title differs from the last opened or successfully committed baseline.
- AC94: Given a dirty path-backed tab with an unchanged `DiskVersion`, when Save succeeds, then the saved revision's serialized bytes replace that file and the saved revision becomes clean.
- AC95: Given a pristine path-backed tab without a pending rename, when Save is invoked, then no disk write occurs and no error is shown.
- AC96: Given Save on an untitled tab or Save As on any active tab, when the native dialog opens, then it uses a default `.md` extension and the explicit title `Save Current Tab As`, confirmation label `Save As`, and platform-supported message or filename label stating that a new document will be created from the current tab.
- AC97: Given Save As to an unoccupied target, when its commit succeeds, then the source file remains unchanged, the target contains the current tab's captured bytes, and the existing open tab is repointed to and adopts the newly created document identity rather than opening a second tab.
- AC98: Given a Save As dialog, when it is cancelled, then no file, title, dirty revision, `FileKey`, or image source changes.
- AC99: Given same-path Save fails before atomic replacement, when the coordinator reports failure, then the original file remains byte-for-byte unchanged and the tab remains dirty.
- AC100: Given Save As fails before atomic target replacement, when the coordinator reports failure, then any pre-existing target remains byte-for-byte unchanged and the tab retains its original identity.
- AC101: Given a pending same-directory rename and content edits, when Save is invoked, then no disk mutation starts and a tab-local decision explains that the content must be saved before the file can move, offering Save and Rename or Cancel Rename.
- AC102: Given that decision and Save and Rename is chosen, when the coordinated transaction succeeds, then the target contains the captured edited revision, the old path is absent, and the tab adopts the target identity as one committed outcome.
- AC103: Given a write to a read-only location, when Save fails, then a visible tab-local error is shown and the dirty revision is retained.
- AC104: Given the current source has a different `DiskVersion` from the one read or last saved by the tab, when Save or rename begins, then the operation stops before writing and shows a tab-local external-change conflict.
- AC105: Given an external-change conflict, when the user explicitly chooses Overwrite Disk and the best-effort conditional retry succeeds, then the captured editor revision replaces the newly observed disk version and becomes clean.
- AC106: Given a path-backed source that is missing at Save or rename time, when the coordinator checks its `DiskVersion`, then it does not silently recreate the path and offers Save As or Cancel.
- AC107: Given a Save As target changes after the user approves it but before the coordinator's immediate pre-replacement `DiskVersion` check, when that check runs, then the operation aborts without overwriting the newer target; a change in the intentionally accepted interval after that check may be overwritten.
- AC108: Given a Save As or rename target whose `FileKey` is already owned by a different tab in any window, when reservation is attempted, then the operation aborts and the owning window/tab is focused; selecting the current tab's exact path behaves as Save, AC88 governs a pure-case rename, and any other alias of the current key is rejected as a collision without moving or rewriting the file.
- AC109: Given Save As selects an existing target that is not an already-open `FileKey`, when overwrite confirmation is declined, then the target and tab remain unchanged.
- AC110: Given Save, Save As, and rename requests for one tab, when they overlap, then one shared per-tab coordinator executes their disk commits serially.
- AC111: Given a save captures revision N and the user edits to revision N+1 while its write is in flight, when N succeeds, then N+1 remains dirty.
- AC112: Given the user invokes Save again after making newer edits while a save is in flight, when the first save succeeds, then the coordinator schedules exactly one follow-up for the revision captured by that second Save; edits after the second command remain dirty.
- AC113: Given repeated Save commands while the same revision is already queued or in flight, when the coordinator processes them, then they coalesce without duplicate writes of that revision.
- AC114: Given an in-flight save fails or conflicts, when it completes, then no automatic follow-up write runs until the user makes another explicit save/conflict choice.
- AC115: Given an async save completion whose tab, path, or operation generation is no longer current, when it resolves, then it cannot clear dirty state, repoint the tab, replace content, or release another tab's reservation.
- AC116: Given a successful Save As or rename, when the tab adopts its new `FileKey`, then the app-wide registry changes ownership from old key to new key atomically with the tab update.
- AC117: Given any parsed image source in this milestone, when Save As serializes the document to another directory, then the saved Markdown and live document preserve the source string exactly and perform no path resolution or rebasing; milestone 0005 owns safe rebasing.
- AC118: Given Save As is cancelled or fails in this milestone, when control returns to the editor, then the in-memory image source strings and original tab identity are unchanged.
- AC119: Given Save As succeeds with no later editor or title change, when the tab adopts the new document, then the adopted serialized model is its new clean baseline; later edits remain dirty under AC111.
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
- AC133: Given Save All, when it runs, then dirty tabs are saved sequentially from left to right and the window closes only after the last required save succeeds.
- AC134: Given sequential Save All where a tab is cancelled, conflicts, or fails, when that tab settles, then the queue stops before later tabs, the window remains open, and each already-saved revision remains clean.
- AC135: Given a window-close prompt, when Don't Save is chosen, then the window closes without writing any dirty tab.
- AC136: Given a window-close prompt, when Cancel is chosen, then the window, tabs, active selection, and disk remain unchanged.
- AC173: Given the user invokes the native operating-system window close control—the macOS red traffic-light button or the Windows/Linux equivalent—when the window contains dirty tabs, then Electron prevents the native close from disposing the window and routes exactly one Close Window request through AC131-AC136; after Cancel the window remains open, while a later approved close is allowed through without starting a second guard.

### Native menu and command routing

- AC137: Given the native application menu at this milestone, when it is inspected, then File contains New File, Open…, Save, Save As…, Save All, Close Tab, and Close Window; Edit contains Undo, Redo, Cut, Copy, Paste, and Select All; macOS places About, Hide, and Quit in the application menu, while Windows/Linux place Quit in File and About in Help. Later milestones add folder, Find, and Settings commands only when their behavior exists.
- AC138: Given native menu accelerators at this milestone, when they are inspected, then New, Open, Save, Save As, and Close Tab use Cmd/Ctrl+N, O, S, Shift+S, and W respectively; Close Window uses Cmd/Ctrl+Shift+W; Quit uses Cmd+Q on macOS, Alt+F4 on Windows, and Ctrl+Q on Linux; standard Edit roles use Electron's platform conventions; Save All has no global accelerator.
- AC139: Given several windows, when a menu command is invoked, then the main process derives its target from the focused live window and never trusts a renderer-supplied window identifier.
- AC140: Given focus in the rich editor or filename field, when a native Undo, Redo, Cut, Copy, Paste, or Select All command is invoked, then it operates on that focused control.
- AC141: Given menu enablement is recomputed, then each command matches the following table and updates whenever focused window, active tab, dirty state, pending title validity, or preservation mode changes.

| Command | Enabled when | Behavior when no Markzen window is focused |
|---|---|---|
| New File | Always | Create a single-file window containing one untitled tab |
| Open… | Always | Complete the native chooser, then create or focus a single-file window for the selected document |
| Save | The active tab is dirty or has a pending rename; invalid pending names remain enabled so the command can focus their inline error | Disabled |
| Save As… | An active tab exists and its pending title is valid | Disabled |
| Save All | The focused window has at least one dirty tab | Disabled |
| Close Tab | The focused window has at least one tab | Disabled |
| Close Window | A live Markzen window is focused | Disabled |
| Undo, Redo, Cut, Copy, Paste, Select All | The focused editor or filename control reports the corresponding action eligible | Disabled |

### Post-commit rename recovery

- AC142: Given rename-plus-save installed the complete destination but deleting the old source fails, when recovery begins, then the tab adopts the safe destination, the old copy remains available, and a persistent warning names both paths and offers Retry Cleanup; Markzen never deletes the destination to simulate rollback.
- AC143: Given a pending valid same-directory rename with no content edit, when Save succeeds, then the filesystem entry moves to the destination without rewriting its contents, its bytes remain exactly unchanged, the tab adopts the destination identity, and only the captured pending title is cleared.
- AC144: Given Save As targets an existing unopened file, when the user accepts overwrite and its observed `DiskVersion` remains current, then failure-atomic replacement succeeds, the original source is untouched, and the tab adopts the target identity.
- AC145: Given Close Tab or Close Window is requested while a prior save is in flight, when that save settles, then close proceeds without another prompt only if the relevant tab is clean; failure, conflict, cancellation, or newer dirty edits keep the UI open and run the normal close decision.
- AC146: Given a path-backed tab or window actually closes after every close decision succeeds, when disposal commits, then the app-wide registry releases each closed `FileKey`; a canceled close retains ownership.
- AC147: Given Quit is invoked, then one app-wide warning is parented to the currently focused window, or the last active live window when none is focused; it states how many windows and dirty tabs will close and, when dirty tabs exist, offers Save All, Don't Save All, and Cancel before any window is disposed.
- AC148: Given app-wide Quit chooses Save All, when dirty tabs are processed sequentially in focused-window-first, tab-left-to-right order followed by remaining windows in creation order, then all windows dispose their document resources, all `FileKey` ownership is released, and the process exits only after every save succeeds; the first failure/conflict/cancellation stops the queue and aborts Quit without undoing completed saves.
- AC149: Given app-wide Quit chooses Don't Save All or there are no dirty tabs, when document close guards finish, then every window and scoped resource is disposed and the process exits on macOS, Windows, and Linux; later milestones may add their own bounded app-owned flush guard before exit.

### Dialog testability and production isolation

- AC150: Given shell smoke controls the packaged artifact through Playwright's main-process test connection, when the test itself stubs the next Electron Open, Save, or confirmation dialog result, then the application consumes that result without displaying native UI and no application-owned dialog queue, flag, or debug IPC is added.
- AC151: Given a packaged production artifact, when its application-facing preload, IPC handlers, and command-line switches are inspected, then none exposes application-owned dialog scripting or a renderer-callable debug capability and normal native dialogs remain main-owned; Spec 0001's inspector-only shell harness is not an application capability.
- AC152: Given `MemoryPlatform.dialog`, when several typed dialog results are queued, then matching dialog calls consume them in FIFO order and cancellation is represented without application-state mutation.
- AC153: Given a repository browser fixture extended by this milestone declares dialog state, when the browser application boots with that known fixture, then `MemoryPlatform.dialog` loads exactly the declared queue in addition to the fixture's milestone 0001 filesystem and window state.

### External document changes

- AC154: Given a clean path-backed tab whose watched source receives an external change and a fresh read returns a different `DiskVersion`, when parsing completes, then the tab replaces its content with the new disk model, makes that model the clean baseline, resets undo/redo history, keeps its tab identity, and announces that the document reloaded.
- AC155: Given a dirty path-backed tab whose watched source receives an external change and a fresh read returns a different `DiskVersion`, when validation completes, then editor content is not replaced and a persistent accessible conflict panel offers Overwrite Disk, Reload from Disk, and Save Editor As….
- AC156: Given that conflict and Overwrite Disk is chosen, when the coordinator checks the newest `DiskVersion` immediately before atomic replacement and commits successfully, then the captured editor snapshot replaces the disk version, becomes the clean baseline, and the conflict clears; another observed change before that check keeps the conflict open.
- AC157: Given that conflict and Reload from Disk is chosen, when the newest disk read and parse succeed, then editor changes and history are discarded, disk content becomes the clean baseline, the conflict clears, and focus returns to the editor.
- AC158: Given that conflict and Save Editor As… is chosen, when Save As succeeds, then the externally changed original file remains untouched, the current tab adopts the newly created document containing the captured editor snapshot, and ownership/watching move atomically to the new `FileKey`.
- AC159: Given app-originated save/rename events, duplicate watcher events, or an older external read completing after a newer generation, when watcher invalidations settle, then self-events do not reload the just-committed document and stale or duplicate results cannot replace current state or reopen a resolved conflict.
- AC160: Given a path-backed tab opens, successfully renames, completes Save As, closes, or its window closes, when watcher ownership changes, then exactly one main-owned document watcher follows its current path and the previous watcher is disposed idempotently.
- AC161: Given the native watcher is unavailable or reports an error, when the tab remains open, then a tab-local accessible warning states that live reload is unavailable, editing remains possible, and the immediate pre-write `DiskVersion` check continues to protect Save and rename on a best-effort basis.

### Document capability security and temporary rendering gates

- AC162: Given the expanded preload API and production TypeScript, when its static surface is inspected, then it exposes one typed method per document intent and no raw Electron/Node object, arbitrary IPC send/invoke, raw filesystem method, renderer-selected event destination, or generic path-based capability.
- AC163: Given any document IPC request, when it reaches the main process, then the exact application-origin main-frame sender is validated before payload parsing, the payload is checked against that intent's runtime schema before domain work, and failures return only typed serializable data.
- AC164: Given a valid application sender with a forged, stale, foreign, or mismatched `WindowId`, `TabId`, `FileKey`, display path, reservation token, or operation generation, when a document intent is authorized, then authority is derived from main-owned registrations, the request is rejected, and no dialog, read, write, focus, watch, or release operation reaches another owner.
- AC165: Given a document load, save completion, dialog result, watcher invalidation, conflict action, menu command, or registry focus event, when main routes it, then only its live owning window/tab receives it and a disposed or superseded generation cannot mutate state or disclose another document's path or content.
- AC166: Given any Markdown link during this milestone, when it renders or is activated by pointer or keyboard, then it behaves as inert editor content and causes no navigation, popup, system-handler call, IPC request, or network request; milestone 0004 must replace this temporary negative gate with its approved link-interaction coverage.
- AC167: Given any Markdown image source during this milestone, when it renders, then an inert placeholder exposes safe alt text without assigning the source to a fetch-capable DOM attribute and causes no network, `file:`, custom-protocol, `data:`, decode, navigation, or filesystem request; milestone 0005 must replace this temporary negative gate with its approved asset-security coverage.

### Reporting, accessibility, and resolved rename outcomes

- AC168: Given CI for this milestone, when the controlled edit, wheel, 10MB-open, and 30-tab performance journeys run, then they execute outside `npm run verify`, publish a human-readable job summary and machine-readable artifact, and are explicitly non-blocking regardless of measured values; choosing a target machine and enforcing thresholds requires a later spec change.
- AC169: Given editor, filename, tab, error, conflict, preservation, and empty-state UI introduced by this milestone at minimum size, 200% zoom, forced colors, or reduced motion, when accessibility checks and keyboard journeys run, then controls remain reachable, focus and state remain distinguishable without color alone, non-essential motion is disabled, and there are no serious or critical automated violations.
- AC170: Given Save and Rename fails before destination installation, when the coordinator returns, then the original path and bytes remain available, the target remains absent or unchanged, and the tab retains its pending rename and dirty editor snapshot.
- AC171: Given a dirty file with a pending rename and the user chooses Cancel Rename, when the decision applies, then the title returns to its original name, no filesystem move or write occurs, and the unrelated editor changes remain dirty.
- AC172: Given a pending filename is manually restored to its baseline value or editor operations return the persistent document model to its baseline, when equality is recomputed, then that dimension is clean again; the tab is clean only when both title and document equal the baseline.

## Constraints

- `Platform.fs.read` returns bytes, an opaque app-wide `FileKey`, and an opaque `DiskVersion`. Renderer code never derives identity or authority from path strings. The Platform owns canonical equality, segment-safe containment and relative paths, existing-parent handling for missing targets, symlink resolution, and actual filesystem case rules.
- A `DiskVersion` is a best-effort opaque snapshot derived from the bytes and metadata observed by the Platform. The coordinator compares it immediately before atomic replacement. The design intentionally accepts that an external write in the small interval after the successful check and before replacement may be overwritten; the API and UI must not claim lock-based or compare-and-swap protection.
- The Electron main process owns a registry with at most one path-backed tab per `FileKey` across all windows. It derives caller identity from the exact parsed sender origin and main frame, validates a per-intent runtime schema, and routes focus, reservation, dialog, read, write, watch, event, and release operations only to live registered windows and tabs. Renderer-supplied display paths and IDs are data, never authority.
- One per-tab persistence coordinator owns Save, Save As, pending rename, overwrite confirmation, target reservation, and close-triggered saves. Disk replacement is conditional on the immediate best-effort `DiskVersion` check and failure-atomic: before destination install, failures preserve committed bytes; after destination install, rename cleanup failure may leave two complete copies but never zero. Milestone 0002 preserves image source strings; milestone 0005 adds rebasing to this coordinator.
- Every async load, dialog, state capture, serialization, and persistence request captures its owning window/tab ID, operation generation, document revision, `FileKey`, and, when applicable, `DiskVersion` before awaiting. Cancellation is opportunistic; checking ownership and generation before commit is mandatory.
- Real document watching is main-owned and uses the chokidar backend already required by milestone 0003, configured for exact open-document paths. Watcher notifications are untrusted invalidations only: the application performs a fresh versioned read, correlates app-originated writes, and never applies an event payload as document state. Browser tests use a separate `MemoryPlatform` harness queue; watchers and queues are never exposed through the application-facing preload.
- Shell tests script native dialogs by stubbing Electron dialog calls from Playwright's existing main-process test connection. Production application code has no dialog-test flag, queue, generic debug IPC, or renderer-callable scripting hook.
- Input rules and disk serialization are separate layers. Tests exercise input rules by typing character by character; file loading uses document parsing and bypasses input rules. The serializer never runs on each editor transaction.
- Canonical edited Markdown uses the official, currently beta `@tiptap/markdown` pipeline with explicit `contentType: 'markdown'`, GFM support, and four-space indentation, extended only through explicit supported or opaque-preservation nodes. The fixture expected models and golden files are independently hand-authored from the linked TipTap/CommonMark/GFM documentation and must never be refreshed automatically from production parser/serializer output.
- Parsing must account for every source byte as supported syntax or one non-overlapping opaque source slice before enabling rich editing. TipTap/Marked token `raw` ranges may support the proof but are not themselves trusted as an oracle; any missing, overlapping, reordered, or guessed range selects whole-document preservation fallback.
- Temporary inert-link and inert-image tests are deliberate security gates, not permanent feature expectations. When milestones 0004 and 0005 introduce their approved guarded behavior, they must return this spec to Draft, remove or narrow AC166/AC167 and their negative tests, add the replacement coverage, and reapprove the changed behavior.
- The implementation change must create ADRs for: (1) `FileKey`/`DiskVersion`, app-wide registration, immediate best-effort version checking, and conditional atomic replacement; (2) semantic-model, source-coverage, opaque-node, and whole-document preservation strategy; (3) tab generations, document revisions, baseline equality, IME commit boundaries, and coalesced persistence scheduling; and (4) exact-document watching, self-event correlation, and conflict generations/actions. It must update accepted ADR 0001 with the new document-intent IPC schemas, sender-derived authority, event routing, and targeted negative security tests rather than duplicate the existing capability-boundary decision. The ADRs record implementation mechanisms without weakening these observable requirements.

## Test mapping

| AC | Primary layer |
|----|---------------|
| AC1-AC14 | Browser Mode |
| AC15 | CI |
| AC16 | Playwright-vs-vite |
| AC17-AC28 | Node |
| AC29 | Browser Mode |
| AC30-AC34 | Node |
| AC35 | Browser Mode |
| AC36 | Playwright-vs-vite |
| AC37-AC38 | Node |
| AC39-AC44 | Playwright-vs-vite |
| AC45-AC46 | Shell smoke |
| AC47-AC48 | Playwright-vs-vite |
| AC49 | CI |
| AC50-AC51 | Playwright-vs-vite |
| AC52-AC53 | Browser Mode |
| AC54-AC58 | Playwright-vs-vite |
| AC59-AC66 | Browser Mode |
| AC67 | CI |
| AC68-AC71 | Playwright-vs-vite |
| AC72-AC74 | Browser Mode |
| AC75-AC84 | Browser Mode |
| AC85 | Node |
| AC86-AC88 | Playwright-vs-vite |
| AC89-AC90 | Node |
| AC91-AC98 | Playwright-vs-vite |
| AC99-AC100 | Node |
| AC101 | Browser Mode |
| AC102 | Playwright-vs-vite |
| AC103-AC109 | Playwright-vs-vite |
| AC110-AC116 | Node |
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
| AC154-AC159 | Playwright-vs-vite |
| AC160 | Shell smoke |
| AC161 | Playwright-vs-vite |
| AC162 | Static |
| AC163-AC165 | Node |
| AC166-AC167 | Playwright-vs-vite |
| AC168 | CI |
| AC169 | Browser Mode |
| AC170 | Node |
| AC171-AC172 | Browser Mode |
| AC173 | Shell smoke |

Supporting coverage is explicit: AC15, AC16, AC49, and AC67 measurements run in the non-blocking AC168 CI report; AC99-AC100, AC102, and AC143-AC144 exercise the real filesystem in shell smoke; AC116 has a two-window shell journey; AC130-AC136 have native-control integration in AC173 shell smoke; AC154-AC161 include real watcher integration in shell smoke; AC163-AC165 include forged/stale IPC shell negatives; and AC169 includes the automated accessibility scan plus Playwright minimum-size/zoom journeys.

## Open questions

- (none)
