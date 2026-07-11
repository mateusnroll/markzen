---
name: pull-request
description: Publish the entire current Markzen worktree to GitHub by creating or using a topic branch, verifying and committing all tracked and untracked changes, pushing to origin, and opening or updating a pull request targeting main with an evidence-based summary, changes, decisions, and verification report. Use when the user asks to commit everything, push the worktree, open a pull request, publish changes, or wants a better PR description than the Codex button produces.
---

# Publish a pull request

Publish the complete worktree as one focused pull request to `main`. Do not implement new product changes while publishing.

## Preflight

1. Read `CLAUDE.md` and relevant specs or ADRs. Run `git status --short --branch`, inspect all tracked and untracked changes, and read the complete diff. Treat invocation of this skill as approval to include the entire worktree.
2. Stop before staging if inspection finds a likely secret, generated or binary bulk, a submodule change, or work that plainly belongs to another task. Otherwise do not ask for file-by-file confirmation.
3. Confirm `origin` is the intended GitHub repository and `origin/main` exists. Fetch `origin` and compare the worktree base with `origin/main`. If the base moved and cannot be reconciled safely without rewriting or risking local changes, stop and explain the blocker.
4. Derive the intended remote branch without creating it. If HEAD is detached or the current branch is `main`, choose an unused `codex/<slug>` locally and on `origin`, adding a numeric suffix when needed; otherwise use the current non-default branch. Never reuse an existing branch when starting from detached HEAD or `main`.
5. Before local mutation, require `git push --dry-run origin HEAD:refs/heads/<branch>` to succeed and confirm a pull-request creation path: prefer the connected GitHub app; otherwise require `gh --version` and a successful `gh auth status`. Stop if either push or PR creation is unavailable.

## Branch, verify, and commit

1. Create or keep the branch selected during preflight. Never commit this work directly to `main`.
2. Run the repository-required verification, or the closest available subset when milestone 0001 has not created the full toolchain. Stop on failure and report the useful output; do not publish known-failing work.
3. Stage the complete worktree with `git add -A`, then inspect `git diff --cached` and `git diff --cached --check`. Recheck that the staged scope contains no secret or unintended artifact.
4. Create one commit with a concise imperative subject that describes the complete staged diff. Do not create an empty commit when the branch already contains the intended commits and the worktree is clean.
5. Push with tracking to `origin`. Do not force-push unless the user explicitly requests it.

## Write the pull request

Build the title and body from `origin/main...HEAD`, the commit list, relevant specs and ADRs, recorded verification output, and the current task context. Describe only facts supported by those sources. Do not invent decisions, issue links, risks, or test results.

Use an imperative title of at most 72 characters that summarizes the whole change. Use this body shape:

```markdown
## Summary

<Two to four sentences: purpose, motivation, and resulting behavior.>

## Changes

- <Three to six behavior- or subsystem-level changes; do not inventory files.>

## Decisions

- <One to four non-obvious choices and why they were made.>

## Verification

- `<command>` — passed
- Not run: <check> — <honest reason>

## Review notes

<Only when material: risks, limitations, follow-up work, screenshots, migration or deployment steps, or where review should start.>
```

Keep `Summary`, `Changes`, and `Verification`. Include `Decisions` only when the diff, spec, ADR, or task context supports a non-obvious choice. Omit empty optional sections and placeholder text. Include `Closes #...` only when an issue is explicitly known. Record failures or skipped checks honestly instead of presenting them as passing.

## Open or update the PR

1. Target `main` and use the pushed branch as head. Check for an existing open PR from that branch; update its title and body instead of opening a duplicate.
2. Prefer the connected GitHub app for creation or update. If it cannot express the repository or branch cleanly, pass the generated Markdown through standard input. Create with `gh pr create --base main --head <branch> --title <title> --body-file -`, adding `--draft` unless ready-for-review was explicitly requested; update the discovered PR with `gh pr edit <PR> --title <title> --body-file -`.
3. Open a draft PR unless the user explicitly asks for ready-for-review.
4. If push or PR creation fails, preserve the completed local state, report exactly what succeeded, and do not claim a PR exists.
5. Return the branch, commit SHA, PR URL and target, draft status, and verification performed.
