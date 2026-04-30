# ADR 0009: Four-Layer Testing Strategy

**Status:** Accepted  
**Date:** 2026-04  
**Deciders:** Mateus Pinheiro

## Context

The app has three distinct domains (Rust backend, React frontend, TipTap editor) plus integrated user journeys. Each domain requires a different testing approach. The guiding principle: test each layer at the lowest level possible.

## Decision

Adopt a **four-layer test pyramid**:

```
                    ┌───────────────┐
                    │   E2E Tests   │  ~20 tests
                    │  WebdriverIO  │  CI only (Linux)
                  ──┴───────────────┴──
               ┌───────────────────────────┐
               │  Editor Behavior Tests     │  ~60 tests
               │  Vitest + jsdom            │  TipTap input rules,
               │                            │  serialization round-trips
             ──┴───────────────────────────┴──
          ┌─────────────────────────────────────┐
          │  Frontend Unit Tests                 │  ~120 tests
          │  Vitest + React Testing Library      │  Components, hooks, stores
        ──┴─────────────────────────────────────┴──
     ┌───────────────────────────────────────────────┐
     │  Rust Unit Tests                              │  ~30 tests
     │  cargo test + tauri::test::MockRuntime        │
     └───────────────────────────────────────────────┘
```

Target: ~230 automated tests, vast majority runnable without building the binary.

### Layer 1: Rust Unit Tests
- Framework: `cargo test` + `tauri::test::MockRuntime`
- Scope: file tree building, path logic, file watcher commands
- Co-located with source via `#[cfg(test)] mod tests`

### Layer 2: Frontend Unit Tests
- Framework: Vitest + React Testing Library + jsdom
- Scope: Zustand stores, custom hooks, UI components
- Tauri IPC mocked via `vi.mock()` in setup.ts
- Test files co-located with source (e.g., `tabsStore.test.ts` next to `tabsStore.ts`)

### Layer 3: Editor Behavior Tests
- Framework: Vitest + jsdom with headless TipTap editor
- Scope: input rule verification, serialization round-trips, mode-switch synchronization
- Highest-value test layer — catches editor bugs that would cause data loss
- Requires DOM polyfills (ProseMirror calls `getBoundingClientRect`, `getClientRects`, `elementFromPoint`)

### Layer 4: E2E Tests
- Framework: WebdriverIO + `tauri-driver`
- Scope: full user journeys (app launch, tab management, file save/open)
- **Linux/Windows only** — macOS WKWebView has no WebDriver support
- Native OS dialogs cannot be automated — use debug-only Tauri commands gated behind `#[cfg(debug_assertions)]`

## Coverage Targets

| Layer | Target |
|---|---|
| Rust commands/path logic | 80% line coverage |
| Zustand stores | 95% line coverage |
| Custom hooks | 85% line coverage |
| TipTap input rules | All patterns in the input rules table |
| Serialization round-trips | All Markdown samples must pass |
| UI components | 70% line coverage |
| E2E flows | 5 core user journeys |

## Consequences

**Positive:**
- Most tests run in < 30 seconds without building the binary
- Editor behavior tests catch data-loss bugs early (serialization, input rules)
- CI can run Rust and frontend tests in parallel

**Negative:**
- E2E tests are slow (~5 min, requires full release build) and Linux-only in CI
- TipTap requires DOM polyfills in jsdom (setup complexity)
- Input rule tests require character-by-character dispatch — `setContent()` bypasses input rules entirely

## Known Constraints

- Zustand stores are module-level singletons — must be reset between tests
- `ClipboardEvent` must be available in jsdom for paste rule initialization
- `tauri-driver` E2E tests should be treated as smoke tests, not comprehensive regression
