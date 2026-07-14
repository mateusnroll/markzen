# Spec 0001: Secure Runtime & Verification

**Status:** Implemented   **Date:** 2026-07
**Origin:** Consolidates draft spec 0001 and the runtime, windowing, navigation, local-resource, settings-broadcast, path-identity, and async-ownership foundations previously distributed across draft specs 0005, 0009, 0013, and 0014. No old-repository code or fixtures are imported by this milestone.

## Problem

Every later feature depends on a desktop runtime, renderer boundary, custom cross-platform window shell, and verification pipeline that are safe and deterministic from the first implementation. The application must support several Markzen windows without giving renderer content ambient Electron, filesystem, navigation, or process authority, while the same application core remains testable in a plain browser through a faithful in-memory platform.

## Non-goals

- Markdown editing and serialization behavior (spec 0002).
- User-facing file open, save, rename, tab, folder-tree, watcher, settings, dialog, or external-link workflows. This milestone provides only the runtime, minimal filesystem/path foundation, window capability, and ownership model required by later milestones.
- Loading arbitrary web content in a Markzen window.
- Auto-update, installers, code signing, notarization, crash reporting, or telemetry.
- Importing code, fixtures, assets, or implementation choices from the old repository.
- Replacing Electron with another shell. The `Platform` port must nevertheless avoid making Electron APIs part of application-domain code.

## Constraints and shared invariants

