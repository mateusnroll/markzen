# Spec 0005: Structured Content and Local Assets

**Status:** Implemented   **Date:** 2026-07
**Origin:** Consolidates former Draft specs 0010 (tables), 0013 (images), and the Table/Image integrations deferred from former 0008. Approval incorporates the 2026-07 contract, codebase, security, accessibility, and independent simplicity reviews. The user explicitly approved this revised local-only scope and directed implementation on 2026-07-13.

## Problem

Tables and local images are common in real Markdown but are difficult to manipulate safely in a rich editor. Markzen must provide accessible structural editing, preserve clean GFM, resolve local assets portably, and prevent document-controlled paths from escaping the Electron security boundary.

## Non-goals

- Table column resizing, cell merging, per-column alignment controls, CSV import/paste conversion, or row/column reordering.
- Always-visible delete controls on every row or column; structural deletion lives in contextual table actions.
- Image paste/drop insertion, copying images into the note folder, resizing, captions, alignment, movement, or orphan management.
- Rendering remote HTTP(S), protocol-relative, or embedded `data:` images. Their source Markdown is preserved and they remain blocked until spec 0006.
- Executing or rendering SVG content.
- Following image destinations or exposing a general renderer-readable filesystem protocol.
- A separate aggregate decoded-frame budget for animated GIF or WebP beyond this milestone's source-byte and canvas-dimension limits.

## Constraints and shared invariants

- Link, table, and image schema parsing plus loss-safe serialization are established in milestone 0002. This milestone adds table manipulation and secure local rendering without weakening those guarantees.
- Table insertion, extension, and deletion are single undoable editor transactions. Persistent mutations dirty the tab and synchronously pin a preview before committing.
- Local pixels are served only through opaque, main-issued, exact-resource bearer capabilities. A token is sufficient authority while live regardless of which Markzen window presents it; issuance remains behind sender-authorized application intents, the token exposes no path, and closing its issuing window or revoking its grant expires it. This narrowly documented possession-based exception does not make renderer-provided IDs, paths, or destinations authoritative.
- The asset scheme is separate from `markzen://app`, non-standard, secure, non-CORS, non-streaming, unavailable to Fetch, and admitted by CSP only for images. Its handler accepts only a live opaque token on an image-destination GET and never maps URL text to a path.
- Folder windows automatically authorize raster assets canonically contained by an opened root. Standalone documents automatically authorize raster assets contained by their document directory. Explicit image selection authorizes that exact canonical file.
- Path authorization, resolution, relative conversion, and containment use trusted Platform operations after symlink resolution. Existing lexical helpers remain display-only. The resulting exact resource is identified by `FileKey`; serialized Markdown retains a user-facing `/`-separated relative or absolute source.
- A Markdown-authored source outside automatic scope never creates authority. It can receive an exact-file grant only when the user explicitly selects the same `FileKey` through Authorize.
- PNG, JPEG, GIF, and WebP sources are limited to 25 MiB encoded bytes, 16,384 pixels on either canvas axis, and 40,000,000 canvas pixels. Animated GIF/WebP uses the same encoded-byte and canvas limits; aggregate frame limits are deferred to spec 0006. MIME, signature, and dimensions must agree before a capability is issued.
- Save As rebasing extends the shared failure-atomic save transaction. Destination selection/reservation and byte commit form one main-owned, generation-scoped operation; a renderer may receive only the bounded path data needed to compute a rebased snapshot plus an opaque commit token, never authority to choose another destination.
- Implementing this milestone updates spec 0001's exact CSP/asset-protocol contract, narrows spec 0002's temporary inert-image AC167, expands spec 0002's independently authored GFM fixture proof, and updates ADRs 0001–0004 where their accepted decisions are extended.

## Behavior (acceptance criteria)

### Tables

