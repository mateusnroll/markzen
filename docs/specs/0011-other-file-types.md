# Spec 0011: Other File Types

**Status:** Draft   **Date:** 2026-07
**Origin:** Promotes the second ordered item from `BACKLOG.md`. The selected
editable set emphasizes source, configuration, build, and log files commonly
created or inspected while collaborating with an AI coding agent. The 2026-07
product decision limits view-only media to the raster formats already secured
by spec 0005, defers WebM and all other media, and requires every otherwise
visible unsupported regular file to open a useful handoff tab rather than stay
disabled in the workspace tree. The independent simplicity review reused the
existing minimal ProseMirror text primitives, removed custom raster zoom state
and activation-only token churn, and replaced executable-file heuristics with
one consistent native confirmation for every default-app handoff.

## Problem

Markzen's workspace tree currently disables everything except Markdown-like
documents, so users cannot inspect or make small edits to the code,
configuration, logs, and generated files surrounding their notes. Other local
files also need a safe, useful outcome: supported raster images should preview,
while an unknown format should explain the limitation and offer an explicit
handoff to the operating system instead of doing nothing.

## Non-goals

- Language servers, project indexing, completion, diagnostics, refactoring,
  debugging, execution, terminals, tasks, test runners, Git integration, code
  navigation, minimaps, multi-cursor editing, snippets, or IDE workspaces.
- Format-specific semantic editors for programming languages, configuration
  formats, logs, XML, YAML, TOML, SQL, GraphQL, or build files.
- Treating Markdown, CSV, or strict `.json` as generic text; their first-class
  document kinds remain owned by specs 0002, 0009, and 0010.
- JSONC validation or structured editing. `.jsonc` is literal generic text even
  when its contents happen to be strict JSON.
- Creating an untitled generic-text document or adding a New Text/Code command.
- Changing a live generic-text tab's managed extension or converting one
  document kind into another through title editing or Save As.
- Editing, annotating, cropping, rotating, resizing, converting, exporting, or
  color-correcting raster images.
- WebM, MP4, audio, PDF, SVG, office documents, archives, fonts, 3D formats, or
  any additional embedded media preview.
- Hex editing, binary decoding, archive browsing, executable inspection, or
  guessing an editable language from file contents.
- Rendering HTML/XML/SVG, evaluating code or configuration, resolving imports,
  fetching referenced resources, or executing any file opened by Markzen.
- Changing spec 0003's hidden-entry policy or adding ignored-folder patterns.
  This spec changes the behavior of regular-file rows that the existing tree
  already makes visible.

## Constraints and shared invariants

- Implementation requires specs 0009 and 0010 to be Implemented. It extends
  their closed per-tab kind union directly with `text`, `raster`, and
  `external`; it does not add a plugin registry, provider API, dynamic grammar
  loader, or user-configurable extension map.
- Markdown (`.md`, `.markdown`), CSV (`.csv`), and strict JSON (`.json`)
  classification takes precedence over this spec. A visible regular file is
  otherwise classified case-insensitively by the closed tables below after
  current identity, file kind, and root containment are revalidated.
- Editable generic text uses this closed set:

