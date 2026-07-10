# Markzen

Open-source, cross-platform Markdown editor — Electron + React + TypeScript + TipTap. This is a ground-up rewrite of `markzen-old` (Tauri); the rewrite's reasoning lives in the old repo's `docs/desktop-rewrite-analysis.md`.

## The one rule: spec before code

**No feature work without a spec.** Every behavior change starts as a numbered spec in [docs/specs/](docs/specs/) (copy `TEMPLATE.md`, take the next free number) and follows the workflow in [docs/specs/README.md](docs/specs/README.md). Two project skills drive it: **`/spec <feature>`** drafts a spec (interviews for non-goals/edge cases, sweeps other specs for ripples), and **`/implement <spec>`** builds it — refusing to start unless the spec is Approved with no open questions:

1. **Spec** — Problem, Non-goals, numbered Given/When/Then acceptance criteria, edge cases, AC→test-layer mapping. Open questions must be resolved and the spec marked **Approved** before implementation starts.
2. **Implement** — write tests named after the ACs first (`test('AC3: closing a dirty tab prompts…')`), then the feature, then run `npm run verify`.
3. **Close** — flip the spec to **Shipped**. Feed durable learnings back into this file or an ADR (the compound step).

Corollaries:

- **The spec is the test plan.** "Done" means the ACs pass in `npm run verify` — not "it looked fine when clicked around".
- **No feature PR merges without tests derived from its spec's ACs.** This is the ratchet; there are deliberately no coverage targets.
- Bug fixes don't need a new spec, but they do need a regression test — and if the fix changes specced behavior, update the spec's ACs in the same PR.
- Ideas that aren't scheduled yet go to [docs/specs/BACKLOG.md](docs/specs/BACKLOG.md) with enough context to draft the spec later without re-research. Picking one up = draft it under the next free number, delete the entry.
- Architecture decisions get ADRs in `docs/decisions/`; specs record *behavior*, ADRs record *why the stack looks like this*. Don't mix them.

## Locked decisions

Decided up front — don't relitigate casually (changing one means updating the affected specs first):

- **Electron** as the shell, **electron-builder** as the packager (spec 0001). Chosen for testability (Playwright `_electron`, single-engine fidelity) and a zero-cost auto-update path (see BACKLOG.md).
- **Headless-first testing.** The app core is a browser app behind a `Platform` port; `MemoryPlatform` makes everything except native integration testable without building Electron.
- **Automated testing is mandatory from day 0.** The verify pipeline and CI land with the scaffold (spec 0001), not after.

## Verification

`npm run verify` is **the** verification step for every change: `tsc --noEmit` + Vitest (node + Browser Mode) + Playwright against `vite dev` + `MemoryPlatform`. `npm run verify:shell` adds the thin Playwright `_electron` smoke suite. (Both are defined by spec 0001 — until it ships, verify means the closest available subset, starting with `tsc --noEmit`.)

Test layers — test each AC at the lowest layer that can prove it:

| Layer | Tool | Scope |
|---|---|---|
| Node | Vitest | Pure logic: serialization round-trips, stores, path utils |
| Browser Mode | Vitest Browser Mode (real Chromium) | Component/editor behavior, input rules (typed character-by-character) |
| Playwright-vs-vite | Playwright + `MemoryPlatform` | User journeys with scripted dialogs and fixtures (`?fixture=<name>`) |
| Shell smoke | Playwright `_electron` | Native integration only — keep it thin |

## Non-negotiable constraints

1. **Nothing outside `src/platform/` imports `electron`** or shell-specific APIs (enforced by ESLint `no-restricted-imports`). All shell access goes through the `Platform` interface — this keeps the core headless-testable and the shell choice reversible.
2. **Round-trip serialization integrity is critical.** `parse(serialize(doc))` must equal `parse(original)` across the fixture corpus. Failures mean user data loss.
3. **Two editor layers, never confused:** input rules (live typing → rich nodes) vs. `@tiptap/markdown` serialization (disk I/O, on open/save only). Never disable input rules; never serialize on keystroke.
4. **Editor content lives in ProseMirror state**, not React/Zustand. Sync to the store on blur and before save only.
5. **Every interactive element gets a stable `data-testid`.** Tests select by test id, not by CSS or text.
6. **TypeScript strict mode; no `any` in production code.**
7. **Editor-behavior tests type character-by-character** — `setContent()` bypasses input rules and proves nothing about typing.