- AC1: Given an editable schema table, when it is rendered, then it is rectangular, its first row is exposed as the header, and contextual table actions are available; preservation mode and opaque/raw content expose no destructive table actions.
- AC2: Given the milestone 0004 ellipsis menu, when Table is available and activated at a valid saved selection, then a table of three columns and three total rows—including one header row—is inserted in one undoable transaction and the caret lands in the first header cell.
- AC3: Given a saved selection where a table cannot be inserted, when the toolbar renders, then Table is disabled with an accessible reason and activation dispatches no command.
- AC4: Given a caret inside a table, when Tab is pressed, then it moves through header and data cells in document order; Tab from the final cell appends one aligned data row in one undoable transaction and enters its first cell.
- AC5: Given a caret inside a table, when Shift+Tab is pressed, then it moves backward; Shift+Tab from the first header cell is a no-op and retains a valid selection.
- AC6: Given a table is hovered, contains the editor selection, or owns control focus, then its named Table Actions trigger remains visible; it disappears when none of those states applies or the tab changes.
- AC7: Given Table Actions, when opened, then it provides named Add Row, Add Column, Delete Row, Delete Column, and Delete Table actions and communicates each unavailable action.
- AC8: Given Add Row or Add Column by pointer or keyboard, when activated, then one row or column is appended in one undoable transaction, the selection remains in the table, a new row inherits each column's alignment, and a new column has unspecified alignment.
- AC9: Given the selection is in the header row, when Table Actions opens, then Delete Row is disabled and the header cannot be removed.
- AC10: Given Delete Row removes a data row, when the transaction commits, then the remaining table stays rectangular and a header-only table remains valid and selected.
- AC11: Given Delete Column would remove the sole remaining column, when activated, then the whole table is replaced by one empty paragraph in one undoable transaction and focus returns to that paragraph.
- AC12: Given Delete Table, when activated, then the complete table is replaced by one empty paragraph in one undoable transaction and focus returns to that paragraph.
- AC13: Given Table Actions is used by keyboard or assistive technology, then the current row/column indices, header state, available actions, and resulting table dimensions are exposed without relying only on spatial placement.
- AC14: Given independently authored table fixtures containing left, center, right, and unspecified alignment, empty cells, escaped pipes, inline code containing pipes, links, nested marks, Unicode, header-only data, and uneven valid GFM rows, when parsed, edited, serialized, and reparsed, then rectangular cell boundaries, alignment, and semantic content match the expected model and golden Markdown.
- AC15: Given a table represented inside a list or blockquote by the supported document model, when saved without structural edits, then serialization preserves the surrounding structure; unsupported nesting follows milestone 0002's preservation fallback.
- AC16: Given a table edit or structural action, when editor transactions run, then whole-document Markdown serialization is not invoked; the existing non-blocking performance project records editing and row-append timing for a 100-row by 20-column fixture.

### Image insertion, metadata, and paths

- AC17: Given the milestone 0004 ellipsis menu, when Image is activated, then an accessible insertion popover offers From Disk without losing the saved editor selection.
- AC18: Given From Disk, when the native chooser opens, then it filters to PNG, JPG/JPEG, GIF, and WebP and does not offer SVG.
- AC19: Given the disk chooser is canceled, when control returns, then the document, dirty state, preview state, saved selection, and grants remain unchanged and no error is shown.
- AC20: Given the chooser returns a valid raster candidate, when control returns, then a metadata step requires supplied alternative text or an explicit Decorative choice before Apply can insert; it never invents meaningful alt text from the filename.
- AC21: Given the metadata step, when Escape, outside-click, or Cancel is used, then no image node or grant is created and the saved editor selection is restored.
- AC22: Given a saved document and an authorized selected image, when Apply inserts it, then the node stores a `/`-separated path relative to the document directory when representable; a cross-volume resource uses a `/`-separated absolute display path and an accessible warning states that portability is reduced.
- AC23: Given any untitled document, when a disk image is inserted, then its live node retains a tagged internal absolute reference that is never serialized as user-authored source before first Save.
- AC24: Given an untitled image node with an internal absolute reference, when first Save commits, then the captured bytes use a destination-relative source where representable and the equivalent live-document update plus new reference base apply only after disk commit.
- AC25: Given Save As changes a saved document's directory, when its transaction captures relative local image sources, then each resolves against the captured old base and is rewritten relative to the selected new base so it still identifies the same resource; remote, data, and user-authored absolute sources remain unchanged.
- AC26: Given first Save or Save As is canceled, rejected, conflicts, or fails, when control returns, then neither live image sources nor their reference base changes and no destination reservation survives.
- AC27: Given images, alt/title metadata, or other content are edited while Save As is in flight, when its captured rebased snapshot commits, then the captured model becomes the new clean baseline, every surviving later live local source is rebased exactly once from the captured old base to the adopted new base, and every later persistent change remains dirty for a later explicit Save.
- AC28: Given spaces, parentheses, `#`, `?`, `%`, non-ASCII characters, Windows separators, UNC paths, or a different Windows volume, when a local source is resolved, rebased, or serialized, then trusted Platform path operations preserve its intended file identity and emit valid Markdown without string-prefix containment or double decoding.
- AC29: Given a selected image, when Enter, Space, or its named Image Actions control is activated, then an accessible metadata editor opens for alt/decorative state and optional title; Apply updates alt and title in one undoable transaction while preserving an unchanged source exactly, and cancellation changes nothing.
- AC30: Given the disk chooser returns a file that cannot be read, exceeds a raster limit, has a disallowed MIME/signature/dimension, or otherwise fails validation, when control returns, then no image node or grant is created, selection/dirty/preview state remains unchanged, and an accessible error explains the failure.

### Local image authorization and rendering

