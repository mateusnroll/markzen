# ADR 0008: Accessible windowed workspace tree and responsive sidebar

**Status:** Accepted
**Date:** 2026-07-12
**Spec:** [0003 — Folder Workspaces](../specs/0003-folder-workspaces.md)

## Context

A root may contain tens of thousands of loaded logical rows, but the sidebar must retain tree keyboard behavior, assistive semantics, focus, and usable document space at the minimum window size and 200% zoom.

## Decision

### Flattening and windowing

- Derive one ordered flat visible-row model from insertion-ordered roots, expansion state, cached snapshots, and deterministic `Intl.Collator('en-US', { usage: 'sort', sensitivity: 'base', numeric: false })` ordering with a code-point tie-breaker.
- Render a fixed-height overscanned slice plus the currently focused row, capped at 300 `treeitem` elements. Stable keys are `RootId` plus logical relative path; FileKey is never used as row identity because aliases are distinct rows.
- Roving focus operates on the complete flat visible-row model. Navigation scrolls the destination into the rendered slice before focusing it. If invalidation or collapse removes the focused row, focus moves to its nearest visible owning directory or root header.
- Root headers remain named buttons outside their root tree. Each expanded root tree exposes accurate levels, expansion, current-page aliases, busy/error descriptions, and one tabbable visible item.

### Responsive sidebar and splitter

- The stored preference remains an integer from 160 through 480 CSS pixels. Layout computes a smaller effective width only when needed to keep tree, splitter, tabs, editor, and errors reachable at the 480×320 minimum or 200% zoom, and restores the stored preference when space returns.
- Separator ARIA values describe the effective range and value. Pointer and keyboard resizing share one clamp function; interrupted pointer capture removes every global listener and transient cursor/selection style.
- Workspace content reuses the existing top-chrome drag region. No sidebar-specific macOS drag strip is added.
- Forced colors preserve borders, focus, current item, disabled item, loading, and error distinctions. Reduced motion removes non-essential expansion, loading, and resize animation.

### Measurement

- DOM row count and invalidation-batch count are deterministic blocking tests.
- Real listing, filtering/sorting, first rows, cached preview activation, and large-tree input latency run in the existing non-blocking CI performance project. Reports separate filesystem listing from deterministic application work.

## Consequences

- A small in-repository fixed-row windowing helper is sufficient; no new runtime dependency is introduced before measurements justify one.
- Keeping the focused row mounted may add one row outside normal overscan but remains within the 300-row cap.
- Responsive effective sizing does not rewrite the user's stored preference merely because zoom or window size changed.

## Verification

- Browser Mode tests cover semantics, roving focus, typeahead, virtual focus retention, splitter keyboard/pointer behavior, forced colors, reduced motion, and the DOM cap.
- Playwright covers real viewport/zoom journeys and tab/tree interactions.
- CI publishes non-blocking machine-readable and human-readable timing reports.
