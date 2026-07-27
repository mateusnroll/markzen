# Spec 0010: First-Class JSON Documents

**Status:** Draft   **Date:** 2026-07
**Origin:** Promotes the first ordered item from `BACKLOG.md`. The format
contract follows [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259) and
[ECMA-404](https://ecma-international.org/publications-and-standards/standards/ecma-404/).
The structured interaction follows the
[WAI-ARIA treegrid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treegrid/)
and extends the closed document-kind and shared-lifecycle direction established
by spec 0009. The independent simplicity review replaced token-by-token source
accounting with a complete-root parse, reused the standard JSON string
serializer and one `null` insertion placeholder, and removed confirmation
dialogs from undoable replace/delete actions. Detected indentation remains
because the user explicitly selected that serialization policy.

## Problem

Markzen cannot currently open, inspect, or edit `.json` files. JSON is common in
AI-assisted work, application configuration, generated data, and API payloads,
but treating it as ordinary prose would hide its structure and risk silently
changing duplicate properties, number spellings, or malformed source.

## Non-goals

- JSON5, JSON Lines/NDJSON, comments, trailing commas, unquoted property names,
  `NaN`, `Infinity`, `undefined`, JavaScript expressions, or schema-specific
  extensions.
- A whole-document raw-source mode, split source/structured view, automatic
  repair, permissive parsing, or partial editing of malformed JSON.
- JSON Schema discovery, validation, completion, documentation, inference, or
  form generation.
- JSONPath, jq, regular expressions, replace, sorting properties, formatting
  presets, minification, diffing, merging, or cross-file search.
- Drag reordering or explicit move-up/move-down commands for object properties
  or array items. Source order remains stable unless an item is inserted or
  deleted.
- Importing or exporting YAML, TOML, XML, CSV, or another structured format.
- Generalizing document kinds into a plugin registry or implementing the
  generic text, code, raster, or unsupported-file paths owned by spec 0011.

## Constraints and shared invariants

- Implementation requires spec 0009 to be Implemented and extends its closed
  per-tab document-kind model directly from `markdown | csv` to include `json`.
  It reuses specs 0001–0004 and 0007 for authority, identity, tabs, persistence,
  watching, preview, Find, menus, layout, and accessibility.
- JSON is strict RFC 8259/ECMA-404 JSON after an optional UTF-8 BOM. Any JSON
  value—object, array, string, number, `true`, `false`, or `null`—is a valid
  document root. An empty or whitespace-only file is malformed JSON.
- JSON content lives in one per-tab ProseMirror state. The persistent model is
  an ordered tree whose object entries retain independent property nodes, so
  duplicate names and source order are representable. Numbers retain their
  validated source lexeme instead of passing through an IEEE-754 value.
  React state may coordinate transient view state but never owns the JSON tree.
- Structured controls are the only JSON editing surface. Property-name and
  string editors expose decoded text; number editors expose a JSON-number
  lexeme; boolean, null, container, insertion, replacement, and deletion
  controls issue structural ProseMirror transactions. Authored JSON is never
  placed in executable DOM or interpreted as markup, a URL, or code.
- The empty value for a newly selected type is `{}` for object, `[]` for
  array, `""` for string, `0` for number, `false` for boolean, and `null` for
  null. These defaults are ordinary JSON values and gain no special
  placeholder semantics.
- Unchanged and rename-only documents preserve exact source bytes. After the
  first semantic edit, serialization retains the source BOM, dominant LF or
  CRLF convention, final-newline presence, detected indentation, object order,
  duplicate properties, and every unedited number lexeme. New JSON uses UTF-8
  without BOM, LF, two-space indentation, and no final newline.
- Indentation detection accepts one tab or 1–8 spaces per level when the
  positive indentation deltas of non-blank structural lines consistently
  identify that unit. Mixed or indeterminate indentation falls back to two
  spaces. Compact single-line source also falls back to two spaces after an
  edit. Formatting metadata is document state, not user preference.
- Editable JSON input is at most 10 MiB after an optional BOM, 512 container
  levels, 100,000 total values plus property names, and 1 MiB of decoded text
  or source lexeme in one property name, string, or number. Parsing stops at
  the first exceeded bound and selects exact preservation without allocating
  the complete semantic model. The existing 32 MiB document-transfer ceiling
  remains the outer bound.
- Malformed, invalid-UTF-8, and over-limit input retains exact original bytes in
  read-only preservation. A prominent accessible warning distinguishes
  malformed JSON from invalid encoding and safety limits. No partial JSON tree
  or repair action is exposed.
- JSON writes use the existing per-tab save coordinator, immediate best-effort
  `DiskVersion` check, failure-atomic writer, app-wide `FileKey` registry,
  watcher correlation, async owner/generation checks, and close/quit decisions.
  A save clears only the captured JSON revision it committed.
- Find reuses `findTextMatches` for decoded property names and scalar display
  text. JSON search state adds only ordered node/result identity, exact
  within-label offsets, and presentation state.
- The visible flattened treegrid is windowed so mounted rows follow the
  viewport rather than expanded document size. Collapsed descendants remain in
  the ProseMirror model and remain searchable.
- Performance timing remains in the existing non-blocking CI performance
  project. Parser limits, stale-result rejection, transaction counts, and DOM
  bounds remain blocking.
- Before production JSON code is accepted, add an accepted JSON ADR covering
  the bounded duplicate-preserving parser, number lexemes, ProseMirror schema,
  formatting metadata and canonical serializer, structured-only controls,
  treegrid windowing, and shared persistence. Update ADR 0001 for the closed
  `new-json` command and document-kind boundary and ADR 0004 for JSON tab/view
  state; do not broaden filesystem authority or create a format registry.

## Behavior (acceptance criteria)

### JSON creation, opening, identity, and document kind

- AC1: Given the native File menu after spec 0009, then **New JSON** appears
  immediately after New CSV, has no global accelerator, and dispatches one
  closed `new-json` command without changing New File, New CSV, or the tab-bar
  `+` button.
- AC2: Given a focused Markzen window, when New JSON is invoked, then one
  ordinary pinned untitled JSON tab becomes active before any preview,
  contains one expanded empty object root, and is initially clean.
- AC3: Given no focused Markzen window, when New JSON is invoked, then one new
  single-file window opens with exactly the clean untitled JSON tab from AC2.
- AC4: Given Open…, when its native chooser renders, then `.json` is selectable
  alongside the previously approved document extensions, its copy identifies
  Markzen documents rather than Markdown alone, and cancellation changes no
  tab, preview, registry, or active selection.
- AC5: Given a `.json` path matched case-insensitively from Open… or a workspace
  tree, when activation revalidates it, then it opens as a JSON tab through the
  existing app-wide `FileKey`, preview/pinned, loading, collision, error, and
  stale-generation rules.
- AC6: Given a JSON tab, then its tab label and editable title hide the
  case-insensitive `.json` suffix, retain the complete accessible filename,
  and show the same workspace-relative secondary path as another recognized
  document.
- AC7: Given a path-backed JSON title edit, then `.json` is its managed
  extension: a case-insensitive explicit `.json` suffix appears exactly once,
  a title without it preserves the existing suffix, and another suffix becomes
  part of the stem rather than converting document kind.
- AC8: Given a new JSON tab is saved or any JSON tab uses Save As, then the
  native chooser defaults to a `.json` filename, filters for JSON, and cannot
  convert the live tab to Markdown, CSV, generic text, raster, or another kind.
- AC9: Given tabs of different document kinds, when create, open, preview,
  Save, Save As, rename, duplicate-open focus, switching, watcher reload, or
  close runs, then each kind remains attached only to its owning tab and stale
  work cannot parse, render, serialize, or mutate bytes through another kind.
- AC10: Given a preview JSON tab, when its first property, item, value, type, or
  structural mutation begins, then it pins synchronously before mutation;
  navigation, selection, expansion, collapse, scrolling, and search do not pin
  it.

### Strict bounded parsing and preservation

- AC11: Given valid UTF-8 strict JSON with or without one UTF-8 BOM and within
  every editable limit, when it opens, then one complete bounded root parses,
  only JSON whitespace remains after it, and no unconsumed non-whitespace input
  is accepted.
- AC12: Given objects containing repeated property names, empty names,
  Unicode names, or source-specific property order, when parsed, then every
  occurrence becomes a distinct ordered property node and no last-key-wins map
  conversion occurs.
- AC13: Given strings and property names containing JSON escapes, escaped solidus,
  control escapes, BMP escapes, valid surrogate pairs, or an unpaired escaped
  surrogate, when parsed, then the decoded code-unit sequence matches an
  independently authored expected model without executing or normalizing it.
- AC14: Given valid numbers including negative zero, integers beyond safe
  JavaScript range, fractions, and exponent variants, when parsed, then each
  node retains its exact validated source lexeme and no floating-point or
  arbitrary-precision numeric conversion changes it.
- AC15: Given pretty, compact, LF, CRLF, BOM, no-BOM, final-newline, and
  no-final-newline fixtures, when parsing succeeds, then their formatting
  metadata follows the deterministic rules in this spec without entering the
  semantic JSON tree.
- AC16: Given an empty or whitespace-only `.json` file, when it opens, then no
  synthetic JSON value is invented and the tab enters malformed preservation
  under AC17.
- AC17: Given an unexpected token, missing delimiter, missing value, extra root
  token, invalid escape, raw control character, invalid number, comment,
  trailing comma, single-quoted string, or unquoted property name, when parsing
  reaches it, then no partial tree is exposed and a prominent warning says the
  file is malformed strict JSON and identifies the first safe one-based line
  and column.
- AC18: Given invalid UTF-8, when decoding runs, then no replacement character
  is introduced, no JSON parse is attempted, and exact byte preservation shows
  a prominent invalid-encoding warning distinct from malformed JSON.
- AC19: Given input crosses the byte, depth, total-node, or per-token bound,
  when the bounded parser observes the crossing, then it stops without
  allocating the remainder of the semantic tree and exact preservation shows
  the exceeded safety limit; input above 32 MiB instead fails before renderer
  transfer with an accessible error and retains no tab ownership.
- AC20: Given malformed, invalid-encoding, or over-limit preservation, then
  Save without a pending rename performs no write, rename-only preserves exact
  bytes, Save As may copy exact bytes, JSON Find and mutation controls are
  unavailable, and the ordinary conflict, close, and ownership behavior
  remains intact.
- AC21: Given independently authored strict-JSON fixtures, when the production
  parser reads them, then root types, ordered properties, duplicate names,
  decoded strings, exact number lexemes, and formatting metadata equal
  independently authored expected models not generated from parser output.

### Serialization integrity

- AC22: Given an unchanged JSON tab without a pending rename, when Save is
  invoked, then no disk write, parse, or canonical reserialization occurs.
- AC23: Given a rename-only JSON save, when it succeeds, then the filesystem
  entry moves without rewriting bytes and the tab adopts the renamed identity.
- AC24: Given an edited JSON document, when serialized, then it retains the
  source BOM, dominant record-newline convention, final-newline presence, and
  detected indentation; a new JSON document uses this spec's new-file defaults.
- AC25: Given serialization of an object or array, then each non-empty
  container is laid out on structural lines using exactly one indentation unit
  per depth, one space after each property colon, and no trailing comma; an
  empty object or array emits `{}` or `[]` on one line.
- AC26: Given a string or property name after any semantic edit, when
  serialized, then ECMAScript's standard `JSON.stringify` string-token behavior
  emits valid escapes for quotes, backslashes, controls, and unpaired UTF-16
  surrogates while other Unicode code units remain literal UTF-8; the custom
  ordered-container and exact-number serializer does not reimplement string
  escaping.
- AC27: Given an unedited number node, when any JSON edit causes
  reserialization, then its original valid number lexeme is emitted exactly;
  given an edited or newly inserted number, its accepted valid lexeme is
  emitted exactly without numeric conversion.
- AC28: Given duplicate properties, empty names, or source-specific object
  order, when unrelated content is edited and saved, then every surviving
  property remains in order and no occurrence is merged, sorted, or discarded.
- AC29: Given an edited independently authored semantic tree and formatting
  metadata, when the production serializer writes it, then its bytes equal an
  independently authored canonical golden and reparsing that golden produces
  the same ordered semantic model and metadata.
- AC30: Given serialization or dirty-state comparison, then expansion,
  selection, focus, search decorations, scroll, row virtualization, validation
  messages, and control state never enter JSON bytes or semantic equality.
- AC31: Given any supported root type, when it is edited, saved, and reopened,
  then its root type and complete value remain unchanged except for the user's
  explicit semantic edits; the serializer never wraps a scalar or array in a
  synthetic object.

### Structured treegrid presentation and navigation

- AC32: Given editable JSON, then it renders one named interactive treegrid
  containing one row per visible root, property, or array item, accurate
  hierarchy metadata, a single active row, clear type/value presentation, and
  no Markdown, table, image, CSV, or generic-code toolbar.
- AC33: Given an object property row, then its decoded property name, value
  type, duplicate-name occurrence where needed for disambiguation, and concise
  value or child-count summary are exposed; an array item exposes its
  one-based index, type, and summary, and the root exposes its type and summary.
- AC34: Given a container row, when its disclosure control, Enter, Space, or
  ArrowRight/ArrowLeft expansion action runs, then only view state changes,
  descendants mount or unmount accordingly, and semantic content, dirty state,
  history, and bytes remain unchanged.
- AC35: Given a JSON tab is switched away from and back to, then its expansion,
  active row, inline-edit caret, selection, undo history, and scroll position
  are restored; reopening the file in a later application session starts with
  the root expanded and every nested container collapsed.
- AC36: Given treegrid navigation mode, then ArrowUp/ArrowDown move through
  visible rows, ArrowRight expands a collapsed container or moves to its first
  child, ArrowLeft collapses an expanded container or moves to its parent,
  Home/End move to the first/last visible row, and the single roving tab stop
  follows the active row.
- AC37: Given an object property row, when its named Rename action, Enter on
  the property-name cell, or F2 is invoked, then a labeled decoded-text editor
  owns the name; Enter or its named Apply action commits, Escape, Cancel, or
  blur cancels, IME and ordinary text editing work, empty and duplicate names
  are allowed, and no-op submission creates no transaction.
- AC38: Given a string value row, when its named Edit action, Enter on the
  value cell, F2, or double-click is invoked, then a labeled decoded-text
  editor owns the value; multiline and control content remain editable as
  literal string data, Cmd/Ctrl+Enter or its named Apply action commits,
  Escape, Cancel, or blur cancels, and ordinary Enter inserts a decoded LF.
- AC39: Given a number value row, when editing begins, then a labeled text
  editor exposes its exact lexeme; invalid or incomplete JSON-number grammar
  keeps Apply/commit disabled with an inline explanation; Enter or Apply
  commits a valid value, Escape, Cancel, or blur cancels, and a valid no-op or
  changed lexeme follows AC27 and creates at most one transaction.
- AC40: Given a boolean or null row, then named keyboard-operable controls
  change `true` to `false` or `false` to `true`, while null remains literal
  until Replace Type is chosen; each accepted change is one transaction and a
  canceled action changes nothing.
- AC41: Given any value row, when Replace Type chooses object, array, string,
  number, boolean, or null, then a scalar is replaced with the documented empty
  default for that type in one immediately undoable transaction; replacing a
  non-empty container removes its descendants through that same transaction
  without a separate confirmation subsystem.
- AC42: Given an object row, when Add Property is invoked, then one property
  with an empty name and `null` value is appended after existing properties in
  one undoable transaction and its name editor receives focus; existing
  duplicate names do not block insertion, and Replace Type supplies any other
  desired initial value.
- AC43: Given an array root or item, when Insert Before or Insert After is
  invoked, then one `null` value is inserted at the exact requested index in
  one undoable transaction, the new row becomes active without reordering
  another item, and Replace Type supplies any other desired initial value.
- AC44: Given a non-root property or array item, when Delete is invoked by its
  named action or the navigation-mode Delete key, then exactly that node is
  removed immediately in one undoable transaction and focus moves to its next
  sibling, previous sibling, or parent; the root cannot be deleted.
- AC45: Given an inline edit or Replace Type action, when it is canceled,
  blurred under its documented cancel path, or submitted without a semantic
  change, then content, revision, dirty state, preview state, history,
  expansion, and serialized bytes do not change.
- AC46: Given the JSON treegrid at 480×320, 200% zoom, forced colors, reduced
  motion, a deeply nested fixture, a long key/value, or bidirectional Unicode,
  then title, JSON actions, hierarchy, warnings, active row, inline editor,
  both required scroll axes, and focus remain reachable and distinguishable
  without color, indentation, or animation alone.

### Find in JSON

- AC47: Given editable JSON, when Cmd/Ctrl+F or Edit → Find is invoked, then
  the existing non-modal Find panel opens and searches decoded property names
  plus string, number-lexeme, boolean, and null display text in stable
  depth-first source order without searching type labels, summaries, indices,
  punctuation, or synthetic paths.
- AC48: Given a non-empty query, then each searchable label is passed to
  `findTextMatches`, retaining spec 0004's NFC plus locale-independent
  lowercase conversion, deterministic non-overlap, and source offsets without
  matching across labels or nodes.
- AC49: Given a result inside collapsed ancestors, when it becomes current,
  then those ancestors expand, the owning row becomes active, the exact label
  text is highlighted, and the row scrolls into view without changing content;
  the resulting expansion remains ordinary tab-scoped view state when Find
  closes.
- AC50: Given results, then the panel reports current and total results and
  Next/Enter plus Previous/Shift+Enter wrap through stable search order without
  moving focus from the search input.
- AC51: Given JSON changes while Find is open, then a generation-scoped rescan
  preserves the mapped current node/result where possible and stale work cannot
  replace a newer query, tree, expansion, active row, or result set.
- AC52: Given Find closes, the tab switches, preservation replaces the tree, or
  the owner disposes, then decorations and pending scans are removed, focus
  returns to the prior live row where possible, and no query or result leaks to
  another tab; search never changes dirty state, history, preview state, or
  JSON bytes.

### Shared lifecycle, concurrency, security, and verification

- AC53: Given an accepted JSON inline or structural edit, then the owning tab's
  revision and dirty state advance synchronously. A tab switch preserves an
  unapplied inline draft as tab-scoped view state; Save or close first commits
  one valid draft, while an invalid number draft blocks that command, retains
  the draft, and focuses its explanation. Active IME composition commits
  exactly once to the originating draft before any of those decisions.
- AC54: Given JSON Save, Save As, rename, Save All, close-triggered save, or
  quit-triggered save, then the existing shared coordinator and failure-atomic
  outcomes apply to its captured serialized bytes exactly as to another
  editable document, including coalescing, follow-up saves, conflicts, missing
  files, collisions, cancellation, cleanup warning, and later edits remaining
  dirty.
- AC55: Given a clean JSON file changes externally to valid in-bound JSON, then
  a fresh bounded parse replaces its tree and formatting metadata, resets
  history and view state deterministically, retains kind and identity, and
  announces reload.
- AC56: Given a clean JSON file changes externally to malformed,
  invalid-encoding, or over-limit input, then exact new disk bytes replace the
  prior model in the corresponding warning preservation state without
  discarding or rewriting those bytes.
- AC57: Given a dirty JSON file changes externally, then its tree is not
  replaced and the existing Overwrite Disk, Reload from Disk, and Save Editor
  As… choices operate on captured JSON bytes and the newest `DiskVersion`.
- AC58: Given overlapping load, parse, search, save, watcher, preview,
  tab-switch, or close work, then every completion checks tab owner, document
  kind, operation generation, and captured revision before commit; stale work
  cannot affect another tab, kind, path, tree, formatting, view state, warning,
  or focus.
- AC59: Given property names or string values containing HTML, Markdown, URLs,
  image syntax, formulas, control-like labels, or bidirectional Unicode, when
  rendered or edited, then they are text only and create no executable DOM,
  rich node, navigation, popup, image capability, filesystem access, or network
  request.
- AC60: Given the expanded renderer/preload boundary, then New JSON and JSON
  document intents use closed enums plus existing sender-derived window/tab
  authority; renderer-supplied kind, formatting, tree, title, FileKey, path, or
  generation cannot grant filesystem authority or target another owner.
- AC61: Given Undo, Redo, Cut, Copy, Paste, Select All, Find, Save, Save As,
  Save All, Close Tab, or Close Window and a JSON inline editor or treegrid has
  relevant focus, then native menu enablement and routing reflect only the
  supported JSON or native text-control operation without acting on an
  inactive tab, another document kind, or another window; navigation-mode
  structural clipboard operations are not invented.
- AC62: Given treegrid windowing, then no more than 500 JSON `row` elements are
  mounted at once, visible rows expose accurate level, position, set size,
  expanded, selected, and active state, and one roving tab stop remains current
  across virtualization.
- AC63: Given a controlled 100,000-node fixture within editable limits, when CI
  opens it, expands and collapses representative branches, scrolls through
  10,000 visible rows, searches at least 5,000 matches, edits a deep scalar,
  inserts and deletes one node, and undo/redoes those changes, then open,
  action-to-paint, search-settle, and undo/redo times plus observed long tasks
  are recorded in human- and machine-readable artifacts without gating the
  build.
- AC64: Given JSON parser, serializer, formatting, and limit tests, then
  independently authored fixtures cover every root type, compact/pretty
  layouts, tabs/spaces/mixed indentation, BOM/no-BOM, LF/CRLF,
  final/no-final newline, duplicate/empty/Unicode names, every escape family,
  valid/unpaired surrogates, number variants beyond safe range, malformed
  syntax, invalid UTF-8, and every exact bound.
- AC65: Given automated JSON tests at any layer, then they use MemoryPlatform,
  repository fixtures, injected generations, and local bytes only; no test
  reads or changes a developer's documents or invokes a public service.
- AC66: Given JSON UI at minimum size, 200% zoom, forced colors, reduced
  motion, keyboard-only operation, or assistive-technology inspection, then
  every pointer action has its specified keyboard path, focus remains visible,
  names/roles/levels/positions/expanded/selected/busy/error states are
  accurate, warnings are announced, state is not visual-only, and automated
  checks report no serious or critical violations.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1 | Shell smoke | Browser Mode closed-command assertion |
| AC2 | Browser Mode | Playwright-vs-vite focused-window journey |
| AC3–AC4 | Shell smoke | Browser Mode initial-state and cancellation assertions |
| AC5 | Playwright-vs-vite | Shell smoke real `.json` open |
| AC6–AC7 | Browser Mode | Playwright-vs-vite rename journey |
| AC8 | Shell smoke | Browser Mode default-name policy |
| AC9–AC10 | Browser Mode | Playwright-vs-vite mixed-kind preview journey |
| AC11–AC18 | Node | Playwright-vs-vite representative parse/preservation |
| AC19 | Shell smoke | Node exact-bound parser tests |
| AC20–AC31 | Node | Playwright-vs-vite preservation and save journey |
| AC32–AC46 | Browser Mode | Playwright-vs-vite keyboard/tree journey |
| AC47–AC52 | Browser Mode | Playwright-vs-vite Find/tab-switch journey |
| AC53 | Browser Mode | Playwright-vs-vite IME save/close journey |
| AC54–AC57 | Playwright-vs-vite | Shell smoke save, watcher, and conflict round trip |
| AC58 | Node | Playwright-vs-vite stale-load/search journey |
| AC59 | Browser Mode | Shell smoke CSP/navigation negative |
| AC60 | Static | Node and shell forged/stale/kind-mismatch negatives |
| AC61 | Shell smoke | Browser Mode command eligibility |
| AC62 | Browser Mode | Playwright-vs-vite virtualization journey |
| AC63 | CI | — |
| AC64 | Node | — |
| AC65 | Static | Node transport/harness guards |
| AC66 | Browser Mode | Automated accessibility scan; Playwright minimum-size/zoom journey |

Supporting shell coverage also inspects packaged Open/Save filters, the closed
preload surface, exact real-filesystem bytes, native command routing, and one
real watcher lifecycle. `npm run verify` remains the blocking aggregate; AC63
runs in the existing non-blocking performance project.

## Open questions

- (none)
