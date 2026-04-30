# ADR 0005: Zustand for State Management

**Status:** Accepted  
**Date:** 2026-04  
**Deciders:** Mateus Pinheiro

## Context

The app needs global state for tabs, file system state, and user settings. Editor content itself lives in TipTap's internal ProseMirror state — Zustand only holds the serialized Markdown string (for saving).

## Decision

Use **Zustand 4.x** for global application state, organized into three isolated stores:

1. **`tabsStore`** — open tabs, active tab, content, dirty state, editor mode, scroll position
2. **`fileSystemStore`** — open folder path, file tree structure
3. **`settingsStore`** — theme, font size, font family, line width, auto-save preferences

## Rationale

- Lightweight and minimal boilerplate compared to Redux
- Works well with Tauri IPC (no middleware complexity)
- Stores are pure logic — easy to unit test directly without rendering components
- No context provider wrapping required

## Consequences

**Positive:**
- Simple API, small bundle size
- Stores are testable as plain functions (no component rendering needed)
- Isolated stores prevent unrelated re-renders

**Negative:**
- Stores are module-level singletons — must be explicitly reset between tests via `useXxxStore.setState({ ...initialState })` in `beforeEach` blocks

**Critical constraint:**
Never store large content in React state unnecessarily. Editor content lives in TipTap's internal ProseMirror state. Sync to the Zustand store on blur and before save, not on every keystroke.