| Family | Extensions or basenames | Syntax selection |
|---|---|---|
| Plain text and logs | `.txt`, `.text`, `.log`; `LICENSE`, `NOTICE`, `AUTHORS` | Plain text |
| JavaScript and TypeScript | `.js`, `.mjs`, `.cjs`, `.jsx`, `.ts`, `.mts`, `.cts`, `.tsx` | JavaScript, JSX, TypeScript, or TSX by exact suffix |
| Web components and styles | `.html`, `.htm`, `.css`, `.scss`, `.sass`, `.less`, `.vue`, `.svelte`, `.astro` | Exact web language by suffix |
| Python and shells | `.py`, `.pyi`, `.sh`, `.bash`, `.zsh`, `.fish` | Python or exact shell family |
| Systems and application languages | `.c`, `.h`, `.cc`, `.cpp`, `.cxx`, `.hpp`, `.hxx`, `.cs`, `.java`, `.kt`, `.kts`, `.go`, `.rs`, `.swift` | Exact language family by suffix |
| Scripting languages | `.rb`, `.php`, `.lua`, `.pl`, `.pm`, `.r`, `.scala` | Exact language by suffix |
| Data, config, and queries | `.xml`, `.yaml`, `.yml`, `.toml`, `.ini`, `.cfg`, `.conf`, `.jsonc`, `.sql`, `.graphql`, `.gql`, `.proto`, `.properties` | XML, YAML, TOML, INI, JSON-with-comments, SQL, GraphQL, Protocol Buffers, or Java properties by suffix |
| Build and infrastructure | `.cmake`, `.gradle`, `.tf`, `.tfvars`, `.hcl`, `.nix`; `Dockerfile`, `Dockerfile.*`, `Makefile`, `GNUmakefile`, `CMakeLists.txt` | CMake, Gradle, HCL/Terraform, Nix, Dockerfile, or Makefile as applicable |
| Technical documents | `.rst`, `.adoc`, `.tex` | reStructuredText, AsciiDoc, or TeX |
| Common explicit dotfiles | `.env`, `.env.*`, `.gitignore`, `.gitattributes`, `.editorconfig`, `.npmrc`, `.nvmrc`, `.prettierrc`, `.prettierignore`, `.eslintrc`, `.eslintignore` | Shell/config/plain syntax by exact basename |

  Exact-basename rules apply only to the final path component. Specialized
  document suffixes win before basename rules, so `README.md` remains Markdown
  and `CMakeLists.txt` is generic CMake text by explicit exception.
- Raster preview is limited to `.png`, `.jpg`, `.jpeg`, `.gif`, and `.webp`.
  It reuses spec 0005/ADR 0009's signature/MIME agreement, 25 MiB encoded-byte,
  canvas, dimension, frame, and aggregate-frame bounds and its image-only
  exact-resource bearer. The opened raster's main-owned tab/FileKey
  registration authorizes only that exact file.
- Every other visible regular file opens as `external`. Main does not read or
  transfer its contents merely to render the tab. The tab contains a limitation
  message and an explicit **Open in Default App** action.
- Every default-app handoff uses one native confirmation before the
  operating-system handler runs. Markzen does not guess whether an unsupported
  file is executable from suffixes or platform metadata.
- Generic text is UTF-8 with an optional UTF-8 BOM. Editable input is at most
  10 MiB after the BOM, 200,000 logical lines, and 1 MiB of decoded text in one
  line. Invalid UTF-8 or an exceeded editable bound at or below the existing
  32 MiB transfer ceiling enters exact read-only preservation with a warning
  and default-app handoff. A larger source opens directly as `external` without
  transferring bytes to the renderer.
- Generic text content lives in one per-tab ProseMirror state using the
  existing minimal Document, Text, and CodeBlock primitives as one literal text
  surface with embedded newlines. Line numbers, search matches, and syntax
  tokens are transient decorations; React state and the syntax highlighter
  never own persistent text. The serializer never runs per keystroke,
  selection, decoration, or scroll.
- Unchanged and rename-only text retains exact bytes. After the first content
  edit, serialization retains BOM presence, dominant LF or CRLF convention,
  final-newline presence, all literal Unicode, tabs, spaces, and trailing
  whitespace. A newly inserted line break uses the retained dominant
  convention. Mixed original newline spellings canonicalize to the dominant
  convention only after a content edit.
- Generic-text writes reuse the shared save transaction, registry, watcher,
  conflict, close, quit, revision, IME, and async ownership rules. Raster and
  external tabs are never content-dirty, expose no editable title, and disable
  Save/Save As; file management remains outside this spec.
