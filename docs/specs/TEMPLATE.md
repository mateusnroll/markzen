# Spec NNNN: <Feature or Milestone>

**Date:** YYYY-MM
**Requirements source:** <GitHub issue URL and frozen requirements digest; a standalone polish finish may cite its external human-agreed snapshot/provenance>
**Origin:** <prerequisite specs, approved product decisions, ADRs or prior art>

<!-- Lifecycle, writer, distinct approver, exact candidate/change-set digests and official receipt are recorded in README.md, outside this candidate. Freeze these bytes before independent approval; do not change them to mark Approved or Implemented. -->

<!-- Formatting: keep each prose paragraph, list item, constraint, and AC on one physical source line. Do not hard-wrap prose or use trailing spaces/backslashes to force line breaks. Use blank lines only between intentional paragraphs or blocks. -->

## Problem

2–3 sentences: what the user can't do today and why it matters.

## Non-goals

- Explicitly excluded behavior.

## Constraints and shared invariants

- Include only implementation-shaping rules that ACs cannot express. Put architectural rationale in an ADR.

## Behavior (acceptance criteria)

- AC-1: Given ..., when ..., then ...
- AC-2: Given ..., when ..., then ...

Include in-scope success, failure, cancellation, concurrency, accessibility, security/privacy, recovery, platform, and measurable performance behavior. Split outcomes that can fail independently or require different proof layers.

## Test mapping

| AC | Primary layer | Test path or symbol |
|----|---------------|---------------------|
| AC-1 | Browser Mode | `tests/browser/feature.browser.test.tsx`: descriptive test symbol |
| AC-2 | Playwright-vs-vite | `tests/playwright/browser/feature.spec.ts`: descriptive journey symbol |

Every AC has exactly one primary layer. Supporting coverage is optional.

## Supporting coverage

List explicitly required additional proofs separately from the primary mapping. Do not repeat literal AC IDs in other primary mapping cells.

## PRD traceability

| Requirement | Acceptance criteria |
|-------------|---------------------|
| PRD-R-001 | AC-1, AC-2 |

Cover every requirement in the issue or caller's frozen projection without silently dropping or expanding scope.

## Implementation ripples

List the exact source/test/spec/ADR paths to change or create and why. Include affected contract amendments in the independent review change set.

## Open questions

- Anything unresolved. Must be empty before approval.
