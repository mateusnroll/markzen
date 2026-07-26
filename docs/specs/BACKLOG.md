# Backlog — Future Spec Candidates

This is Markzen's ordered product backlog after the initial rewrite. **In scope**
items are intended to become numbered specs in the order shown. **Later** items
remain deliberate candidates, but are not part of the current sequence.

Each entry preserves the product intent, relevant prior decisions, and known
design or verification boundaries without pre-approving behavior. When an item
is picked up, draft it from `TEMPLATE.md` with the next free number, resolve its
open decisions, and delete or narrow the entry here. If it changes behavior from
an Implemented spec, update and reapprove that affected spec as required.

## In scope

### 1. JSON document editing

Treat `.json` documents as first-class Markzen documents with a polished
structured viewing and editing experience. Users should be able to navigate,
search, expand and collapse, and edit objects, arrays, properties, and values
with clear syntax, indentation, and validation.

JSON documents must reuse Markzen's normal document lifecycle and
loss-prevention behavior. The eventual spec must resolve malformed input,
duplicate keys, number fidelity, formatting and serialization policy, large
documents, edit validation, and the boundary between structured controls and
direct text editing.

### 2. Other file types

Provide broad, intentionally modest support for files that do not warrant a
specialized Markzen editor. Code and text files such as `.js`, `.html`, `.css`,
and `.txt` should be editable with a good ProseMirror-based text experience and
syntax highlighting where applicable. Other supported formats such as `.png`,
`.jpg`, and `.webm` should have useful view-only presentation.

This work should favor coverage, safety, and reuse over format-specific
features. It must not grow into a collection of secondary IDE, image-editor,
media-editor, or office-suite implementations. The eventual spec must classify
supported extensions, editing eligibility, decoding and size limits, syntax
selection, binary/media rendering boundaries, save behavior, and accessible
fallbacks. CSV and JSON remain separate first-class document types rather than
being reduced to this generic path.

Milestone 0003 currently shows unsupported file types as subdued, disabled tree
rows and opens only `.md`, `.markdown`, and `.txt`. Those rows should become
available only after their document lifecycle and loss-prevention behavior are
approved.

### 3. Nested-list presentation

Make nested Markdown lists easier to read by drawing a clear vertical guide for
each indentation level and allowing nested sections to be collapsed and
expanded.

The eventual spec must define the pointer and keyboard controls, focus and
screen-reader state, what remains searchable or selectable while collapsed,
whether collapse state survives tab switches or restarts, and how hidden
descendants participate in copy, editing, undo, and save. Presentation state
must never remove or silently alter serialized list content.

### 4. Table and image reordering

Spec 0005 deliberately ships table insertion, navigation, add, and delete
actions plus image insertion, metadata editing, and deletion without structural
reordering. Add row and column reordering plus image movement through one shared
interaction model.

The eventual spec must define pointer drag and keyboard grab behavior, legal
targets, cancellation and blur/tab-switch cleanup, focus restoration,
announcements, undo ownership, and touch behavior. Reordering must preserve
table headers and alignment metadata plus image source serialization.

### 5. Raw Markdown editing

Add raw-Markdown editing as a per-tab mode toggled with Cmd/Ctrl+E. The prior
design direction used CodeMirror 6, transferred content only when switching
modes, kept independent rich-text and source-mode undo histories, and required
malformed Markdown never to throw. That design was never implemented and no
CodeMirror dependency has landed, so the eventual spec must revalidate the
dependency and synchronization contract before implementation.

Mode switching must preserve the existing serialization-integrity and
loss-prevention guarantees. The spec must define dirty state, selection and
scroll restoration, failed rich-mode parsing, save ownership, external changes,
and what happens when a tab closes or switches while either mode has pending
work.

### 6. Remove or reorder sidebar roots and file-tree CRUD

Add removal and reordering of workspace roots plus create, delete, rename, and
move operations in the file tree. Milestone 0003 deliberately deferred these
operations together because they share context-menu and command
infrastructure.