- AC31: Given a relative or absolute local image whose canonical target is inside an opened root, when its folder document renders, then main issues an exact-resource bearer capability and the image loads through `markzen-asset:`.
- AC32: Given a relative or absolute local image whose canonical target is inside a standalone document's directory, when that document renders, then it receives the same exact-resource capability without granting directory enumeration.
- AC33: Given an image explicitly selected in a native chooser, when it lies outside automatic scope, then only that selected `FileKey` is granted to the issuing window.
- AC34: Given an absolute or `..` image reference outside automatic scope, when rendered, then source Markdown remains untouched and an accessible blocked-image placeholder appears without issuing a capability.
- AC35: Given a blocked local image, when the user chooses Authorize and selects the same `FileKey`, then that exact resource renders without granting its parent directory; selecting a different file leaves the source and grant state unchanged with an accessible mismatch error.
- AC36: Given a live unaltered asset token, when an image-destination GET presents it from its issuing or another Markzen window, then possession authorizes only the token's exact raster resource until expiry or revocation.
- AC37: Given an expired, revoked, altered, or unknown token, a non-image request destination, a non-GET method, an unauthorized symlink target, encoded traversal, a direct Fetch/navigation attempt, or a validated file that no longer matches its granted `FileKey`, when requested, then main returns the same non-disclosing denial without exposing path or existence details.
- AC38: Given a `markzen-asset:` response, when Chromium loads it, then CSP admits it only as an image, its response is `nosniff` and non-cacheable, and it cannot navigate, execute script, request subresources, use CORS, enter the File System API, or expose a general readable response.
- AC39: Given a local source disappears, changes identity, or becomes unreadable after authorization, when rendering fails, then a selectable broken-image placeholder preserves and exposes safe alt text without leaking an unauthorized absolute path.
- AC40: Given an issuing window closes, its document base changes, or an exact-file grant is revoked, when a later request uses the former token, then it receives AC37's non-disclosing denial.
- AC41: Given a PNG, JPEG, GIF, or WebP candidate at or below all encoded-byte and canvas bounds with a matching signature, when validated, then it may render; a source above 25 MiB, above 16,384 pixels on either axis, above 40,000,000 pixels, with mismatched signature/MIME, or SVG/unsupported content is blocked while existing Markdown round-trips unchanged.
- AC42: Given an HTTP(S), protocol-relative, credential-bearing URL, `data:`, `file:`, `javascript:`, `blob:`, malformed, or custom-scheme source, when rendered in this milestone, then no network/system request or asset grant occurs and a selectable accessible blocked placeholder preserves the original Markdown.

### Image editing and shared layout

- AC43: Given an image node or placeholder, when clicked or reached in sequential keyboard order, then it receives a visible node selection and exposes its alt/decorative and loaded/blocked/broken state to assistive technology.
- AC44: Given a selected image, when Delete or Backspace is pressed, then it is removed in one undoable transaction; Escape returns to a nearby text selection without deletion.
- AC45: Given a blocked or broken image placeholder, when selected, inspected, metadata-edited, or deleted, then it supports the same keyboard path as a loaded image and serialization remains unchanged unless the node is edited or deleted.
- AC46: Given table actions, the formatting toolbar, image insertion/metadata surfaces, or search would overlap at a supported narrow size or high zoom, when they appear, then each primitive flips, clamps, or reflows to remain reachable while the shared overlay coordinator provides stacking, topmost dismissal, focus return, and tab-switch cleanup.
- AC47: Given an active editable tab, when the milestone 0004 ellipsis menu opens, then Table and Image appear as named actions alongside existing commands; neither appears in preservation mode or without an active tab.
- AC48: Given table actions, images/placeholders, asset errors, and insertion/metadata popovers in forced-colors or reduced-motion mode, then state and focus remain distinguishable without color alone and non-essential loading animation is disabled.

## Implementation ADR requirements

Before local-asset production code is accepted, add an accepted ADR recording bearer-token entropy/format and lifetime, `markzen-asset:` privileges, image-destination enforcement, sender-authorized issuance, canonical authorization and trusted path operations, response headers, MIME/signature/dimension validation, raster limits, revocation, the possession-based cross-window exception, and negative shell tests.

Update accepted ADR 0001 for the asset intent, CSP, protocol registration, and bearer exception; ADR 0002 for destination preparation/reservation and rebased commit; ADR 0003 for renderable local image nodes and expanded GFM goldens; and ADR 0004 for rebased captured/live baseline adoption. These decisions may choose implementation mechanisms but cannot weaken the observable outcomes above.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1–AC13 | Browser Mode | Playwright-vs-vite table journey |
| AC14–AC15 | Node | Browser Mode render/edit |
| AC16 | CI | Browser Mode serializer-spy assertion |
| AC17 | Browser Mode | — |
| AC18 | Shell smoke | Node dialog-options contract |
| AC19–AC21 | Browser Mode | Shell smoke chooser cancellation |
| AC22–AC28 | Node | Playwright-vs-vite Save As journey |
| AC29 | Browser Mode | — |
| AC30 | Playwright-vs-vite | Shell smoke invalid-file journey |
| AC31–AC35 | Playwright-vs-vite | Shell smoke real local render/authorize |
| AC36–AC40 | Shell smoke | Node token/path policy |
| AC41 | Node | Shell smoke real raster response |
| AC42–AC48 | Browser Mode | AC42 Playwright request observation; automated accessibility scan |

## Open questions

- (none)
