# Spec 0010: Tables

**Status:** Draft   **Date:** 2026-07
**Origin:** Old repo `TableControls.tsx`, table extensions in `RichEditor.tsx`; commits `3058add` (GFM tables), `97952d5` (insert button), `a51d4d5` (add row/column + drag reorder).

## Problem

Tables are the hardest Markdown structure to edit by hand. Users need to insert, extend, and reorder GFM tables visually, with the serialized Markdown staying clean and pipe-aligned enough to be readable in other tools.

## Non-goals

- Column width/resize; cell merging; per-column alignment UI (alignment from source files must still round-trip).
- Deleting rows/columns via dedicated buttons (available through editing/backspace semantics; a delete UI can come later).
- CSV import/paste conversion.

## Behavior (acceptance criteria)

- AC1: Given a Markdown file containing a GFM table, when opened, then it renders as a table with a header row; when serialized, the GFM pipe syntax round-trips.
- AC2: Given the toolbar Table action (spec 0008 AC8), when invoked, then a 3×3 table with a header row is inserted at the caret and the caret lands in the first cell.
- AC3: Given the caret inside a table, when the user presses Tab / Shift+Tab, then it moves to the next/previous cell (extending the table with a new row when tabbing past the last cell).
- AC4: Given the pointer hovers a table, then an "add row" button appears at the table's bottom edge and an "add column" button at its right edge; clicking them appends a row/column.
- AC5: Given a table with data rows, when the user grabs a row's drag handle and drags vertically, then a drop indicator tracks the target position, the row reorders on drop, and the serialized Markdown reflects the new order. The header row is not draggable and cannot be displaced.
- AC6: Given a table, when the user grabs a column's drag handle and drags horizontally, then the column (including its header cell) reorders on drop, reflected in serialization.
- AC7: Given the caret leaves the table or the tab switches, then all table controls disappear.

## Edge cases

- 1-data-row table: dragging is a no-op but must not corrupt the table.
- Cells containing pipes (`\|` escaping) round-trip.
- Empty cells serialize as valid GFM (no collapsed columns).
- Tables inside blockquotes/lists: rendering may be limited, but serialization must not corrupt.
- Drag released outside the table cancels cleanly.

## Test mapping

| AC | Layer |
|----|-------|
| AC1 | Node (tables fixture round-trip) + Browser Mode (render) |
| AC2, AC3 | Browser Mode |
| AC4, AC7 | Browser Mode |
| AC5, AC6 | Browser Mode (pointer-event drag simulation, then serialize + assert) |

## Open questions

- (none)