- The initial toolchain is Node.js **24.18.0**, Electron **43.1.0**, npm with a committed `package-lock.json`, and electron-builder. Node and Electron versions are pinned rather than expressed as floating ranges.
- Electron main, preload, and privileged adapters are TypeScript. Production TypeScript is strict and contains no `any`.
- The main process is the sole owner of `BrowserWindow` creation, `WindowId` assignment, native menus, native dialogs, application-protocol registration, permission handling, and privileged resource disposal.
- Production renderer assets are served only from the standard, secure custom origin `markzen://app`. The application protocol resolves a fixed allowlist of bundled renderer assets and never treats a URL path as an arbitrary filesystem path.
- Renderer code cannot select its platform by testing an ambient global alone. Development/test selection is explicit; a packaged build validates the versioned preload capability and fails closed.
- IPC channels are narrow capabilities with request and response schemas. A request is authorized only when its sender is the registered main frame at `markzen://app` for a live window. There is no generic `send`, renderer-facing arbitrary filesystem command, arbitrary URL opener, or renderer-selected destination window.
- Trusted, main-owned application services consume the Electron `Platform` adapters. The preload exposes typed application-intent capabilities, not raw `Platform.fs` methods accepting renderer-supplied paths. In browser tests, the same application services consume `MemoryPlatform` directly.
- Cross-boundary operations return discriminated serializable results: `{ ok: true, value }` or `{ ok: false, error }`. Typed failures are plain data rather than thrown custom `Error` instances. Foundational filesystem failure codes are `invalid-path`, `not-found`, `already-exists`, `not-file`, `not-directory`, `permission-denied`, `not-empty`, `unavailable`, and `io`; capability routing additionally uses `validation`, `sender`, and `ownership` failures.
- A `Path` is an opaque absolute path that is NUL-free and valid for its target platform. It is used for trusted I/O only. A `FileKey` is a separate opaque identity used for deduplication; UI display strings never serve as identity keys.
- Existing `FileKey` values canonicalize lexical and symlink aliases but intentionally do not collapse distinct hard-link paths. Case folding follows the actual filesystem volume.
- Every async result is owned by a main-assigned entity ID and a generation or operation token. Applying stale results is forbidden even when cancellation cannot stop the underlying OS call.
- Every window-scoped registration has an idempotent disposer. Closing one window cannot dispose another window's resources.
- `MemoryPlatform` implements each capability only when its first owning milestone needs it. In this milestone it implements the foundational `fs` and `window` contracts; dialog behavior is added by spec 0002 and directory listing/watching by spec 0003. Test conveniences are exposed through a separate harness, never through the application-facing port.
- Repository fixtures are compile-time test data selected only in explicit browser development/test mode. They are not production capabilities and are excluded from packaged artifacts.
- Local-resource rendering uses spec 0005's separate `markzen-asset:` protocol with opaque exact-resource bearer capabilities. Token issuance is sender-authorized and owner-lifetime-scoped, but possession is the deliberately narrow authority exception documented by that spec. Raw `file:` renderer access, arbitrary path URLs, and disabling `webSecurity` remain forbidden.
- All interactive UI receives both a stable test id and semantic accessibility behavior. A test id never substitutes for a role, name, focus order, or keyboard interaction.
- Custom chrome is required on macOS, Windows, and Linux. The minimum window size is 480×320 device-independent pixels, and chrome remains non-overlapping and operable at that size with renderer zoom at 100% or 200%.
- The production artifact flips Electron fuses to disable `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, and `GrantFileProtocolExtraPrivileges`; it enables `EnableEmbeddedAsarIntegrityValidation` and `OnlyLoadAppFromAsar`. `EnableNodeCliInspectArguments` remains enabled so Playwright `_electron` can exercise the same production artifact; this explicit exception and threat model are recorded in the security ADR.
- The first implementation creates the decisions index and an accepted Electron security/capability ADR before privileged runtime code is accepted. The ADR records the application origin, CSP, preload and IPC surface, sender validation, permission policy, fuses including the inspector exception, filesystem authority placement, typed-result taxonomy, and negative-test strategy.

## Behavior (acceptance criteria)

### Application and window lifecycle

- AC1: Given a cold app launch with no restore request, when Electron becomes ready, then the main process creates and shows exactly one Markzen window and assigns it an opaque `WindowId`.
- AC2: Given one open Markzen window, when the main-owned window factory is asked to create another, then it creates a distinct Markzen window with a different `WindowId` without replacing or reusing the first window.
- AC3: Given two open Markzen windows, when a window command or state event originates in one window, then it is delivered only to that window's renderer.
- AC4: Given two open Markzen windows, when one window closes, then only that window's subscriptions and pending-operation ownership records are disposed; the other window remains registered and usable.
- AC5: Given Linux or Windows with no Markzen windows left, when the last window closes, then the application process exits cleanly.
- AC6: Given macOS, when the last Markzen window closes and the application is later activated, then the closed window's resources remain disposed and exactly one new Markzen window is created.

### Required custom window chrome and accessibility

- AC7: Given a Markzen window on macOS, when it renders, then it uses `titleBarStyle: 'hiddenInset'` with an explicit `trafficLightPosition`, custom top chrome fills the remaining title-bar area, and no application content or interactive control overlaps the traffic-light exclusion zone.
- AC8: Given a Markzen window on Windows or Linux, when it renders, then it is explicitly frameless and visible custom controls invoke native minimize, maximize/restore, and close operations while the maximize/restore control reflects the current native state.
- AC9: Given any platform-chrome variant at the 480×320 minimum device-independent window size with renderer zoom set to 100% or 200%, when it renders, then traffic lights, window controls, drag regions, and application content remain visible, non-overlapping, and operable.
- AC10: Given the custom top chrome, when the user drags a designated empty region, then the native window moves; starting the same gesture on an interactive descendant does not drag the window or suppress the control's interaction.
- AC11: Given a custom title-bar control, when it receives keyboard focus, then Enter or Space invokes the same operation as pointer activation.
- AC12: Given a custom title-bar control, then it exposes a stable accessible name, its current state where applicable, and a visible focus indicator with at least 3:1 contrast that remains visible in forced-colors mode.
- AC13: Given a user who requests reduced motion, when shell chrome changes state, then non-essential chrome animations are disabled without removing state feedback.

### Electron security boundary

- AC14: Given any Markzen `BrowserWindow`, when its effective web preferences are inspected, then `nodeIntegration` is `false`.
- AC15: Given any Markzen `BrowserWindow`, when its effective web preferences are inspected, then `contextIsolation` is `true`.
- AC16: Given any Markzen `BrowserWindow`, when its effective web preferences are inspected, then renderer sandboxing is enabled.
- AC17: Given any Markzen `BrowserWindow`, when its effective web preferences are inspected, then `webSecurity` is enabled and `allowRunningInsecureContent` is `false`.
- AC18: Given any Markzen `BrowserWindow`, when its effective web preferences are inspected, then `experimentalFeatures`, `webviewTag`, and `navigateOnDragDrop` are `false` and no Blink feature is explicitly enabled.
- AC19: Given a packaged Markzen renderer, when its document or ordinary bundled subresource is requested, then it loads only from the fixed `markzen://app` bundle allowlist; `file:`, traversal, encoded traversal, unknown hosts, and unknown bundled paths are rejected. Spec 0005's separately registered `markzen-asset:` handler accepts only opaque exact-resource image tokens and never extends the bundle allowlist.
- AC20: Given a packaged renderer response, when its Content Security Policy is inspected, then it contains `default-src 'none'; script-src 'self'; style-src 'self'; img-src 'self' data: markzen-asset:; font-src 'self'; connect-src 'none'; media-src 'none'; object-src 'none'; child-src 'none'; frame-src 'none'; worker-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`; inline/evaluated script and development-only Vite allowances are absent.
- AC21: Given preload initialization, when its runtime surface is inspected, then it exposes one versioned API through `contextBridge`; non-function values are deeply frozen, and the surface exposes no raw `ipcRenderer`, Electron object, Node primitive, raw filesystem method, or unrestricted channel-send method.
- AC22: Given production TypeScript, when the preload and renderer compile, then the versioned capability surface and every request, response, event, and typed failure satisfy their shared static contract without `any`.
- AC23: Given production source under `src/`, when code outside `src/platform/electron/` imports `electron`, Node-only shell modules, or privileged adapter internals, then lint fails; tests and build tooling remain free to use their required Node APIs.
- AC24: Given an IPC request on an unregistered channel, when the main process receives it, then the request is rejected without invoking a handler or mutating state.
- AC25: Given an IPC request whose payload does not satisfy that channel's runtime schema, when the main process receives it, then it returns a typed validation failure without invoking the domain operation.
- AC26: Given an IPC request from a subframe, stale frame, unregistered frame, non-application origin, or frame not owned by a live registered window, when validation runs, then it returns a typed sender failure before reading payload-supplied owner identifiers or invoking a domain operation.
- AC27: Given a valid application sender whose request contains a forged or foreign owner identifier, when authority is derived from the sending frame, then it returns a typed ownership failure and does not access another window's resources.
- AC28: Given a Markzen renderer that attempts top-level navigation away from `markzen://app`, when Electron receives the navigation request, then navigation is cancelled and the current Markzen document remains loaded.
- AC29: Given renderer content that calls `window.open`, attempts to attach a `webview`, or otherwise requests a popup or embedded web contents, when Electron handles it, then creation is denied and no new `BrowserWindow`, webview, or embedded contents is created.
- AC30: Given renderer content that checks or requests a Chromium permission, when the application session handles it, then both permission-check and permission-request paths deny it unless a later approved spec adds an explicit capability.
- AC31: Given a production artifact, when its Electron fuses are read, then `RunAsNode`, `EnableNodeOptionsEnvironmentVariable`, and `GrantFileProtocolExtraPrivileges` are disabled; `EnableEmbeddedAsarIntegrityValidation`, `OnlyLoadAppFromAsar`, and the documented Playwright-required `EnableNodeCliInspectArguments` exception are enabled.

