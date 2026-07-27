# Spec 0009: First-Class CSV Documents

**Status:** Implemented   **Date:** 2026-07
**Origin:** Promotes
[GitHub issue #14](https://github.com/mateusnroll/markzen/issues/14).
The format contract is grounded in
[RFC 4180](https://www.rfc-editor.org/rfc/rfc4180), with explicitly defined
delimiter extensions, and the interaction model follows the
[WAI-ARIA data-grid pattern](https://www.w3.org/WAI/ARIA/apg/patterns/grid/).
The 2026-07 independent simplicity review replaced pointer-drag selection with
click/Shift+click, required reuse of the CSV codec and existing search matcher,
narrowed ADR updates, removed an unrelated backlog rewrite, and made cell-edit
commit ownership explicit. Its proposed removal of the header-row toggle was
rejected because the user explicitly selected that product behavior. Approval
also resolves bare-CR compatibility, exact-copy Save As, byte-counted limits,
fixed grid geometry, virtualized accessibility semantics, and split proof
layers.
The post-green simplicity review removed redundant grid props and React matrix
state, reused one preservation-message source, and kept document-kind authority
in main-owned tab records.
Returned to Draft after a 2026-07 browser-polish session refined the CSV
workspace density, fixed grid chrome, header-mode presentation, icon actions,
pointer selection, and layered cell editing. The retained uncommitted prototype
was frozen as design research and explicitly approved after this revision and
its Draft simplicity review were presented.
The independent Draft simplicity review kept the expanded `csv-basic` data as
supporting test/demo scaffolding rather than normative product behavior and
removed AC64's duplicate header-mode role rules in favor of AC30.
The final implementation simplicity review made tooltip copy derive from each
action's accessible label and removed a redundant parent pointer guard. Final
live inspection also exposed an initially under-filled virtualized viewport;
the grid now measures its actual size on mount and resize, with a Playwright
regression assertion.

## Problem

Markzen currently lists `.csv` files as disabled workspace entries and cannot
open, create, inspect, or edit them. CSV is a common interchange format for
LLM-generated and application data, so it needs a first-class, spreadsheet-like
grid that makes literal data easy to navigate, search, copy, and edit without
introducing formulas, type coercion, or silent serialization loss.

## Non-goals

- Formulas, functions, computed values, data-type inference, date or number
  coercion, validation schemas, conditional formatting, charts, pivot tables,
  macros, or external data connections.
- Sorting, filtering, hiding, grouping, freezing arbitrary rows or columns,
  merged cells, cell styling, manual column resizing, or fill handles.
- Importing or exporting spreadsheet formats such as XLSX, ODS, or Numbers.
- Opening `.tsv` or other extensions as CSV documents. A `.csv` file may use a
  detected tab delimiter, but broader file-type support remains in the backlog.
- Automatically repairing, padding, truncating, or partially editing malformed,
  ragged, non-UTF-8, or over-limit CSV data.
- A raw CSV source mode, manual delimiter chooser, configurable CSV dialect,
  persisted header-row preference, or per-file sidecar metadata.
- Generalizing the document system into a format plugin registry or building
  abstractions for JSON and other future document types before their specs.
- Changing Markdown parsing, serialization, formatting, link, table, image,
  source-mode, or search semantics.
- Cross-file search, replace, regular expressions, whole-word search, or
  spreadsheet-style find-and-replace.

## Constraints and shared invariants

- This spec extends the secure runtime and path identity of spec 0001, the tab,
  save, close, watcher, conflict, and serialization-integrity foundations of
  spec 0002, the workspace preview and tree behavior of spec 0003, the Find and
  shared-surface behavior of spec 0004, and the native chrome and editor layout
  of spec 0007.
- A tab has one closed document kind: `markdown` or `csv`. CSV support extends
  that discriminated model directly; it does not introduce a generic registry,
  format-provider API, or speculative JSON/code/media abstraction.
- CSV content lives in per-tab ProseMirror state and mutations are ProseMirror
  transactions. React state may hold transient view coordination but never the
  authoritative cell matrix. The CSV schema contains literal text fields and
  the minimum row/record structure required by this spec. It may reuse existing
  ProseMirror table primitives where their behavior matches, but CSV never
  serializes through Markdown table rules or admits rich marks, links, images,
  or nested blocks.
- Every CSV field is a string. Markzen never evaluates, sanitizes, prefixes,
  follows, fetches, or coerces field text, including text beginning with `=`,
  `+`, `-`, or `@`. Clipboard and serialization preserve those strings as data.
- Header-row state is view metadata scoped to one live tab, defaults to on, and
  affects presentation and accessible labels only. It never changes CSV
  content, dirty state, undo history, serialized bytes, or another tab.
- One MiB is 1,048,576 bytes. Editable CSV input and the canonical bytes
  produced after any mutation are at most 10 MiB including an optional UTF-8
  BOM, 10,000 records, 1,000 fields in one record, 100,000 total fields, and
  1 MiB of UTF-8 encoded bytes in one decoded field. Clipboard text is measured
  by its UTF-8 encoding against the same applicable parser and field bounds.
  Parsing or mutation validation stops at the first exceeded bound and selects
  exact preservation or rejects the complete mutation rather than allocating
  or committing the remainder.
- The existing 32 MiB document IPC payload ceiling remains a defense-in-depth
  outer bound. CSV does not add streaming filesystem authority, raw renderer
  paths, a worker network capability, or a generic read/write IPC method.
- CSV writes use the existing per-tab save coordinator, immediate best-effort
  `DiskVersion` check, failure-atomic replacement, app-wide `FileKey` registry,
  watcher correlation, async owner/generation checks, and close/quit decisions.
  A save clears only the captured CSV revision it committed; later edits remain
  dirty.
- Clipboard matrices reuse the same bounded CSV parser and serializer with an
  explicit tab delimiter, LF record separators, and no terminal separator
  rather than introducing a second quoting codec. Paste adds only
  clipboard-specific expansion and editable-bound policy.
- CSV Find reuses `findTextMatches` from the existing search module for each
  field. CSV-specific search state contains only row-major grid coordinates,
  current-result ownership, and presentation state.
- Grid rendering uses fixed 32px rows and 180px columns and is windowed in both
  axes so DOM size follows the viewport, not the document. Display cells are
  single-line and clipped, with embedded newlines represented visibly as `↵`.
  Editing uses a size-capped scrollable textarea layered over the active cell
  without changing grid geometry. `aria-rowcount` and `aria-colcount` describe
  only CSV records and fields; synthetic row numbers and column letters are
  presentational and excluded. Header mode off exposes every data cell as
  `gridcell`; header mode on exposes editable first-record cells as
  `columnheader`. Virtualization always mounts the active or editing cell.
  Very long display cells announce coordinates and a bounded preview; edit mode
  exposes the complete value.
- Performance timing remains on the existing non-blocking CI performance path.
  Deterministic safety limits, DOM bounds, transaction counts, and stale-result
  rules remain blocking.
- Implementation must add an accepted CSV ADR before production CSV code is
  accepted. It records the bounded parser and dialect detector, semantic model
  and canonical serializer, ProseMirror ownership, windowed accessible-grid
  strategy, clipboard reuse, header view state, and reuse of the shared
  persistence transaction. ADR 0001 is updated for the closed `new-csv` command
  and document-kind boundary, and ADR 0004 is updated for per-kind tab/editor
  state; ADRs 0006 and 0008 remain unchanged because workspace identity and
  sidebar-tree windowing still apply as written.

## Behavior (acceptance criteria)

### CSV creation, opening, identity, and document kind

- AC1: Given the native File menu, then it contains **New CSV** immediately
  after New File, has no global accelerator, and dispatches a closed
  `new-csv` command without changing New File or the tab-bar `+` button.
- AC2: Given a focused Markzen window, when New CSV is invoked, then one
  ordinary pinned untitled CSV tab becomes active before any preview, contains
  one empty editable cell, is initially clean, and has its first-row-header
  toggle on.
- AC3: Given no focused Markzen window, when New CSV is invoked, then one new
  single-file window opens with exactly the clean untitled CSV tab from AC2.
- AC4: Given Open…, when its native chooser renders, then `.csv` is selectable
  alongside `.md`, `.markdown`, and `.txt`, its copy identifies the choices as
  Markzen documents rather than only Markdown, and cancellation changes no tab,
  preview, registry, or active selection.
- AC5: Given a `.csv` path matched case-insensitively from Open… or a workspace
  tree, when activation revalidates it, then it opens as a CSV tab through the
  existing app-wide `FileKey`, preview/pinned, loading, collision, error, and
  stale-generation rules.
- AC6: Given a CSV tab, then its tab label hides the case-insensitive `.csv`
  suffix while its compact title control shows the editable stem followed
  immediately by a separately rendered, non-editable `.csv` suffix; the input's
  accessible name identifies the fixed extension, the complete filename remains
  available to assistive technology, and the same workspace-relative secondary
  path appears as for another recognized document.
- AC7: Given a path-backed CSV title edit, then `.csv` is its managed extension:
  a case-insensitive explicit `.csv` suffix appears exactly once, a title
  without it preserves the existing suffix, and another suffix is treated as
  part of the stem rather than converting document kind.
- AC8: Given a new CSV tab is saved or any CSV tab uses Save As, then the native
  chooser defaults to a `.csv` filename, filters for CSV, and cannot convert the
  live tab to Markdown, JSON, or another document kind.
- AC9: Given a Markdown tab or CSV tab, when New File, New CSV, Open…, tree
  preview, Save, Save As, rename, duplicate-open focus, tab switching, or close
  runs, then its document kind remains attached only to that tab and stale work
  cannot parse or render bytes through the other kind.
- AC10: Given a preview CSV tab, when its first cell, row, column, or clipboard
  mutation begins, then it pins synchronously before the mutation; selection,
  scrolling, searching, or changing the header-row toggle does not pin it.

### Bounded parsing and deterministic delimiter detection

- AC11: Given valid UTF-8 CSV with or without one UTF-8 BOM, when it opens
  within the editable limits, then every decoded Unicode scalar, space, empty
  field, quote escape, delimiter, embedded CR/LF, record boundary, and terminal
  record-separator state contributes exactly once to the parsed result or its
  document-level dialect metadata.
- AC12: Given delimiter detection, then a quote-aware scan examines at most the
  first 20 logical records and counts unquoted comma, semicolon, and tab
  separators for each record; the candidate present in the greatest number of
  sampled records wins, total unquoted occurrences breaks that tie, and fixed
  precedence comma, semicolon, then tab breaks the final tie.
- AC13: Given no sampled record contains an unquoted comma, semicolon, or tab,
  then the file is a one-column CSV using comma as its document delimiter.
- AC14: Given representative comma-, semicolon-, and tab-delimited fixtures
  containing quoted delimiters and embedded newlines, when detection and parse
  complete, then the intended delimiter wins under AC12, quoted content remains
  one field, and the selected delimiter is retained as document metadata.
- AC15: Given the selected delimiter, when the complete file is parsed, then
  RFC-style double-quoted fields, doubled quote escapes, unquoted literal
  spaces, empty leading/interior/trailing fields, LF, CRLF, and bare CR record
  separators, an optional final record separator, and embedded CR or LF inside
  quoted fields produce the independently authored semantic matrix.
- AC16: Given an empty CSV file, when it opens, then it becomes the clean
  one-empty-cell grid from AC2 while retaining empty bytes as its baseline.
- AC17: Given invalid UTF-8, an unclosed quoted field, a quote in an invalid
  unquoted position, characters after a closing quote before the delimiter or
  record boundary, or records with unequal field counts, when parsing runs,
  then no partial matrix is exposed and the tab enters exact read-only
  preservation with an explanation identifying malformed or ragged CSV.
- AC18: Given input crosses any byte, record, per-record field, total-field, or
  per-field text bound, when the bounded parser observes the crossing, then it
  stops without allocating the remainder of the semantic model and the tab
  enters exact read-only preservation with an explanation identifying the
  exceeded limit.
- AC19: Given preservation from AC17 or AC18, then Save performs no write,
  rename-only preserves the original bytes, Save As copies the exact original
  bytes, and ordinary conflict, close, and ownership behavior remains intact.
- AC20: Given independently authored CSV fixtures, when the production parser
  reads each valid source, then its matrix, delimiter, BOM, record-separator
  convention, embedded field newlines, and terminal-separator state equal an
  independently authored expected model not generated by the parser.

### Serialization integrity

- AC21: Given an unchanged CSV tab without a pending rename, when Save is
  invoked, then no disk write or canonical reserialization occurs.
- AC22: Given a rename-only CSV save, when it succeeds, then the filesystem
  entry moves without rewriting bytes and the tab adopts the renamed identity.
- AC23: Given an edited CSV document, when serialized, then it uses the
  detected comma, semicolon, or tab delimiter; retains the source BOM, dominant
  LF, CRLF, or bare CR record-separator convention, and source presence or
  absence of a final record separator. Every convention is counted across
  record boundaries and the first encountered breaks a tie. A one-record source
  without a separator has one row and defaults future edited serialization to
  LF. A new CSV uses UTF-8 without BOM, LF, and no final record separator.
- AC24: Given a field that contains the selected delimiter, `"`, CR, or LF,
  when serialized, then the field is double-quoted and each literal `"` is
  doubled; every other field is emitted unquoted with leading and trailing
  spaces preserved.
- AC25: Given embedded CR, LF, or CRLF text inside a field, when serialized,
  then those field characters remain unchanged even when the document's record
  separator uses another convention.
- AC26: Given an unchanged valid CSV uses Save As, then the target receives the
  exact original bytes. Given the first content edit has occurred and the
  production serializer writes the semantic matrix, then its bytes equal an
  independently authored canonical golden; reparsing that golden produces the
  same matrix and dialect metadata except for intentionally canonical field
  quoting.
- AC27: Given formula-looking, HTML-looking, URL-looking, control-like, Unicode,
  emoji, very long, empty, or whitespace-only field text within the bounds,
  when the codec parses, serializes, and reparses it, then it remains the same
  literal string and never changes type.
- AC28: Given serialization, clipboard preparation, or dirty-state comparison,
  then the header-row toggle, grid selection, search decorations, scroll
  position, synthetic row numbers, synthetic column labels, and virtualized DOM
  state never enter the CSV bytes or semantic matrix.

### Spreadsheet-like grid presentation and navigation

- AC29: Given an editable CSV tab, then it renders one named interactive data
  grid edge-to-edge across the document surface and through its remaining
  height, with synthetic row numbers, visible light cell boundaries,
  independently scrollable rows and columns, the document's complete logical
  row/column counts, and one active cell without rendering a Markdown writing
  toolbar, Markdown table actions, link actions, or image actions.
- AC30: Given the first-row-header toggle is on and the CSV has at least one
  record, then the first record remains ordinary editable CSV data but replaces
  the synthetic A/B/C column-label strip as sticky, visually distinguished
  editable `columnheader` cells and supplies accessible column names. Given the
  toggle is off, the bordered A/B/C strip is sticky and the first record is
  ordinary scrollable `gridcell` content beneath it. In both modes the fixed
  row-number gutter and top strip use the darker document background and do not
  visibly trail or animate after either scroll axis moves.
- AC31: Given the header-row toggle, when pointer, Enter, or Space changes it,
  then its pressed state and resulting header semantics update immediately for
  only that tab without changing content, revision, dirty state, preview state,
  undo history, selection, or serialized bytes.
- AC32: Given a CSV tab is switched away from and back to, then its header
  toggle, active cell, rectangular selection, undo history, and scroll position
  are restored in grid navigation mode; any live cell draft commits exactly
  once before the switch. Reopening the file in a later application session
  starts with the header toggle on.
- AC33: Given grid navigation mode, then Arrow keys move one cell without
  wrapping, Home/End move to the first/last cell in the row, Cmd/Ctrl+Home and
  Cmd/Ctrl+End move to the first/last cell in the matrix, and Page Up/Page Down
  move by one visible page while retaining the column where possible.
- AC34: Given grid navigation mode, when Tab or Shift+Tab is pressed, then
  focus moves to the next or previous cell in row-major order, wrapping between
  rows but leaving the grid normally after the final or before the first cell.
- AC35: Given a cell receives primary pointer-down, is focused through grid
  navigation, or is selected as the current search result, then it becomes the
  sole active cell and grid tab stop immediately, scrolls into view without
  forced smooth motion under reduced motion, and announces its row, column,
  optional header name, and a bounded literal-value preview. Pointer movement
  before release cannot leave a different cell looking focused or selected.
- AC36: Given the active cell, when Enter, F2, double-click, or a printable key
  outside IME composition begins editing, then a plainly labeled, size-capped,
  scrollable textarea visibly overflows and owns the mounted cell without
  changing the 32px-by-180px grid geometry; it exposes the complete literal
  value, a printable key replaces the prior value with that character and
  places the caret after it so subsequent characters append, and Enter, F2, or
  double-click preserves the value and caret placement.
- AC37: Given cell edit mode, then ordinary text-editing and IME behavior,
  selection, clipboard, Home/End, and Arrow keys operate inside the field;
  Alt/Option+Enter inserts a literal LF, Escape cancels that edit, Enter commits
  and returns to grid navigation, and Tab/Shift+Tab commits before moving under
  AC34. Pointer-down, click, double-click, and drag inside the textarea remain
  text-editing interactions and do not bubble into grid selection or commit.
  Clicking another cell, invoking a CSV toolbar or Find action, focusing the
  title, switching tabs, saving, or closing commits the live draft exactly once
  before that action; Escape is the only cancellation path.
- AC38: Given an edit whose submitted string equals its pre-edit string, when it
  commits, then no document transaction, revision, dirty state, preview
  promotion, or undo entry is created.
- AC39: Given the grid at 480×320, 200% zoom, forced colors, reduced motion, or
  a long-field/large-column fixture, then a 40px single-line CSV header keeps
  the compact filename control at the left and all CSV actions at the right,
  while title, actions, fixed headers, active cell, selection, grid, both scroll
  axes, errors, and document controls remain reachable and distinguishable
  without color or animation alone. Rows remain 32px, columns remain 180px,
  display text is one clipped non-selectable line, embedded newlines display as
  `↵`, and edit-mode text remains selectable.

### Range selection, clipboard, and structural editing

- AC40: Given an active cell in navigation mode, when Shift+Arrow extends the
  selection or Shift+pointer-down chooses another corner, then one rectangular
  selection grows from its stable anchor, its active corner remains visible,
  and selection state is conveyed without color alone and through accurate
  `aria-selected` state for mounted cells; ordinary primary pointer-down starts
  a new single-cell anchor even if the pointer moves before release,
  Cmd/Ctrl+A selects the complete matrix, and Select All in cell edit mode
  remains ordinary text selection.
- AC41: Given a selected range, when Cmd/Ctrl+C is invoked, then one
  spreadsheet-compatible tab-delimited rectangular `text/plain` matrix is
  written in row-major order using double-quote escaping for tab, quote, CR, or
  LF inside a field, LF between records, and no terminal record separator;
  content and dirty state do not change.
- AC42: Given a selected range, when Cmd/Ctrl+X is invoked and clipboard
  writing succeeds, then AC41's matrix is written and every selected field is
  cleared in one undoable transaction; clipboard failure leaves every field
  unchanged and exposes a non-blocking accessible error. Delete or Backspace in
  grid navigation performs the same one-transaction clear without writing the
  clipboard.
- AC43: Given tab-delimited clipboard text containing quoted delimiters,
  doubled quotes, embedded newlines, empty fields, or one literal value, when
  Cmd/Ctrl+V is invoked on an active cell or range, then it parses one bounded
  rectangular matrix and replaces cells from the selection's top-left corner
  in one undoable transaction without repeating values to fill a larger
  selection.
- AC44: Given pasted rows or columns exceed the current matrix, then the matrix
  expands with empty fields only as needed to contain the pasted rectangle;
  cells outside that rectangle retain their values.
- AC45: Given clipboard text is malformed, ragged, unavailable, or would cross
  an editable CSV bound, when paste is attempted, then no field, row, column,
  selection, revision, or undo state changes and a non-blocking accessible
  explanation identifies the rejection.
- AC46: Given the CSV toolbar and an active cell, then named keyboard-operable
  icon actions insert a row above or below and a column before or after; each
  exposes its accessible name as a tooltip on hover and keyboard focus, and one
  action adds exactly one empty record or empty field across records in one
  undoable transaction and focuses the corresponding new cell.
- AC47: Given the CSV toolbar and an active cell, then named keyboard-operable
  icon actions delete its row or column in one undoable transaction, expose the
  same hover and focus tooltip contract as AC46, and deleting the sole row or
  sole column leaves one empty cell instead of producing an unrenderable
  zero-dimensional matrix.
- AC48: Given any cell, paste, cut, row, or column mutation would cross an
  editable bound, then the complete transaction is rejected before mutation,
  focus and selection remain current, and an accessible message explains the
  limit.
- AC49: Given cell, range, row, or column mutations and undo/redo, then each
  command is one ProseMirror history event, dirty state is semantic matrix
  equality against the committed baseline, and returning exactly to the
  baseline makes the content dimension clean.
### Find in CSV

- AC50: Given an editable CSV tab, when Cmd/Ctrl+F or Edit → Find is invoked,
  then the existing non-modal Find panel opens and searches literal field text
  in row-major cell order without searching synthetic headers or row numbers.
- AC51: Given a non-empty query, then each field is passed to the existing
  `findTextMatches` helper so matching retains spec 0004's NFC plus
  locale-independent lowercase conversion, deterministic non-overlap, and
  source offsets without matching across a cell or record boundary.
- AC52: Given search results, then the panel reports current and total results;
  Next/Enter and Previous/Shift+Enter wrap in row-major order, make the result's
  cell active, highlight the exact text without changing content, and scroll
  both axes only as needed.
- AC53: Given CSV content changes while Find is open, then a generation-scoped
  rescan preserves the mapped current result where possible and a stale scan
  cannot replace newer query, matrix, selection, or result state.
- AC54: Given Find closes, a tab switches, the CSV becomes preservation-only,
  or its owner disposes, then decorations and pending scans are removed, the
  prior live grid selection is restored where possible, and no query or result
  leaks to another tab.
- AC55: Given search before, during, or after serialization, then search state
  never changes semantic matrix equality, preview status, undo history, dirty
  state, clipboard output, or CSV bytes.

### Shared lifecycle, concurrency, security, and verification

- AC56: Given an editable CSV transaction, then the owning tab's revision and
  dirty state advance synchronously; active IME composition commits exactly
  once before cell navigation, tab switching, Save, or close captures the
  revision.
- AC57: Given a CSV Save, Save As, rename, Save All, close-triggered save, or
  quit-triggered save, then the existing shared coordinator and failure-atomic
  outcomes apply to its captured serialized bytes exactly as they do to a
  Markdown document, including coalescing, ordered follow-up saves, conflicts,
  missing files, collisions, cancellation, cleanup warning, and later edits
  remaining dirty.
- AC58: Given a clean CSV file changes externally, then a fresh bounded parse
  replaces the matrix and dialect metadata, resets history and selection
  deterministically, retains tab kind and identity, and announces reload; a
  malformed, ragged, or over-limit replacement enters exact preservation
  without discarding the new disk bytes.
- AC59: Given a dirty CSV file changes externally, then its matrix is not
  replaced and the existing Overwrite Disk, Reload from Disk, and Save Editor
  As… conflict choices operate on the captured CSV bytes and newest
  `DiskVersion`.
- AC60: Given overlapping load, parse, delimiter detection, search, clipboard,
  save, watcher, preview, tab-switch, or close work, then the pure completion
  policy accepts a result only when its tab owner, document kind, operation
  generation, and captured revision remain current.
- AC61: Given CSV field text containing HTML, Markdown, URLs, image syntax,
  formulas, control-like labels, or bidirectional Unicode, when it renders,
  then it is inserted only as text and creates no executable DOM, rich-editor
  node, link action, image capability, navigation, popup, filesystem access, or
  network request.
- AC62: Given the expanded renderer/preload boundary, then static contracts
  expose New CSV and CSV document intents through closed enums and typed payloads
  without raw Electron, filesystem, arbitrary IPC, or generic path authority.
- AC63: Given Undo, Redo, Cut, Copy, Paste, Select All, Find, Save, Save As,
  Save All, Close Tab, or Close Window and a CSV grid/editor has relevant
  focus, then native menu enablement and routing reflect that CSV operation
  without acting on an inactive tab, Markdown editor, title field, or another
  window.
- AC64: Given the CSV grid uses windowing, then no more than 600 data
  `gridcell`/`columnheader` elements are mounted at once; `aria-rowcount`,
  `aria-colcount`, `aria-rowindex`, and `aria-colindex` describe only the
  complete CSV matrix, presentational chrome does not affect those values,
  AC30's roles remain accurate, and roving focus remains singular across
  virtualization. The active or editing cell remains mounted.
- AC65: Given a controlled 100,000-field fixture within all editable bounds,
  when CI opens it, scrolls both axes, searches at least 5,000 matches, edits
  one field, pastes a 100×10 matrix, and undo/redoes that paste, then open,
  input-to-paint, search-settle, paste, and undo/redo times plus observed long
  tasks are recorded in the human-readable job summary and machine-readable
  performance artifact without timing values gating the build.
- AC66: Given CSV parser, serializer, clipboard, and limit tests, then fixtures
  include comma/semicolon/tab dialects, ambiguous precedence, BOM/no-BOM,
  LF/CRLF, terminal/no-terminal separator, quotes, embedded newlines, spaces,
  empty fields, Unicode, formula-looking text, invalid UTF-8, malformed quotes,
  ragged records, and every exact limit boundary; expected models and goldens
  are independently authored and never refreshed from production output.
- AC67: Given automated CSV tests at any layer, then they use MemoryPlatform,
  repository fixtures, synthetic clipboard adapters, injected generations, and
  local bytes only; no test reads or changes a developer's documents or invokes
  a public service.
- AC68: Given CSV UI at minimum size, 200% zoom, forced colors, reduced motion,
  keyboard-only operation, or assistive-technology inspection, then every
  pointer action has its specified keyboard path, focus remains visible,
  names/roles/counts/indexes/selected/pressed/busy/error states are accurate,
  icon tooltips appear on hover and focus without required motion, grid display
  text cannot create a browser text selection while textarea text can, state is
  not color-only, and automated checks report no serious or critical
  violations.
- AC69: Given a source above the existing 32 MiB outer document-transfer bound,
  then main fails before renderer transfer with an accessible error and retains
  no tab ownership.
- AC70: Given preservation from AC17 or AC18 is displayed, then Find and every
  CSV mutation control are unavailable and the accessible explanation identifies
  malformed, ragged, or exceeded-limit preservation as applicable.
- AC71: Given the literal field families from AC27, when rendered, copied,
  edited, saved, and reopened through the CSV UI, then each remains literal text
  and never executes, navigates, fetches, gains rich marks, or creates an image
  or filesystem capability.
- AC72: Given a stale completion from AC60 resolves during real grid focus,
  selection, search, preview, tab-switch, or close interaction, then it cannot
  change another kind, tab, path, matrix, selection, header state, or active
  focus.
- AC73: Given a CSV intent reaches main, then the exact application sender is
  validated before its closed payload, authority is derived from the registered
  window and tab, and renderer-supplied kind, delimiter, title, matrix, FileKey,
  path, or generation cannot grant filesystem authority or target another owner.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1 | Shell smoke | Browser Mode closed-command assertion |
| AC2 | Browser Mode | Playwright-vs-vite focused-window journey |
| AC3–AC4 | Shell smoke | Browser Mode initial-state and cancellation assertions |
| AC5 | Playwright-vs-vite | Shell smoke real `.csv` open |
| AC6–AC7 | Browser Mode | Playwright-vs-vite rename journey |
| AC8 | Shell smoke | Browser Mode default-name policy |
| AC9–AC10 | Browser Mode | Playwright-vs-vite workspace preview/save journey |
| AC11–AC20 | Node | Playwright-vs-vite representative dialects and preservation |
| AC21–AC28 | Node | AC27 Browser Mode literal interaction; shell newline/BOM, exact-copy Save As, and rename-only round trip |
| AC29–AC39 | Browser Mode | Playwright-vs-vite large-grid keyboard journey |
| AC40–AC49 | Browser Mode | Playwright-vs-vite clipboard and range-selection journey |
| AC50–AC55 | Browser Mode | Playwright-vs-vite Find/tab-switch journey |
| AC56 | Browser Mode | Playwright-vs-vite save/close IME journey |
| AC57–AC59 | Playwright-vs-vite | Shell smoke save, watcher, and conflict round trip |
| AC60 | Node | Playwright-vs-vite stale-load and stale-search journey |
| AC61 | Browser Mode | Shell smoke CSP/navigation negative |
| AC62 | Static | Shell smoke preload-surface assertion |
| AC63 | Shell smoke | Browser Mode command eligibility |
| AC64 | Browser Mode | Playwright-vs-vite two-axis virtualization journey |
| AC65 | CI | — |
| AC66 | Node | — |
| AC67 | Static | Node transport/harness guards |
| AC68 | Browser Mode | Automated accessibility scan; Playwright minimum-size/zoom journey |
| AC69 | Shell smoke | Node byte-budget boundary |
| AC70–AC71 | Browser Mode | Playwright-vs-vite preservation and literal-data journeys |
| AC72 | Playwright-vs-vite | Node completion-policy coverage |
| AC73 | Node | Shell forged/stale/kind-mismatch negatives |

Supporting shell coverage also inspects the packaged Open/Save filters, closed
preload surface, real filesystem bytes, renderer CSP, native menu routing, and
one real watcher lifecycle. `npm run verify` remains the blocking aggregate;
AC65 runs in the existing non-blocking performance project.

## Open questions

- (none)
