---
name: spec
description: Draft a numbered feature spec in docs/specs/. Use for a new feature, milestone, or promoted backlog item. Not for implementation or architecture-only decisions.
---

# Draft a feature spec

Produce a decision-complete feature spec that doubles as the test plan. `/implement` refuses anything not Approved.

## Steps

1. **Read the rules.** Read `CLAUDE.md`, `docs/specs/README.md`, `docs/specs/TEMPLATE.md`, and `docs/specs/BACKLOG.md`.

2. **Gather context.** Read every spec and current module the behavior touches. If the idea has a BACKLOG entry, use its context and delete or narrow that entry in the same change. If `~/dev/markzen-old` exists and prior behavior matters, it may be researched and cited in Origin, but copy none of its code, fixtures, ADRs, or documents into this repository.

3. **Interview real decisions.** Ask about non-goals and defensible product choices. Sweep failure/recovery, cancellation, concurrent edits, async races, accessibility, security/privacy, platform differences, data loss, and measurable performance. Do not ask questions research already settles.

4. **Route every scenario.** Observable in-scope behavior becomes a numbered AC; exclusions become Non-goals; unresolved decisions become Open questions; architecture goes to a Constraint or ADR; later work goes to BACKLOG.md. Never leave normative behavior in an unnumbered “edge case” bullet.

5. **Draft precisely.** Split ACs when outcomes can fail independently or require different test layers. Map each AC to one lowest primary layer and list optional integration coverage separately. Status is Draft, date is `YYYY-MM`, and Open questions is honest.

6. **Sweep ripples.** Update affected specs, cross-references, workflow docs, and backlog entries in the same change. During the five rewrite milestones, preserve their linear order; afterward take the next free number and never renumber existing specs.

7. **Challenge the Draft for simplicity.** Give a fresh independent agent `CLAUDE.md`, `docs/specs/README.md`, the target Draft, its prerequisite specs, affected backlog entries, and relevant modules; do not provide the drafting rationale. Have it use `$review-simplicity`. Apply unambiguously redundant cuts, but present any product-scope decision to the user and never silently remove behavior. Review each rewrite milestone immediately before its approval, in linear order.

8. **Apply the approval checklist.** Confirm the checklist in `docs/specs/README.md`, including disposition of the simplicity findings. Report decisions and unresolved questions. Only the user may mark a spec Approved.
