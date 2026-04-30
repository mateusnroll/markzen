# Markzen

Open-source, cross-platform Markdown editor. Fast, beautiful, focused.

## What This Is

Markzen is an inline WYSIWYG Markdown editor built on Tauri 2.x + React 19 + TipTap 3.x. It targets macOS, Windows, and Linux from a single codebase. The product sits at the intersection of iA Writer (writing elegance) and Obsidian (file-system freedom), but faster and open-source.

## Stack

| Layer | Technology | ADR |
|---|---|---|
| Shell | Tauri 2.x (Rust backend, native WebView) | [0001](docs/decisions/0001-tauri-over-electron.md) |
| UI | React 19 + TypeScript 5.x (strict) + Vite 8 | [0002](docs/decisions/0002-react-typescript-vite.md) |
| Rich editor | TipTap 3.x (ProseMirror) | [0003](docs/decisions/0003-tiptap-as-rich-editor.md) |
| Source editor | CodeMirror 6 (toggle via Cmd/Ctrl+E) | [0004](docs/decisions/0004-dual-mode-editing.md) |
| Serialization | @tiptap/markdown (NOT community tiptap-markdown) | [0008](docs/decisions/0008-tiptap-markdown-serialization.md) |
| Markdown pipeline | unified / remark / rehype (utilities only) | [0007](docs/decisions/0007-unified-remark-rehype.md) |
| State | Zustand 4.x (3 stores: tabs, fileSystem, settings) | [0005](docs/decisions/0005-zustand-for-state.md) |
| Styling | Tailwind CSS 3.x + CSS custom properties | [0006](docs/decisions/0006-tailwind-css-theming.md) |
| File I/O | Tauri plugins (fs, dialog, shell) + notify crate | [0010](docs/decisions/0010-tauri-plugins-over-custom-rust.md) |
| Testing | Vitest + RTL + cargo test + WebdriverIO | [0009](docs/decisions/0009-testing-strategy.md) |

## Non-Negotiable Constraints

1. **Sub-500ms cold start, 60fps typing/scrolling.** All file I/O is async via Tauri commands. Never block the main thread.
2. **Editor has two independent layers — never confuse them.**
   - Layer 1 (Input Rules): live Markdown-to-rich-node conversion as user types. Provided by StarterKit. Never disable `enableInputRules`.
   - Layer 2 (Serialization): Markdown ↔ ProseMirror conversion for disk I/O and mode switch. Uses `@tiptap/markdown`. Never run this on every keystroke.
3. **Use `@tiptap/markdown` for serialization** — not custom remark pipelines, not the community `tiptap-markdown` package.
4. **Editor content lives in ProseMirror state**, not React/Zustand state. Sync to Zustand on blur and before save only.
5. **TypeScript strict mode.** No `any` in production code.
6. **Tauri permissions must be minimal.** Don't enable broad `fs:allow-read-recursive` — scope to user-opened paths.
7. **No `window.localStorage` for file content.** All persistence through Tauri fs. localStorage is only for ephemeral UI state.
8. **Round-trip serialization integrity is a critical requirement.** `parse(serialize(doc))` must produce the same document. Failures mean data loss.

## Repository Structure

```
markzen/
├── src-tauri/              # Rust backend (Tauri)
│   ├── src/
│   │   ├── main.rs
│   │   ├── lib.rs
│   │   └── commands/       # Custom Tauri commands (file watcher)
│   ├── Cargo.toml
│   └── tauri.conf.json
├── src/                    # React frontend
│   ├── components/
│   │   ├── layout/         # AppShell, TitleBar, Sidebar, TabBar
│   │   ├── editor/         # EditorPane, RichEditor, SourceEditor, Toolbar, StatusBar
│   │   ├── filetree/       # FileTree, FileTreeNode, FileTreeActions
│   │   └── ui/             # Button, Tooltip, ContextMenu, Modal
│   ├── store/              # Zustand stores (tabs, fileSystem, settings)
│   ├── hooks/              # useFileSystem, useTabManager, useAutoSave, useKeyboardShortcuts, useTheme
│   ├── lib/                # tiptapExtensions.ts, markdown.ts, constants.ts
│   ├── styles/             # Tailwind base, editor CSS, theme files
│   └── types/              # TypeScript type definitions
├── e2e/                    # WebdriverIO E2E tests (separate package)
├── docs/
│   ├── decisions/          # Architecture Decision Records (ADR 0001-0010)
│   └── product/            # Product marketing and positioning
└── CONTRIBUTING.md
```

## Testing

Four-layer pyramid — see [ADR 0009](docs/decisions/0009-testing-strategy.md):

- **Rust**: `cd src-tauri && cargo test`
- **Frontend**: `npm run test` (Vitest + RTL, jsdom)
- **Editor behavior**: same Vitest suite, TipTap headless in jsdom (requires DOM polyfills for ProseMirror)
- **E2E**: `cd e2e && npm test` (WebdriverIO + tauri-driver, Linux/Windows only)

Test files are co-located with source (e.g., `tabsStore.test.ts` next to `tabsStore.ts`).

## Key Shortcuts

| Shortcut | Action |
|---|---|
| Cmd/Ctrl+E | Toggle rich/source mode |
| Cmd/Ctrl+\ | Toggle sidebar |
| Cmd/Ctrl+T | New tab |
| Cmd/Ctrl+W | Close tab |
| Cmd/Ctrl+S | Save |
| Cmd/Ctrl+Shift+S | Save As |
| Cmd/Ctrl+N | New file |
| Cmd/Ctrl+O | Open file |

## Implementation Phases

1. Foundation — Tauri + React + TipTap integration, input rules verification, round-trip tests
2. Tabs & File Operations — tab system, open/save/close flows
3. Source Mode — CodeMirror 6, mode toggle, bidirectional sync
4. Folder & File Tree — sidebar, file tree, file watcher
5. Polish & Settings — themes, settings modal, status bar, auto-save
6. QA & Release — cross-platform testing, CI/CD, code signing
