# Spec 0011: Other File Types

**Status:** Implemented   **Date:** 2026-08
**Origin:** Promotes the second ordered item from `BACKLOG.md`. The selected editable set emphasizes source, configuration, build, and log files commonly created or inspected while collaborating with an AI coding agent. The 2026-07 product decision limits view-only media to the raster formats already secured by spec 0005, defers WebM and all other media, and requires every otherwise visible unsupported regular file to open a useful handoff tab rather than stay disabled in the workspace tree. The independent simplicity review reused the existing minimal ProseMirror text primitives, removed custom raster zoom state and activation-only token churn, and replaced executable-file heuristics with one consistent native confirmation for every default-app handoff. The first 2026-08 review against the implemented CSV/JSON code returned specs 0002, 0003, and 0009 to Draft, required closed editor-backed and view-only variants, added atomic text mutation limits and exact unchanged Save As, made the terminal newline editable literal content, removed syntax highlighting and line numbers, removed external-file watching, and added main-enforced view-only intent denial. After testing that implementation, the user required every otherwise-unrecognized valid UTF-8 file within the existing editable bounds to open as Plain text, required the generic-text editor to use the same full-panel document layout as CSV and JSON, and selected TipTap CodeBlockLowlight for path-derived highlighting of known languages without content-based auto-detection.

## Problem

Markzen must let users inspect and edit any safely bounded valid UTF-8 file surrounding their notes, even when its extension is not in a known language table. Known code and configuration files should retain literal byte-safe editing while gaining a full-panel document layout and path-derived syntax coloring; raster images should preview, while invalid UTF-8, unsafe media, and oversized content should retain a safe non-lossy handoff outcome.

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
- Hex editing, binary decoding, archive browsing, executable inspection, content-based language detection, shebang detection, or syntax auto-detection.
- Line numbers, code folding, bracket matching, indentation engines, formatter integration, semantic tokens, custom grammar authoring, user-selectable highlight themes, or highlighting languages outside the fixed bundled grammar mapping.
- Rendering HTML/XML/SVG, evaluating code or configuration, resolving imports,
  fetching referenced resources, or executing any file opened by Markzen.
- Changing spec 0003's hidden-entry policy or adding ignored-folder patterns.
  This spec changes the behavior of regular-file rows that the existing tree
  already makes visible.

## Constraints and shared invariants

- Implementation requires this revised spec 0011 to be Approved while specs 0002, 0003, 0009, and 0010 remain Implemented prerequisites. The gateway, seed, live-tab, bootstrap, watcher-event, and IPC payloads retain closed discriminated variants: `markdown`, `csv`, `json`, and `text` are editor-backed and require only their own content payload, while `raster` and `external` are view-only and carry no editor or writable-content payload. `external` never carries probed file bytes, and `raster` carries only validated display metadata plus an opaque exact-resource URL. This remains a direct closed union, not a plugin registry, provider API, or user-configurable extension map.
- After current identity, regular-file kind, and root containment are revalidated, main classifies the final logical path component case-insensitively in this fixed order: Markdown (`.md`, `.markdown`), CSV (`.csv`), strict JSON (`.json`), exact generic-text basenames, generic-text basename prefixes, generic-text suffixes, raster, then a content-classification candidate. A specialized suffix wins even when a basename pattern also matches, while a generic basename or prefix wins over a generic suffix; therefore `.env.json` and `Dockerfile.json` are JSON, `CMakeLists.txt` is CMake, `.env.log` is Environment, and `Dockerfile.log` is Dockerfile.
- A content-classification candidate above the existing 32 MiB transfer ceiling becomes `external` before a read. At or below that ceiling, main performs one owned bounded read and fatal UTF-8 decode: valid UTF-8 within every editable bound becomes `text` with the complete basename, no managed extension, and the Plain text label; a valid result beyond an editable bound becomes `external` with the first exceeded limit; invalid UTF-8 becomes `external` without transferring the probed bytes or creating a watcher. Content classification never promotes a candidate to Markdown, CSV, JSON, raster, or a programming-language label.
- Editable generic text uses this closed path-to-label table. Labels are presentation metadata derived only from the final path component. One shared pure label-to-grammar lookup derives the optional Lowlight grammar when the renderer constructs the text editor; grammar is not stored or transported as document state. Markzen performs no content inference or automatic language detection.

