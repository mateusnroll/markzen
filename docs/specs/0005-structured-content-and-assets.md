# Spec 0005: Structured Content and Assets

**Status:** Draft   **Date:** 2026-07
**Origin:** Consolidates former Draft specs 0010 (tables), 0013 (images), and the Table/Image integrations deferred from former 0008. Prior behavior was researched from the origins recorded in those drafts; no old-repository artifacts are copied here.

## Problem

Tables and images are common in real Markdown but are difficult to manipulate safely in a rich editor. Markzen must provide accessible structural editing, preserve clean GFM, resolve local assets portably, and prevent document-controlled paths or remote resources from escaping the Electron security boundary.

## Non-goals

- Table column resizing, cell merging, per-column alignment controls, or CSV import/paste conversion.
- Always-visible delete controls on every row or column; structural deletion lives in contextual table actions.
- Image paste/drop insertion, copying images into the note folder, resizing, captions, alignment, or orphan management.
- Automatic remote-image loading.
- Executing or rendering active SVG content during the initial rewrite.
- Following image destinations or exposing a general renderer-readable filesystem protocol.

## Constraints and shared invariants

- Link, table, and image schema parsing plus loss-safe serialization are established in milestone 0002. This milestone adds manipulation and secure rendering without weakening those guarantees.
- Table insertion, extension, reorder, and deletion are single undoable editor transactions. Persistent mutations dirty the tab and synchronously pin a preview before committing.
- Local pixels are served only through opaque, main-issued, window-scoped capabilities. A capability identifies one authorized resource; it never exposes a filesystem path or general fetch API.
- Folder windows automatically authorize assets contained by an opened root. Standalone documents authorize assets contained by their directory. Explicit image selection authorizes that exact file.
- Path authorization uses milestone 0001's canonical, segment-safe `Path` containment after symlink resolution; the resulting exact resource is then identified by `FileKey`. Serialized Markdown retains the user-facing relative or absolute source.
- A Markdown-authored source outside the automatic scope never creates authority. It can receive an exact-file grant only through explicit user action.
- Remote-image permission is scoped to the requesting WindowId, document, and exact URL for the current app session. It is not persisted as a general origin permission.
- Safe raster `data:` sources are limited to PNG, JPEG, GIF, and WebP with at most 10 MiB decoded bytes. SVG and other active data types remain preserved but blocked.

## Behavior (acceptance criteria)

### Tables

- AC1: Given a supported GFM table from disk, when opened, then it renders as a rectangular table whose first row is exposed as the header and whose document model matches milestone 0002's expected fixture.
- AC2: Given a table with left, center, right, or unspecified alignment, when parsed and serialized without edits, then its semantic alignment and cell content match the approved golden Markdown.
- AC3: Given the milestone 0004 ellipsis menu, when Table is available and activated at a valid selection, then a table of three columns and three total rows—including one header row—is inserted and the caret lands in the first header cell.
- AC4: Given a selection where a table cannot be inserted, when the toolbar renders, then Table is disabled with an accessible reason and no command is dispatched.
- AC5: Given a caret inside a table, when Tab is pressed, then it moves through header and data cells in document order; Tab from the final cell appends one data row and enters its first cell.
- AC6: Given a caret inside a table, when Shift+Tab is pressed, then it moves backward; Shift+Tab from the first header cell is a no-op and retains a valid selection.
- AC7: Given a table is hovered, contains the editor selection, owns control focus, or is being dragged, then contextual controls remain visible; they disappear only when none of those states apply or the tab changes.
- AC8: Given table controls by pointer or keyboard, when Add Row or Add Column is activated, then one row or column is appended in a single undoable transaction and the resulting selection remains in the table.
- AC9: Given a table row control, when a data row is dragged to a legal vertical target, then a drop indicator tracks the target and drop reorders exactly that row; the header never becomes draggable or displaced.
- AC10: Given a table column control, when a column is dragged to a legal horizontal target, then its header, data cells, and alignment metadata move together.
- AC11: Given a pointer drag below its movement threshold, released outside the table, canceled with Escape, interrupted by blur, or invalidated by tab switching, then it performs no document transaction and all drag UI clears.
- AC12: Given a one-data-row table, when that row is dragged without another legal position, then the operation is a no-op and does not dirty or corrupt the document.
- AC13: Given a focused row or column handle, when Space starts keyboard-grab mode, arrow keys change the legal target, and Space drops, then the structure reorders exactly once and the new position is announced.
- AC14: Given keyboard-grab mode, when Escape is pressed, then reorder cancels, content remains unchanged, and focus returns to the original handle.
- AC15: Given a caret in a table, when Alt+F10 is pressed, then focus moves to its named contextual controls; Escape returns to the originating cell selection.
- AC16: Given the Table Actions menu, when opened, then it provides named Add Row, Add Column, Move Row, Move Column, Delete Row, Delete Column, and Delete Table actions with unavailable actions disabled.
- AC17: Given Delete Row or Delete Column would leave no valid GFM table, when activated, then the whole table is replaced by an empty paragraph in one undoable transaction.
- AC18: Given table controls, when used by keyboard or assistive technology, then row/column indices, header state, available actions, grab state, and resulting positions are exposed without relying only on spatial placement.
- AC19: Given cells containing escaped pipes, inline code with pipes, links, nested marks, Unicode, or empty content, when edited and saved, then cell boundaries and semantic content survive the milestone 0002 golden and expected-model checks.
- AC20: Given malformed or uneven table source that cannot enter the table schema losslessly, when opened, then milestone 0002's raw-preservation fallback applies and this milestone exposes no destructive table controls.
- AC21: Given a table represented inside a list or blockquote by the supported document model, when saved without structural edits, then serialization preserves the surrounding structure; unsupported nesting uses the preservation fallback.
- AC22: Given a 100-row by 20-column fixture, when a cell is edited or one row is appended, then the editor remains responsive under milestone 0002's input-latency budget and no whole-document serialization runs on keystroke.