### Test-only behavior and production fail-closed boot

- AC32: Given a packaged application whose URL contains `?fixture=<name>`, when the renderer boots, then the query is ignored and no repository fixture is loaded.
- AC33: Given a packaged application whose preload API is missing, malformed, or version-incompatible, when the renderer boots, then it shows a deterministic fatal shell error and never falls back to `MemoryPlatform`.
- AC34: Given the Vite application opened in a plain browser with no preload API, when it boots in explicit development or test mode, then it selects `MemoryPlatform` and reaches the application shell without a runtime error.

### Platform, path identity, and async ownership foundations

- AC35: Given application-domain code, when it performs filesystem or window work in this milestone, then it depends only on the typed `Platform.fs` and `Platform.window` contracts; the Electron renderer invokes typed application intents and never receives raw path-based filesystem authority.
- AC36: Given a Platform operation succeeds or fails, when its result crosses an application boundary, then it is represented by the documented serializable discriminated result and one of the documented failure codes rather than a custom `Error` instance or platform-specific exception shape.
- AC37: Given `MemoryPlatform.fs`, when a test creates a new file, reads its exact bytes, or overwrites an existing file, then create refuses an existing target, overwrite refuses a missing target, and the resulting bytes plus `already-exists`, `not-found`, `not-file`, and `permission-denied` failures match the real adapter contract.
- AC38: Given `MemoryPlatform.fs`, when a test stats or removes an in-memory file or empty directory, then its metadata and `not-found`, `not-directory`, `not-empty`, `permission-denied`, `unavailable`, and fallback `io` failures match the real adapter contract; foundational removal never recursively deletes a non-empty directory.
- AC39: Given `MemoryPlatform.fs`, when a test validates or canonicalizes a path, then its normalized `Path`, `FileKey`, and `invalid-path` failure match the real adapter contract.
- AC40: Given `MemoryPlatform.window`, when tests create, address, focus, maximize/restore, minimize, and close virtual windows, then commands, state events, and registered resources remain isolated by `WindowId` using the same ownership rules as the Electron adapter.
- AC41: Given a development URL containing the name of a newly authored repository fixture, when the browser application boots, then `MemoryPlatform` loads exactly that fixture's declared filesystem and window state.
- AC42: Given a development URL naming an unknown fixture, when the browser application boots, then it presents a deterministic fixture-bootstrap error and does not silently substitute an empty fixture.
- AC43: Given an absolute platform path, when the path utility validates it, then it returns an opaque `Path` normalized according to the target platform without lexically rewriting components in a way that could change the referent across a symlink boundary.
- AC44: Given two existing paths that resolve through lexical or symlink aliases to the same canonical path, when their identities are computed, then they produce the same opaque `FileKey`; distinct hard-link paths remain distinct keys.
- AC45: Given a not-yet-existing leaf whose immediate parent exists, when its identity is computed, then its `FileKey` is derived from the canonical parent plus the normalized candidate name using the actual volume's case-sensitivity rules rather than unconditional lowercasing.
- AC46: Given a path that cannot be validated or canonicalized, when a platform operation prepares to use it, then it returns the typed path failure before starting the side effect.
- AC47: Given an async operation that captures its owner ID and generation token, when it completes after that owner or generation has been replaced, then its result is discarded and cannot mutate the replacement's state.
- AC48: Given a window with pending async operations, when the window closes, then its operation tokens are invalidated and later completions neither recreate resources nor emit unhandled errors.