| Extensions or basenames | Language label | Lowlight grammar |
|---|---|---|
| `.txt`, `.text`, `.log`; `LICENSE`, `NOTICE`, `AUTHORS` | Plain text | — |
| `.js`, `.mjs`, `.cjs` | JavaScript | `javascript` |
| `.jsx` | JSX | `javascript` |
| `.ts`, `.mts`, `.cts` | TypeScript | `typescript` |
| `.tsx` | TSX | `typescript` |
| `.html`, `.htm` | HTML | `xml` |
| `.css` | CSS | `css` |
| `.scss` | SCSS | `scss` |
| `.sass` | Sass | `scss` |
| `.less` | Less | `less` |
| `.vue` | Vue | `xml` |
| `.svelte` | Svelte | `xml` |
| `.astro` | Astro | `xml` |
| `.py`, `.pyi` | Python | `python` |
| `.sh` | Shell | `bash` |
| `.bash` | Bash | `bash` |
| `.zsh` | Zsh | `bash` |
| `.fish` | Fish | — |
| `.c` | C | `c` |
| `.h` | C header | `c` |
| `.cc`, `.cpp`, `.cxx` | C++ | `cpp` |
| `.hpp`, `.hxx` | C++ header | `cpp` |
| `.cs` | C# | `csharp` |
| `.java` | Java | `java` |
| `.kt`, `.kts` | Kotlin | `kotlin` |
| `.go` | Go | `go` |
| `.rs` | Rust | `rust` |
| `.swift` | Swift | `swift` |
| `.rb` | Ruby | `ruby` |
| `.php` | PHP | `php` |
| `.lua` | Lua | `lua` |
| `.pl`, `.pm` | Perl | `perl` |
| `.r` | R | `r` |
| `.scala` | Scala | — |
| `.xml` | XML | `xml` |
| `.yaml`, `.yml` | YAML | `yaml` |
| `.toml` | TOML | — |
| `.ini` | INI | `ini` |
| `.cfg`, `.conf` | Configuration | `ini` |
| `.jsonc` | JSON with comments | `json` |
| `.sql` | SQL | `sql` |
| `.graphql`, `.gql` | GraphQL | `graphql` |
| `.proto` | Protocol Buffers | — |
| `.properties` | Java properties | — |
| `.cmake`, `CMakeLists.txt` | CMake | — |
| `.gradle` | Gradle | — |
| `.tf`, `.tfvars` | Terraform | — |
| `.hcl` | HCL | — |
| `.nix` | Nix | — |
| `Dockerfile`, `Dockerfile.*` | Dockerfile | — |
| `Makefile`, `GNUmakefile` | Makefile | `makefile` |
| `.rst` | reStructuredText | — |
| `.adoc` | AsciiDoc | — |
| `.tex` | TeX | — |
| `.env`, `.env.*` | Environment | — |
| `.gitignore`, `.prettierignore`, `.eslintignore` | Ignore rules | — |
| `.gitattributes` | Git attributes | — |
| `.editorconfig` | EditorConfig | `ini` |
| `.npmrc` | npm configuration | — |
| `.nvmrc` | nvm configuration | — |
| `.prettierrc` | Prettier configuration | `json` |
| `.eslintrc` | ESLint configuration | `json` |

  Basename and basename-prefix rules apply only to the final path component.
  Suffix-classified text retains its exact opening suffix as the managed
  extension. Basename-classified text retains its complete basename as the
  editable title and captures its label for the live tab.
- Raster preview is limited to `.png`, `.jpg`, `.jpeg`, `.gif`, and `.webp`.
  It reuses spec 0005/ADR 0009's signature/MIME agreement, 25 MiB encoded-byte,
  canvas, dimension, frame, and aggregate-frame bounds and its image-only
  exact-resource bearer. The opened raster's main-owned tab/FileKey
  registration authorizes only that exact file.
- A content-classified editable Plain text file participates in the same byte preservation, write, watcher, preview, and conflict lifecycle as path-classified generic text. Its entire basename is editable, Save As uses All Files, and rename or Save As never changes its captured Plain text label or live kind.
- Every default-app handoff uses one native confirmation before the
  operating-system handler runs. Markzen does not guess whether an unsupported
  file is executable from suffixes or platform metadata.
