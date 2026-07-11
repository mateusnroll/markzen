---
name: implement
description: Implement an Approved spec from docs/specs/ with AC-named tests, verification, ADRs, and an Implemented status flip. Not for Drafting specs.
---

# Implement an Approved spec

Turn an Approved behavior contract into passing tests and working code.

## Gate

Read `CLAUDE.md`, `docs/specs/README.md`, and the target spec. Stop before changing code if:

- Status is not **Approved**.
- Open questions is non-empty.
- An AC lacks exactly one primary test mapping.
- Normative behavior remains outside numbered ACs.
- For rewrite milestones 0002–0005, the previous milestone is not **Implemented**.

## Steps

1. **Plan the milestone.** Read Origin references and affected code. Identify the Platform, data, accessibility, security, and failure paths. Record durable architectural choices in `docs/decisions/`; milestone 0001 creates that directory and its index before shell implementation.

2. **Write tests first.** Add at least one AC-named test at each primary mapped layer. Add supporting coverage where the spec calls for it. Input-rule tests type character-by-character.

3. **Implement to green.** Follow `CLAUDE.md`, especially the Platform boundary, shared save transaction, canonical identity, async ownership, serialization integrity, and accessibility baseline.

4. **Verify honestly.** Run `npm run verify` and `npm run verify:shell` when any AC maps to or explicitly requires shell smoke. Report failures; never skip an AC because it is difficult.

5. **Run the simplicity gate.** After the first green verification, give a fresh independent agent `CLAUDE.md`, `docs/specs/README.md`, the Approved spec, the implementation diff against its starting base, and relevant source; do not provide the implementer's rationale. Have it use `$review-simplicity`. The reviewer reports findings and never edits files. Apply each valid cut or rebut it in one sentence with the AC or constraint that requires the complexity. No finding may remain unresolved.

6. **Correct the contract when needed.** If an AC is wrong or a proposed simplification changes Approved behavior, return the spec to Draft, agree on revised behavior with the user, update tests and spec together, and obtain approval again.

7. **Verify the reviewed result.** After simplicity edits, rerun the complete verification required by step 4. Run one more fresh simplicity review only when remediation introduced a dependency, abstraction, or material design.

8. **Close.** Only after every AC passes, required verification is green, and every simplicity finding is applied or rebutted, mark the spec **Implemented** in the same implementation PR. One rewrite milestone is one implementation unit; later feature specs follow the same lifecycle.

9. **Compound.** Route durable learnings to `CLAUDE.md`, an ADR, a spec correction, or BACKLOG.md. Do not invent learnings.