- Find in generic text reuses the existing search matcher and panel. Syntax
  selection is based only on the closed classification, never on content,
  shebang execution, model inference, filename supplied by document text, or a
  network-loaded grammar.
- A syntax-highlighting implementation may add one focused, locally bundled
  parsing/highlighting dependency chosen in the required ADR. It must bundle
  the non-plain syntax selections named in the table and no dynamic grammar
  source, perform no network access or code execution, and keep highlight state
  generation-scoped and non-persistent.
- Before production code is accepted, add an accepted ADR covering the closed
  kind/extension classifier, literal ProseMirror text model, encoding and
  newline policy, highlighting boundary, raster-tab bearer reuse, and owned
  default-app handoff. Update ADR 0001 for the closed handoff intent, ADR 0004
  for generic-text state, and ADR 0009 for an opened raster authorizing its own
  exact `FileKey`. When this spec is approved, narrow spec 0002's Open/filter
  and managed-extension assumptions plus spec 0003 AC29–AC30 so all visible
  regular files route through this spec instead of remaining disabled.

## Behavior (acceptance criteria)

### Classification, opening, identity, and sidebar behavior

- AC1: Given a workspace snapshot after this spec is implemented, then every
  visible regular-file or file-symlink row is enabled regardless of extension,
  while directories, terminal directory symlinks, hidden entries, sorting,
  windowing, root containment, and watcher behavior remain governed by
  spec 0003.
- AC2: Given a visible file matched by a specialized Markdown, CSV, or strict
  JSON suffix, when activated, then it opens through that specialized
  document kind and never through generic text, raster, or external fallback.
- AC3: Given a path matching one editable table entry case-insensitively, when
  activated from Open… or a workspace, then its exact extension or basename
  selects one generic-text syntax identity and it opens through existing
  app-wide `FileKey`, preview/pinned, collision, error, and generation rules.
- AC4: Given `.jsonc`, `.env*`, config, query, or build input whose contents
  resemble JSON, Markdown, HTML, shell, or another format, when classified,
  then only the closed path rule selects its generic syntax and no content
  sniffing changes document kind.
- AC5: Given `.png`, `.jpg`, `.jpeg`, `.gif`, or `.webp` matched
  case-insensitively, when activated, then it opens as a raster tab pending
  main-owned validation rather than as generic text or a Markdown image node.
- AC6: Given any other visible regular file, when single-clicked, Enter/Space
  activated, or opened through Open…, then one preview-capable external tab
  opens with that file's identity and limitation message instead of leaving a
  disabled row or attempting to decode its contents.
- AC7: Given Open…, when its native chooser renders, then it offers Markzen's
  specialized, editable-text, and raster groups plus **All Files**; selecting
  an unsupported regular file follows AC6, and cancellation changes no tab,
  preview, registry, or active selection.
- AC8: Given an activated path, when main revalidation reports a directory,
  out-of-root target, changed FileKey, missing file, or unreadable source, then
  no stale classification grants authority; the existing retry/error and
  registry rules apply without opening another file's bytes.
- AC9: Given two entries or windows identify the same generic, raster, or
  external `FileKey`, when activated concurrently, then exactly one live
  path-backed tab owns it application-wide and losing requests focus that owner.
- AC10: Given a generic-text tab, then its tab label and editable title hide
  its exact matched suffix where one exists, retain the complete accessible
  filename, and show existing workspace-relative secondary-path context;
  basename-only matches show their complete basename as the title.
- AC11: Given suffix-classified generic text, when rename or Save As runs, then
  its opening suffix is managed and retained, another typed suffix becomes part
  of the stem, and the chooser filters to that exact type; given a
  basename-classified file, its complete basename is the editable filename and
  its captured syntax identity remains attached after rename or Save As.
  Neither path converts the live tab's language or document kind.
- AC12: Given raster or external fallback, then the complete filename remains
  visible and accessible, its title is not editable, Save and Save As are
  disabled, and viewing or default-app handoff never pins or dirties a preview.
