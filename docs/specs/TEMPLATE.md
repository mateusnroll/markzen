# Spec NNNN: <Feature>

**Status:** Draft | Approved | Shipped   **Date:** YYYY-MM
**Origin:** <optional: pointer to old-repo implementation, ADR, or prior art>

## Problem

2–3 sentences: what the user can't do today and why it matters.

## Non-goals

Bullets. The most valuable section — scope creep dies here.

## Behavior (acceptance criteria)

- AC1: Given a doc with a table, when the user clicks the row handle and drags, then the row reorders and the serialized Markdown reflects it.
- AC2: Given ..., when ..., then ...

(Numbered. Each observable and testable. This section IS the test plan.)

## Edge cases

- Empty document; unsaved buffer; 10k-line file; non-ASCII path; ...

## Test mapping

| AC | Layer |
|----|-------|
| AC1 | Browser Mode |
| AC2 | Playwright-vs-vite |

## Open questions

Anything unresolved. Empty before implementation starts.
