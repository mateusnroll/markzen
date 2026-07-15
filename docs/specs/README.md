# Rewrite Milestone Specs

The Electron rewrite is defined by five linear milestone specs. Each milestone produces a user-visible, independently verifiable checkpoint and is implemented only after the previous milestone is **Implemented**. After the rewrite, new behavior gets the next free numbered spec.

The spec is the test plan: every observable in-scope behavior is a numbered acceptance criterion, and every AC has one primary test layer.

## Status lifecycle

- **Draft** — still under design; implementation is forbidden.
- **Approved** — decision-complete, with no open questions, and explicitly approved by the user.
- **Implemented** — implementation and all mapped tests exist, required verification is green, and the simplicity review is dispositioned. This does not mean released.

If Implemented behavior changes, return the spec to Draft, update and reapprove it, then restore Implemented only after verification passes.

### Polish prototype exception

`$polish` may explore visual presentation, existing-control interactions, accessibility states, and shell chrome as an uncommitted prototype before drafting the final behavior contract. `CLAUDE.md` defines the exact boundary. The prototype branch must keep its starting `HEAD` unchanged and may not be committed or pushed.

When the user ends the session, the normal lifecycle resumes at Draft. Approval, AC coverage, baseline-failure proof, verification, review, and close remain mandatory as defined by `CLAUDE.md` and the repository skills.

## Milestones

| # | Milestone | Verification checkpoint |
|---|---|---|
| 0001 | [Secure runtime and verification](0001-secure-runtime-and-verification.md) | Secure multi-window shell, browser fake, CI, and shell smoke |
| 0002 | [Document lifecycle and tabs](0002-document-lifecycle-and-tabs.md) | Loss-safe editing, opening, saving, renaming, switching, and closing |
| 0003 | [Folder workspaces](0003-folder-workspaces.md) | Multi-root folder windows, preview tabs, live trees, and persisted workspace settings |
| 0004 | [Everyday writing experience](0004-everyday-writing-experience.md) | Accessible formatting, links, search, themes, and toolbar preferences |
| 0005 | [Structured content and local assets](0005-structured-content-and-assets.md) | Accessible tables and securely rendered local images |

Post-rewrite feature specs continue the same lifecycle:

| # | Feature | Status |
|---|---|---|
| 0006 | [Remote and embedded images](0006-remote-and-embedded-images.md) | Draft |

## Scenario routing

- Observable and in scope → numbered AC.
- Deliberately excluded → Non-goal.
- Unresolved → Open question.
- Implementation-shaping invariant → Constraint.
- Architectural rationale → ADR in `docs/decisions/`.
- Deferred behavior → [BACKLOG.md](BACKLOG.md).

There is no separate Edge Cases section. Failure, cancellation, concurrency, accessibility, security, privacy, recovery, platform, and performance behavior must be ACs when applicable. Split an AC whenever its outcomes can fail independently or need different proof layers.

## Test layers

Each AC maps to one primary layer: the lowest layer that can prove the whole criterion. Supporting integration coverage is optional and listed separately.

| Layer | Tool | Proves |
|---|---|---|
| Static | ESLint + TypeScript | Import boundaries, code rules, and type contracts |
| Node | Vitest | Pure logic, serialization, schemas, path identity, stores |
| Browser Mode | Vitest Browser Mode | Components, editor behavior, keyboard/focus/accessibility |
| Playwright-vs-vite | Playwright + `MemoryPlatform` | Complete browser journeys with fake filesystem and scripted dialogs |
| Shell smoke | Playwright `_electron` | Native integration only: Electron security, IPC, menus, windows, real filesystem |
| CI | GitHub Actions | Verification orchestration, platform matrix, and required artifacts |

Tests are named after the AC: `test('AC12: a later edit remains dirty after save completes')`.

## Workflow

1. **Draft** — use [TEMPLATE.md](TEMPLATE.md), resolve decisions, sweep related specs and backlog entries, run an independent simplicity challenge, and leave status Draft.
2. **Approve** — the user reviews the approval checklist and explicitly changes status to Approved.
3. **Implement** — write mapped AC tests first, implement, add required ADRs, and run `npm run verify` plus mapped shell smoke.
4. **Review** — after the first green verification, run an independent simplicity review, apply or rebut every finding, and rerun required verification after edits.
5. **Close** — mark Implemented only when every AC passes, required verification is green, and no simplicity finding remains unresolved.

## Approval checklist

- Open questions are empty and non-goals are explicit.
- Every normative in-scope behavior is a numbered, independently testable AC.
- Every AC has exactly one primary test mapping; supporting coverage is explicit.
- Failure/recovery, cancellation, concurrency, platform behavior, and performance are resolved where applicable.
- Accessibility, security, and privacy have been reviewed and expressed as ACs where applicable.
- The independent simplicity challenge is dispositioned; current behavior is necessary, and existing, standard, or native alternatives have been considered.
- Cross-spec references, backlog entries, and required ADRs are accurate.

## Decisions and local research

Specs describe behavior and constraints. ADRs describe why architecture takes a particular shape. Milestone 0001 creates `docs/decisions/` and the first security/capability ADR.

The old repository may be consulted locally when present, but no old code, fixtures, ADRs, or documents are copied into this repository during the rewrite. Origins may retain references that identify prior behavior.

## Future work

Future candidates live in [BACKLOG.md](BACKLOG.md). Picking one up means drafting the next free spec and deleting or narrowing its backlog entry.
