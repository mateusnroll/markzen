# ADR 0004: Tab state and persistence scheduling

**Status:** Accepted  
**Date:** 2026-07-11  
**Specs:** [0002 — Document Lifecycle & Tabs](../specs/0002-document-lifecycle-and-tabs.md), [0005 — Structured Content and Local Assets](../specs/0005-structured-content-and-assets.md)

## Context

Each tab needs independent ProseMirror state, history, selection, scroll, title, async ownership, and persistence scheduling. Saves can overlap edits and close requests, and IME composition must commit to its original tab before ownership changes.

## Decision

### Editor and tab ownership

- A renderer-side `DocumentController` owns ordered tab records keyed by main-assigned `TabId`. Each editable tab owns one TipTap `Editor`/ProseMirror state for its lifetime; React renders metadata and the active editor but never stores document content.
- Tab metadata contains display path, baseline title/model fingerprint, revision, saved revision, mode, load generation, persistence generation, scroll, errors, and conflict state.
- Persistent transactions monotonically advance revision. Dirty state is semantic equality of current persistent JSON plus pending title against the adopted baseline, not merely `revision !== savedRevision`, so undo/reversion can become clean.

### Switching, focus, and IME

- Activation captures the originating tab selection and scroll synchronously and restores the destination state. Generation tokens guard any async measurement.
- Tab-list activation leaves focus on the selected tab; switching initiated while the editor owns focus restores editor focus.
- Composition start records the originating tab. Save, switch, and close requested during composition are deferred until one composition-end commit, then resume against the captured owner. They never retarget the subsequently active tab.

### Persistence coordinator

- Each tab owns one FIFO persistence coordinator. Commands capture owner, generation, revision, path/key/version, baseline, and serialized snapshot before awaiting.
- Repeated Save for the same captured revision coalesces. A later explicit Save records one follow-up snapshot; failure/conflict/cancellation clears automatic follow-up intent.
- Success updates only the captured baseline. Later edits remain dirty. Close requests waiting on a save resume through the normal clean/dirty decision after it settles.
- Save All is an outer sequential loop over per-tab coordinators and stops at the first non-success.
- A successful rebasing Save As returns the rebased captured model plus exact old/new source pairs. The renderer applies matching pairs to surviving live image nodes in one non-history transaction, adopts the returned captured model as baseline, and compares the resulting live model to that baseline so later content or metadata edits remain dirty.

## Consequences

- Keeping one editor state per tab costs memory but makes history and selection ownership explicit and avoids serializing during switches.
- Baseline fingerprinting adds work only after persistent transactions; it avoids false dirty prompts after undo or title reversion.
- All async paths require captured tokens, but there is one ownership rule for load, save, dialog, watch, and close.

## Verification

- Node tests cover revisions, equality, coalescing, follow-ups, stale generations, and Save All order.
- Browser tests cover input rules, per-tab history/selection/scroll, roving focus, dirty state, IME boundaries, title navigation, and accessibility.
- Playwright journeys cover asynchronous dialogs, reads/writes, close prompts, and tab/window lifecycle.
