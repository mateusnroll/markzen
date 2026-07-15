# The Stoic Commonplace Book

This folder is a small working library, not a museum display. Its classical passages are brief public-domain excerpts; the surrounding prompts and organization are original demo material.

> “From my grandfather Verus I learned good morals and the government of my temper.”

*Marcus Aurelius, Thoughts, Book I, George Long translation*

## Begin here

1. Open this repository with **File → Open Folder…** and choose `examples/stoic-workspace`.
2. Single-click a library note to preview it. Double-click the row or tab to keep it open.
3. Add `journal` with **File → Add Folder…**. It becomes a second root while the original root remains intact.
4. Drag the sidebar divider, then focus it and try ArrowLeft, ArrowRight, Shift+ArrowRight, Home, and End.
5. Open several notes and use the tab bar with the pointer or with Left, Right, Home, End, Enter, and Space.

The hidden `.private-reflection.md` beside this note is intentionally absent from Markzen's tree. `references.bib` is intentionally visible but subdued because it is not an editable document type.

## Write and format

Open `journal/Scratchpad.md`, place the caret in its practice area, and try these in any order:

- Type `#`, `-`, `1.`, `>`, or `- [ ]`, followed by a space, at the beginning of an empty line.
- Type the Markdown delimiters for **bold**, *italic*, ~~strike~~, or `code` character by character.
- Type three backticks followed by a space for a code block, or type the third dash in `---` for a rule.
- Select text and use the formatting toolbar. Settings can switch the toolbar between Minimal and Regular.
- Undo, switch tabs, return, and redo to see that each tab keeps its own history, caret, selection, and scroll position.

### Save and title exercises

- Check a task box and watch a preview become a pinned tab.
- Edit the document title, press Escape to cancel it, then enter a valid Unicode title and save.
- Use **Save As…** on `library/01 — Marcus Aurelius — Morning Practice.md` and save a copy under `journal`. Its relative local image should continue to render after rebasing.
- Make changes in two tabs and use **Save All**. Close a dirty tab to inspect the save, discard, and cancel decision.
- Optional: while `Scratchpad.md` is open, change it in another text editor to exercise reload and external-conflict decisions. Restore it afterward with Git if desired.

## Explore everyday features

- Press Cmd/Ctrl+F in `library/04 — Commonplace Index.md` and search for `virtue`; use Enter and Shift+Enter to move cyclically.
- Open `05 — Links and Images.md`. Plain-clicking places the caret; use the link popover or the platform modifier only on the cases explicitly marked safe.
- Put the caret in the table in `library/04 — Commonplace Index.md`. Use Tab, Shift+Tab, and **Table Actions** to add or remove structure.
- Select the loaded study image in `06 — Local Image Study.md`, open **Image Actions**, inspect its alt text and title, then cancel. In `Scratchpad.md`, insert `assets/stoic-study.png` from disk and provide meaningful alt text.
- Compare that loaded state with the unavailable local and blocked remote placeholders in `05 — Links and Images.md`.
- Open Settings with Cmd/Ctrl+, and compare System, Light, and Dark themes plus Minimal and Regular toolbars.

## Inspect loss-safe content

- `archive/Raw Marginalia.md` contains raw HTML held as an inert, byte-preserved node while the surrounding Markdown remains editable.
- `archive/Unfinished Footnote.md` contains an unresolved footnote reference. Markzen opens the complete source read-only rather than guessing and risking data loss.

---

The excerpts and translations are documented in `Sources & Attributions.md`. Relative note links are present as serialization examples, but Markzen does not navigate them internally.
