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

## Fuzzy file finder & tab quick switcher

Cmd/Ctrl+P subsequence matching (VS Code style) over a flat list of all Markdown files in the folder, plus a tab switcher modal. Old ADR 0011 chose `fuzzysort` and specified the flat-list scan kept fresh by the watcher; never built. Multi-root (spec 0005) means the flat list now spans all roots.

## Full-text content search

Search across body text of all files in the open folder with ranking and excerpts. Old ADR 0012 chose Tantivy (Rust, in-memory index) — **that choice is void under Electron** (no Rust process). Re-evaluate: a worker thread in the main process with a JS index (MiniSearch/Orama/FlexSearch) is the natural Electron shape; the ADR's IPC/memory concerns read differently when the "backend" is Node.

## Expanded settings

Font family/size, line width, auto-save (+ delay), spell check. Old ADR 0013 designed the persistence format for all of these; only theme, toolbar mode, and sidebar width shipped. The settings mechanism (spec 0014) was specced to accommodate them — each becomes a small spec (auto-save is the only behavior-heavy one: dirty-state interplay, rename-pending interplay with spec 0011).

## External-change conflict handling

The watcher (spec 0007) deliberately covers the sidebar only. What happens when an *open document* changes or disappears on disk (reload if clean, prompt if dirty, mark deleted?) needs its own spec.

## Remove / reorder sidebar roots & file tree CRUD

Spec 0005 non-goals, deferred together: removing a root from a folder window, reordering roots, and create/delete/rename/move from the tree — all want context-menu infrastructure that doesn't exist yet.
