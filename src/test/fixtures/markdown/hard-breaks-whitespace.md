# Verses and Line Breaks

## The Backslash Method

Roses are red,\
Violets are blue,\
Markdown is precise,\
And line breaks matter too.

## The Two-Space Method

Stars above the quiet lake,  
Ripples spreading, none to break,  
Silence holds what words forsake,  
Morning comes for memory's sake.

## Multiple Consecutive Hard Breaks

First line.\
\
Third line after an empty hard break.

## Soft Breaks Within a Paragraph

This line and
this line should merge into a single paragraph
because single newlines are soft breaks
in standard Markdown rendering.

## Paragraph with Normal Spacing

This is the first paragraph. It contains a complete thought.

This is the second paragraph. A single blank line separates them.

This is the third paragraph. Multiple blank lines between paragraphs should collapse.




This is the fourth paragraph. There were four blank lines above, but it should render the same as one.

## Mixed Content with Line Breaks

The server responded with:\
Status: 200 OK\
Content-Type: application/json\
Body: `{"success": true}`

## Hard Break Before a Block Element

This paragraph ends with a hard break.\

> And a blockquote follows immediately.

## Prose Without Breaks

In practice, most documents are written as flowing prose where each sentence follows naturally from the last. The editor should wrap these lines visually without inserting any break elements. This paragraph is intentionally written as a single long block of text to test how the editor handles natural line wrapping versus explicit line breaks.

## Whitespace Preservation Notes

The tests in this file verify that the editor correctly distinguishes between hard breaks (explicit line endings within a paragraph) and soft breaks (single newlines that should be ignored or treated as spaces).
