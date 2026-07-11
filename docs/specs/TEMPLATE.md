# Spec NNNN: <Feature or Milestone>

**Status:** Draft | Approved | Implemented   **Date:** YYYY-MM
**Origin:** <optional: earlier spec, old-repo behavior, ADR, or prior art>

## Problem

2–3 sentences: what the user can't do today and why it matters.

## Non-goals

- Explicitly excluded behavior.

## Constraints and shared invariants

- Include only implementation-shaping rules that ACs cannot express. Put architectural rationale in an ADR.

## Behavior (acceptance criteria)

- AC1: Given ..., when ..., then ...
- AC2: Given ..., when ..., then ...

Include in-scope success, failure, cancellation, concurrency, accessibility, security/privacy, recovery, platform, and measurable performance behavior. Split outcomes that can fail independently or require different proof layers.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1 | Browser Mode | — |
| AC2 | Playwright-vs-vite | Shell smoke |

Every AC has exactly one primary layer. Supporting coverage is optional.

## Open questions

- Anything unresolved. Must be empty before approval.