- AC13: Given File → New File, New CSV, New JSON, or the tab-bar `+`, when
  invoked, then it retains its previously approved specialized behavior and no
  untitled generic-text, raster, or external tab is created.
- AC14: Given mixed document kinds, when open, preview replacement, activation,
  Save, watcher reload, handoff, tab switch, or close completes, then kind and
  syntax identity remain owned by their captured tab and stale work cannot
  parse, highlight, render, save, or open another tab's file.
- AC15: Given a preview generic-text tab, when its first persistent text
  transaction begins, then it pins synchronously before mutation; caret
  movement, selection, scrolling, search, and syntax highlighting do not pin it.

### UTF-8 decoding, literal text, and serialization

- AC16: Given valid UTF-8 generic text with or without one UTF-8 BOM and within
  every editable bound, when it opens, then every Unicode scalar, empty line,
  tab, space, trailing space, line boundary, and terminal-newline state enters
  exactly once into the literal text model or encoding metadata.
- AC17: Given CRLF, LF, or mixed-newline source, when decoded, then each logical
  line has the expected literal text, the dominant convention is the more
  frequent sequence with the first observed sequence breaking a tie, and lone
  CR is preserved as a literal character rather than treated as a line break.
- AC18: Given an empty generic-text file, when opened, then it contains one
  editable empty line, is clean, and retains empty bytes as its baseline.
- AC19: Given invalid UTF-8, when decoding runs, then no replacement character
  is introduced and exact byte preservation shows a prominent encoding warning
  plus **Open in Default App**; content editing, Find, and highlighting are
  unavailable.
- AC20: Given source crosses the editable byte, line-count, or per-line bound
  while remaining at or below 32 MiB, when bounded decoding observes it, then
  it stops building the editable model and exact preservation shows the
  exceeded limit plus **Open in Default App** without exposing partial editing.
- AC21: Given a recognized generic-text source above 32 MiB, when main stats it,
  then it opens as external fallback before document-byte transfer and explains
  that the file is too large for Markzen rather than failing silently.
- AC22: Given preservation from AC19 or AC20, then Save without a pending
  rename performs no write, exact-byte Save As remains available under the
  existing preservation contract, default-app handoff follows AC50–AC55, and
  close/conflict/ownership behavior remains intact.
- AC23: Given an unchanged editable text tab without a pending rename, when
  Save is invoked, then no disk write, syntax pass, or canonical
  reserialization occurs.
- AC24: Given a rename-only generic-text save, when it succeeds, then the
  filesystem entry moves without rewriting bytes and the tab adopts the renamed
  identity and unchanged syntax selection.
- AC25: Given edited generic text, when serialized, then it emits UTF-8 with
  retained BOM, dominant newline, and terminal-newline state while preserving
  every literal non-newline scalar, tab, space, trailing space, and empty line;
  syntax tokens and editor/view state never enter bytes.
- AC26: Given independently authored generic-text source, expected line model,
  and golden bytes for each encoding/newline case, when production
  decode/serialize/reparse runs, then the results match those independent
  fixtures and no fixture is refreshed from production output.

### Generic text editing, syntax highlighting, and Find

- AC27: Given editable generic text, then it renders one named multiline
  ProseMirror text editor using the existing minimal literal code-text
  primitives, a monospaced font, visible caret/selection, line-number
  decorations excluded from content and clipboard, and no Markdown formatting,
  table, image, CSV, or JSON structural controls.
- AC28: Given ordinary typing, paste, deletion, Enter, undo, or redo, then text
  remains literal: punctuation never creates rich marks, links, headings,
  lists, HTML, images, or input-rule structures, and each user command is one
  ProseMirror history event where the platform edit operation permits.
- AC29: Given a generic-text tab is switched away from and back to, then its
  full undo/redo history, caret, text selection, horizontal/vertical scroll,
  and Find ownership are restored or cleared under existing tab-switch rules.
