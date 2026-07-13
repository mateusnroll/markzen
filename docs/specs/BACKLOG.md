# Backlog — Future Spec Candidates

Ideas that will likely become numbered specs but aren't scheduled yet. Each entry carries just enough context (origin, prior decisions, gotchas) that drafting the spec later doesn't require re-research. When one is picked up: draft the spec from `TEMPLATE.md` with the next free number and delete the entry here.

## Auto-update

Ship updates via **electron-updater** (electron-builder's updater) with **GitHub Releases as the update feed** — no server to run; CI publishes artifacts + `latest.yml` on each tagged release and the app checks the feed directly. Decided 2026-07; spec 0001 already locks electron-builder as the packager for this reason.

Cost/signing facts gathered up front (recheck at implementation):

- **macOS**: Apple Developer Program ($99/yr) required — Squirrel.Mac refuses unsigned updates and notarization is needed for distribution anyway. The only real recurring cost.
- **Windows**: free OV signing for qualifying OSS via the [SignPath Foundation](https://signpath.org/) (CI-integrated, key on their HSM); fallback Azure Trusted Signing (~$10/mo). Unsigned updates work with electron-updater but trigger SmartScreen.
- **Linux**: $0 — AppImage self-updates via electron-updater; Flatpak/Snap stores own their update mechanism entirely.
- Alternative considered and rejected: [update.electronjs.org](https://github.com/electron/update.electronjs.org) (free, official) — macOS/Windows only and pairs with Squirrel/Forge rather than electron-builder.

Testability hook for the eventual spec: electron-updater's *generic* provider can point at a local HTTP server in the shell-smoke suite, so "app on vN discovers, downloads, and stages vN+1" is an assertable AC.

## Source mode

Raw-Markdown editing in CodeMirror 6, toggled per-tab with Cmd/Ctrl+E. Designed in old ADR 0004 (sync rules: hand off content only on mode switch, independent undo stacks, malformed Markdown must not throw) but **never built** — no CodeMirror dependency ever landed.

## Additional tree file types

Milestone 0003 deliberately shows unsupported file types as subdued, disabled tree rows so folder context remains visible, but opens only `.md`, `.markdown`, and `.txt`. A later spec should classify additional text and binary formats as view-only or light-editing documents, define safe decoding/size limits and save eligibility per type, and replace each row's disabled state only when its document lifecycle and loss-prevention behavior are approved.

## Fuzzy file finder & tab quick switcher

Cmd/Ctrl+P subsequence matching (VS Code style) over a flat list of all Markdown files in the folder, plus a tab switcher modal. Old ADR 0011 chose `fuzzysort` and specified the flat-list scan kept fresh by the watcher; never built. Multi-root workspaces (milestone 0003) mean the flat list spans all roots.

## Full-text content search

Search across body text of all files in the open folder with ranking and excerpts. Old ADR 0012 chose Tantivy (Rust, in-memory index) — **that choice is void under Electron** (no Rust process). Re-evaluate: a worker thread in the main process with a JS index (MiniSearch/Orama/FlexSearch) is the natural Electron shape; the ADR's IPC/memory concerns read differently when the "backend" is Node.

## Expanded settings

Font family/size, line width, auto-save (+ delay), spell check. Old ADR 0013 designed the persistence format for all of these; the rewrite milestones implement only theme, toolbar mode, and sidebar width. Each later approved setting directly extends milestone 0003's closed typed schema rather than using a generic registry. Auto-save is behavior-heavy because it must extend milestone 0002's dirty-state, save-transaction, and pending-rename rules.

## Internal and fragment link navigation

Milestone 0004 preserves relative paths and `#fragment` destinations but does not follow them. A future spec should define whether Markdown-file links focus/open a Markzen tab, how fragments resolve to headings, how paths interact with multi-root workspaces, and how missing or ambiguous targets surface.

## Native link elements and unsafe-link preference

Milestone 0004 deliberately renders each editable link as a focusable `span` with link semantics while keeping the model, focus contract, and opening policy independent of that tag. A later accessibility-focused spec should migrate rich-editor links to semantic `<a>` elements without reintroducing ambient navigation, changing Markdown serialization, or making ordinary clicks leave editing context.

The same future work should add a closed `allowUnsafeLinks` setting, default `false`, to milestone 0003's main-owned settings schema. When enabled it may bypass the native warning only for milestone 0004's confirmable absolute destinations (credential-bearing HTTP(S), `file:`, and non-executable custom schemes); relative/fragment-only, malformed/control-character, `javascript:`, `data:`, and `blob:` destinations remain non-openable. The preference must be supplied at bootstrap, broadcast by authoritative revision, and enforced in main rather than accepted as a renderer-provided bypass flag.

## Full Unicode search case folding

Milestone 0004 search intentionally implements NFC normalization plus ECMAScript locale-independent lowercase conversion with source-offset mapping. If real documents demonstrate a need for equivalences outside that contract—such as full Unicode case-fold expansions—a future spec should select a maintained Unicode data source or dependency, enumerate approved equivalences and locale behavior, preserve correct ProseMirror offsets, and measure the added search cost before changing matching semantics.

## Active SVG images

Milestone 0005 preserves SVG sources but deliberately blocks active SVG rendering. A future security-focused spec may permit SVG after choosing and testing a sanitization or rasterization boundary that cannot execute script, navigate, fetch subresources, or escape the asset capability model.

## Remove / reorder sidebar roots & file tree CRUD

Milestone 0003 non-goals, deferred together: removing or reordering roots and create/delete/rename/move from the tree. These operations share context-menu infrastructure and must preserve canonical identity, preview tabs, watchers, and the shared save transaction.
