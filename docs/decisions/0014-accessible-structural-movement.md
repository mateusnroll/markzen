# ADR 0014: Accessible structural movement

**Status:** Accepted

**Date:** 2026-08-22

**Spec:** [0013 — Table and Image Reordering](../specs/0013-table-and-image-reordering.md)

## Context

Rows, columns, and inline images need structural movement without creating a second document model, serializing during interaction, or relying on a drag gesture that excludes touch, keyboard, speech, or assistive-technology users. Direct drag also has to preserve the same ownership, cancellation, and undo behavior as an explicit accessible path.

## Decision

- Represent movement as one editor-local session containing a source kind, immutable source identity, and one candidate insertion-gap index. The document remains unchanged until Place Here or a valid pointer-up commits one ProseMirror transaction.
- Use one gap model for rows, columns, and images. Data-row gaps exclude the fixed header; column gaps span only the current table; image gaps are schema-valid inline positions in the current document after logically removing the source.
- Make the complete interaction available through native named buttons for First, Previous, Next, Last, Place Here, and Cancel. Mouse and pen drag handles reuse the same plan, gap validation, transaction, announcement, and cancellation path; touch uses the untimed explicit controls and requires no long press or path gesture.
- Keep document content exclusively in ProseMirror. React owns only the active session and renders its controller; persistent non-session transactions cancel the session instead of maintaining a parallel mapped editing state.
- Preserve image `assetId`, exact source, and generation through movement. Existing image runtime lookup resolves that identity at its current position, so movement adds no transport, capability, reload, authorization, or separate async owner.
- Use browser Pointer Events, pointer capture, ProseMirror transactions, and existing overlay/focus coordination. Add no drag-and-drop dependency and no Platform, preload, IPC, clipboard, filesystem, or network contract.

## Consequences

- Explicit Move mode is a first-class path rather than a fallback, and direct dragging remains a convenience with no separate semantics.
- Enumerating image gaps is linear in document positions and occurs only when movement begins; candidate navigation stores an index and never clones or serializes the document.
- A persistent edit during Move mode cancels the session. This avoids stale structural identity and mapping machinery while transient selection, decoration, and current image-runtime transactions remain compatible.

## Verification

- Node tests prove gap construction, one-transaction row/column/image movement, semantic preservation, no-op behavior, stale-plan rejection, and canonical serialization.
- Browser Mode proves the complete explicit interaction, direct-pointer cancellation, history, focus, announcements, preview pinning, image runtime ownership, responsive presentation, and accessibility.
- Playwright-vs-Vite proves nested image placement, tab cleanup, and real pointer drag geometry; the non-blocking performance project records the approved large-table and 500-block fixtures.
