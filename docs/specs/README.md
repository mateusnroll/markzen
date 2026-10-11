# Rewrite Milestone Specs

The Electron rewrite is defined by five linear milestone specs. Each milestone produces a user-visible, independently verifiable checkpoint and is implemented only after the previous milestone is **Implemented**. After the rewrite, new behavior gets the next free numbered spec.

The spec is the test plan: every observable in-scope behavior is a numbered acceptance criterion, and every AC has one primary test layer.

## Status lifecycle

- **Draft** — still under design; implementation is forbidden.
- **Approved** — decision-complete, with no open questions, and approved under the policy below.
- **Implemented** — implementation and all mapped tests exist, required verification is green, and the simplicity review is dispositioned. This does not mean released.

If Implemented behavior changes, return the spec to Draft, update and reapprove it, then restore Implemented only after verification passes.

### Polish prototype exception

`$polish` may explore visual presentation, existing-control interactions, accessibility states, and shell chrome as an uncommitted prototype before drafting the final behavior contract. `CLAUDE.md` defines the exact boundary. A session may retain a current implementation branch after committing its complete `$implement` worktree, or create a dedicated polish branch for standalone work. The selected branch must keep its baseline `HEAD` unchanged and may not commit or push prototype changes; publication from an implementation baseline updates its existing branch and PR.

When the user ends the session, the normal lifecycle resumes at Draft. Approval, AC coverage, baseline-failure proof, verification, review, and close remain mandatory as defined by `CLAUDE.md` and the repository skills.

## Milestones

| # | Milestone | Status | Verification checkpoint |
|---|---|---|---|
| 0001 | [Secure runtime and verification](0001-secure-runtime-and-verification.md) | Implemented | Secure multi-window shell, browser fake, CI, and shell smoke |
| 0002 | [Document lifecycle and tabs](0002-document-lifecycle-and-tabs.md) | Implemented | Loss-safe editing, opening, saving, renaming, switching, and closing |
| 0003 | [Folder workspaces](0003-folder-workspaces.md) | Implemented | Multi-root folder windows, preview tabs, live trees, and persisted workspace settings |
| 0004 | [Everyday writing experience](0004-everyday-writing-experience.md) | Implemented | Accessible formatting, links, search, themes, and toolbar preferences |
| 0005 | [Structured content and local assets](0005-structured-content-and-assets.md) | Implemented | Accessible tables and securely rendered local images |

Specs 0002, 0003, and 0009 were revised with spec 0011 after the user accepted
the shared Open, title, command, tree-row, symlink, and preview findings. All
four returned to Implemented together after their mapped tests, independent
simplicity review, and browser plus packaged-shell verification passed.

Spec 0011 returned to Draft after desktop testing established that unrecognized valid UTF-8 files should join the generic-text editor and path-known languages should use a full-panel CodeBlockLowlight presentation. The user approved that revision, and it returned to Implemented after mapped tests, two independent simplicity reviews, browser verification, and packaged-shell verification passed. Specs 0002, 0003, 0009, and 0010 retain their Implemented specialized contracts.

Post-rewrite feature specs continue the same lifecycle:

| # | Feature | Status |
|---|---|---|
| 0006 | [Remote and embedded images](0006-remote-and-embedded-images.md) | Implemented |
| 0007 | [Native chrome and editor polish](0007-native-chrome-and-editor-polish.md) | Implemented |
| 0008 | [Opt-in pseudonymous usage and crash diagnostics](0008-opt-in-pseudonymous-telemetry.md) | Draft |
| 0009 | [First-class CSV documents](0009-first-class-csv-documents.md) | Implemented |
| 0010 | [First-class JSON documents](0010-first-class-json-documents.md) | Implemented |
| 0011 | [Other file types](0011-other-file-types.md) | Implemented |
| 0012 | [Nested list presentation](0012-nested-list-presentation.md) | Implemented |
| 0013 | [Table and image reordering](0013-table-and-image-reordering.md) | Implemented |
| 0014 | [Fuzzy file finder and tab quick switcher](0014-fuzzy-file-finder-and-tab-switcher.md) | Implemented |

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
2. **Approve** — someone other than the writer reviews the exact spec digest against the approval checklist, records the approval, and changes status to Approved.
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

## Approval policy

A spec must be approved by someone other than its writer. The approver may be a human or an independent Review Agent.

- Record the writer identity, approver identity, and exact spec digest in the spec.
- Self-approval is invalid.
- Approval applies only to the recorded digest. Changing normative content invalidates approval: return the spec to Draft and clear the approver and approval digest until a new approval is recorded.
- A Review Agent evaluates completeness and fidelity but does not invent unresolved product decisions. A spec with unresolved product decisions remains Draft.

## Decisions and local research

Specs describe behavior and constraints. ADRs describe why architecture takes a particular shape. Milestone 0001 creates `docs/decisions/` and the first security/capability ADR.

The old repository may be consulted locally when present, but no old code, fixtures, ADRs, or documents are copied into this repository during the rewrite. Origins may retain references that identify prior behavior.

## Future work

Future candidates live in [BACKLOG.md](BACKLOG.md). Picking one up means drafting the next free spec and deleting or narrowing its backlog entry.