### Verification, packaging, and CI

- AC49: Given the repository, when `npm run verify` runs, then it executes `tsc --noEmit` in strict mode and fails if type checking fails.
- AC50: Given the repository, when `npm run verify` runs, then it executes ESLint, including the privileged-import restriction, and fails if lint fails.
- AC51: Given the repository, when `npm run verify` runs, then it executes the Vitest Node suite and fails if a Node test fails.
- AC52: Given the repository, when `npm run verify` runs, then it executes the Vitest Browser Mode suite in real Chromium and fails if a Browser Mode test fails.
- AC53: Given the repository, when `npm run verify` runs, then it executes the Playwright browser project against Vite and `MemoryPlatform` and fails if that project fails.
- AC54: Given any constituent verification process exits non-zero, when `npm run verify` completes, then the aggregate command exits non-zero and preserves the failing process's useful output.
- AC55: Given the repository, when `npm run test:shell` runs, then electron-builder creates one unpacked production artifact for the host and the Playwright `_electron` project launches and tests that same artifact.
- AC56: Given the repository, when `npm run verify:shell` runs locally, then it first passes `npm run verify` and then runs `npm run test:shell`.
- AC57: Given the real Electron shell-smoke project, when it launches the production artifact, then it identifies a main-owned Markzen window and asserts its title is `Markzen`.
- AC58: Given a shell-smoke test fails, when Playwright reports it, then failure-only screenshots and traces are retained when the relevant page or context is available; successful runs retain no mandatory screenshot artifact.
- AC59: Given the real Electron shell-smoke project and its isolated temporary directory, when the main-side real `Platform.fs` adapter writes and reads a known payload, then the bytes round-trip and cleanup removes the temporary data.
- AC60: Given a push or pull request, when CI is triggered, then `npm run verify` runs once on Node 24.18.0 in the required `ubuntu-24.04` job before the change can pass.
- AC61: Given a push or pull request whose Linux verification job passed, when shell CI runs, then a dependent matrix executes `npm run test:shell` independently on `ubuntu-24.04`, `windows-2025`, and `macos-15` without rerunning the full verification suite in each matrix job; the Linux job provisions the virtual display required by Electron.
- AC62: Given a shell-matrix job, when packaging completes, then electron-builder produces one unpacked production artifact for that runner, fuse checks inspect that artifact, and shell smoke launches the same artifact successfully; no separately configured test artifact is built.