- Generic text is UTF-8 with at most one recognized leading UTF-8 BOM. Editable source and edited output are at most 10 MiB including the BOM, 200,000 logical lines, and 1 MiB of UTF-8 encoded bytes in one logical line excluding its separator. An empty source has one logical line; after CRLF is recognized as one boundary, every LF boundary adds one line, including the empty line after a terminal LF. Lone CR is literal text. A path-classified file or already-open text tab with invalid UTF-8 or a valid source exceeding an editable bound at or below the existing 32 MiB transfer ceiling enters exact read-only preservation with a warning and default-app handoff. An initially probed content candidate that is invalid UTF-8 or exceeds an editable bound becomes `external` with the precise reason and no transferred bytes. A larger source opens directly as `external` without reading or transferring bytes to the renderer.
- Generic text content lives in one per-tab ProseMirror state using the existing minimal Document, Text, and CodeBlock primitives as one literal text surface with embedded `\n` boundaries. The implementation replaces the plain CodeBlock extension only for this editor with version-matched `@tiptap/extension-code-block-lowlight` and `lowlight`'s fixed common grammar bundle. The shared pure lookup derives an optional grammar from the tab's captured label when the renderer constructs the sole code block; automatic detection is never called. Lowlight token nodes and CSS are synchronous derived presentation only and never enter persistent document content, serialization, clipboard text, dirty equality, undo history, search text, document ownership, or IPC. A missing grammar, unsupported label, or highlighting failure falls back to the same fully editable uncolored literal text without changing bytes or authority.
- Generic text reuses one shared full-panel surface, page, and compact title-row layout with CSV and JSON: zero outer page padding, no centered paper-width maximum, a fixed-height title row containing the editable title, complete accessible filename, secondary path, and language label, and one monospaced no-soft-wrap editor that fills the remaining panel with reachable horizontal and vertical scrolling. It adds only text-specific editor and language-label styling, with no line-number, diagnostics, formatting, table, image, CSV, or JSON controls.
- Unchanged and rename-only text retains exact bytes. After the first content
  edit, serialization retains BOM presence and the dominant LF or CRLF
  convention while preserving every literal character, tab, space, trailing
  space, empty line, and current terminal-newline state from the ProseMirror
  text. The terminal newline exists only in literal content, so the user may
  add or remove it. Every model `\n`, including a newly inserted one, emits the
  retained dominant convention. Mixed original newline spellings canonicalize
  only after a content edit.
- Before any typing, paste, deletion, Enter, undo, or redo transaction commits,
  its complete resulting literal model is checked against every editable
  bound. A crossing rejects the whole transaction with an accessible message;
  no partial text, revision, history, dirty state, selection, or preview
  promotion commits.
- Generic-text writes reuse the shared save transaction, registry, watcher,
  conflict, close, quit, revision, IME, and async ownership rules. Raster and
  external tabs are never content-dirty, expose no editable title, and disable
  Save/Save As; file management remains outside this spec.
- Find in generic text reuses the existing search matcher and panel. The displayed language label is captured from path classification and the optional grammar is derived only from that label, never from content, a shebang, model inference, or filename text inside the document.
- Main rejects Save, Save As, rename, overwrite, and every Markdown image
  select/authorize/resolve, remote-load, or embedded-load intent for `raster`
  and `external` records even when a valid application renderer forges a
  well-shaped request. UI eligibility is not authority.
- Before production code is accepted, revise ADR 0013 to cover owned content fallback, path-only grammar selection, CodeBlockLowlight's derived presentation boundary, and the full-panel generic-text surface. ADRs 0001, 0004, and 0009 and specs 0002, 0003, 0009, and 0010 retain their Implemented contracts because this revision changes neither their specialized kinds nor their authority boundaries. Spec 0011 alone returns to Implemented after its revised mapped tests and required verification are green.

## Behavior (acceptance criteria)

### Classification, opening, identity, and sidebar behavior

- AC1: Given a workspace snapshot after this spec is implemented, then every
  visible regular-file or file-symlink row is enabled regardless of extension,
  while directories, terminal directory symlinks, hidden entries, sorting,
  windowing, root containment, and directory-watcher behavior remain governed
  by spec 0003.
- AC2: Given any visible regular file, when main classifies its revalidated final logical path component and, only for the remaining content candidate, its owned bounded bytes, then the fixed specialized, path-known generic-text, raster, content-classified Plain text, and external precedence produces exactly one closed document kind.
- AC3: Given every suffix, basename, or basename-prefix entry in the generic table matched case-insensitively, when classified, then it produces the exact documented language label and `text` kind without inspecting file content.
- AC4: Given overlapping classifier rules, when classified, then a `.md`, `.markdown`, `.csv`, or `.json` specialized suffix wins over a generic basename or prefix; otherwise an exact generic basename wins over a generic prefix and either wins over a generic suffix, and every path rule wins over fallback content classification. Thus `.env.json` and `Dockerfile.json` are JSON, `CMakeLists.txt` is CMake, `.env.log` is Environment, and `Dockerfile.log` is Dockerfile; `.jsonc` and unmatched config/build basenames remain literal generic text even when their contents resemble another format, while an unrecognized valid UTF-8 file is Plain text rather than inferred from its contents.
- AC5: Given `.png`, `.jpg`, `.jpeg`, `.gif`, or `.webp` matched
  case-insensitively, when activated, then it opens as a raster tab pending
  main-owned validation rather than as generic text or a Markdown image node.
