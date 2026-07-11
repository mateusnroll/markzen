---
name: spec
description: Draft a new numbered feature spec in docs/specs/. Use when the user invokes /spec in Claude Code or $spec in Codex, asks to write or draft a spec, or wants to promote a BACKLOG.md idea into a spec. Do not use for implementing specs (use /implement or $implement) or architecture decisions (use ADRs).
---

# Draft a feature spec

Produce a one-page behavior spec that doubles as the test plan, following `docs/specs/README.md`. The spec you write will gate implementation: the implement skill refuses anything not Approved.

## Steps

1. **Gather context.** Read `docs/specs/README.md`, `docs/specs/TEMPLATE.md`, and `docs/specs/BACKLOG.md`. If the feature has a BACKLOG entry, start from its context and **delete the entry** in the same change. Take the next free 4-digit number — never renumber existing specs.

2. **Research before drafting.** Read the specs this feature builds on or touches. If the feature existed in the old app, read the relevant code in `~/dev/markzen-old` (and its `docs/decisions/` ADRs) and record what you used in the spec's **Origin** line — commits, files, ADRs. Proven old behavior beats invented behavior; old *bugs* become explicit ACs so they can't regress.

3. **Interview the user before writing.** Ask specifically about:
   - **Non-goals** — push for them; this is where scope creep dies, and users rarely volunteer them.
   - **Edge cases** — propose the ones you found in research and ask what you're missing.
   - **Judgment calls** — where multiple designs are defensible, present options with a recommendation instead of silently choosing.
   Use the host's structured user-input tool (`AskUserQuestion` in Claude Code or `request_user_input` in Codex) for genuine either-way decisions; don't ask about things research already settles.

4. **Draft the spec** from TEMPLATE.md:
   - ACs are numbered Given/When/Then, each independently observable and testable. Group them with sub-headings when there are more than ~8.
   - Every AC gets a row in the test mapping, assigned to the **lowest layer that can prove it** (Node → Browser Mode → Playwright-vs-vite → Shell smoke; keep Shell smoke thin).
   - Add a **Constraints** section only for implementation-shaping rules the ACs can't express (e.g. "state keyed per root, not by path").
   - Status **Draft**, date `YYYY-MM`. List unresolved items under Open questions honestly — an empty section you invented answers for is worse than a full one.

5. **Sweep for ripples.** Search the other specs for ACs this feature changes (menus, watcher scope, path display, settings). Make the consistency edits in the same change and tell the user exactly what you touched and why.

6. **Update the index.** Add the spec to README.md's index table with its dependencies.

7. **Hand off.** Summarize the judgment calls you made and the open questions. The user resolves those and flips the status to **Approved** — that's their call, never yours.
