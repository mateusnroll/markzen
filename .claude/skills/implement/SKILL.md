---
name: implement
description: Implement an approved spec from docs/specs/ — tests first, then code, then verify, then flip to Shipped. Use when the user says /implement <spec number or name> or asks to build/implement a specced feature. Not for drafting specs (use /spec).
---

# Implement a spec

Turn an Approved spec's ACs into passing tests and working code. The spec is the contract; the ACs are the test plan.

## Gate — check before any work

Read the spec. **Stop and tell the user** (do not start implementing) if any of these fail:

- Status is not **Approved** (Draft needs the user's approval; Shipped is already done).
- **Open questions** is non-empty — list them and ask for resolutions.
- A dependency in README.md's index isn't Shipped yet — warn; proceed only if the user says so.

## Steps

1. **Plan first.** Read the spec's Origin references (old-repo code, ADRs) and the current code it touches. For anything non-trivial, present the implementation approach before writing code (plan mode when available). Architecture choices worth remembering become ADRs in `docs/decisions/`, not comments.

2. **Tests before code.** For each AC, write a test named after it — `test('AC3: closing a dirty tab prompts before discarding')` — at the layer assigned in the spec's test mapping. House rules that commonly bite:
   - Editor input-rule tests must type character-by-character; `setContent()` bypasses input rules.
   - Select elements by `data-testid` only; add the test id to any element that lacks one.
   - Dialogs and fs go through the platform fake (`MemoryPlatform`), never mocked at the IPC layer.

3. **Implement to green.** Follow CLAUDE.md's non-negotiables — especially: no `electron` imports outside `src/platform/`, no serialization on keystroke, content lives in ProseMirror state.

4. **Verify honestly.** Run `npm run verify` (plus `npm run verify:shell` when the spec maps ACs to Shell smoke). Report failures with their output — never claim done with red tests, never skip an AC's test because it's hard to write (that's a design smell worth surfacing).

5. **If an AC is wrong**, don't silently deviate: explain the conflict, agree the new behavior with the user, and edit the spec's AC in the same branch.

6. **Close.** When every AC passes: flip the spec's status to **Shipped**. One spec = one branch = one PR containing the status flip, tests, and implementation together.

7. **Compound.** Before finishing, ask: what did this teach us that changes the rules? Route each learning to its home — a CLAUDE.md constraint, an ADR, a spec correction, or a BACKLOG.md entry for follow-up work discovered along the way. If the answer is genuinely nothing, say so and stop; don't invent learnings.
