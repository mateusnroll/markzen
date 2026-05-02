# ADR 0012: Full-Text Content Search with Tantivy (In-Memory)

**Status:** Accepted  
**Date:** 2026-05  
**Deciders:** Mateus Pinheiro

## Context

The full-text search feature requires searching across the **body text** of all files in the open folder, returning a ranked list of files and in-context match excerpts — the kind of search found in VS Code's global search panel or Obsidian's full-text search.

This is a fundamentally different problem from the file-name fuzzy filtering in ADR 0011:

- **Volume:** Hundreds of files, each potentially hundreds of lines. Content must be read from disk and tokenised.
- **Ranking:** Raw substring matches are not enough. Results must be sorted by relevance, not just presence.
- **Latency:** Reading and scanning all files on every query is too slow. An index is required.
- **Thread safety:** JavaScript is single-threaded. Reading and indexing hundreds of files in the browser main thread would freeze the editor. Web Workers could help, but add complexity and still live within the memory-constrained WebView process.

**Why not a JS full-text search library (MiniSearch, Orama, FlexSearch)?**

These are solid libraries for client-side search of pre-loaded datasets. The problem is loading the data: all file contents must be read via Tauri fs calls into the JS heap before any indexing can begin. For a folder with 500 markdown files averaging 5 KB each, that is 2.5 MB of content transferred across the IPC bridge, allocated in the WebView heap, and processed on the main thread. The initial index build would cause a multi-second UI freeze. Subsequent queries are fast, but the WebView process bears the full memory cost of holding both the raw content and the index simultaneously.

Rust, running in the Tauri process, can read files directly from the OS without an IPC round-trip and process them off the WebView thread.

**Why not a disk-persistent index?**

Tantivy's segment-based architecture (Lucene-style) imposes a minimum of ~15 MB on disk per index regardless of content size. Each segment is a family of files (term dictionary, postings lists, positions, field norms, document store) with fixed structural overhead.

This is negligible for a single folder. But over months of use, the cost compounds: a user who opens 100 different folders accumulates **1.5 GB+ of stale index data** on the filesystem. Cleanup policies (LRU caps, existence checks for deleted folders) add architectural complexity and are inherently imperfect — moved or renamed folders leave orphaned indexes until the next cleanup pass runs.

The alternative — rebuilding the index in memory on each folder open — has acceptable cost for the expected corpus size, and eliminates the entire disk-management problem.

## Decision

Use **`tantivy`** (Rust crate) as an embedded full-text search engine with an **in-memory index** (`RamDirectory`), exposed to the React frontend via Tauri commands.

### Why in-memory is sufficient

A typical Markzen folder contains ~100 markdown files averaging 500 lines each. At ~60 characters per line, that is ~3 MB of raw text.

| Metric | Typical folder (100 files × 500 lines) | Large folder (1,000 files × 500 lines) |
|---|---|---|
| Raw text | ~3 MB | ~30 MB |
| Index build time | **< 500 ms** | **< 2 s** |
| Memory footprint | **~5–15 MB** | **~20–40 MB** |

Build time is dominated by file I/O (1,000 separate `open()` syscalls) and Tantivy's index construction. Both run in a background Rust thread — the editor is fully usable while the index builds. Search becomes available once the build completes.

A user is unlikely to have many windows open simultaneously with very large folders, so the combined memory footprint stays well within desktop norms. The tradeoff — paying the build cost on every folder open — is sub-second for typical folders, which is imperceptible when backgrounded.

### Why tantivy

- **Embedded:** A library, not a server. No external process, no port, no daemon. Links directly into the Tauri binary.
- **In-memory support:** Tantivy's `RamDirectory` holds the full index in process memory — same API, same query performance, no disk I/O.
- **Inverted index:** Standard Lucene-style index; O(1) lookup per term regardless of corpus size.
- **BM25 ranking:** Industry-standard relevance scoring; puts the most relevant matches first without configuration.
- **Incremental updates:** Files can be added, removed, or updated individually in the in-memory index (delete + re-insert). When external apps or Markzen itself create, modify, or delete files, the `notify`-based file watcher (ADR 0010) fires events and the index updates just the affected documents — no full rebuild required.
- **Performance:** ~50 ms query latency across 10,000 files with a warm index.

### Architecture