- AC6: Given a visible regular file that matches no specialized, generic-text, or raster path rule and is at or below 32 MiB, when activated from a workspace or selected through Open…, then main performs one current-owner bounded read and fatal UTF-8 decode; an in-bound valid result registers as editable `text` with Plain text, no managed extension, and the complete basename, while an invalid result or a result beyond an editable bound registers `external` with the precise reason without transferring the probed bytes or starting a watcher.
- AC7: Given Open…, when its native chooser renders, then it offers specialized
  Markzen documents, editable text, raster images, and **All Files** filters;
  selecting an unsupported regular file follows AC6, while cancellation changes
  no tab, preview, registry, or active selection.
- AC8: Given an activated path, when main revalidation reports a directory, out-of-root target, changed `FileKey`, missing file, or a read failure for a byte-backed or content-candidate kind, then no stale classification grants authority; an external result retains only successful current stat/canonical identity until handoff, and existing retry/error and registry rules cannot expose another file's bytes.
- AC9: Given two entries or windows identify the same generic, raster, or
  external `FileKey`, when activated concurrently, then exactly one live
  path-backed tab owns it application-wide and losing requests focus that owner.
- AC10: Given a generic-text tab, then its tab label and editable title hide its exact matched suffix where one exists, retain the complete accessible filename, and show existing workspace-relative secondary-path context; basename-only and content-classified Plain text show their complete basename as the title.
- AC11: Given suffix-classified generic text, when rename or Save As runs, then its opening suffix is managed and retained, another typed suffix becomes part of the stem, and the chooser filters to that exact type; given a basename- or content-classified file, its complete basename is editable, Save As uses an All Files filter, and its captured language label remains attached. No path converts the live tab's label or document kind.
- AC12: Given raster or external fallback, then the complete filename remains
  visible and accessible, its title is not editable, Save and Save As are
  disabled, and ordinary viewing or handoff does not pin or dirty a preview;
  spec 0003's explicit double-click, Cmd/Ctrl+Enter, and Keep Open actions still
  pin it.
- AC13: Given File → New File, New CSV, New JSON, or the tab-bar `+`, when
  invoked, then it retains its previously approved specialized behavior and no
  untitled generic-text, raster, or external tab is created.
- AC14: Given mixed document kinds, when open, content probing, preview replacement, activation, Save, reload, handoff, tab switch, or close completes, then the closed kind, required payload, and generic label remain owned by their captured tab and stale work cannot classify, parse, render, save, or open another tab's file.
- AC15: Given a preview generic-text tab, when its first accepted persistent
  text transaction begins, then it pins synchronously before mutation; caret
  movement, selection, scrolling, and search do not pin it.

### UTF-8 decoding, literal text, and serialization

- AC16: Given path-classified or content-candidate valid UTF-8 with zero or one leading UTF-8 BOM and within every editable bound, when it opens, then every Unicode scalar, empty line, tab, space, trailing space, normalized line boundary, and terminal newline enters exactly once into the literal model, while only BOM presence and dominant output convention remain encoding metadata.
- AC17: Given CRLF, LF, or mixed-newline source, when decoded, then CRLF becomes
  one model `\n`, LF becomes one model `\n`, lone CR remains literal, dominant
  convention is the more frequent boundary with first observed breaking a tie,
  and an input with no boundary defaults future edited output to LF.
- AC18: Given an empty generic-text file, when opened, then it contains one
  editable empty line, is clean, and retains empty bytes as its exact baseline.
- AC19: Given invalid UTF-8 within the transfer ceiling, when fatal decoding runs, then no replacement character or partial literal model is produced; a path-classified generic-text file or already-open text tab enters exact encoding preservation, while an initial content candidate becomes external without transferring its probed bytes.
- AC20: Given encoding preservation, when displayed, then a prominent announced
  warning explains that editing and Find are unavailable and offers **Open in
  Default App** without exposing a lossy text rendering.
