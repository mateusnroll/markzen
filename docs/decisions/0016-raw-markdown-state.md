# ADR 0016: Raw Markdown editor state

**Status:** Accepted  
**Date:** 2026-09-06  
**Spec:** [0015 — Raw Markdown editing](../specs/0015-raw-markdown-editing.md)

## Decision

Each Markdown tab owns its Rich editor and a lazily created literal TipTap/Lowlight Raw editor. Content and independent history stay in ProseMirror. The tab session holds the authoritative mode, accepted baseline, encoding, notice, and scroll positions.

Mode transfer is synchronous. The existing serializer produces Raw source; the loss-safety parser admits supported Rich content. An unchanged destination keeps its selection and history. A changed destination receives a fresh editor state and a deterministic content-anchor selection. Refused conversion leaves the source authoritative.

Raw saves use the existing encoding policy and save coordinator. The coordinator distinguishes captured mode as well as revision. Accepted snapshots are projected into the current representation for dirty comparison; save completion does not replace either editor. External reload creates a fresh session from the new bytes.

Composition capture ends composition and flushes ProseMirror's pending DOM observation before reading the snapshot. This requires a narrow typed access to the pinned ProseMirror view's internal observer because its composition-end handler normally schedules the final read asynchronously. The final-DOM-mutation regression test must remain green when upgrading that dependency.

## Consequences

A visited representation retains an editor instance until its tab closes. This preserves independent undo histories without a second history implementation or storing source in React. Raw highlighting remains inert and introduces no capabilities, dependencies, or write path.

Node fidelity fixtures, Browser Mode transfer/composition tests, complete lifecycle journeys, and packaged focus/security checks exercise the boundaries. The controlled large-document project records performance without a release threshold.
