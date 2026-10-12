---
name: spec
description: Draft a numbered Markzen technical contract from a GitHub issue's product requirements, with traceability, independent simplicity review and exact-digest approval. Does not implement features.
---

# Draft a feature spec

Produce a decision-complete technical contract that doubles as the test plan. GitHub owns product requirements; Git owns technical contracts. `$implement` refuses product code without independent approval.

## Steps

1. **Read the rules.** Read `CLAUDE.md`, `docs/specs/README.md`, `docs/specs/TEMPLATE.md`, `docs/ISSUE-WORKFLOW.md`, and the source GitHub issue's frozen requirements and relevant decisions/comments. A standalone polish finish may instead supply frozen human-agreed requirements and approval provenance outside Git while issue publication is not authorized; link the eventual issue when publication is authorized without changing the approved candidate. This temporary design input is not a repository backlog or issue-to-PR run. Verify prerequisites and reuse settled human decisions.

2. **Gather context.** Read every spec and current module the behavior touches. Identify affected contracts and trace the issue's requirements, rather than narrowing the issue silently. If `~/dev/markzen-old` exists and prior behavior matters, it may be researched and cited in Origin, but copy none of its code, fixtures, ADRs, or documents into this repository.

   If `$polish` supplied an uncommitted prototype, inspect its diff as design research only. Confirm it stayed within the Polish exception and keep the starting `HEAD` unchanged. Do not infer that prototype behavior is approved or route uncovered behavior into the spec merely because code exists.

3. **Interview real decisions.** Ask about non-goals and defensible product choices. Sweep failure/recovery, cancellation, concurrent edits, async races, accessibility, security/privacy, platform differences, data loss, and measurable performance. Do not ask questions research already settles.

4. **Route every scenario.** Observable in-scope behavior becomes a numbered AC; exclusions become Non-goals; unresolved decisions become Open questions; architecture goes to a Constraint or ADR; deferred product work becomes a complete GitHub issue. Never leave normative behavior in an unnumbered “edge case” bullet or promote a historical Non-goal without product approval.

5. **Draft precisely.** New candidates use sequential `AC-1` through `AC-N`, one primary Test mapping row per AC, and descriptive test paths/symbols in the other cells; do not repeat literal AC IDs in those cells. List optional supporting proofs separately, trace every projected `PRD-R-NNN` to ACs, and name exact implementation ripple paths. Register Draft and writer in the index, outside the candidate; Open questions is honest. Keep each prose paragraph, list item, constraint, and AC on one physical Markdown source line; do not hard-wrap prose or force line breaks.

6. **Sweep ripples.** Include affected specs, cross-references, ADRs and substantive workflow/index rules in the reviewed change set. Keep lifecycle-only registry writes outside normative inputs so receipt/digest metadata cannot change its own reviewed hash. During the rewrite milestones preserve linear order; afterward take the next free number and never renumber existing or reserved specs. Sequential issue slices use frozen verbatim requirement projections retaining original IDs and full-source provenance/digest; the complete issue coverage must still account for every requirement.

7. **Challenge the Draft for simplicity.** Give a fresh independent read-only agent `CLAUDE.md`, `docs/specs/README.md`, the target Draft, its prerequisite specs, frozen requirements source and relevant modules; do not provide the drafting rationale. Have it use `$review-simplicity`. Apply unambiguously redundant cuts, but present any product-scope decision to the human and never silently remove behavior.

8. **Apply the approval checklist.** Confirm the index checklist, complete traceability, disposed simplicity findings and exact candidate/change-set bytes. The issue orchestrator invokes installed `$spec-approver` under its current policy and verifies its official receipt before implementation; standalone drafting may receive independent human approval of the exact digest. Record writer, distinct approver, exact SHA-256 and verified receipt in the index, outside the new immutable candidate. Candidate bytes remain unchanged through Implemented. Preserve legacy spec conventions and receipts; normative amendments require exact-digest reapproval. A reviewer does not invent unresolved product decisions.