- AC21: Given source crosses the inclusive 10 MiB document, 200,000 logical-line, or 1 MiB UTF-8-per-line bound while remaining at or below 32 MiB, when bounded decoding observes it, then it stops before constructing the remainder and returns the first exceeded limit with no partial model; a path-classified or already-open text file enters exact preservation, while an initial content candidate becomes `external` without transferring the probed bytes.
- AC22: Given a path-classified or already-open text file enters limit preservation, when displayed, then a prominent announced warning identifies the exact limit, disables content editing and Find, and offers **Open in Default App** without rendering partial content as editable; the equivalent initial content candidate uses the external limitation view and same handoff.
- AC23: Given a path-classified generic-text source or content candidate above 32 MiB, when main stats it, then it opens as external fallback before any document-byte read or transfer and explains that the file is too large for Markzen.
- AC24: Given path-classified or already-open text preservation from AC19 or AC21, when Save, rename-only Save, Save
  As, conflict, close, or handoff runs, then unchanged Save writes nothing,
  rename moves without rewriting, Save As copies exact original bytes, ordinary
  ownership/conflict/close rules remain intact, and handoff follows AC52–AC57.
- AC25: Given an unchanged editable text tab without a pending rename, when Save
  is invoked, then no disk write or canonical reserialization occurs.
- AC26: Given unchanged editable generic text uses Save As, when the shared
  transaction commits, then the target receives the exact original bytes,
  including BOM, mixed newline spellings, lone CR, whitespace, and terminal
  newline state.
- AC27: Given a rename-only generic-text save, when it succeeds, then the filesystem entry moves without rewriting bytes and the tab adopts the renamed identity with its captured language label unchanged.
- AC28: Given edited generic text, when serialized, then it emits UTF-8 with the
  retained BOM and dominant newline convention, converts every model `\n` to
  that convention, and preserves every other literal scalar, lone CR, tab,
  space, trailing space, empty line, and the model's current terminal newline;
  search and view state never enter bytes.
- AC29: Given typing, paste, deletion, Enter, undo, or redo would make the
  complete output cross any editable bound, when the command is evaluated,
  then the whole command is rejected before a transaction commits, focus and
  selection remain current, preview stays unpinned, and an accessible message
  identifies the limit.
- AC30: Given independently authored path-classified and extensionless or unknown-extension source, expected literal model, classification metadata, and golden bytes covering valid UTF-8, invalid UTF-8, and exact boundaries, when production classify, decode, serialize, and reparse run, then all results match those fixtures and no expected artifact is refreshed from production output.

### Generic text editing and Find

- AC31: Given editable generic text, then it renders one named multiline ProseMirror literal-text editor by reusing the same full-panel surface, page, and compact title-row classes as CSV and JSON, with zero outer page padding, no paper-width maximum, the editable title, complete accessible filename, secondary path, captured language label, a monospaced no-soft-wrap editor filling the remaining panel, visible caret and selection, reachable horizontal and vertical scrolling, and no line numbers, diagnostics, Markdown formatting, table, image, CSV, or JSON structural controls.
- AC32: Given ordinary typing, paste, deletion, Enter, undo, or redo within the
  bounds, then text remains literal: punctuation never creates rich marks,
  links, headings, lists, HTML, images, or input-rule structures, each accepted
  command is one history event where the platform operation permits, and
  returning exactly to the committed literal baseline makes content clean.
- AC33: Given a generic-text tab is switched away from and back to, then its
  full undo/redo history, caret, text selection, horizontal/vertical scroll,
  and Find ownership are restored or cleared under existing tab-switch rules.
- AC34: Given active IME composition, when tab switch, Save, or close is
  requested, then composition commits exactly once to its originating text tab
  before the captured revision or ownership changes and is subject to AC29's
  atomic bounds.
- AC35: Given HTML, XML, SVG text, URLs, imports, template expressions, shell commands, code, bidirectional Unicode, or Lowlight token output in the generic editor, when it renders, then authored content remains text under inert token spans and creates no executable DOM, navigation, popup, image/media load, import, process, filesystem access, or network request.
- AC36: Given editable generic text, when Cmd/Ctrl+F or Edit → Find is invoked,
  then the existing non-modal Find panel searches literal text in line order
  using `findTextMatches`, without searching the language label and without
  matching across a model `\n` boundary.
- AC37: Given generic-text search results, then existing query focus,
  current/total status, cyclic Next/Previous, exact highlighting, mapped-current
  behavior after edits, debounce, reduced-motion scrolling, tab-switch cleanup,
  and stale-generation rules from spec 0004 apply.
- AC38: Given search before, during, or after Save, then serialized bytes,
  literal baseline equality, preview state, revision, undo history, and
  clipboard text are identical to the same document without search state.
