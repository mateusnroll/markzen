---
name: polish
description: Run a collaborative Markzen visual-polish session with a live browser or Electron preview, inspect UI the user points at, make narrow uncommitted visual and existing-interaction prototypes, hot-reload or relaunch the app, and close the session through a retroactive spec, approval, tests, verification, and simplicity review. Use for live design iteration, UI polish, styling, layout, hover/focus/keyboard behavior, native window chrome, traffic lights, or prompts such as “let’s polish this,” “show me a live preview,” and “change what I’m clicking.”
---

# Polish Markzen live

Iterate with the user against the running app. Treat every pre-spec edit as a disposable prototype until the finish gate completes.

## Start the session

1. Read `CLAUDE.md` and `docs/specs/README.md`, including the Polish prototype exception.
2. Inspect `git status`, the current branch, and `origin/main`. Fetch before a new session. If the worktree is clean, update it without discarding work and create `codex/polish-<short-slug>` unless already on a dedicated polish branch. If unrelated changes exist, stop and ask how to isolate them.
3. Keep `HEAD` unchanged for the whole prototype phase. Do not commit or push. It is the baseline used to prove the eventual AC tests fail without the prototype.
4. Select one preview mode:
   - Prefer **browser** for renderer styling, layout, component markup, copy, animation, and existing interactions.
   - Select **Electron** for native chrome, macOS traffic lights, menus, window geometry, preload behavior, or any Electron-only difference.

## Run and inspect

### Browser mode

Run `npm run polish -- browser` in a persistent terminal session. Pass `--fixture <name>` when a repository fixture is more useful than `workspace-basic`. Read and follow the available `browser:control-in-app-browser` skill, open the printed `POLISH_PREVIEW_URL`, and inspect both the semantic DOM and screenshot.

Expect Vite to apply renderer changes without restarting the preview process.

### Electron mode

Run `npm run polish -- electron` in a persistent terminal session. The launcher opens an isolated profile and a temporary copy of `examples/stoic-workspace`. Read and follow the available `computer-use:computer-use` skill, then inspect the Markzen/Electron accessibility tree and screenshot.

Expect renderer CSS and modules to update through Vite. Expect a successful main-process, preload, or imported native dependency rebuild to relaunch Electron while preserving the temporary profile and workspace. A failed build must leave the last working process open.

Keep only one preview launcher active unless the user explicitly asks to compare modes. Stop it through its terminal session when switching or finishing so it can remove temporary state.

## Iterate with the user

1. Let the user click, navigate, type, or describe a target.
2. Reinspect the current live state before deciding what to edit. Do not rely on a stale screenshot, accessibility index, or DOM snapshot.
3. State the observed issue briefly, make the smallest source edit that expresses the requested design, and wait for HMR or relaunch.
4. Reinspect the result in the same state and report what changed. Continue until the user explicitly asks to finish.
5. Preserve accessibility while prototyping: pair pointer and keyboard paths, expose hover UI on focus, retain roles/names/states, and consider reduced motion and forced colors.

Permit prototype edits only to CSS, layout, presentational markup, visible copy, animation, existing-control interactions, hover/focus/keyboard states, and shell chrome. Do not add dependencies, persistence, IPC or preload capabilities, filesystem authority, document semantics, security exceptions, or complete feature flows. Stop and route any such request through the normal `$spec` workflow.

Run focused static or component checks after coherent edits when useful, but optimize the middle of the session for live iteration. Full verification belongs to the finish gate.

## Finish the session

Only begin this gate when the user explicitly says the polish session is finished.

1. Capture the final live state, stop the launcher, and inspect the complete diff against unchanged `HEAD`. Remove experiments and reject anything outside the prototype boundary.
2. Use `$spec` to draft the next free numbered spec, or return an affected Implemented spec to Draft when the prototype changes its existing contract. Treat the diff as research, not approved behavior. Translate the agreed design into measurable ACs, including platform, responsive, keyboard, focus, forced-colors, and reduced-motion outcomes where applicable.
3. Run the Draft simplicity review with a fresh independent agent and resolve its findings. Present the Draft to the user. Only the user may mark it Approved.
4. If approval is withheld, leave the prototype uncommitted and stop. Do not present it as implementation.
5. After approval, add AC-named tests. In a disposable worktree at the unchanged prototype baseline `HEAD`, apply only the new tests and prove they fail without the prototype. A compile failure caused solely by a deliberately introduced public interface is acceptable evidence; unrelated setup failures are not.
6. Use `$implement` to retain only prototype code required by the Approved ACs, make all mapped tests pass, run `npm run verify` and any required `npm run verify:shell`, then run and disposition the implementation simplicity review.
7. Reinspect the final browser surface and Electron surface when native chrome is affected. Mark the spec Implemented only after all required verification is green. Do not commit or publish unless the user separately requests it.