- AC30: Given active IME composition, when tab switch, Save, or close is
  requested, then composition commits exactly once to its originating text tab
  before the captured revision or ownership changes.
- AC31: Given a closed syntax classification from AC3, then the editor exposes
  the corresponding language name and applies only that bundled grammar;
  plain-text classifications apply no token colors, and an unexpected
  highlighter initialization failure degrades to plain literal text with an
  accessible non-blocking warning without blocking editing.
- AC32: Given syntax highlighting, then tokens are transient non-history
  decorations over unchanged source ranges, semantic meaning is also available
  from the literal text, and token color alone never communicates editor state,
  errors, selection, or search results.
- AC33: Given an edit, language activation, tab switch, or disposal while a
  highlight pass is pending, then only the newest live tab/language/revision
  generation may apply decorations and stale work cannot change content,
  selection, dirty state, another tab, or another language.
- AC34: Given syntactically incomplete or invalid code/configuration, when
  highlighting runs, then it remains fully editable and serializable as literal
  text, exposes no invented diagnostic, and never falls back to another
  language based on content.
- AC35: Given HTML, XML, SVG text, URLs, imports, template expressions, shell
  commands, code, or bidirectional Unicode in the generic editor, when it
  renders or highlights, then it creates no executable DOM, navigation, popup,
  image/media load, import, process, filesystem access, or network request.
- AC36: Given editable generic text, when Cmd/Ctrl+F or Edit → Find is invoked,
  then the existing non-modal Find panel searches literal text in line order
  using `findTextMatches`, without searching line numbers or syntax metadata
  and without matching across a line boundary.
- AC37: Given generic-text search results, then existing query focus,
  current/total status, cyclic Next/Previous, exact highlighting, mapped-current
  behavior after edits, debounce, reduced-motion scrolling, tab-switch cleanup,
  and stale-generation rules from spec 0004 apply.
- AC38: Given search or syntax decoration before, during, or after save, then
  serialized bytes, semantic baseline equality, preview state, revision, undo
  history, and clipboard text are identical to the same document without those
  decorations.
- AC39: Given code/config text with long lines, at 480×320, 200% zoom, forced
  colors, or reduced motion, then title, language label, line numbers, caret,
  selection, search states, errors, and both scroll axes remain reachable and
  distinguishable without color or animation alone; the editor does not
  silently insert soft line breaks into content.

### View-only raster documents

- AC40: Given an opened raster candidate, when main validates it under the
  exact spec 0005/ADR 0009 signature, MIME, byte, dimension, canvas, frame, and
  aggregate-frame limits, then one exact-resource bearer permits Chromium to
  render only that owned file through `markzen-asset:`.
- AC41: Given a valid raster tab, then it presents the image centered on a
  neutral scrollable canvas, identifies the complete filename, format,
  intrinsic width and height, and animated/static state, and exposes a useful
  accessible image name derived from those facts without claiming authored alt
  text.
- AC42: Given a raster preview, then the image scales down proportionally to
  fit the available canvas without upscaling, ordinary window/renderer zoom
  remains available, and Markzen adds no image-specific zoom, pan, or persisted
  view-state subsystem.
- AC43: Given raster viewing, focus, canvas scrolling, renderer zoom, or
  animation playback, then no document revision, dirty state, serialization,
  file write, metadata edit, or preview promotion occurs.
- AC44: Given a raster extension with malformed bytes, MIME/signature mismatch,
  exceeded raster bound, unreadable source, or changed identity, when
  validation runs, then no token or pixels are exposed and the tab becomes the
  external-style limitation view with the validation-safe message and
  **Open in Default App**.
- AC45: Given a clean raster file changes externally while its tab remains
  live, then a fresh owned validation replaces or revokes the current token and
  updates dimensions/pixels only for the current generation; invalid
  replacement follows AC44 and a missing source uses the existing missing-file
  state.