The eventual spec must preserve canonical identity, root containment, preview
and pinned tabs, watcher invalidation, cross-window ownership, the shared save
transaction, external-conflict handling, and loss-safe behavior for open or
dirty documents affected by a tree operation.

### 7. Fuzzy file finder and tab quick switcher

Add Cmd/Ctrl+P subsequence matching in the style of VS Code over a flat list of
openable files in the workspace, together with a tab-switcher modal. The old
ADR 0011 selected `fuzzysort` and a watcher-maintained flat-file scan, but that
design was never implemented and must be re-evaluated before adding a
dependency.

The finder must span all roots in a multi-root workspace and, by this point in
the sequence, account for the approved CSV, JSON, code, text, and view-only
document types rather than assuming a Markdown-only workspace. The eventual
spec must define ranking, path disambiguation, large-workspace performance,
watcher freshness, preview versus pinned activation, keyboard behavior, and
accessible result state.

### 8. Expanded settings

Add font family and size, line width, auto-save with a configurable delay, and
spell check. The old ADR 0013 explored persistence for these settings, while
the rewrite currently implements only theme, toolbar mode, and sidebar width.

Each approved setting must extend milestone 0003's closed, typed,
main-authoritative settings schema rather than introduce a generic registry.
Auto-save requires particular care because it extends milestone 0002's dirty
state, shared save transaction, external-conflict behavior, failure reporting,
and pending-rename rules.

### 9. Auto-update

Ship updates through **electron-updater** with **GitHub Releases as the update
feed**. CI should publish platform artifacts and update metadata for tagged
releases, and official builds should check that feed directly without requiring
a Markzen-operated update server. Spec 0001 already chose electron-builder as
the packager with this direction in mind.

Cost and signing facts gathered in 2026-07 must be rechecked when the spec is
drafted:

- **macOS:** Apple Developer Program membership is required because
  Squirrel.Mac refuses unsigned updates and public distribution also needs
  notarization.
- **Windows:** SignPath Foundation may provide free OV signing for qualifying
  open-source projects; Azure Trusted Signing is the fallback. Unsigned updates
  work technically but still encounter SmartScreen.
- **Linux:** AppImage can self-update through electron-updater, while Flatpak
  and Snap own their respective update mechanisms.
- The rejected alternative was
  [update.electronjs.org](https://github.com/electron/update.electronjs.org),
  which is macOS/Windows-only and fits Squirrel/Forge rather than the selected
  electron-builder path.

The eventual shell-smoke suite can point electron-updater's generic provider at
a local HTTP server to prove that an application on version N discovers,
downloads, and stages version N+1 without contacting a public service.

## Later

### 1. Native link elements and unsafe-link preference

Milestone 0004 renders each editable link as a focusable `span` with link
semantics while keeping the document model, focus contract, and opening policy
independent of that tag. A later accessibility-focused spec may migrate
rich-editor links to semantic `<a>` elements without reintroducing ambient
navigation, changing Markdown serialization, or making ordinary clicks leave
the editing context.

The same future work may add a closed `allowUnsafeLinks` setting, defaulting to
`false`, to milestone 0003's main-owned settings schema. When enabled, it may
bypass the native warning only for milestone 0004's confirmable absolute
destinations: credential-bearing HTTP(S), `file:`, and non-executable custom
schemes. Relative or fragment-only, malformed or control-character,
`javascript:`, `data:`, and `blob:` destinations remain non-openable. The
preference must be supplied at bootstrap, broadcast by authoritative revision,
and enforced in main rather than accepted as a renderer-provided bypass.

### 2. Active SVG images

Milestone 0005 preserves SVG sources but deliberately blocks active SVG
rendering. A later security-focused spec may permit SVG only after choosing and
testing a sanitization or rasterization boundary that cannot execute script,
navigate, fetch subresources, or escape the asset-capability model.
