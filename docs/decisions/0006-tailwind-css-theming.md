# ADR 0006: Tailwind CSS + CSS Custom Properties for Theming

**Status:** Accepted  
**Date:** 2026-04  
**Deciders:** Mateus Pinheiro

## Context

The app needs a styling system that supports light/dark/system themes, editor-specific typography, and a design-system-friendly approach. The editor area has specific typography requirements (max content width, line height, font choices) that must be configurable by the user.

## Decision

Use **Tailwind CSS 3.x** for utility-first layout/component styling, combined with **CSS custom properties** for theming (colors, editor typography).

## Theme Architecture

All colors are defined as CSS custom properties in `src/styles/themes/light.css` and `dark.css`. The active theme class is applied to the `<html>` element based on `settingsStore.theme`.

Editor typography uses dedicated custom properties:
- `--editor-font` — configurable font family
- `--editor-font-size` — configurable size (default 17px)
- `--editor-line-width` — max content width (default 720px, iA Writer style)

The TipTap editor renders into `div.ProseMirror`, which is styled with these properties for a clean reading experience: line-height 1.7, centered content with generous padding, visually distinct heading hierarchy (size + weight, no color).

## Consequences

**Positive:**
- Tailwind handles layout; CSS custom properties handle theming — clean separation
- Theme switching is a class toggle, no re-render needed
- User-configurable typography via settings store
- CodeMirror's theme must also adapt via Zustand subscription to stay in sync

**Negative:**
- Two styling systems to maintain (Tailwind utilities + custom properties)
- Editor-specific CSS (`editor.css`) is handwritten, not Tailwind — necessary for ProseMirror's DOM structure
