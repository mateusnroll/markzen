# Markzen

Repository instructions for any coding agent or development environment.

Markzen is an open-source, cross-platform Markdown editor built with Electron, React, TypeScript, and TipTap. This is a ground-up rewrite of `markzen-old` (Tauri). Read [docs/specs/README.md](docs/specs/README.md) before changing behavior.

## The one rule: spec before code

**No feature work without a numbered spec.** The initial rewrite is organized as five linear, verifiable milestones in [docs/specs/](docs/specs/):

1. **Spec** — resolve the behavior, non-goals, numbered acceptance criteria, constraints, and AC-to-test mapping. Status stays **Draft** until the user explicitly marks it **Approved**.
2. **Implement** — write AC-named tests first, implement the behavior, record durable architecture in ADRs, and run verification.
3. **Close** — when every mapped test and required verification passes and every simplicity finding is resolved, mark the spec **Implemented**.

The five rewrite milestones are implemented in order. Later feature work takes the next free number and must identify any prerequisite behavior it relies on.

Scenario routing is strict:

- Observable and in scope → numbered AC.
- Deliberately excluded → Non-goal.
- Unresolved → Open question; Approved specs have none.
- Architectural rationale → Constraint or ADR.
- Deferred behavior → [BACKLOG.md](docs/specs/BACKLOG.md).

Corollaries:

- **The spec is the test plan.** Done means every AC passes at its mapped layer.
- Split ACs when outcomes can fail independently or require different proof layers.
- Each AC has one primary proof layer; additional integration coverage is optional and explicit.
- Bug fixes need a regression test. If behavior changes, update and reapprove the affected spec.
- Architecture decisions live in `docs/decisions/`. Milestone 0001 creates the directory and its first ADR; later milestones add decisions when they become executable.
- Local `~/dev/markzen-old` material may be researched when available, but do not copy its code, fixtures, ADRs, or documents into this repository.

## Simplicity discipline

1. Do not build behavior outside the current Approved spec.
2. Reuse an existing helper, type, or pattern before adding another.
3. Prefer the standard library, browser or Electron capabilities, and already-installed dependencies over custom code or new packages.
4. Do not add speculative abstractions, configuration, extension points, dependencies, or scaffolding.
5. Choose the smallest clear implementation that satisfies every acceptance criterion; line count is a diagnostic, not a target.
6. Never simplify away trust-boundary validation, data-loss handling, security, serialization integrity, async ownership, accessibility, cross-platform behavior, or required verification.

## Verification

`npm run verify` is **the** verification step: ESLint + `tsc --noEmit` + Vitest (Node and Browser Mode) + Playwright against `vite dev` with `MemoryPlatform`. `npm run verify:shell` adds the thin Playwright `_electron` smoke suite. Until milestone 0001 is Implemented, run the closest available subset.

| Layer | Tool | Scope |
|---|---|---|
| Static | ESLint + TypeScript | Import boundaries, code rules, and type contracts |
| Node | Vitest | Pure logic, schemas, serialization, path identity, stores |
| Browser Mode | Vitest Browser Mode | Components, editor behavior, keyboard/focus/accessibility |
| Playwright-vs-vite | Playwright + `MemoryPlatform` | Complete browser journeys with scripted dialogs and fixtures |
| Shell smoke | Playwright `_electron` | Native integration, IPC security, menus, windows, real filesystem |
| CI | GitHub Actions | Verification orchestration, platform matrix, and required artifacts |

## Non-negotiable engineering constraints

1. **Platform boundary.** Nothing outside `src/platform/` imports Electron or shell-specific APIs. The preload exposes only typed capabilities; the main process validates IPC senders and payloads.
2. **Secure renderers.** Keep Node integration disabled, context isolation and sandboxing enabled, CSP restrictive, permissions denied by default, and renderer navigation/popups blocked.
3. **Window-scoped authority.** Main-owned `WindowId`, `TabId`, and `RootId` values scope resources and events. Renderer-provided IDs never grant authority.
4. **Canonical identity.** UI uses display paths; equality, deduplication, containment, and reservations use Platform-provided canonical `FileKey` values.
5. **Async ownership.** Async work captures its owner and generation before awaiting and commits only if both remain current. Never write through “the active tab/root” after an await.
6. **Shared save transaction.** All document writes use the save coordinator and failure-atomic writer. A save clears only the snapshot it committed; later edits remain dirty.
7. **Serialization integrity.** Parsing must match independently authored expected models, serialization must match approved goldens, and unsupported/raw content must be preserved or saving blocked. Silent loss is a release blocker.
8. **Editor state.** Content lives in ProseMirror state, not React/Zustand. Sync metadata on blur/save as required; never serialize on keystroke.
9. **Input-rule tests.** Type character-by-character. `setContent()` bypasses input rules and cannot prove typing behavior.
10. **Accessibility.** Every pointer action has a keyboard path; hover UI appears on focus; state is not visual-only; roles/names/states and focus behavior are correct; reduced motion and forced colors are respected.
11. **Selectors.** Functional tests use stable `data-testid` values. Accessibility assertions may query roles, accessible names, labels, and states.
12. **Types.** TypeScript strict mode; no `any` in production code.

## Git hygiene

- A fresh worktree is stale until proven otherwise. Fetch `origin`, compare with `origin/main`, and rebase before starting if the base moved.
- Preserve unrelated worktree changes and never use destructive resets to solve local conflicts.