- AC39: Given generic text with long lines at 480×320, 200% zoom, forced colors, or reduced motion, then the compact title row, language label, caret, selection, search state, errors, and both editor scroll axes remain reachable and distinguishable without color or animation alone, the editor consumes the remaining panel without introducing an outer page scroll trap, and presentation never inserts soft line breaks into content or serialized bytes.

### Path-derived syntax highlighting

- AC70: Given every documented language label, when the shared pure label-to-grammar lookup runs, then it returns the exact optional version-locked Lowlight common grammar in the table; Plain text and table rows marked `—` return no grammar, the classifier transports only the label, and no call to automatic detection occurs.
- AC71: Given a TypeScript, TSX, JavaScript, JSX, HTML, CSS, JSONC, shell, Python, or other table-mapped document, when the generic editor renders or its literal content changes, then TipTap CodeBlockLowlight applies the grammar derived from the captured label to the sole code block and produces expected token spans for independently authored representative fixtures while preserving the exact visible text and selection positions.
- AC72: Given syntax highlighting appears, changes, disappears, or is synchronously recomputed across edits, undo/redo, Find, theme changes, tab switches, save, reload, or preview promotion, then tokens remain derived presentation only and never affect literal equality, dirty state, history events, search matches, clipboard text, serialized bytes, revision, owner, or captured label.
- AC73: Given a content-classified Plain text file, a path-known label without a bundled grammar, or a Lowlight failure, then the same full editor remains available without token coloring, exposes its captured label, reports no data-loss state, and retains all editing, Find, save, watcher, conflict, and accessibility behavior.
- AC74: Given highlighted text in light theme, dark theme, System theme, forced colors, selected text, a Find match, keyboard-only operation, or assistive-technology inspection, then syntax tokens remain readable, authored text and semantic editor naming are unchanged, caret/selection/current-match/focus state remains distinguishable without relying on token color, and forced colors may collapse token colors to system text colors without hiding content.

### View-only raster documents

- AC40: Given an opened raster candidate, when main validates it under the
  exact spec 0005/ADR 0009 signature, MIME, byte, dimension, canvas, frame, and
  aggregate-frame limits, then validation returns only the approved format,
  intrinsic width and height, and animated/static metadata, or a safe failure;
  failure issues no token.
- AC41: Given AC40 succeeds for the current main-owned raster TabId, FileKey,
  path, and generation, then main issues one exact-resource bearer that permits
  Chromium to render only that file through `markzen-asset:` and only as an
  image destination.
- AC42: Given a valid raster tab, then it presents the image centered on a
  neutral scrollable canvas, identifies the complete filename, format,
  intrinsic width and height, and animated/static state, and exposes a useful
  accessible image name derived from those facts without claiming authored alt
  text.
- AC43: Given a raster preview, then the image scales down proportionally to
  fit the available canvas without upscaling, ordinary window/renderer zoom
  remains available, and Markzen adds no image-specific zoom, pan, or persisted
  view-state subsystem.
- AC44: Given raster viewing, focus, canvas scrolling, renderer zoom, or
  animation playback, then no document revision, dirty state, serialization,
  file write, metadata edit, or preview promotion occurs.
- AC45: Given a raster extension with malformed bytes, MIME/signature mismatch,
  exceeded raster bound, unreadable source, or changed identity, when
  validation runs, then no token or pixels are exposed and the tab becomes the
  external-style limitation view with the validation-safe message and
  **Open in Default App**.
- AC46: Given a clean raster file changes externally while its tab remains
  live, then a fresh owned validation replaces or revokes the current token and
  updates dimensions/pixels only for the current generation; invalid
  replacement follows AC45 and a missing source uses the existing missing-file
  state.
- AC47: Given an altered, expired, revoked, foreign, or stale raster token,
  direct Fetch/navigation, non-image destination, non-GET request, or file that
  no longer matches its FileKey, when requested, then the existing
  non-disclosing asset denial occurs without path, byte, or existence leakage.
- AC48: Given a raster tab closes, is preview-replaced, changes identity,
  receives an external invalidation, explicitly revokes its grant, or its
  window closes, then owned tokens and pending validation are revoked or
  canceled idempotently and a late completion cannot recreate image state;
  ordinary activation changes retain the live tab's existing exact-file grant.
- AC49: Given an animated raster while the operating system requests reduced
  motion or changes to request it, then Markzen does not attach or fetch its
  asset URL before use or detaches an already attached image, identifies that
  animated preview is withheld, and offers **Open in Default App**. The live
  tab may retain its current grant under AC48, and when the preference becomes
  inactive it may reattach that grant only while the same owner, file, and
  generation remain current.