```
React frontend                    Rust (Tauri)
──────────────                    ────────────
Folder opens         ──────────►  build_search_index(folder_path)
                                  • Walk directory tree
                                  • Read each .md file
                                  • Tokenise + write to Tantivy RamDirectory
                                  • Index held in Rust process memory

File changes         ──────────►  update_search_index(file_path, op)
(via notify events)               • Delete old doc from in-memory index
                                  • Re-read + re-index file (on write/create)
                                  • Or just delete (on removal)

Indexing progress    ◄──────────  Tauri event: "search-index-progress"
                                  { indexed: u32, total: u32 }

User types query     ──────────►  invoke("search_content", { query })
                                  • Tantivy BM25 query
                                  • Returns top-N results

Search results       ◄──────────  Vec<SearchResult>
                                  { file_path, snippet, score }

Window closes                     Index dropped with Rust state
                                  • Zero cleanup needed
```

### Tauri command signature (Rust)

```rust
#[derive(Serialize)]
pub struct SearchResult {
    pub file_path: String,
    pub snippet:   String,   // surrounding context with match highlighted
    pub score:     f32,
}

#[tauri::command]
pub async fn search_content(
    query: String,
    state: tauri::State<'_, SearchIndex>,
) -> Result<Vec<SearchResult>, String> { ... }
```

### Index memory management

The index lives entirely in Rust process memory via Tantivy's `RamDirectory`. It is created when a folder is opened and dropped when the window is closed. No files are written to disk — no config directory, no cleanup policies, no registry.

Multiple open folders each hold their own index in memory. At ~5–15 MB per typical folder, even 5 simultaneous folders use ~25–75 MB — well within desktop memory budgets.

### Tauri permissions

No new permissions are required beyond what is already declared for the file watcher. File reading for indexing happens in Rust directly (via `std::fs`), scoped to the user-opened folder path consistent with ADR 0010's minimal-permission principle.

### UI surface

- A magnifying-glass icon in the left sidebar (below the file tree icon) toggles a search panel.
- The panel contains a single text input. Results appear below it as the user types (debounced ~200 ms).
- Each result shows the filename, the relative path, and a snippet of surrounding text with the match highlighted.
- Clicking a result opens the file (reusing `openFileFromTree`) and, where feasible, scrolls to the matching line.
- Keyboard shortcut: **Cmd/Ctrl+Shift+F** (standard convention).

### Indexing lifecycle

1. **On folder open:** Build the full index in a background Rust thread. The search panel shows an "Indexing…" indicator while in progress (fed by `search-index-progress` events). The editor is fully usable; search becomes available once the build completes.
2. **On file save (internal or external):** The `notify` watcher detects the change. The saved file is re-read, its old document deleted from the in-memory index, and the updated content re-inserted. This takes milliseconds for a single file.
3. **On file create (external):** The `notify` watcher detects the new file. It is read and inserted into the in-memory index.
4. **On file delete / rename:** The document is removed from the in-memory index. On rename, the file is re-inserted under the new path.
5. **On window close:** The index is dropped with the Rust state. No cleanup is needed.

## Consequences

**Positive:**
- Searching is non-blocking — the WebView thread is never touched by indexing or search I/O.
- BM25 ranking produces immediately useful results without threshold tuning.
- Zero disk footprint — no stale indexes accumulating over months of use, no gigabytes of orphaned data.
- No cleanup infrastructure needed — no LRU policies, no existence checks, no registry files.
- Simpler architecture than disk-persistent indexing — no index versioning, no corruption recovery, no migration between Tantivy versions on upgrade.
- Incremental updates keep the index current as files change, without requiring full rebuilds.
- Tantivy is battle-tested (used in Quickwit, a production-grade search platform).
- Handles thousands of files at low latency; scales well beyond the current use case.

**Negative:**
- Requires writing Rust code. This is the first meaningful custom Rust beyond the file watcher, and introduces Tauri `State` management and async command patterns.
- Every folder open pays the index build cost: ~100–500 ms for typical folders, up to ~2 s for very large ones (1,000+ files). The build is backgrounded, but search is unavailable until it completes.
- Memory footprint of ~5–15 MB per open folder. Acceptable for typical desktop use; would become a concern only with many simultaneous large folders open.
- Adding a new Tauri command requires updating `tauri.conf.json` capability declarations and re-registering the command in `lib.rs`.
- Fuzzy / typo-tolerant matching in content search is more limited than fuzzysort. Tantivy supports prefix queries and fuzzy term distance (edit distance 1–2) but it is not a first-class feature. For file-name fuzzy matching, ADR 0011's fuzzysort remains the right tool.
