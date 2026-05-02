# ADR 0011: Fuzzy Search for File Finder and Tab Quick Switcher

**Status:** Accepted  
**Date:** 2026-05  
**Deciders:** Mateus Pinheiro

## Context

Two UI features require fast in-memory filtering:

- **File Finder** — a search bar at the top of the sidebar file tree that narrows the visible file list as the user types. Users often remember partial names, distinct fragments ("api util"), or mistype; exact substring matching would miss too many valid targets.
- **Tab Quick Switcher** — a button on the far right of the tab bar that opens a modal listing all open tabs with a search bar. Provides keyboard-driven navigation across many open files without reaching for the mouse.

The tab switcher operates on data already resident in Zustand (`tabsStore.tabs`). The file finder requires a **complete flat list of all markdown files in the folder**, including files inside directories the user has never expanded. This flat list is populated once on folder open via a recursive directory scan and kept in sync by the existing `notify`-based file watcher (ADR 0010). No full-text content is loaded — only file paths.

A naive substring filter (`name.includes(query)`) would fail for partial names and typos. A Levenshtein-distance approach (e.g. Fuse.js) is more flexible but slower and requires tuning thresholds to avoid false positives. The pattern that works best here — and that users recognise from VS Code's Cmd+P — is a **subsequence-based fuzzy match**: characters in the query must appear in order in the filename, but need not be contiguous. This tolerates missing letters, partial typing, and natural abbreviations without producing noisy results.

## Decision

Use **`fuzzysort`** (npm, ~3.8 kB gzipped) in the React frontend for both features.

### Why fuzzysort over alternatives

| Library | Size | Algorithm | Typo tolerance | Highlight |
|---|---|---|---|---|
| `fuzzysort` | 3.8 kB | Subsequence (SublimeText-style) | Yes (v3+) | Built-in |
| `uFuzzy` | 4.2 kB | Optimised subsequence | Limited | Built-in |
| `Fuse.js` | 6–8 kB | Bitap / Levenshtein | Yes | Yes |

fuzzysort is the fastest of the three on large lists, has the smallest footprint, ships typo tolerance since v3, and exposes a `highlight()` helper that returns annotated spans ready for React rendering. No configuration tuning is required for the file-name use case.

### Feature A — File Finder

- A search input renders at the top of the `Sidebar`, above the `FileTree`.
- On every keystroke, `fuzzysort.go(query, allFiles, { key: 'name' })` is called against `fileSystemStore.allFiles` — a flat array of every markdown file in the folder, regardless of whether its parent directory has been expanded.
- The filtered result replaces the rendered list; the Zustand store is never mutated.
- Matched characters are highlighted using `fuzzysort.highlight()` to give visual feedback.
- The input is cleared when a file is opened or the sidebar is toggled.
- Keyboard shortcut: **Cmd/Ctrl+P** (standard convention; matches VS Code, Zed, Obsidian).

#### `allFiles` population and maintenance

- `fileSystemStore` gains a new field: `allFiles: FileTreeEntry[]`.
- On `setFolderPath()`, a recursive `readDir` call (via `@tauri-apps/plugin-fs`) walks the entire folder and populates `allFiles` with all `.md` / `.markdown` entries. This runs asynchronously and does not block the editor.
- The `notify`-based file watcher (ADR 0010) emits `folder-changed` events; the frontend refreshes `allFiles` on those events by re-running the recursive scan (or doing targeted add/remove when the event carries enough detail).
- Hidden files and directories (starting with `.`) are excluded, consistent with the existing `dirChildren` loader.

### Feature B — Tab Quick Switcher

- A small icon button sits on the far right end of the `TabBar`.
- Clicking it (or pressing **Cmd/Ctrl+Shift+E**) opens a floating modal anchored below the tab bar.
- The modal renders all tabs from `tabsStore.tabs`, each showing the filename and abbreviated path.
- A search input at the top of the modal filters tabs via `fuzzysort.go(query, tabs, { key: 'filePath' })`.
- Selecting a result calls the existing `switchTab()` utility; the modal closes.
- The modal closes on Escape or clicking outside.

### Implementation notes

- Both features are purely presentational: no store mutations, no backend calls.
- Filtering runs synchronously on the main thread. For the file finder, `allFiles` is a flat array of file paths — no content — so even a folder with 10,000 markdown files stays well under a few MB of memory. For the tab switcher, the list is bounded by the number of open tabs (tens, not thousands).
- fuzzysort results are already sorted by score descending — no additional ranking step is needed.
- The `fuzzysort` import is tree-shaken by Vite; only the used API surface is bundled.

## Consequences

**Positive:**
- Instant results — no IPC round-trips, no indexing, no async work.
- Tiny footprint: ~3.8 kB adds negligible bundle weight.
- Match highlighting gives users clear visual confirmation of why a result matched.
- The SublimeText-style algorithm matches user expectations from other tools.
- No new Rust code required.

**Negative:**
- The recursive `readDir` scan on folder open is an extra async operation. It is lightweight (paths only, no file contents) and runs in the background, but adds a brief window at startup where `allFiles` is not yet populated and the file finder shows no results.
- `allFiles` must be kept in sync with the filesystem. The `notify` watcher handles this, but a full re-scan is a blunt instrument for large folders. A more targeted add/remove approach would require the watcher to emit specific change events (added/removed file path) rather than a generic `folder-changed` signal.
- Not suitable if the repository grows to hundreds of thousands of files — at that scale a Rust-side pre-indexed approach would be needed. Not a current concern.
- fuzzysort has no built-in stemming or language-aware matching, which is fine for file names but would be wrong for prose search (that is Tantivy's job, see ADR 0012).
