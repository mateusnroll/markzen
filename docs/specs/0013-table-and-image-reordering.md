# Spec 0013: Table and Image Reordering

**Status:** Implemented   **Date:** 2026-08
**Origin:** Promotes the first in-scope backlog item deferred by spec 0005. The user chose image movement to any valid position in the current rich document and row/column movement only within the current table with the header row fixed. The touch and assistive interaction follows [WCAG 2.2 Dragging Movements](https://www.w3.org/WAI/WCAG22/Understanding/dragging-movements), [Pointer Cancellation](https://www.w3.org/WAI/WCAG22/Understanding/pointer-cancellation), and WAI techniques [G219](https://www.w3.org/WAI/WCAG22/Techniques/general/G219) and [G210](https://www.w3.org/WAI/WCAG22/Techniques/general/G210): direct dragging is optional, while the complete operation remains available through untimed single-pointer activation and keyboard input. WAI-ARIA's deprecated `aria-grabbed` and `aria-dropeffect` attributes are not used.

## Problem

Markzen can create and structurally edit tables and can insert, inspect, and delete images, but correcting their order requires leaving the rich editor or reconstructing content. Users need one predictable, accessible movement model that preserves Markdown semantics, document safety, and live image ownership across pointer, touch, keyboard, and assistive-technology input.

## Non-goals

- Moving a row or column between tables, moving the header row, promoting a data row to the header, or changing which cells are headers.
- Copying, duplicating, multi-selecting, or moving several rows, columns, or images in one operation.
- Reordering tables as whole nodes, moving arbitrary text or non-image blocks, resizing table columns or images, merging cells, changing alignment, or introducing image captions, wrapping, or float layout.
- Dragging files into or out of Markzen, inserting images by drop or paste, changing image authorization, fetching a remote image, or creating filesystem, IPC, preload, or network authority.
- Cross-tab, cross-window, or cross-document movement and clipboard-backed transfer.
- Reordering opaque/raw preserved content or exposing destructive movement controls in preservation mode.
- Requiring a long press, timed gesture, multipoint gesture, path-based touch drag, or deprecated ARIA drag-and-drop state.

## Constraints and shared invariants

- Specs 0002, 0005, and 0006 remain authoritative for document ownership, dirty and preview state, undo, serialization integrity, Save/Save As concurrency, table structure, image metadata, source spelling, asset authorization, transient image state, and token lifetime. This spec adds only structural movement.
- One renderer-owned move session is allowed per editor and names one source kind, immutable source identity, source position, and current legal insertion gap. React and Zustand do not hold document copies, and any non-session transaction that changes the document cancels the session rather than maintaining a second mapped editing state.
- A successful move is one ProseMirror transaction and one undo-history event. It synchronously pins a preview tab and dirties the document through the existing editor update path; a canceled or equivalent-position operation dispatches no persistent transaction.
- Direct manipulation uses existing browser Pointer Events and ProseMirror position mapping without a new drag-and-drop dependency. The explicit Move mode is the complete input-independent interaction; direct mouse or pen dragging is an optional convenience over the same source, target validation, transaction, focus, and announcement behavior.
- Image movement preserves the node's complete persistent attributes and transient `assetId`. Moving an unchanged local, remote, embedded, blocked, broken, or loading image does not itself acquire, revoke, retry, reload, or serialize an asset.
- Row movement treats the first table row as an immovable header and permits only whole data-row movement among that table's data rows. Column movement treats each column as a whole-table unit, including its header cell, data cells, and alignment value.
- Image destinations are every ProseMirror-valid inline image insertion position in the same editable rich document, including supported paragraphs or headings inside lists, blockquotes, and table cells. Schema-invalid positions, opaque/raw content, the image's own interior, and content outside the owning document are never legal targets.
- The implementation must not use `aria-grabbed` or `aria-dropeffect`, which WAI-ARIA deprecates. Native roles, named controls, instructions, current-position text, visible target state, and polite live announcements express the interaction instead.
- While this spec is Draft or Approved, spec 0005's implemented no-reordering contract remains the shipped behavior. Implementation of this spec narrows spec 0005's row/column-reordering and image-movement non-goals and updates its cross-reference without weakening any other 0005 outcome.

## Behavior (acceptance criteria)

### Shared move entry and explicit Move mode

- AC1: Given a supported editable table selection or selected image, when its existing Table Actions or Image Actions surface opens, then it offers a named Move Row, Move Column, or Move Image action as applicable, and the same actions are absent from preservation mode, opaque/raw content, non-Markdown documents, and selections without a legal movement source.
- AC2: Given the header row is current, when Table Actions opens, then Move Row is disabled with an accessible explanation while Move Column remains available; given a table has only one data row or one column, then its corresponding move action is disabled because no different order exists.
- AC3: Given an enabled Move action is activated by click, tap, keyboard, or assistive technology, then one non-modal move session begins without changing the document, names the source and its current position, gives concise instructions, exposes Cancel and the movement controls, and moves focus to the first movement control.
- AC4: Given an active move session, when the user operates its Previous, Next, First, or Last controls by an untimed click, tap, or native button keyboard activation, then the candidate advances to the corresponding legal insertion gap, remains visibly identified, scrolls into view when necessary, and the document remains unchanged until placement is committed.
- AC5: Given an active move session, when its controls have focus, then Enter and Space retain native button activation, Escape cancels, and Tab and Shift+Tab traverse the ordinary Previous, Next, First, Last, Place Here, and Cancel controls without custom arrow-key handling or a keyboard trap.
- AC6: Given an active move session with a legal insertion gap, when Place Here is activated, then the source moves to that exact gap in one transaction; the source's own current gap is represented as an equivalent-position no-op rather than as separate before/after outcomes.
- AC7: Given Move Image mode, when the user clicks, taps, or keyboard-navigates to a legal caret position anywhere in the owning rich document, then that position becomes the candidate without editing text; ordinary document scrolling remains available, and Place Here is disabled with an accessible reason while no legal caret candidate exists.
- AC8: Given any active move session, when Cancel or Escape is activated, the owning tab changes, the document is replaced or closed, the application window loses focus, an unrelated modal surface opens, or the source ceases to exist with the same identity, then the session closes, its indicators and listeners are removed, no persistent transaction is dispatched, and no stale later input can commit it.
- AC9: Given focus moves between the owning editor and its move controller or a user scrolls the owning document, then the session remains active; ordinary internal focus transitions are not mistaken for AC8's application-window blur or unrelated-surface cancellation.
- AC10: Given a destination would produce the source's existing order, when placement is attempted, then the session closes as a no-op, focus returns as in AC11, and dirty, preview, history, serialization, image runtime, and announcements do not claim a move occurred.
- AC11: Given a move commits, then focus and selection follow the moved source: an image receives node selection at its new position, a row returns to the same logical column in the moved row, and a column returns to the same logical row in the moved column; given cancellation, focus returns to the unchanged source when it still exists or otherwise to the nearest valid text selection.
- AC12: Given a move starts, changes candidate, commits, cancels, becomes invalid, or has no alternative position, then a polite status announcement states the source kind, one-based current/candidate position with total where finite, available placement, and final outcome without relying on visual position, color, pointer movement, or deprecated drag ARIA attributes.

### Table row and column reordering

- AC13: Given a caret or cell selection in a data row, when Move Row begins, then legal insertion gaps are only the positions between, before, or after data rows in that same table; the header boundary cannot move above the original header, and another table, content outside the table, and any position that would change table shape are excluded.
- AC14: Given a data row is placed before or after another data row, then the complete row moves once, the first row remains the original header, every cell and nested supported inline value remains in its original column, and table dimensions are unchanged.
- AC15: Given a caret or cell selection in a table column, when Move Column begins, then legal insertion gaps are only the positions before, between, or after columns in that same table; another table, a partial row, and content outside the table are excluded.
- AC16: Given a column is placed before or after another column, then its header cell and every data cell move together to the new index, its left/center/right/unspecified alignment value follows that column, all other columns keep their relative order and alignment, and table dimensions are unchanged.
- AC17: Given a row or column contains links, marks, Unicode, empty cells, escaped pipes, inline code containing pipes, local/remote/embedded images, or other content supported by spec 0005's table model, when it moves, then its semantic ProseMirror subtree is preserved exactly and independently authored serialize/reparse goldens retain the moved cell boundaries, header identity, alignments, content, and image sources.
- AC18: Given a table in a supported list or blockquote position, when one of its rows or columns moves, then the surrounding structure and table position remain unchanged; unsupported nesting and opaque/raw preservation continue to expose no move action.

### Image movement and runtime ownership

- AC19: Given a selected image in supported editable rich content, when Move Image begins, then any schema-valid inline insertion gap in the same document may become the candidate, including gaps before, between, or after inline content in supported paragraphs or headings nested in lists, blockquotes, and table cells.
- AC20: Given an image is placed at a legal destination, then the same single image node moves without copying, its alt/decorative state, optional title, exact stored source, internal-source tag, and other persistent attributes remain unchanged, and removing it from its old parent leaves that parent in the nearest schema-valid empty form rather than deleting unrelated structure.
- AC21: Given the image is local, remote, embedded, loaded, blocked, broken, retryable, or loading, when it moves without changing its `assetId` or source, then its current runtime state and live capability or pending acquisition remain owned by that node, no extra request or authorization occurs, and a current async completion reuses the existing `assetId`, exact-source, and generation correlation to locate the node at its current position.
- AC22: Given an image moves into or out of a table cell, list, or blockquote, when the document saves and reparses, then the image remains at the chosen semantic position with its exact source value and metadata, and all affected surrounding Markdown retains the canonical structure guaranteed by specs 0002, 0005, and 0006.

### Direct mouse and pen dragging

- AC23: Given a movable row, column, or image is hovered, selected, or owns control focus and the input has a fine pointer, then a named drag handle appears without obscuring content; starting on other content continues ordinary editing and selection rather than initiating a drag.
- AC24: Given a mouse or pen presses a drag handle, then movement begins only after a small platform-consistent movement threshold, captures that pointer, identifies only legal targets with the same candidate indicator as explicit Move mode, and performs no document mutation before a valid pointer-up drop.
- AC25: Given direct dragging reaches the viewport edge, then bounded automatic scrolling can reveal further legal targets without moving the source; pointer capture, candidate state, and the eventual drop remain scoped to the owning editor.
- AC26: Given direct dragging ends over a legal target, then pointer-up commits the same one-transaction result as explicit Move mode; releasing outside every legal target, returning to the equivalent position, pressing Escape, receiving `pointercancel`, losing pointer capture, switching tabs, replacing the document, or blurring the application window cancels without a persistent transaction.
- AC27: Given touch input, coarse pointer input, a screen reader consuming touch gestures, or a user unable to hold and move a pointer, then the complete reorder operation remains available through AC3–AC7's visible tap controls without long press, path dragging, multipoint input, timing, or a physical keyboard; direct touch dragging is neither required nor the only path.

### Transactions, concurrency, and boundaries

- AC28: Given a successful row, column, or image move, then it is one undoable editor transaction: one Undo restores the exact prior order and selection mapping, one Redo restores the move, and edits made before or after it retain their normal independent history order.
- AC29: Given a preview tab, when a move commits, then it is synchronously pinned before the persistent transaction and becomes dirty; given the move cancels or is a no-op, preview and dirty state remain unchanged.
- AC30: Given a non-session transaction changes the document while Move mode is active, then the session cancels with AC12's invalidation announcement before stale input can move a node; selection-only, decoration-only, transient image-state, and other non-persistent transactions may continue only while the source identity and insertion gap remain valid.
- AC31: Given Save or Save As captured a snapshot before a move commits, then that save may clear only its captured snapshot and the later move remains dirty; given the move is included in the captured snapshot, existing generation and failure-atomic rules govern it without a second serialization or write path.
- AC32: Given a move commits while image resolution, remote acquisition, search decorations, or another asynchronous renderer operation is pending, then each operation applies only to its still-current owner and generation; image work reuses the existing `assetId` and exact-source lookup at the node's current position, and no completion may restore the old order, duplicate a node, revoke an unchanged image solely because it moved, or write through the active tab after an await.
- AC33: Given any movement interaction, then it invokes no filesystem, dialog, clipboard, navigation, IPC, preload, or network capability and grants no new image authority; only existing sender-owned image lifecycle work may continue under specs 0005 and 0006.
- AC34: Given row, column, or image movement, when editor transactions run, then whole-document Markdown serialization is not invoked and target discovery does not clone the document; the existing non-blocking performance project records candidate navigation and commit timing for the 100-row by 20-column table fixture and a 500-block document with images at its beginning, middle, and end.

### Responsive and accessible presentation

- AC35: Given explicit Move mode or a direct-drag indicator at the 480×320 minimum window size, 200% zoom, forced colors, or reduced motion, then source, candidate, controls, instructions, and focus remain visible or scrollably reachable, distinguishable without color or motion alone, and non-essential movement animation is disabled.
- AC36: Given any move control or direct-drag handle, then its accessible name identifies the source and action, its pointer target is at least 24 by 24 CSS pixels or has equivalent compliant spacing, hover-only controls also appear on selection or focus, and every pointer result has the complete keyboard and untimed single-pointer path defined above.
- AC37: Given automated accessibility inspection of table and image movement, then the editor and move controller retain valid roles, names, states, descriptions, focus order, and live-status behavior with no serious accessibility violations and no `aria-grabbed` or `aria-dropeffect` attribute.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1–AC12 | Browser Mode | Playwright-vs-vite complete explicit-move journeys; automated accessibility scan |
| AC13–AC18 | Browser Mode | Node serialize/reparse goldens for AC17–AC18 |
| AC19–AC22 | Browser Mode | Node serialize/reparse goldens; Playwright-vs-vite nested-destination journey |
| AC23–AC27 | Browser Mode | Playwright-vs-vite pointer, cancellation, and scrolling journey |
| AC28–AC30 | Browser Mode | Playwright-vs-vite preview-tab journey |
| AC31 | Playwright-vs-vite | Node save-coordinator snapshot proof |
| AC32 | Browser Mode | Node generation/ownership policy where pure |
| AC33 | Static | Playwright request and dialog observation |
| AC34 | CI | Browser Mode serializer-spy assertion |
| AC35–AC37 | Browser Mode | Automated accessibility scan |

## Open questions

- (none)
