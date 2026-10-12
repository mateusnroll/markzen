---
name: Product requirement
about: Define a complete Markzen outcome for a bounded issue-to-PR session
title: ''
labels: ''
assignees: ''
---

## Problem, users and outcome

Describe who cannot do what today, why it matters, and the observable result.

## Readiness and priority

Requirements state: Draft
Priority: Planned

## Product requirements

- PRD-R-001: State one observable requirement.

Cover applicable failure/cancellation, concurrency, recovery, accessibility, security/privacy, platform and bounded performance outcomes. Reference existing guarantees instead of rewriting them.

## Acceptance intent

- [ ] State a user journey or measurable outcome and its requirement IDs.

## Dependencies and affected contracts

Link prerequisite issues/merged PRs and numbered specs. State any external acceptance gates.

## Product decisions and approval

Distinguish settled human decisions from proposals. Record the exact approval source and frozen requirements digest separately from the payload.

## Technical questions

Identify discoverable facts, implementation choices and blocking human decisions. Resolve material decisions before Ready; keep research questions visible without pretending they are product approval.

## Non-goals

State explicit exclusions.

## Delivery and handoff

Follow [ISSUE-WORKFLOW.md](https://github.com/mateusnroll/markzen/blob/main/docs/ISSUE-WORKFLOW.md): one focused PR, independent spec/code reviews, required verification and exact-head CI. Leave the PR unmerged. State whether merge completes acceptance or external evidence is still required. Record the branch/base/head, PR, proof/review evidence, consumed bounds and next gate on interruption.