- AC46: Given an altered, expired, revoked, foreign, or stale raster token,
  direct Fetch/navigation, non-image destination, non-GET request, or file that
  no longer matches its FileKey, when requested, then the existing
  non-disclosing asset denial occurs without path, byte, or existence leakage.
- AC47: Given a raster tab closes, is preview-replaced, changes identity,
  receives an external invalidation, explicitly revokes its grant, or its
  window closes, then owned tokens and pending validation are revoked or
  canceled idempotently and a late completion cannot recreate image state;
  ordinary activation changes retain the live tab's existing exact-file grant.
- AC48: Given raster view at minimum size, 200% zoom, forced colors, reduced
  motion, keyboard-only operation, or assistive-technology inspection, then
  filename, format, dimensions, static/animated state, pixels or failure,
  canvas bounds, scroll, and focus remain accurately exposed and
  distinguishable without color alone.

### Unsupported-file handoff

- AC49: Given an external tab or failed/over-limit supported preview, then it
  shows the complete accessible filename, a concise reason Markzen cannot edit
  or preview it, and one named **Open in Default App** button without reading,
  escaping, rendering, or interpreting unsupported content.
- AC50: Given Open in Default App, when activated by pointer, Enter, or Space,
  then one closed application intent resolves the sender-owned live TabId to
  its main-registered current path and FileKey, revalidates them, and shows one
  window-modal native confirmation before any operating-system handler runs.
- AC51: Given the default-app confirmation, then it names the complete path,
  states that the file will leave Markzen and its default application may run
  software, and offers **Open** and **Cancel** without classifying or inspecting
  the file as executable.
- AC52: Given the default-app confirmation is canceled, closed, escaped, or
  becomes stale because its owner/path/generation changed, then no handler runs
  and focus returns to the live originating tab where possible.
- AC53: Given the default-app confirmation is accepted while its originating
  owner/path/FileKey/generation remain current, then main delegates that exact
  path once to the operating system's default handler and cannot target another
  tab or accept a renderer confirmation bypass.
- AC54: Given the default handler reports failure or no association, then
  Markzen remains open on the same tab and exposes a non-blocking accessible
  error without raw shell details, stack, or another file's path.
- AC55: Given a forged path, FileKey, owner, kind, confirmation flag, stale
  TabId, foreign window, duplicate completion, or malformed/oversized payload,
  when handoff is attempted, then sender-first validation rejects it before
  filesystem or shell action and discloses no registered target.

### Shared lifecycle, security, performance, and verification

- AC56: Given generic-text Save, Save As, rename, Save All, close-triggered
  save, or quit-triggered save, then the shared coordinator applies its
  captured literal bytes with existing coalescing, ordered follow-up, conflict,
  cancellation, collision, cleanup-warning, missing-file, and later-edit
  behavior.
- AC57: Given a clean generic-text file changes externally to valid in-bound
  UTF-8, then fresh bounded decoding replaces content and encoding metadata,
  resets history and selection deterministically, retains kind/syntax/identity,
  and announces reload; invalid or over-limit replacement enters AC19/AC20
  preservation.
- AC58: Given a dirty generic-text file changes externally, then editor content
  is not replaced and existing Overwrite Disk, Reload from Disk, and Save
  Editor As… choices operate on captured literal bytes and the newest
  `DiskVersion`.
- AC59: Given overlapping classify, load, decode, highlight, search, raster
  validation, token, handoff, save, watcher, preview, switch, warning, or close
  work, then each completion checks owner, kind, syntax, generation, path,
  FileKey, and captured revision as applicable before commit.
- AC60: Given the expanded renderer/preload boundary, then text/raster/external
  kinds and owned-file handoff use closed schemas plus sender-derived
  window/tab authority; the renderer receives no generic read/write/open-path
  API, Electron shell object, raw raster path URL, syntax loader, process
  capability, or arbitrary event destination.
