---
name: review-simplicity
description: Independently review a Markzen Draft spec or implementation diff for unnecessary complexity while preserving approved behavior and repository invariants. Use before spec approval, after implementation first reaches green, or when asked for KISS, YAGNI, Ponytail, over-engineering, deletion, or simplification review.
---

# Review for simplicity

Find code or proposed behavior that does not need to exist. Review only; do not edit files.

## Read the contract

Read `CLAUDE.md`, `docs/specs/README.md`, the target spec, the current diff, and relevant source. For a Draft-spec review, also read prerequisite specs and affected backlog entries. Derive evidence from these artifacts; do not ask for or rely on the author's rationale.

Trace the behavior and its trust, data-loss, accessibility, platform, and async boundaries before suggesting a cut.

## Challenge complexity

Stop at the first sufficient option:

1. Remove behavior that is speculative, duplicated, deferred, or outside the current milestone. In a spec review, present product-scope cuts for user decision; never silently remove them.
2. Reuse an existing helper, type, component, or pattern.
3. Use a standard-library or browser/Electron-native capability.
4. Use an already-installed dependency instead of adding or rebuilding one.
5. Inline a premature abstraction or configuration with only one real consumer or value.
6. Otherwise, keep the smallest clear implementation that satisfies the contract.

Use these finding categories: `delete`, `reuse`, `standard`, `native`, `dependency`, `inline`, and `shrink`.

## Preserve required complexity

Recommend a change only when it preserves every applicable acceptance criterion and non-negotiable invariant. Never cut trust-boundary validation, data-loss handling, security, serialization integrity, async ownership, accessibility, cross-platform behavior, AC-named primary coverage, or required verification. Do not judge test adequacy or propose replacement assertions in this pass; flag duplicate supporting coverage only when the primary proof remains unchanged.

Treat line count as evidence, not the goal. Do not replace clear code with compressed or clever code. If a proposed simplification changes approved behavior, route the spec back to Draft instead of recommending an implementation edit.

Keep correctness, security, and performance findings out of this review unless they directly explain why a simpler design is invalid. Route unrelated findings to a normal review.

## Report

Return one line per finding:

`<location> — <category>: <what to remove>. Evidence: <why it is unnecessary>. Replace with: <smaller sufficient option>.`

Use a section or AC reference for specs and a file plus line for code. Do not apply fixes. If there are no findings, return exactly:

`Lean already. No simplicity changes recommended.`
