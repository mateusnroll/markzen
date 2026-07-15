# Links and Images

This page contains deliberate interaction cases. Plain-click any link to place the caret without opening it; use the link popover to inspect or edit its exact destination.

## Link cases

- Safe HTTPS: [Marcus Aurelius at Project Gutenberg](https://www.gutenberg.org/ebooks/6920 "Public-domain source"). This is safe to open explicitly.
- Safe bare host: [Epictetus at Gutenberg](gutenberg.org/ebooks/10661). Markzen normalizes it in memory to HTTPS without rewriting the note.
- Non-openable relative destination: [the scratchpad](journal/Scratchpad.md). Markzen preserves it but does not navigate internally.
- Non-openable fragment: [reflection](#reflection). It remains editable and serializable.
- Confirmable custom destination: [demo protocol](stoic-demo://reflection). **Do not open it**; it exists only to demonstrate classification and the warning path.

Select a link and try Cmd/Ctrl+K, or use its popover's Edit and Remove actions. Canceling restores the selection without changing the note.

## Image failure states

The successful local-image case lives by itself in `06 — Local Image Study.md`, so its authorization is easy to inspect independently of these deliberate failures.

### Unavailable local image

![A missing sketch of a stoa](assets/missing-stoa.png "Intentionally absent")

### Blocked remote image

![A remote image that Markzen must not request automatically](https://example.com/stoic-demo/remote-bust.png "Intentionally blocked")

Both sources remain unchanged in Markdown. Their placeholders are selectable, keyboard reachable, metadata-editable, and deletable just like the loaded image.

## Reflection

Images can support attention, but they should not smuggle in ambient filesystem or network authority. The visible states make that boundary part of the document rather than a silent failure.