- AC61: Given native Undo, Redo, Cut, Copy, Paste, Select All, Find, Save,
  Save As, Save All, Close Tab, or Close Window, then menu enablement and
  routing reflect the focused generic editor, native title control,
  preservation state, raster/external view, or inactive tab without applying
  an operation to another kind/window; raster/external views expose only their
  specified view and handoff actions.
- AC62: Given a controlled 10 MiB/200,000-line generic-text fixture and the
  approved grammar families, when CI opens, scrolls, highlights, searches at
  least 5,000 matches, makes 20 edits, and undo/redoes them, then open,
  input-to-paint, highlight-settle, search-settle, scroll, and undo/redo times
  plus observed long tasks are recorded in human- and machine-readable
  artifacts without gating the build.
- AC63: Given classification, decoding, serialization, highlighting, raster,
  and handoff tests, then repository fixtures cover every extension/basename
  family and precedence rule, BOM/no-BOM, LF/CRLF/mixed/final newlines, empty
  and long lines, tabs/trailing spaces, Unicode, invalid UTF-8, exact bounds,
  every raster format and rejection family, unsupported binaries, default-app
  failure, and default-app confirmation policy.
- AC64: Given automated tests at any layer, then they use MemoryPlatform,
  repository fixtures, synthetic highlighter/system-handler adapters, injected
  generations, and isolated shell temporary files only; no test reads or
  changes a developer's documents, executes a fixture, or invokes a public
  service.
- AC65: Given UI introduced by this spec at minimum size, 200% zoom, forced
  colors, reduced motion, keyboard-only operation, or assistive-technology
  inspection, then every pointer action has a keyboard path, focus is visible,
  names/roles/states/errors are accurate, state is not color-only, status
  changes are announced without stealing focus, and automated checks report no
  serious or critical violations.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1–AC6 | Browser Mode | Playwright-vs-vite mixed workspace journey |
| AC7 | Shell smoke | Node dialog-options contract; Browser Mode cancellation |
| AC8–AC9 | Playwright-vs-vite | Shell smoke real alias/open |
| AC10–AC13 | Browser Mode | Shell smoke exact Save As filter |
| AC14–AC15 | Browser Mode | Playwright-vs-vite stale preview journey |
| AC16–AC20 | Node | Playwright-vs-vite decode/preservation presentation |
| AC21 | Shell smoke | Node size-classification policy |
| AC22–AC26 | Node | Shell smoke exact-byte/rename/newline round trip |
| AC27–AC39 | Browser Mode | Playwright-vs-vite code edit/Find journey |
| AC40 | Node | Shell smoke real raster render |
| AC41–AC44 | Browser Mode | Playwright-vs-vite view controls and failure |
| AC45–AC47 | Shell smoke | Node token/generation policy |
| AC48–AC49 | Browser Mode | Automated accessibility scan |
| AC50 | Shell smoke | Node owned-path handoff policy |
| AC51–AC54 | Shell smoke | Node confirmation and stale policy |
| AC55 | Node | Shell smoke forged/bypass negatives |
| AC56–AC58 | Playwright-vs-vite | Shell smoke save, watcher, and conflict round trip |
| AC59 | Node | Playwright-vs-vite stale mixed-kind journey |
| AC60 | Static | Shell smoke preload/CSP/shell-surface assertion |
| AC61 | Shell smoke | Browser Mode command eligibility |
| AC62 | CI | — |
| AC63 | Node | — |
| AC64 | Static | Node transport/harness guards |
| AC65 | Browser Mode | Automated accessibility scan; Playwright minimum-size/zoom journey |

Supporting shell coverage also proves packaged All Files/Open/Save filters,
closed system-handoff authority, real default-handler stubbing, exact
filesystem bytes, raster CSP isolation, native menu routing, and one watcher
lifecycle. `npm run verify` remains the blocking aggregate; AC62 runs in the
existing non-blocking performance project.

## Open questions

- (none)
