# Contributing to Markzen

Thank you for your interest in contributing to Markzen! This guide covers everything you need to get started.

## Prerequisites

- [Node.js](https://nodejs.org/) 20.x or later
- [Rust](https://rustup.rs/) (stable toolchain)
- [Tauri CLI](https://v2.tauri.app/start/prerequisites/) — `cargo install tauri-cli`
- Platform-specific dependencies:
  - **macOS**: Xcode Command Line Tools
  - **Linux**: `sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev`
  - **Windows**: Microsoft Visual Studio C++ Build Tools, WebView2 (pre-installed on Windows 10/11)

## Getting Started

```bash
# Clone the repo
git clone https://github.com/markzen/markzen.git
cd markzen

# Install frontend dependencies
npm install

# Run in development mode (starts both Vite dev server and Tauri)
npm run tauri dev
```

The app should open within a few seconds. Vite provides hot module replacement — most frontend changes appear instantly.

## Project Structure

```
markzen/
├── src-tauri/          # Rust backend (Tauri shell, file watcher)
├── src/                # React frontend (editor, UI, state)
├── e2e/                # End-to-end tests (WebdriverIO)
├── docs/
│   ├── decisions/      # Architecture Decision Records
│   └── product/        # Product positioning docs
├── CLAUDE.md           # AI agent context (project overview for Claude Code)
└── CONTRIBUTING.md     # This file
```

See [CLAUDE.md](CLAUDE.md) for a full architectural overview and the [ADRs](docs/decisions/) for the reasoning behind each major technical decision.

## Development Workflow

### Branch Naming

- `feature/<short-description>` — new features
- `fix/<short-description>` — bug fixes
- `docs/<short-description>` — documentation changes

### Making Changes

1. Create a branch from `main`
2. Make your changes
3. Ensure all tests pass (see below)
4. Submit a pull request

### Code Style

- **TypeScript**: Strict mode (`"strict": true`). No `any` types in production code.
- **Rust**: Standard `rustfmt` formatting. Run `cargo fmt` before committing.
- **Comments**: Avoid unless explaining *why*, not *what*. Well-named identifiers should be self-documenting.
- **No feature flags or backward-compatibility shims** — change the code directly.

## Testing

We use a four-layer test pyramid. See [ADR 0009](docs/decisions/0009-testing-strategy.md) for the full strategy.

### Running Tests

```bash
# Frontend unit tests + editor behavior tests (fast, no binary needed)
npm run test           # watch mode
npm run test:ci        # single run
npm run test:coverage  # with coverage report

# Rust unit tests
cd src-tauri && cargo test

# E2E tests (requires built binary, Linux/Windows only)
npm run tauri build
cd e2e && npm ci && npm test
```

### Test Conventions

- Test files are **co-located** with source files: `tabsStore.ts` → `tabsStore.test.ts`
- E2E tests live in a separate `e2e/` directory (separate package, needs built binary)
- TipTap editor tests require DOM polyfills — these are configured in `src/test/setup.ts`

### What to Test

- **Zustand stores**: Pure logic, test directly without rendering components
- **Custom hooks**: Use `renderHook` from React Testing Library
- **UI components**: Test behavior (user interactions, rendered output), not implementation
- **Editor input rules**: Use the `createTestEditor` helper with character-by-character dispatch
- **Serialization**: Round-trip tests (`Markdown → ProseMirror → Markdown`) for every supported syntax

## Architecture Decisions

Major technical decisions are documented as [Architecture Decision Records](docs/decisions/). If your contribution involves a significant architectural change, please open an issue to discuss before implementing — and consider writing a new ADR.

| ADR | Decision |
|---|---|
| [0001](docs/decisions/0001-tauri-over-electron.md) | Tauri 2.x over Electron |
| [0002](docs/decisions/0002-react-typescript-vite.md) | React + TypeScript + Vite |
| [0003](docs/decisions/0003-tiptap-as-rich-editor.md) | TipTap as rich editor core |
| [0004](docs/decisions/0004-dual-mode-editing.md) | Dual-mode editing (Rich + Source) |
| [0005](docs/decisions/0005-zustand-for-state.md) | Zustand for state management |
| [0006](docs/decisions/0006-tailwind-css-theming.md) | Tailwind CSS + CSS custom properties |
| [0007](docs/decisions/0007-unified-remark-rehype.md) | unified/remark/rehype pipeline |
| [0008](docs/decisions/0008-tiptap-markdown-serialization.md) | @tiptap/markdown for serialization |
| [0009](docs/decisions/0009-testing-strategy.md) | Four-layer testing strategy |
| [0010](docs/decisions/0010-tauri-plugins-over-custom-rust.md) | Tauri plugins over custom Rust |

## Editor Architecture — Key Concepts

If you're working on the editor, understand these two independent systems:

1. **Input Rules (Layer 1)** — Transforms Markdown syntax as the user types (e.g., `## ` becomes an H2). Provided by TipTap's StarterKit extensions. Fires on every keystroke. Never disable `enableInputRules`.

2. **Serialization (Layer 2)** — Converts between Markdown strings and ProseMirror's internal document model. Used only on file open, file save, and mode switch. Uses `@tiptap/markdown`. Never run this on every keystroke.

These layers are independent. Input rules never call the serializer. The serializer never fires input rules. Both must work correctly.

## Building for Production

```bash
# Build for your current platform
npm run tauri build

# Build for a specific target
npm run tauri build -- --target x86_64-apple-darwin
npm run tauri build -- --target x86_64-pc-windows-msvc
npm run tauri build -- --target x86_64-unknown-linux-gnu
```

Output: `.dmg` (macOS), `.msi` (Windows), `.AppImage` (Linux) in `src-tauri/target/release/bundle/`.

## Reporting Issues

- Use [GitHub Issues](https://github.com/markzen/markzen/issues)
- Include: OS and version, steps to reproduce, expected vs. actual behavior
- For editor bugs: note whether the issue is in rich mode, source mode, or both
- For rendering issues: note which platform (WebKit vs. WebView2 differences are expected)

## License

Markzen is [MIT licensed](LICENSE). By contributing, you agree that your contributions will be licensed under the same terms.
