# Feature Specs

One spec per feature, written **before** implementation. A spec is ~one page: the problem, what's out of scope, numbered Given/When/Then acceptance criteria, edge cases, and a mapping from each AC to the test layer that proves it. **The spec is the test plan** — "done" means the ACs pass in `npm run verify`, not "it seemed fine when clicked around."

This replaces nothing: ADRs in `docs/decisions/` still record *architecture* choices. Specs record *behavior*.

## Locked decisions for the rewrite

These were decided up front (see the old repo's `docs/desktop-rewrite-analysis.md` for full reasoning):

1. **Electron** as the shell — chosen for the mature ecosystem and, above all, testability: Playwright `_electron` and single-engine fidelity (the Chromium you test is the Chromium you ship). The frontend stays shell-agnostic behind a `Platform` port so the decision is cheap to revisit.
2. **Headless-first testing** — the app core is a browser app that happens to run in a shell. `vite dev` + an in-memory platform fake runs the entire editor in a plain browser; Playwright and Vitest Browser Mode drive it headlessly. A deliberately thin real-shell smoke suite covers only native integration.
3. **Automated testing is mandatory from day 0** — CI lands in the same PR as the scaffold, and **no feature PR merges without tests derived from its spec's ACs**. No coverage targets; the ratchet is the rule above.

## Test layers

Each AC maps to exactly one layer (test at the lowest layer that can prove it):

| Layer | Tool | Proves |
|---|---|---|
| Node | Vitest (node) | Pure logic: serialization round-trips, stores, path utils |
| Browser Mode | Vitest Browser Mode (real Chromium) | Component/editor behavior: input rules, toolbar, tables |
| Playwright-vs-vite | Playwright against `vite dev` + `MemoryPlatform` | Full user journeys with fake fs and scripted dialogs |
| Shell smoke | Playwright `_electron` | Native integration only: real fs, menus, dialogs, windows |

## Workflow

1. **Spec** — draft from `TEMPLATE.md` with the next number; resolve open questions; mark **Approved**.
2. **Implement** — write tests named after the ACs (`test('AC3: closing a dirty tab prompts…')`), then the feature, then `npm run verify`.
3. **Close** — flip the spec to **Shipped**. Anything learned that changes the rules goes into CLAUDE.md or an ADR — that's the compound step.

## Index

Ordered foundation-first; each spec builds on the ones before it.

| # | Spec | Depends on |
|---|---|---|
| 0001 | [Application shell & platform foundation](0001-application-shell-and-platform-foundation.md) | — |
| 0002 | [Rich Markdown editing core](0002-rich-markdown-editing-core.md) | 0001 |
| 0003 | [File operations & native menu](0003-file-operations-and-native-menu.md) | 0002 |
| 0004 | [Tab system](0004-tab-system.md) | 0003 |
| 0005 | [Folder mode & file tree sidebar](0005-folder-mode-and-file-tree.md) | 0004 |
| 0006 | [Peeking (preview) tabs](0006-peeking-tabs.md) | 0005 |
| 0007 | [File system watcher](0007-file-system-watcher.md) | 0005 |
| 0008 | [Formatting toolbar](0008-formatting-toolbar.md) | 0002 |
| 0009 | [Links](0009-links.md) | 0008 |
| 0010 | [Tables](0010-tables.md) | 0008 |
| 0011 | [Filename field & rename](0011-filename-field-and-rename.md) | 0003, 0005 |
| 0012 | [In-document search](0012-in-document-search.md) | 0002 |
| 0013 | [Images](0013-images.md) | 0008 |
| 0014 | [Settings & theming](0014-settings-and-theming.md) | 0001 |

## Future spec candidates

Tracked in [BACKLOG.md](BACKLOG.md) — auto-update, source mode, fuzzy file finder, full-text search, expanded settings, external-change conflict handling, sidebar root management. Each entry keeps enough context to draft the spec without re-research; picking one up means drafting it with the next free number and deleting the entry.