### Image insertion and paths

- AC23: Given the milestone 0004 ellipsis menu, when Image is activated, then an accessible popover offers From Disk and From URL without losing the editor selection.
- AC24: Given From Disk, when the chooser opens, then it filters to PNG, JPG/JPEG, GIF, and WebP; active SVG is not offered during the initial rewrite.
- AC25: Given the disk chooser is canceled, when control returns, then the document, dirty state, preview state, and selection remain unchanged and no error is shown.
- AC26: Given a saved document and an authorized selected image, when inserted, then the node stores a `/`-separated path relative to the document directory when representable; a cross-volume resource uses an absolute display path and warns that portability is reduced.
- AC27: Given an untitled document in a folder window with exactly one root, when an image is inserted, then the node uses that root as its provisional reference base; other untitled documents retain an internal absolute source until first Save.
- AC28: Given an untitled image node with a provisional or absolute source, when first Save succeeds, then milestone 0002's save transaction converts it to a destination-relative source where representable and applies the equivalent live-document update only after commit.
- AC29: Given Save As moves a document, when its transaction captures relative local image sources, then each resolves against the old base and is rewritten relative to the new base so it still identifies the same resource; remote, data, and absolute sources remain unchanged.
- AC30: Given Save As is canceled or fails, when control returns, then neither live image sources nor their reference base changes.
- AC31: Given images are inserted or edited while Save As is in flight, when its captured snapshot commits, then those later sources are rebased from the captured old base to the adopted new base, remain dirty, and are persisted only by a later explicit Save.
- AC32: Given spaces, parentheses, `#`, `?`, `%`, non-ASCII characters, Windows separators, UNC paths, or a different Windows volume, when a local source is parsed, rendered, or serialized, then Platform path helpers preserve its intended file identity and emit valid Markdown without double decoding.
- AC33: Given an image insertion, when the user supplies alternative text or explicitly marks the image decorative, then the resulting Markdown records the supplied alt value; insertion cannot silently invent meaningful alt text from a filename.
- AC34: Given an existing image with an optional title, when its metadata is edited, then alt and title update in one undoable transaction and preserve any unchanged source exactly.

### Local image authorization and rendering

- AC35: Given a relative image whose canonical target is inside an opened root, when its folder document renders, then the main process issues a window-scoped exact-resource capability and the image loads through the safe protocol.
- AC36: Given a relative image whose canonical target is inside a standalone document's directory, when that document renders, then it receives the same exact-resource capability without granting directory enumeration.
- AC37: Given an image explicitly selected in a native chooser, when it lies outside automatic scope, then only that exact canonical file is authorized for the owning window.
- AC38: Given an absolute or `..` image reference outside authorized scope, when parsed, then source Markdown remains untouched and an accessible blocked-image placeholder appears instead of issuing a capability.
- AC39: Given a blocked local image, when the user explicitly chooses Locate/Authorize and selects the same canonical file, then that exact resource renders for the current window without granting its parent directory.
- AC40: Given an asset capability from another window, an expired capability, an altered token, a non-image MIME type, an unauthorized symlink target, encoded traversal, or direct protocol fetch, when requested, then the main process denies it without exposing the filesystem path or useful existence details.
- AC41: Given a Markzen asset response, when loaded by Chromium, then it is usable only as an image resource, cannot navigate, execute script, request subresources, bypass CSP, or expose a general readable file response.
- AC42: Given a local source disappears or becomes unreadable after authorization, when rendering fails, then a selectable broken-image placeholder preserves and exposes safe alt text without leaking an unauthorized absolute path.
- AC43: Given the owning window closes, its document base changes, or an exact-file grant is revoked, when later requests use the former capability, then they are denied.

### Remote and embedded images

