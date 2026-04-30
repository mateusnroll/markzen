# ADR 0001: Tauri 2.x Over Electron

**Status:** Accepted  
**Date:** 2026-04  
**Deciders:** Mateus Pinheiro

## Context

The app needs a shell framework to wrap the web UI and provide OS integration (file system, native dialogs, window management) across macOS, Windows, and Linux. The two mature options are Tauri 2.x and Electron.

The product's core promise is that the editor must feel fast and snappy — sub-500ms cold start, low memory footprint, native feel on every platform.

## Decision

Use **Tauri 2.x** as the shell framework.

## Comparison

| Dimension | Tauri 2.x | Electron |
|---|---|---|
| Architecture | Native OS WebView + Rust backend | Bundled Chromium + Node.js |
| Installer size | ~8-15 MB | ~100-165 MB |
| Idle memory | ~30-50 MB | ~200-300 MB |
| Cold start time | < 0.5 seconds | 1-2 seconds |
| Security model | Allowlist by default (zero-trust) | Requires manual hardening |
| Future platforms | Desktop + iOS + Android (Tauri 2.x) | Desktop only |
| Backend language | Rust (learning curve) | JavaScript/TypeScript |
| Ecosystem maturity | Growing rapidly | Very mature (VS Code, Slack) |

## Consequences

**Positive:**
- Sub-500ms cold starts and order-of-magnitude lower memory usage are measurable, user-perceived improvements
- Installer size is ~10x smaller, which matters for distribution
- Security-first architecture (permissions allowlist) reduces attack surface
- Future path to iOS/Android via Tauri 2.x mobile support
- Directly enables the "fast and lightweight" positioning against Electron-based competitors (Obsidian, MarkText)

**Negative:**
- Rust expertise is needed for backend/native plugins — however, for a Markdown editor, native backend needs are limited (file I/O, OS dialogs, file watchers), and Tauri ships built-in plugins for all of these
- WebKit rendering differences across platforms (macOS Safari WebKit vs Linux WebKitGTK vs Windows Edge WebView2) require cross-platform CSS testing
- Smaller ecosystem than Electron, though Tauri's plugin registry now exceeds 120 packages

**Risks:**
- If Tauri introduces blockers during prototyping, Electron remains a valid fallback — the frontend is a standard React app and is framework-agnostic
