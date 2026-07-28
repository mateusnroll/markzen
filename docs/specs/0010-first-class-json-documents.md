# Spec 0010: First-Class JSON Documents

**Status:** Implemented   **Date:** 2026-07
**Origin:** Promotes the first ordered item from `BACKLOG.md`. The format
contract follows [RFC 8259](https://www.rfc-editor.org/rfc/rfc8259) and
[ECMA-404](https://ecma-international.org/publications-and-standards/standards/ecma-404/).
The structured interaction follows the
[WAI-ARIA tree pattern](https://www.w3.org/WAI/ARIA/apg/patterns/treeview/)
and extends the closed document-kind and shared-lifecycle direction established
by spec 0009. The independent simplicity review replaced a multi-cell treegrid
with one row-first tree and active-row toolbar, reused spec 0009's
commit-on-leave ownership, added atomic mutation limits and exact-copy coverage,
and split parser, preservation, stale-work, and sender-authority proof layers.
The user explicitly approved those cuts plus deterministic formatting,
bounded previews, transient node identity, and a closed discriminated kind
union before implementation.

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
- Structural cut, copy, paste, multi-selection, or a cell-oriented treegrid.
  Native text editing and clipboard behavior remains available inside inline
  editors.
- Importing or exporting YAML, TOML, XML, CSV, or another structured format.
- Generalizing document kinds into a plugin registry or implementing the
  generic text, code, raster, or unsupported-file paths owned by spec 0011.

## Constraints and shared invariants

- Implementation requires spec 0009 to be Implemented and extends its closed
  per-tab document-kind model directly from `markdown | csv` to include `json`.
  Gateway, seed, and live-tab types are closed discriminated variants: each
  kind requires its own payload and cannot carry another kind's payload. This
  is not a provider API or registry.
- JSON is strict RFC 8259/ECMA-404 JSON after an optional UTF-8 BOM. Any JSON
  value—object, array, string, number, `true`, `false`, or `null`—is a valid
  document root. An empty or whitespace-only file is malformed JSON.
- JSON content lives in one per-tab ProseMirror state. The persistent model is
  an ordered tree whose object entries retain independent property nodes, so
  duplicate names and source order are representable. Numbers retain their
  validated source lexeme instead of passing through an IEEE-754 value.
  Mutations replace only the owning ProseMirror range rather than rebuilding
  the complete document.
- Every property, array item, and root has a transient ID retained by surviving
  nodes across transactions. IDs coordinate expansion, active row, Find, and
  focus but never enter JSON bytes or semantic equality.
- Structured controls are the only JSON editing surface. Property-name and
  string editors expose decoded text; number editors expose a JSON-number
  lexeme; boolean, null, container, insertion, replacement, and deletion
  controls issue structural ProseMirror transactions. Authored JSON is never
  placed in executable DOM or interpreted as markup, a URL, or code.
- The empty value for a newly selected type is `{}` for object, `[]` for
  array, `""` for string, `0` for number, `false` for boolean, and `null` for
  null. Add Property and Add Item use one ordinary `null` insertion value.
- Unchanged and rename-only documents preserve exact source bytes. After a
  semantic edit, serialization preserves the source BOM, dominant LF, CRLF, or
  bare-CR separator, source terminal-separator presence, detected indentation,
  object order, duplicate properties, and every number lexeme. It discards
  other insignificant leading and trailing whitespace. New JSON uses UTF-8
  without BOM, LF, two-space indentation, and no terminal separator.
- Newline dominance counts each line separator outside string tokens, treats
  CRLF as one separator, and lets the first encountered convention break a
  count tie. Edited output has exactly one terminal separator when the source
  ended with one and none otherwise.
- Indentation detection examines the first non-whitespace token on every
  non-blank structural line. A positive indentation transition must be the same
  one tab or 1–8-space unit at every deeper transition; mixed whitespace,
  inconsistent transitions, and compact or indeterminate source use two
  spaces. Formatting metadata is document state, not a preference.
- One MiB is 1,048,576 bytes. Editable source and canonical bytes after a
  mutation are at most 10 MiB including an optional BOM. A complete source or
  canonical property-name, string, or number token is at most 1 MiB in UTF-8,
  including string quotes and escapes. A container root has depth 1 and the
  maximum is 512. Each JSON value and each property name counts once toward
  the 100,000-unit maximum.
- Main rejects input above the existing 32 MiB transfer ceiling before renderer
  transfer. At or below that ceiling, the 10 MiB document bound is checked
  before UTF-8 decoding; fatal UTF-8 decoding precedes syntax parsing; syntax,
  depth, unit, and token failures then report the first failure encountered in
  source order.
- Malformed, invalid-UTF-8, and over-limit input retains exact original bytes in
  read-only preservation. No partial JSON tree or repair action is exposed.
- JSON writes reuse the existing save coordinator, `DiskVersion` checks,
  failure-atomic writer, app-wide `FileKey` registry, watcher correlation,
  async owner/generation checks, and close/quit decisions.
- Find reuses `findTextMatches` for decoded property names and scalar display
  text. The visible flattened tree uses fixed-height, windowed rows. Collapsed
  descendants remain in ProseMirror state and remain searchable.
- Before production JSON code is accepted, add an accepted JSON ADR covering
  the bounded parser, duplicate properties, number lexemes, ProseMirror schema,
  transient IDs, formatting and serialization, row-first tree, windowing, and
  shared persistence. Update ADR 0001 for `new-json` and the closed kind boundary
  and ADR 0004 for JSON tab/view state.

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
  alongside the previously approved extensions, its copy identifies Markzen
  documents, and cancellation changes no tab, registry, preview, or selection.
- AC5: Given a `.json` path matched case-insensitively from Open… or a workspace
  tree, when activation revalidates it, then it opens as JSON through the
  existing `FileKey`, preview/pinned, collision, error, and generation rules.
- AC6: Given a JSON tab, then its tab label and editable title hide the
  case-insensitive `.json` suffix, retain the complete accessible filename,
  and show the same workspace-relative secondary path as another document.
- AC7: Given a path-backed JSON title edit, then `.json` is its managed
  extension: an explicit case-insensitive suffix appears exactly once, a title
  without it preserves the current suffix, and another suffix stays in the
  stem rather than converting kind.
- AC8: Given a new JSON tab is saved or any JSON tab uses Save As, then the
  chooser defaults to `.json`, filters for JSON, and cannot convert the live
  tab to Markdown, CSV, generic text, raster, or another kind.
- AC9: Given mixed document kinds, when create, open, preview, Save, Save As,
  rename, duplicate focus, switch, watcher reload, or close runs, then each
  closed kind and required payload remain attached only to their owning tab.
- AC10: Given a preview JSON tab, when its first semantic mutation begins, then
  it pins synchronously; navigation, selection, expansion, scrolling, and Find
  do not pin it.

### Strict bounded parsing and preservation

- AC11: Given valid UTF-8 strict JSON with at most one leading BOM and within
  every editable limit, when it opens, then one complete root of any JSON type
  parses and only JSON whitespace may remain after it.
- AC12: Given repeated, empty, or Unicode property names and source-specific
  order, when parsed, then every occurrence is a distinct ordered property and
  no map-style last-key-wins conversion occurs.
- AC13: Given JSON escape families, escaped solidus, BMP escapes, valid
  surrogate pairs, or an unpaired escaped surrogate, when parsed, then decoded
  UTF-16 code units equal the independently authored expected model.
- AC14: Given negative zero, integers beyond JavaScript's safe range,
  fractions, or exponent variants, when parsed, then every number retains its
  exact validated source lexeme without numeric conversion.
- AC15: Given compact or pretty source with tabs, spaces, mixed indentation,
  BOM/no-BOM, LF/CRLF/bare-CR/mixed separators, leading/trailing whitespace,
  multiple/one/no terminal separators, when parsed, then formatting metadata
  follows this spec's deterministic rules without entering the semantic tree.
- AC16: Given an empty or whitespace-only `.json` file, when it opens, then no
  synthetic value is invented and parsing returns malformed preservation.
- AC17: Given malformed JSON, when parsing reaches the first unexpected token
  or incomplete production, then no partial tree is exposed and the result
  identifies a safe one-based line and Unicode-code-point column, treating
  CRLF as one line break and tab as one column.
- AC18: Given invalid UTF-8 within the document byte bound, when decoding runs,
  then no replacement character is introduced and no syntax parse is attempted.
- AC19: Given input crosses the 10 MiB source, 512-depth, 100,000-unit, or
  1 MiB token bound, when the bounded parser observes it, then it stops building
  the semantic tree and returns the exact exceeded limit; the document-byte
  bound wins before decoding and later failures follow source order.
- AC20: Given malformed, invalid-encoding, or over-limit preservation, then a
  prominent announced warning distinguishes the reason, malformed input shows
  AC17's location, and JSON Find and every mutation control are unavailable.
- AC21: Given preservation at or below the transfer ceiling, then Save without
  a rename performs no write, rename-only moves without rewriting, Save As
  copies exact bytes, and ordinary conflict, close, and ownership behavior
  remains intact.
- AC22: Given source above 32 MiB, then main fails before renderer transfer with
  an accessible error and retains no tab ownership.
- AC23: Given independently authored strict-JSON fixtures, when the production
  parser reads them, then roots, ordered properties, duplicates, decoded
  strings, exact numbers, and formatting metadata equal expected models not
  generated from parser output.

### Serialization integrity

- AC24: Given an unchanged path-backed JSON tab without a rename, when Save is
  invoked, then no disk write, parse, or canonical serialization occurs.
- AC25: Given unchanged valid JSON uses Save As, then the target receives the
  exact original bytes, including insignificant whitespace, BOM, and escapes.
- AC26: Given a rename-only JSON save, when it succeeds, then the filesystem
  entry moves without rewriting bytes and the tab adopts the new identity.
- AC27: Given edited JSON, when serialized, then it retains BOM, dominant
  separator, exactly the source terminal-separator presence, and detected
  indentation while applying the leading/trailing-whitespace policy; new JSON
  uses the documented defaults.
- AC28: Given serialization of a non-empty object or array, then each member or
  item occupies structural lines with one indentation unit per depth, one space
  after a property colon, and no trailing comma; empty containers emit `{}` or
  `[]` on one line.
- AC29: Given a string or property name after a semantic edit, when serialized,
  then standard `JSON.stringify` string-token behavior escapes quotes,
  backslashes, controls, and unpaired surrogates while the ordered serializer
  does not reimplement escaping.
- AC30: Given an existing or edited number, when serialization runs, then its
  accepted valid lexeme is emitted exactly without numeric conversion.
- AC31: Given duplicates, empty names, or source-specific object order, when
  unrelated content changes, then every surviving property remains in order
  and no occurrence is merged, sorted, or discarded.
- AC32: Given an independently authored semantic tree and formatting metadata,
  when serialized, then bytes equal an independently authored canonical golden
  and reparsing produces the same ordered model and metadata.
- AC33: Given serialization or dirty comparison, then transient IDs, expansion,
  active row, focus, Find, scroll, validation, toolbar, and windowing state never
  enter JSON bytes or semantic equality.
- AC34: Given any root type, when edited, saved, and reopened, then its complete
  value remains unchanged except for explicit semantic edits and no synthetic
  object wrapper is introduced.

### Row-first tree presentation and editing

- AC35: Given editable JSON, then it renders one named row-first interactive
  tree with one active and selected treeitem, one visible row per root,
  property, or array item, accurate hierarchy state, and one JSON toolbar
  targeting only the active row; Markdown, CSV, table, link, image, and generic
  toolbars are absent.
- AC36: Given a visible row, then property names, duplicate occurrence where
  needed, one-based array indexes, type, and child counts or scalar previews
  are exposed in a fixed-height single line; previews are bounded to 160 Unicode
  code points, render CR/LF/tab/control characters visibly, and isolate
  bidirectional text while inline editors expose complete decoded text.
- AC37: Given a container row, when its disclosure control, Enter, Space,
  ArrowRight, or ArrowLeft expansion action runs, then only tab-scoped view
  state changes and semantic content, history, preview, dirty state, and bytes
  remain unchanged.
- AC38: Given a JSON tab switches away and back, then expansion, active row,
  undo history, and both scroll axes restore; reopening in another application
  session starts with the root expanded and nested containers collapsed.
- AC39: Given tree navigation, then Up/Down move visible rows, Right expands or
  enters the first child, Left collapses or moves to the parent, Home/End move
  to the first/last visible row, Page Up/Down move one viewport, Ctrl/Cmd+
  Home/End move to the first/last tree row, and one roving tab stop follows the
  active selected row.
- AC40: Given an object property row, when the named Rename Property action is
  invoked, then a labeled decoded-text editor owns the complete name, empty and
  duplicate names are allowed, and Apply commits one transaction.
- AC41: Given a string scalar row, when Enter, F2, double-click, or Edit Value is
  invoked, then a labeled multiline decoded-text editor owns the complete value;
  ordinary Enter inserts LF and Apply or Cmd/Ctrl+Enter commits.
- AC42: Given a number row, when Enter, F2, double-click, or Edit Value is
  invoked, then a labeled editor exposes the exact lexeme and invalid or
  incomplete number grammar disables commit with an inline explanation.
- AC43: Given a boolean row, then one named keyboard-operable action toggles its
  value in one transaction; null remains literal until Replace Type.
- AC44: Given any value row, when Replace Type chooses a JSON type, then its
  value becomes that type's documented empty value in one undoable transaction;
  replacing a non-empty container removes descendants without confirmation.
- AC45: Given an object row, when Add Property is invoked, then an empty-name,
  null-valued property appends in one transaction, the parent expands, the new
  row activates, and Rename Property begins.
- AC46: Given any array row, when Add Item is invoked, then one `null` item
  appends in one transaction, the array expands, and the new row activates.
- AC47: Given an existing array item, when Insert Before or Insert After is
  invoked, then one `null` item is inserted at that exact index in one
  transaction without reordering another item.
- AC48: Given a non-root property or item, when Delete or the navigation-mode
  Delete key is invoked, then that node is removed in one transaction and focus
  moves to next sibling, previous sibling, or parent; the root cannot be deleted.
- AC49: Given an inline draft, then Escape or Cancel is the only cancellation
  path; another focus-leaving action commits a valid changed draft exactly once,
  a no-op creates no transaction, and an invalid number draft blocks navigation,
  Save, Save All, tab/window close, and quit while retaining focus and explaining
  the error.
- AC50: Given any inline or structural mutation would cross the canonical
  10 MiB, depth, unit, or token bound, then it is rejected before transaction;
  content, focus, active row, revision, history, dirty state, and preview remain
  unchanged and an accessible explanation identifies the limit.
- AC51: Given the JSON surface at 480×320, 200% zoom, forced colors, reduced
  motion, deep nesting, long/control-containing text, or bidirectional Unicode,
  then title, toolbar, hierarchy, warning, active row, inline editor, both scroll
  axes, and focus remain reachable and distinguishable without color,
  indentation, direction, or animation alone.

### Find in JSON

- AC52: Given editable JSON, when Find opens, then it searches decoded property
  names plus string, number, boolean, and null text in stable depth-first source
  order without type labels, summaries, indexes, punctuation, or paths.
- AC53: Given a non-empty query, then each searchable label is passed to
  `findTextMatches`, retaining spec 0004's normalization, casing, non-overlap,
  and source-offset rules without matching across labels.
- AC54: Given a result inside collapsed ancestors or outside a bounded preview,
  when it becomes current, then ancestors expand, the row activates, a bounded
  excerpt centered on the exact highlighted match appears, and the row scrolls
  into view without changing content.
- AC55: Given results, then status reports current and total and Next/Enter plus
  Previous/Shift+Enter wrap without moving focus from the search input.
- AC56: Given JSON changes while Find is open, then stable transient IDs preserve
  the mapped surviving result where possible and a generation-scoped stale scan
  cannot replace a newer query, tree, expansion, active row, or results.
- AC57: Given Find closes, the tab switches, preservation replaces the tree, or
  the owner disposes, then decorations and pending scans clear, focus returns to
  the prior live row where possible, no search state leaks, and content, history,
  preview, dirty state, and bytes remain unchanged.

### Shared lifecycle, concurrency, security, and verification

- AC58: Given an accepted JSON mutation, then the owning revision and dirty
  state advance synchronously, one localized ProseMirror history event is
  created, surviving transient IDs remain stable, and undo to the committed
  semantic baseline makes the content dimension clean.
- AC59: Given JSON Save, Save As, rename, Save All, close-triggered save, or
  quit-triggered save, then the shared coordinator and failure-atomic outcomes
  apply to captured serialized bytes, including coalescing, follow-up saves,
  conflicts, missing files, collisions, cancellation, cleanup warnings, and
  later edits remaining dirty.
- AC60: Given a clean JSON file changes externally to valid in-bound JSON, then
  a fresh bounded parse replaces its tree and metadata, resets history and view
  deterministically, retains kind and identity, and announces reload.
- AC61: Given a clean JSON file changes externally to malformed,
  invalid-encoding, or over-limit input, then exact new disk bytes replace the
  prior model in the corresponding preservation state without rewriting them.
- AC62: Given a dirty JSON file changes externally, then its tree is not
  replaced and Overwrite Disk, Reload from Disk, and Save Editor As… operate on
  captured JSON bytes and the newest `DiskVersion`.
- AC63: Given captured and current owner, kind, generation, and revision
  descriptors, then the pure completion policy accepts a result only when all
  four values match.
- AC64: Given stale load, parse, search, save, watcher, preview, switch, or close
  work resolves during real interaction, then it cannot change another tab,
  kind, path, tree, formatting, warning, selection, active row, or focus.
- AC65: Given property names or values containing HTML, Markdown, URLs, image
  syntax, formulas, control-like text, or bidirectional Unicode, when rendered,
  searched, edited, saved, and reopened, then they remain text and create no
  executable DOM, rich node, navigation, popup, image capability, filesystem
  access, or network request.
- AC66: Given static document contracts, then Markdown, CSV, and JSON gateway,
  seed, tab, bootstrap, and file payloads form a closed discriminated union,
  JSON requires only its JSON payload, and New JSON uses a closed command
  without raw Electron, filesystem, arbitrary IPC, or generic path authority.
- AC67: Given a JSON intent reaches main, then the exact application sender is
  validated before its closed payload, authority derives from the registered
  window and tab, and renderer-supplied kind, formatting, tree, title, `FileKey`,
  path, or generation cannot grant authority or target another owner.
- AC68: Given native Undo, Redo, Cut, Copy, Paste, Select All, Find, Save,
  Save As, Save All, Close Tab, or Close Window, then routing reflects the
  active JSON tree or native inline text editor without acting on another tab,
  kind, title field, or window; tree navigation invents no structural clipboard.
- AC69: Given tree windowing, then at most 500 treeitems mount, complete visible
  row count and each mounted row's level/position/set-size/expanded/selected
  state remain accurate, the active or editing row stays mounted, and one
  roving tab stop survives virtualization.
- AC70: Given a controlled fixture at the 100,000 counted-unit limit, when CI
  opens it, expands representative branches, scrolls 10,000 visible rows,
  searches 5,000 matches, edits a deep scalar, adds and deletes one node, and
  undo/redoes, then timing and long-task observations are recorded in human-
  and machine-readable artifacts without gating the build.
- AC71: Given parser, serializer, formatting, mutation, and limit tests, then
  independently authored fixtures cover every root, layout and separator
  convention, duplicate/empty/Unicode names, escape family, surrogate case,
  number family, malformed syntax, invalid UTF-8, and exact boundary.
- AC72: Given automated JSON tests, then they use MemoryPlatform, repository
  fixtures, injected generations, and local bytes only; no test reads or changes
  developer documents or invokes a public service.
- AC73: Given minimum size, zoom, forced colors, reduced motion, keyboard-only
  operation, or assistive-technology inspection, then every pointer action has
  its specified keyboard path, focus remains visible, tree names/roles/levels/
  positions/expanded/selected/busy/error states are accurate, warnings announce,
  state is not visual-only, and automated checks report no serious or critical
  violations.

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
| AC11–AC19 | Node | Playwright-vs-vite representative preservation |
| AC20 | Browser Mode | Playwright-vs-vite preservation presentation |
| AC21 | Playwright-vs-vite | Shell smoke exact-copy and rename round trip |
| AC22 | Shell smoke | Node byte-budget boundary |
| AC23–AC34 | Node | Shell smoke exact bytes; Playwright save/reopen |
| AC35–AC51 | Browser Mode | Playwright-vs-vite keyboard/tree journey |
| AC52–AC57 | Browser Mode | Playwright-vs-vite Find/tab-switch journey |
| AC58 | Browser Mode | Node semantic equality coverage |
| AC59–AC62 | Playwright-vs-vite | Shell smoke save, watcher, and conflict round trip |
| AC63 | Node | — |
| AC64 | Playwright-vs-vite | Node completion-policy coverage |
| AC65 | Browser Mode | Shell smoke CSP/navigation negative |
| AC66 | Static | Node contract guards |
| AC67 | Node | Shell forged/stale/kind-mismatch negatives |
| AC68 | Shell smoke | Browser Mode command eligibility |
| AC69 | Browser Mode | Playwright-vs-vite virtualization journey |
| AC70 | CI | — |
| AC71 | Node | — |
| AC72 | Static | Node transport/harness guards |
| AC73 | Browser Mode | Automated accessibility scan; Playwright minimum-size/zoom journey |

Supporting shell coverage also inspects packaged Open/Save filters, the closed
preload surface, exact real-filesystem bytes, native command routing, and one
real watcher lifecycle. `npm run verify` remains the blocking aggregate; AC70
runs in the existing non-blocking performance project.

## Open questions

- (none)