- AC44: Given an HTTPS image source, when the document opens, then a remote-image placeholder shows its origin and a named Load action; no network request occurs automatically.
- AC45: Given the user activates Load for an HTTPS image, when requested, then it loads for the current app session without credentials, cookies, or referrer and cannot navigate the renderer.
- AC46: Given an HTTP, protocol-relative, credential-bearing, malformed, `file:`, `javascript:`, `blob:`, or custom-scheme image source, when rendered, then no network/system request occurs and an accessible blocked placeholder preserves the source.
- AC47: Given a `data:` source with PNG, JPEG, GIF, or WebP MIME and no more than 10 MiB decoded bytes, when rendered, then it displays without granting script or navigation capability.
- AC48: Given SVG, SVG data, an unsupported MIME, malformed encoding, or a raster data source above the decoded limit, when rendered, then it is blocked while its original Markdown round-trips unchanged.
- AC49: Given a remote request fails or the app is offline, when rendering completes, then an accessible remote-error placeholder remains selectable and offers Retry without changing Markdown.

### Image editing and shared layout

- AC50: Given an image node, when clicked or reached by keyboard, then it receives a visible node selection and exposes its alt/decorative state to assistive technology.
- AC51: Given a selected image, when Delete/Backspace is pressed, then it is removed in one undoable transaction; Escape returns to a nearby text selection without deletion.
- AC52: Given a selected image, when pointer drag or Alt+Arrow moves it to a legal document position, then exactly one undoable transaction reorders the node and the resulting position is announced.
- AC53: Given an image drag is canceled, released outside a legal document position, interrupted by blur, or invalidated by a tab switch, then no content changes and drag UI clears.
- AC54: Given a missing, blocked, invalid, or offline image placeholder, when selected, deleted, moved, or inspected, then it supports the same keyboard path as a successfully rendered image and serialization remains unchanged unless the node is edited or deleted.
- AC55: Given table controls, the formatting toolbar, image popover, or search panel would overlap at a supported narrow size or high zoom, when they appear, then milestone 0004's overlay manager keeps the active controls reachable and closes them safely on tab switch.
- AC56: Given From URL, when the user submits a valid HTTPS or permitted raster `data:` source with alt/decorative metadata, then one image node is inserted and an HTTPS source starts in the explicit-load placeholder state.
- AC57: Given From URL, when the value is empty, malformed, unsafe, or unsupported, then Apply shows an inline accessible error and leaves the document unchanged; Escape or outside-click cancels and restores the saved editor selection.
- AC58: Given an active editable tab after this milestone is implemented, when the milestone 0004 ellipsis menu opens, then Table and Image appear as named actions alongside the existing commands; neither action appears in preservation mode or without an active tab.
- AC59: Given the disk chooser returns a file that cannot be read, has a disallowed MIME/signature, or fails validation, when control returns, then no image node or grant is created, selection/dirty state remains unchanged, and an accessible error explains the failure.
- AC60: Given table controls, image nodes/placeholders, asset errors, and insertion popovers in forced-colors or reduced-motion mode, then state and focus remain distinguishable without color alone and non-essential drag/loading animation is disabled.
- AC61: Given an approved HTTPS remote-image request redirects or returns a response, then every redirect remains credential-free HTTPS and same-origin with at most five hops, and the final response must be an allowed raster MIME within configured compressed, decoded-byte, and pixel-dimension limits; otherwise loading stops in the blocked/error state.
- AC62: Given Delete Table is activated directly, then the complete table is replaced by one empty paragraph in a single undoable transaction and focus returns to that paragraph.

## Implementation ADR requirement

At the start of this milestone, before local-asset production code is written, an accepted ADR must record the opaque capability format and lifetime, custom-protocol privileges, sender/window validation, canonical authorization checks, response headers, redirect policy, remote-image session grants, raster/network limits, SVG decision, revocation, and the negative shell-test strategy. The ADR may choose implementation libraries but cannot weaken the observable security outcomes above.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1 | Browser Mode | Node expected-model fixture |
| AC2 | Node | Browser Mode render |
| AC3–AC18 | Browser Mode | Playwright-vs-vite toolbar/table journey |
| AC19–AC21 | Node | Browser Mode preservation state |
| AC22 | Browser Mode | — |
| AC23–AC34 | Playwright-vs-vite | AC24–AC25 Shell smoke dialog journey |
| AC35–AC39 | Playwright-vs-vite | Shell smoke authorized local render |
| AC40–AC43 | Shell smoke | Node capability/path validation |
| AC44–AC49 | Browser Mode | Playwright-vs-vite scripted network journey |
| AC50–AC55 | Browser Mode | Automated accessibility scan |
| AC56–AC57 | Browser Mode | — |
| AC58 | Browser Mode | — |
| AC59 | Playwright-vs-vite | Shell smoke invalid-file journey |
| AC60 | Browser Mode | Automated accessibility scan |
| AC61 | Playwright-vs-vite | Shell smoke redirect/protocol negative |
| AC62 | Browser Mode | — |

## Open questions

- (none)
