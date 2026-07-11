# ADR 0001: Electron security and capability boundary

**Status:** Accepted  
**Date:** 2026-07-11  
**Spec:** [0001 — Secure Runtime & Verification](../specs/0001-secure-runtime-and-verification.md)

## Context

Markzen runs trusted application code in Electron while opening user-authored Markdown in later milestones. A renderer compromise must not become ambient filesystem, process, navigation, or cross-window authority. The same application services must also run against a deterministic browser-only platform for Browser Mode and Playwright-vs-Vite tests.

The production artifact itself must be exercised by Playwright `_electron`. That automation relies on Electron's Node inspector arguments, while several other Electron runtime features are unnecessary and expand the packaged attack surface.

## Decision

### Application origin and renderer policy

- Register `markzen` as a standard, secure scheme before Electron becomes ready and serve the renderer only from `markzen://app`.
- Build an allowlist from packaged renderer assets. Protocol requests select an allowlisted key; URL paths are never joined directly to arbitrary filesystem paths.
- Return the exact production CSP required by spec 0001 AC20 on every application response. Vite development allowances exist only in the browser development server and never in packaged responses.
- Keep `nodeIntegration`, insecure content, experimental features, webviews, drag navigation, and explicit Blink features disabled. Keep context isolation, sandboxing, and web security enabled.
- Reject top-level navigation away from the application origin, all popups, all webview attachment, and all Chromium permission checks and requests.

### Capability and IPC boundary

- Electron-specific code lives in `src/platform/electron/`. Domain code imports only serializable contracts from `src/platform/`.
- Trusted main-owned application services call privileged filesystem adapters. The preload exposes application intents such as window operations; it never exposes raw Electron objects, raw IPC, Node primitives, or a path-based filesystem API.
- Each IPC channel has a closed request schema and a serializable discriminated result. Custom `Error` instances do not cross the bridge.
- Validate the sender before the payload: it must be the registered main frame at `markzen://app` for a live `BrowserWindow`. A renderer-provided `WindowId` or other owner identifier never establishes authority.
- Route results and events through the sender-derived `WindowId`. Window registrations and subscriptions have idempotent disposers, and pending operations carry owner plus generation tokens.

### Platform and identity

- `MemoryPlatform` implements the same application-facing contract and typed filesystem failures as the real adapter, while fixture mutation and observability live only in its test harness.
- `Path`, `FileKey`, and `WindowId` are separate opaque types. Display paths do not establish equality or authority.
- Existing-file identity uses canonical paths after symlink resolution and deliberately leaves separate hard-link paths distinct. Missing-leaf identity combines the canonical existing parent with a candidate normalized according to the actual filesystem's case behavior.

### Packaging and fuses

- Use electron-builder with ASAR packaging and one unpacked production artifact per CI runner. Shell smoke and fuse checks exercise that same artifact; there is no differently configured test artifact.
- Disable `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, and `GrantFileProtocolExtraPrivileges`.
- Enable `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar`.
- Keep `EnableNodeCliInspectArguments` enabled because Playwright `_electron` uses the inspector to automate the packaged application. This is an explicit local-machine threat-model exception: it does not grant renderer authority, requires process-launch control, and is preferable to testing a materially different artifact. Revisit it if Playwright gains a production-safe automation transport.

### Test-only behavior

- Browser fixtures are compile-time development/test data and are absent from packaged behavior.
- Later dialog scripting is registered only in a non-packaged process with its dedicated test flag and is never exposed through the production preload API.
- Negative shell tests load the production renderer in controlled windows or origins from the external test runner; production does not register generic debug IPC channels.

## Consequences

- Main-process services and IPC schemas require more explicit code than calling Electron or Node APIs from the renderer, but authority and serialization remain reviewable.
- The fixed application protocol makes CSP headers and origin checks deterministic and avoids `file:` privileges.
- Enabling Node inspector arguments preserves test equivalence at the cost of a documented local-launch attack surface. Other unnecessary fuses remain disabled.
- Future asset, dialog, watcher, settings, and external-opening capabilities must extend the narrow contract in their owning Approved spec and update this ADR when they change its trust model.

## Verification

- Static checks enforce production import boundaries and typed preload contracts.
- Node tests cover schemas, sender-first authorization, ownership, typed results, path identity, and stale-operation disposal.
- Browser Mode tests cover custom chrome semantics, keyboard behavior, focus, forced-color/reduced-motion styling, and accessibility audits.
- Playwright-vs-Vite tests cover explicit MemoryPlatform boot and fixture failure behavior.
- Shell smoke inspects effective BrowserWindow preferences, application responses, CSP, preload surface, navigation/popup/permission denial, multi-window routing, custom native chrome operations, real filesystem round-trips, packaged boot failure, and diagnostic capture.
- CI reads the fuses and launches the same electron-builder artifact on pinned Linux, Windows, and macOS runners.