- AC50: Given raster view at minimum size, 200% zoom, forced colors,
  keyboard-only operation, or assistive-technology inspection, then
  filename, format, dimensions, static/animated state, pixels or failure,
  canvas bounds, scroll, and focus remain accurately exposed and
  distinguishable without color alone.

### Unsupported-file handoff

- AC51: Given an external tab or failed/over-limit supported preview, then it shows the complete accessible filename, a concise reason Markzen cannot edit or preview it, and one named **Open in Default App** button without transferring probed bytes, escaping, rendering, or interpreting unsupported content; above-ceiling content remains unread.
- AC52: Given Open in Default App, when activated by pointer, Enter, or Space,
  then one closed application intent resolves the sender-owned live TabId to
  its main-registered current path and FileKey, revalidates them, and shows one
  window-modal native confirmation before any operating-system handler runs.
- AC53: Given the default-app confirmation, then it names the complete path,
  states that the file will leave Markzen and its default application may run
  software, and offers **Open** and **Cancel** without classifying or inspecting
  the file as executable.
- AC54: Given the default-app confirmation is canceled, closed, escaped, or
  becomes stale because its owner/path/generation changed, then no handler runs
  and focus returns to the live originating tab where possible.
- AC55: Given the default-app confirmation is accepted while its originating
  owner/path/FileKey/generation remain current, then main delegates that exact
  path once to the operating system's default handler and cannot target another
  tab or accept a renderer confirmation bypass.
- AC56: Given the default handler reports failure or no association, then
  Markzen remains open on the same tab and exposes a non-blocking accessible
  error without raw shell details, stack, or another file's path.
- AC57: Given a forged path, FileKey, owner, kind, confirmation flag, stale
  TabId, foreign window, duplicate completion, or malformed/oversized payload,
  when handoff is attempted, then sender-first validation rejects it before
  filesystem or shell action and discloses no registered target.

### Shared lifecycle, security, performance, and verification

- AC58: Given generic-text Save, Save As, rename, Save All, close-triggered
  save, or quit-triggered save, then the shared coordinator applies its
  captured literal bytes with existing coalescing, ordered follow-up, conflict,
  cancellation, collision, cleanup-warning, missing-file, and later-edit
  behavior.
- AC59: Given a clean generic-text file changes externally to valid in-bound UTF-8, then fresh bounded decoding replaces content and encoding metadata, resets history and selection deterministically, retains kind, language, and identity, and announces reload; invalid or over-limit replacement enters AC19/AC20 preservation without reclassifying the live tab from its captured path/content decision.
- AC60: Given a dirty generic-text file changes externally, then editor content
  is not replaced and existing Overwrite Disk, Reload from Disk, and Save
  Editor As… choices operate on captured literal bytes and the newest
  `DiskVersion`.
- AC61: Given an external tab produced after content probing or an above-ceiling stat changes or disappears, then no content watcher or further eager read runs; the visible limitation view remains stable until handoff, and handoff revalidation reports the current safe error or confirms the current main-owned path and FileKey before proceeding.
- AC62: Given overlapping classify, content probe, load, decode, search, raster validation, token, handoff, save, watcher, preview, switch, warning, or close work, then each asynchronous completion checks owner, kind, language, generation, path, FileKey, and captured revision as applicable before commit.
- AC63: Given the expanded renderer/preload boundary, then document gateway, seed, live-tab, bootstrap, watcher, command, and IPC contracts use closed variants for Markdown, CSV, JSON, generic text, raster, and external kinds; a text variant may contain only validated literal content, encoding metadata, path-derived label, and preservation bytes, grammar remains renderer-derived and is never transported, raster/external variants contain no editor or writable payload, external variants contain no probed bytes, and the renderer receives no generic read/write/open-path API, Electron shell object, raw raster path URL, process capability, or arbitrary event destination.
- AC64: Given Save, Save As, rename, overwrite, or Markdown asset/acquisition
  intent targets a raster or external tab, then main rejects it from its own
  registered kind and sender authority before any filesystem, dialog, protocol,
  or shell action, regardless of renderer menu state or forged payload.
- AC65: Given native Undo, Redo, Cut, Copy, Paste, Select All, Find, Save,
  Save As, Save All, Close Tab, or Close Window, then menu enablement and
  routing reflect the focused generic editor, native title control,
  preservation state, raster/external view, or inactive tab without applying
  an operation to another kind/window; raster/external views expose only their
  specified view and handoff actions.
