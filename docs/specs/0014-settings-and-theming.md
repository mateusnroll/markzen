# Spec 0014: Settings & Theming

**Status:** Draft   **Date:** 2026-07
**Origin:** Old repo `SettingsModal.tsx`, `settingsStore.ts`, `settingsPersistence.ts`, `themeManager.ts`; commit `8883f89`; old ADRs 0006, 0013.

## Problem

Users expect the app to remember their preferences — theme, toolbar mode, sidebar width — across restarts, apply them instantly, and keep multiple windows consistent. The old app shipped three settings; this spec is the durable mechanism those and future settings (fonts, line width, auto-save) plug into.

## Non-goals

- The future settings themselves (font family/size, line width, auto-save, spell check) — the mechanism must accommodate them, but they ship as their own specs.
- Settings sync between machines; import/export.
- A settings search UI.

## Behavior (acceptance criteria)

- AC1: Given the app, when the user invokes Settings… (Cmd/Ctrl+,), then a modal opens; Escape, the × button, or a backdrop click closes it.
- AC2: Given the Theme select (System / Light / Dark), when changed, then the UI and editor recolor immediately (CSS custom-property theme class on the root element — no reload, no re-render flash).
- AC3: Given theme "System", when the OS appearance changes while the app runs, then the app follows live.
- AC4: Given the Toolbar select (Minimal / Regular), when changed, then the editor toolbar switches mode immediately (spec 0008 consumes this).
- AC5: Given any settings change (including sidebar-width drags from spec 0005), then it persists to a single flat `settings.json` in the platform config directory (Electron `userData`), written debounced (~300ms), and is restored on next launch.
- AC6: Given a missing, corrupt, or partially invalid `settings.json`, when the app loads, then each invalid key falls back to its default independently — the file never crashes startup, and unknown keys are preserved on rewrite.
- AC7: Given two open windows, when a setting changes in one, then the other applies it immediately (broadcast via main process).
- AC8: Given rapid consecutive changes (dragging the sidebar), then writes coalesce (debounce) and the final state is what persists.

## Edge cases

- First launch (no config dir yet) — created on demand.
- Two windows changing settings near-simultaneously — last write wins, both converge.
- Settings load must not block first paint; defaults render, then loaded values apply.

## Test mapping

| AC | Layer |
|----|-------|
| AC1, AC2, AC4 | Browser Mode |
| AC3 | Browser Mode (emulate `prefers-color-scheme` change) |
| AC5, AC6, AC8 | Node (persistence module against fake fs) + Playwright-vs-vite (restore journey) |
| AC7 | Shell smoke (two real windows) |

## Open questions

- (none)
