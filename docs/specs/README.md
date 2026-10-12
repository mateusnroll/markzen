# Rewrite Milestone Specs

The Electron rewrite is defined by five linear milestone specs. Each milestone produces a user-visible, independently verifiable checkpoint and is implemented only after the previous milestone is **Implemented**. After the rewrite, new behavior gets the next free numbered spec.

The spec is the test plan: every observable in-scope behavior is a numbered acceptance criterion, and every AC has one primary test layer.

## Status lifecycle

- **Draft** — still under design; implementation is forbidden.
- **Approved** — decision-complete, with no open questions, and approved under the policy below.
- **Implemented** — implementation and all mapped tests exist, required verification is green, and the simplicity review is dispositioned. This does not mean released.

If Implemented behavior changes, return the spec to Draft, update and reapprove it, then restore Implemented only after verification passes.

### Polish prototype exception

`$polish` may explore visual presentation, existing-control interactions, accessibility states, and shell chrome as an uncommitted prototype before drafting the final behavior contract. `AGENTS.md` defines the exact boundary. A session may retain a current implementation branch after committing its complete `$implement` worktree, or create a dedicated polish branch for standalone work. The selected branch must keep its baseline `HEAD` unchanged and may not commit or push prototype changes; publication from an implementation baseline updates its existing branch and PR.

When the user ends the session, the normal lifecycle resumes at Draft. Approval, AC coverage, baseline-failure proof, verification, review, and close remain mandatory as defined by `AGENTS.md` and the repository skills.

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
| 0008 | [Opt-in usage and crash diagnostics](https://github.com/mateusnroll/markzen/issues/46) — number reserved | Migrated Draft |
| 0009 | [First-class CSV documents](0009-first-class-csv-documents.md) | Implemented |
| 0010 | [First-class JSON documents](0010-first-class-json-documents.md) | Implemented |
| 0011 | [Other file types](0011-other-file-types.md) | Implemented |
| 0012 | [Nested list presentation](0012-nested-list-presentation.md) | Implemented |
| 0013 | [Table and image reordering](0013-table-and-image-reordering.md) | Implemented |
| 0014 | [Fuzzy file finder and tab quick switcher](0014-fuzzy-file-finder-and-tab-switcher.md) | Implemented |

Spec 0014 was implemented in merged PR #32. [Spec 0015 — Raw Markdown editing](0015-raw-markdown-editing.md) is Implemented in merged PR #34. The next unallocated number is 0016; migrated number 0008 remains reserved.

Spec 0002 was revised with 0015 to route editable UTF-8 fallback into Raw mode. Both returned to Implemented after independent approval, mapped tests, simplicity review, and browser plus packaged-shell verification.

## Scenario routing

- Observable and in scope → numbered AC.
- Deliberately excluded → Non-goal.
- Unresolved → Open question.
- Implementation-shaping invariant → Constraint.
- Architectural rationale → ADR in `docs/decisions/`.
- Deferred product work → a complete [GitHub issue](https://github.com/mateusnroll/markzen/issues).

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

New tests are named after the AC: `test('AC-12: a later edit remains dirty after save completes')`. Existing contracts retain their established `AC12` spelling.

## Workflow

1. **Draft** — use [TEMPLATE.md](TEMPLATE.md), resolve decisions, trace the source issue requirements and sweep related specs, run an independent simplicity challenge, and leave status Draft.
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
- Source issue requirement traceability, cross-spec references and required ADRs are accurate.

## Approval policy

Someone other than the writer approves the exact contract. A human may approve a standalone candidate; issue implementation uses the installed specification reviewer and verified official receipt under [ISSUE-WORKFLOW.md](../ISSUE-WORKFLOW.md). The reviewer evaluates fidelity/completeness and never invents unresolved product decisions.

New candidate files remain byte-identical after independent approval. Record lifecycle and approval evidence in the table below, outside the hashed candidate: path, source issue, writer, distinct approver, full SHA-256, proposed change-set digest and official receipt/provenance. Recompute exact digests immediately before approval and implementation. Draft/Approved/Implemented refer to those exact bytes, not merely a filename.

Lifecycle-only registry updates are evidence metadata outside the normative proposed change set; do not hash receipt/digest fields into their own approval. When the index's process rules also change, freeze and review those normative bytes separately from the registry entry. Verify materialized candidate and normative ancillary documents against the frozen change set; approval does not permit later substantive index edits.

| Candidate | Source issue | Status | Writer | Approver | Candidate SHA-256 | Change-set SHA-256 | Receipt/provenance |
|-----------|--------------|--------|--------|----------|------------------|-------------------|--------------------|

Changing normative content invalidates approval. Preserve the superseded snapshot and receipt, register the replacement as Draft, resolve decisions and obtain independent approval of the new bytes; never reuse or reset exhausted review budgets. Metadata alone does not grant implementation authority.

Legacy specs 0001–0015 retain their original in-file metadata and historical approval conventions; do not rewrite or fabricate receipts to fit the new template. When amended, record the exact reviewed revision/change set and its convention. Their historical Implemented status is not blanket approval for new behavior. A migrated unapproved draft reserves its number but grants no implementation authority.

## Decisions and local research

Specs describe behavior and constraints. ADRs describe why architecture takes a particular shape. Milestone 0001 creates `docs/decisions/` and the first security/capability ADR.

The old repository may be consulted locally when present, but no old code, fixtures, ADRs, or documents are copied into this repository during the rewrite. Origins may retain references that identify prior behavior.

## Future work

Future product requirements and priorities live only in [GitHub issues](https://github.com/mateusnroll/markzen/issues). Follow [ISSUE-WORKFLOW.md](../ISSUE-WORKFLOW.md) and `$implement #N` for discovery through one reviewed, verified, unmerged PR. The retired backlog and telemetry Draft remain available in Git history and their migrated issues; historical candidates remain byte-preserved. The [retired backlog](https://github.com/mateusnroll/markzen/blob/9efb1945bc7cf44abecaa06424f941a04a06bcc7/docs/specs/BACKLOG.md) and [telemetry Draft](https://github.com/mateusnroll/markzen/blob/9efb1945bc7cf44abecaa06424f941a04a06bcc7/docs/specs/0008-opt-in-pseudonymous-telemetry.md) are pinned here to their migration baseline; old Origin/path mentions are historical, not live workflow dependencies.
