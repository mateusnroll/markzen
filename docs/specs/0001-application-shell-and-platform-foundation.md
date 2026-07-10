# Spec 0001: Application Shell & Platform Foundation

**Status:** Draft   **Date:** 2026-07
**Origin:** Old repo commits `31848ad` (Tauri+React+TipTap bootstrap), `517896a`/`60f2fc7` (window chrome); rewrite analysis §1–§3. Shell switched from Tauri to Electron.

## Problem

Every feature needs a shell (window, chrome, IPC), a frontend scaffold, and — per the rewrite's day-0 rule — a verification pipeline that Claude and CI can run headlessly. The old repo bootstrapped the shell but never the tests; this spec makes the testing infrastructure part of the foundation itself, so nothing can be built on top without it.

## Non-goals

- Any editor functionality (spec 0002).
- File open/save flows, menus beyond the default (spec 0003).
- Auto-update, code signing, installers, crash reporting.
- Multi-window folder mode (spec 0005) — this spec covers a single main window.
- Porting back to Tauri — but the `Platform` port must keep that path open.

## Behavior (acceptance criteria)

- AC1: Given the packaged/dev Electron app, when it launches, then a single frameless window appears (no native title bar) with, on macOS, traffic lights inset via `titleBarStyle: 'hiddenInset'` + `trafficLightPosition`, and the top bar acts as a drag region.
- AC2: Given the renderer codebase, when any module outside `src/platform/` imports `electron` or Electron-specific APIs, then lint fails (`no-restricted-imports`). All shell access goes through one `Platform` interface (`fs`, `dialog`, `window`, `shell`).
- AC3: Given `vite dev` opened in a plain browser (no shell), when the app boots, then it runs fully on `MemoryPlatform` — an in-memory file tree, scripted dialog queue, and triggerable watcher events — with no runtime errors.
- AC4: Given a dev build, when the URL includes `?fixture=<name>`, then `MemoryPlatform` boots pre-loaded with that named fixture tree (fixture corpus ported from the old repo's `src/test/fixtures/`).
- AC5: Given the repo, when `npm run verify` runs, then it executes `tsc --noEmit`, the Vitest suite (node + Browser Mode), and the Playwright browser project against vite + `MemoryPlatform`, exiting non-zero on any failure. `npm run verify:shell` additionally runs the Playwright `_electron` smoke suite.
- AC6: Given a PR, when CI runs, then `verify` executes on every push, and the shell smoke suite runs on a macOS + Linux + Windows matrix.
- AC7: Given the shell smoke suite, when it launches the real app via Playwright `_electron`, then it can read the window title, take a screenshot, and round-trip a file through the real `Platform.fs` implementation.
- AC8: Given any interactive element in the UI, when it is added, then it carries a stable `data-testid` (enforced as a review/CLAUDE.md rule; spot-checked by tests that select only via test ids).

## Constraints

- One language: main process is TypeScript, testable by Vitest directly.
- Dialogs in the main process expose a debug-only hook (e.g. `__setNextDialogResult`) gated behind an env flag, so shell-smoke tests never hit a real native dialog.
- CLAUDE.md in this repo states `npm run verify` as *the* verification step from the first commit.
- A project `/verify` skill (`.claude/skills/verify/`) lands in the same PR as the pipeline: it runs `npm run verify` and, on failure, pastes the failing test output so the fix loop starts immediately.
- Packaging uses **electron-builder** — decided so auto-update can later ship via electron-updater's GitHub Releases provider with zero-cost infrastructure across all three platforms (see [BACKLOG.md](BACKLOG.md)).

## Edge cases

- Browser boot with `window.__SHELL__` absent vs. present (Electron preload sets it) — wrong detection must not silently pick the fake in production.
- `?fixture=` must be inert in production builds.
- Window close with the default empty renderer must exit cleanly (no orphan main process).

## Test mapping

| AC | Layer |
|----|-------|
| AC1 | Shell smoke |
| AC2 | Lint (CI step in `verify`) |
| AC3 | Playwright-vs-vite |
| AC4 | Playwright-vs-vite |
| AC5 | CI (the pipeline itself) |
| AC6 | CI |
| AC7 | Shell smoke |
| AC8 | Playwright-vs-vite |

## Open questions

- (none — packager resolved to electron-builder, see Constraints)
