# Markdown Syntax FAQ

## How Do I Display Literal Asterisks?

To show asterisks without triggering emphasis, escape them with a backslash: \*this is not italic\* and \*\*this is not bold\*\*.

The price is $19.99 per month \* billed annually.

## How Do I Show Literal Underscores?

Variable names like \_\_init\_\_ and MAX\_RETRY\_COUNT appear frequently in Python code. Escape them to prevent italic formatting.

## Can I Start a Line with a Hash Without Creating a Heading?

\# This line starts with a hash but is not a heading.

\## Neither is this one.

## How Do I Show Brackets and Parentheses?

The syntax \[text\](url) creates a link. To display it literally, escape the brackets.

Array access uses `arr[0]` notation, which normally doesn't need escaping inside inline code.

## Backtick Escaping

To display a literal backtick outside of code: \`not code\`.

Inside inline code, backticks are handled by using double backticks: ``code with ` inside``.

## Pipe Characters

Table cell separators use the pipe character. To include a literal pipe: \| this is not a table column.

## HTML Entities

The characters &amp;, &lt;, and &gt; are HTML entities for ampersand, less-than, and greater-than.

In code: `if (a < b && c > d)` the angle brackets and ampersand are displayed literally.

The expression `x &lt; y` shows a raw HTML entity inside inline code.

## Unicode Characters

### Accented Letters

Résumé, naïve, café, São Paulo, Zürich, Malmö.

### CJK Characters

日本語テスト (Japanese), 中文测试 (Chinese), 한국어 테스트 (Korean).

### Emoji

Common emoji in technical docs: ✅ passed, ❌ failed, ⚠️ warning, 🚀 deployed, 🐛 bug.

## URLs with Special Characters

Visit [search results](https://example.com/search?q=hello+world&lang=en&sort=relevance#top) for more.

A URL with encoded spaces: [my document](https://example.com/docs/my%20document.pdf).

An email link: [contact us](mailto:support@example.com?subject=Help&body=I%20need%20help).

## Consecutive Special Characters

The pattern `***` in a regular paragraph is three asterisks, not a horizontal rule (because it's inline). Similarly, `---` inside a sentence is just three hyphens.

## Mixed Escapes in Context

The file path `/home/user/my\_project/\*\*/\*.ts` uses escaped characters that would otherwise be interpreted as markdown formatting.

## Summary

When in doubt, use a backslash before any character that has special meaning in Markdown: \\ \` \* \_ \{ \} \[ \] \( \) \# \+ \- \. \!