- AC66: Given controlled path-highlighted and unhighlighted generic-text fixtures up to 10 MiB and 200,000 lines, when CI opens, scrolls, searches at least 5,000 matches, makes 20 edits, and undo/redoes them, then classification/decode, open, input-to-paint including synchronous token decoration, search-settle, scroll, and undo/redo times plus observed long tasks are recorded in human- and machine-readable artifacts without gating the build.
- AC67: Given classification, fallback probing, decoding, serialization, highlighting, raster, and handoff tests, then repository fixtures cover cross-cutting precedence rules, unknown-extension and extensionless valid UTF-8, unknown invalid UTF-8 and binary content, BOM/no-BOM, LF/CRLF/mixed/final newlines, empty and long lines, tabs/trailing spaces, Unicode, exact bounds, representative token classes, every raster format and rejection family, default-app failure, and default-app confirmation policy.
- AC68: Given automated tests at any layer, then they use MemoryPlatform,
  repository fixtures, synthetic system-handler adapters, injected generations,
  and isolated shell temporary files only; no test reads or
  changes a developer's documents, executes a fixture, or invokes a public
  service.
- AC69: Given UI introduced by this spec at minimum size, 200% zoom, forced
  colors, reduced motion, keyboard-only operation, or assistive-technology
  inspection, then every pointer action has a keyboard path, focus is visible,
  names/roles/states/errors are accurate, state is not color-only, status
  changes are announced without stealing focus, and automated checks report no
  serious or critical violations.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1 | Browser Mode | Playwright-vs-vite mixed workspace journey |
| AC2–AC4 | Node | Browser Mode representative classification |
| AC5 | Node | Playwright-vs-vite raster activation |
| AC6 | Node | Shell smoke bounded fallback probe and probed-byte non-transfer |
| AC7 | Shell smoke | Node dialog-options contract; Browser Mode cancellation |
| AC8 | Playwright-vs-vite | Shell smoke real alias/open |
| AC9 | Node | Shell smoke concurrent alias/open |
| AC10–AC13 | Browser Mode | Shell smoke exact Save As filter and title |
| AC14–AC15 | Browser Mode | Playwright-vs-vite stale preview journey |
| AC16–AC19 | Node | — |
| AC20 | Browser Mode | Playwright-vs-vite encoding-preservation journey |
| AC21 | Node | — |
| AC22 | Browser Mode | Playwright-vs-vite limit-preservation journey |
| AC23 | Shell smoke | Node size-classification policy |
| AC24 | Playwright-vs-vite | Shell smoke preservation lifecycle |
| AC25–AC28 | Node | Shell smoke exact-byte/rename/newline round trip |
| AC29 | Browser Mode | Playwright-vs-vite mutation-limit journey |
| AC30 | Node | — |
| AC31–AC39 | Browser Mode | Playwright-vs-vite generic-text edit/Find journey |
| AC40 | Node | Shell smoke real raster render |
| AC41 | Shell smoke | Node token policy |
| AC42–AC45 | Browser Mode | Playwright-vs-vite view controls and failure |
| AC46 | Playwright-vs-vite | Shell smoke real invalidation |
| AC47–AC48 | Node | Shell smoke protocol and late-completion negatives |
| AC49–AC50 | Browser Mode | Automated accessibility scan |
| AC51 | Browser Mode | Playwright-vs-vite limitation view |
| AC52–AC56 | Shell smoke | Node owned-path confirmation and stale policy |
| AC57 | Node | Shell smoke forged/bypass negatives |
| AC58–AC60 | Playwright-vs-vite | Shell smoke save, watcher, and conflict round trip |
| AC61 | Shell smoke | Node no-watcher/action-revalidation policy |
| AC62 | Node | Playwright-vs-vite stale mixed-kind journey |
| AC63 | Static | Shell smoke preload/CSP/shell-surface assertion |
| AC64 | Node | Shell smoke forged mutation and asset-intent negatives |
| AC65 | Shell smoke | Browser Mode command eligibility |
| AC66 | CI | — |
| AC67 | Node | — |
| AC68 | Static | Node transport/harness guards |
| AC69 | Browser Mode | Automated accessibility scan; Playwright minimum-size/zoom journey |
| AC70 | Node | Browser Mode representative grammar metadata |
| AC71–AC74 | Browser Mode | Playwright-vs-vite highlighted/full-panel text journey |

Supporting shell coverage also proves packaged All Files/Open/Save filters,
closed system-handoff authority, real default-handler stubbing, exact
filesystem bytes, raster CSP isolation, native menu routing, and one watcher
lifecycle each for generic text and raster; external tabs have no watcher.
`npm run verify` remains the blocking aggregate; AC66 runs in the
existing non-blocking performance project.

## Open questions

- (none)