### Accessibility, documentation, and repository gates

- AC63: Given an interactive element introduced by this milestone, when static checks inspect it, then it has a stable `data-testid` that does not depend on visible text, DOM position, or styling.
- AC64: Given an interactive element introduced by this milestone, when its accessibility tree is inspected, then it has an appropriate native role or explicit semantic role, an accessible name, and required state attributes so state is not conveyed visually alone.
- AC65: Given a keyboard-only user, when they traverse the application shell, then every shell action introduced by this milestone is reachable in a logical order and operable without a pointer; any action that leaves its window open preserves or returns focus to a deterministic element.
- AC66: Given the application shell in its default color scheme, forced-colors mode, reduced-motion mode, 200% zoom, and each platform-chrome variant, when the automated accessibility audit and browser interaction tests run, then there are no serious or critical automated violations and custom-chrome state, focus, names, and controls remain distinguishable and reachable.
- AC67: Given the first implementation PR for this milestone, when its documentation checks run, then `docs/decisions/README.md` and an accepted Electron security/capability ADR exist and runtime configuration tests cite that ADR.
- AC68: Given functional Browser Mode or Playwright tests that operate application UI introduced by this milestone, when they locate an interactive element, then they use its stable `data-testid`; accessibility assertions may instead use roles, names, labels, and states.
- AC69: Given the repository and CI configuration, when dependency and runtime pins are inspected, then Node is fixed at 24.18.0, Electron is fixed at 43.1.0, installs use `npm ci` with the committed lockfile, and CI does not use `-latest` runner labels.

## Test mapping

Each AC has one primary proof layer. Supporting coverage may be added but does not replace the named proof.

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1–AC3 | Shell smoke | AC3 Node routing unit |
| AC4 | Node | Shell smoke two-window close |
| AC5–AC10 | Shell smoke | AC9–AC10 Browser Mode layout/interaction |
| AC11–AC13 | Browser Mode | AC11 Shell smoke native-operation assertion |
| AC14–AC21 | Shell smoke | Static configuration inspection |
| AC22–AC23 | Static | — |
| AC24–AC27 | Node | Shell smoke sender-origin negatives |
| AC28–AC30 | Shell smoke | Node policy units |
| AC31 | CI | Shell smoke production-artifact fuse read |
| AC32–AC33 | Shell smoke | — |
| AC34 | Playwright-vs-vite | — |
| AC35 | Static | Node boundary contract |
| AC36–AC40 | Node | — |
| AC41–AC42 | Playwright-vs-vite | — |
| AC43–AC48 | Node | Real-adapter path cases where applicable |
| AC49–AC56 | CI | — |
| AC57–AC59 | Shell smoke | — |
| AC60–AC62 | CI | — |
| AC63 | Static | — |
| AC64–AC66 | Browser Mode | Automated accessibility scan; shell chrome journey |
| AC67 | CI | — |
| AC68 | Static | — |
| AC69 | CI | — |

## Open questions

- (none)
