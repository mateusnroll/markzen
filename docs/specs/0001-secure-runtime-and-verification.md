# Spec 0001: Secure Runtime & Verification

**Status:** Draft   **Date:** 2026-07
**Origin:** Consolidates draft spec 0001 and the runtime, windowing, navigation, local-resource, settings-broadcast, path-identity, and async-ownership foundations previously distributed across draft specs 0005, 0009, 0013, and 0014. No old-repository code or fixtures are imported by this milestone.

## Problem

Every later feature depends on a desktop runtime, a renderer boundary, and a verification pipeline that are safe and deterministic from the first implementation. The application must support several Markzen windows without giving renderer content ambient Electron, filesystem, navigation, or process authority, while the same application core remains testable in a plain browser through a faithful in-memory platform.

## Non-goals

- Markdown editing and serialization behavior (spec 0002).
- User-facing file open, save, rename, tab, folder-tree, watcher, settings, or external-link workflows. This milestone provides the ports and ownership model those workflows consume.
- Loading arbitrary web content in a Markzen window.
- Auto-update, installers, code signing, notarization, crash reporting, or telemetry.
- Importing code, fixtures, assets, or implementation choices from the old repository.
- Replacing Electron with another shell. The `Platform` port must nevertheless avoid making Electron APIs part of application-domain code.

## Constraints and shared invariants

- Electron main, preload, and privileged adapters are TypeScript. Production TypeScript is strict and contains no `any`.
- The main process is the sole owner of `BrowserWindow` creation, `WindowId` assignment, native menus, native dialogs, protocol registration, permission handling, and privileged resource disposal.
- Renderer code cannot select its platform by testing an ambient global alone. Development/test selection is explicit; a packaged build validates the versioned preload capability and fails closed.
- IPC channels are narrow capabilities with request and response schemas. The sender determines window authority; there is no generic `send`, arbitrary filesystem command, arbitrary URL opener, or renderer-selected destination window.
- A `Path` is a validated opaque absolute path used for I/O. A `FileKey` is a separate opaque identity used for deduplication. UI display strings never serve as identity keys.
- Existing `FileKey` values canonicalize symlink aliases but intentionally do not collapse distinct hard-link paths. Case folding follows the actual filesystem volume.
- Every async result is owned by a main-assigned entity ID and a generation or operation token. Applying stale results is forbidden even when cancellation cannot stop the underlying OS call.
- Every window-scoped registration has an idempotent disposer. Closing one window cannot dispose another window's resources.
- `MemoryPlatform` implements the same public contract and typed error taxonomy as the Electron platform; test conveniences are exposed through a separate harness, not through the application-facing port.
- Dialog scripting and fixture loading are test mechanisms, not production features. Packaged negative tests must prove their absence.
- Future local-resource rendering must use a main-registered safe protocol with opaque, scoped capabilities. Raw `file:` renderer access, arbitrary path URLs, and disabling `webSecurity` are forbidden.
- All interactive UI receives both a stable test id and semantic accessibility behavior. A test id never substitutes for a role, name, focus order, or keyboard interaction.
- Packaging uses **electron-builder**. Its configuration preserves the security settings and excludes test-only fixture/debug entrypoints from packaged artifacts.
- The first implementation creates the decisions index and Electron security/capability ADR before privileged runtime code is accepted.
- The first implementation also creates `.claude/skills/verify/SKILL.md`; the skill runs `npm run verify` and surfaces the failing command and useful output when verification fails.

## Behavior (acceptance criteria)

### Application and window lifecycle

- AC1: Given a cold app launch with no restore request, when Electron becomes ready, then the main process creates and shows exactly one Markzen window and assigns it an opaque `WindowId`.
- AC2: Given one open Markzen window, when the main process handles an authorized request to create another, then it creates a distinct Markzen window with a different `WindowId` without replacing or reusing the first window.
- AC3: Given two open Markzen windows, when a command or dialog result originates in one window, then it is delivered only to that window's renderer.
- AC4: Given two open Markzen windows with registered resources, when one window closes, then only that window's dialogs, subscriptions, pending-operation ownership records, and other scoped resources are disposed.
- AC5: Given Linux or Windows with no Markzen windows left, when the last window closes, then the application process exits cleanly.
- AC6: Given macOS, when the last Markzen window closes and the application is later activated, then the closed window's resources remain disposed and exactly one new Markzen window is created.

### Custom window chrome and accessibility

- AC7: Given a Markzen window on macOS, when it renders, then it uses `titleBarStyle: 'hiddenInset'` with an explicit `trafficLightPosition`, and no application content overlaps the traffic-light hit area.
- AC8: Given a Markzen window on Windows or Linux, when it renders without a native title bar, then visible custom controls invoke native minimize, maximize/restore, and close operations and reflect the current maximized state.
- AC9: Given the top chrome, when the user drags a designated empty region, then the native window moves; starting the same gesture on an interactive descendant does not drag the window or suppress the control's interaction.
- AC10: Given a custom title-bar control, when it receives keyboard focus, then Enter or Space invokes the same operation as pointer activation.
- AC11: Given a custom title-bar control, then it exposes a stable accessible name, its current state where applicable, and a visible focus indicator that remains distinguishable at WCAG 2.2 AA contrast and in forced-colors mode.
- AC12: Given a user who requests reduced motion, when shell chrome changes state, then non-essential chrome animations are disabled without removing state feedback.

### Electron security boundary

- AC13: Given any Markzen `BrowserWindow`, when its effective web preferences are inspected, then `nodeIntegration` is `false`.
- AC14: Given any Markzen `BrowserWindow`, when its effective web preferences are inspected, then `contextIsolation` is `true`.
- AC15: Given any Markzen `BrowserWindow`, when its effective web preferences are inspected, then renderer sandboxing is enabled.
- AC16: Given any Markzen `BrowserWindow`, when its effective web preferences are inspected, then `webSecurity` remains enabled.
- AC17: Given a production renderer response, when its Content Security Policy is inspected, then scripts and objects are restricted to approved application sources, inline/evaluated script is disallowed, framing is disallowed, and unapproved network connections are blocked; development-only Vite allowances are absent.
- AC18: Given renderer code, when preload initializes, then it exposes one versioned, deeply frozen, typed API through `contextBridge` and exposes no raw `ipcRenderer`, Electron object, Node primitive, or unrestricted channel-send method.
- AC19: Given source code outside the privileged Electron adapter directory under `src/platform/`, when it imports `electron`, Node-only shell modules, or privileged adapter internals, then lint fails.
- AC20: Given an IPC request on an unregistered channel, when the main process receives it, then the request is rejected without invoking a handler or mutating state.
- AC21: Given an IPC request whose payload does not satisfy that channel's runtime schema, when the main process receives it, then it returns a typed validation error without invoking the domain operation.
- AC22: Given an IPC request containing a forged or foreign owner identifier, when the main process derives authority from the sending frame, then it returns a typed ownership error and does not access another window's resources.
- AC23: Given a Markzen renderer that attempts top-level navigation away from the application origin, when Electron receives the navigation request, then navigation is cancelled and the current Markzen document remains loaded.
- AC24: Given renderer content that calls `window.open` or otherwise requests a popup, when Electron receives the request, then no new `BrowserWindow` or embedded web view is created.
- AC25: Given renderer content that requests a Chromium permission not explicitly granted by an approved application capability, when Electron handles the request, then permission is denied.
- AC26: Given the typed external-opening primitive and a syntactically valid, credential-free `https:`, `http:`, or `mailto:` URL supplied by an explicit application action, when the primitive is invoked, then the main process delegates that URL to the operating system without navigating a Markzen window.
- AC27: Given the typed external-opening primitive and a `javascript:`, `data:`, `file:`, malformed, credential-bearing, or unapproved custom-scheme URL, when the primitive is invoked, then it returns a typed rejection and does not call the operating-system shell.

### Test-only capabilities and production fail-closed behavior

- AC28: Given a non-packaged shell-smoke process started with the dedicated test flag, when the test harness scripts a native-dialog result, then the next matching dialog consumes that result without displaying native UI.
- AC29: Given a packaged application, when it starts with the test flag or a debug-hook-shaped IPC request, then no dialog-scripting hook is registered or callable.
- AC30: Given a packaged application whose URL contains `?fixture=<name>`, when the renderer boots, then the query is ignored and no fixture data is loaded.
- AC31: Given a packaged application whose preload API is missing, malformed, or version-incompatible, when the renderer boots, then it shows a deterministic fatal shell error and never falls back to `MemoryPlatform`.
- AC32: Given the Vite application opened in a plain browser with no preload API, when it boots in development or test mode, then it selects `MemoryPlatform` explicitly and reaches the application shell without a runtime error.

### Platform, path identity, and async ownership foundations

- AC33: Given application-domain code, when it performs shell work, then it depends only on the typed `Platform` capability groups (`fs`, `dialog`, `window`, and allowlisted `shell`) and receives serializable typed results and errors.
- AC34: Given `MemoryPlatform.fs`, when a test creates, reads, overwrites, lists, stats, canonicalizes, or removes an in-memory entry, then the result and typed failure class match the documented real-platform contract for that operation.
- AC35: Given `MemoryPlatform.dialog`, when several dialog results are queued, then matching dialog calls consume them in FIFO order and cancellation is represented without application-state mutation.
- AC36: Given `MemoryPlatform.fs.watch`, when a test registers a watcher and emits a synthetic event, then only active matching registrations receive it, and disposing a registration decreases the observable active-watcher count.
- AC37: Given `MemoryPlatform.window`, when tests create, address, focus, and close virtual windows, then commands and registered resources remain isolated by `WindowId` using the same ownership rules as the Electron adapter.
- AC38: Given a development URL containing the name of a newly authored repository fixture, when the browser application boots, then `MemoryPlatform` loads exactly that fixture's declared filesystem, dialog, and window state.
- AC39: Given a development URL naming an unknown fixture, when the browser application boots, then it presents a deterministic fixture-bootstrap error and does not silently substitute an empty fixture.
- AC40: Given an absolute platform path, when the path utility validates it, then it returns an opaque `Path` value normalized according to the target platform without lexically rewriting components in a way that could change the referent across a symlink boundary.
- AC41: Given two existing paths that resolve through lexical or symlink aliases to the same canonical path, when their identities are computed, then they produce the same opaque `FileKey`; distinct hard-link paths remain distinct keys.
- AC42: Given a not-yet-existing target path, when its identity is computed, then its `FileKey` is derived from the canonical existing parent plus the normalized candidate name using the actual volume's case-sensitivity rules rather than unconditional lowercasing.
- AC43: Given a path that cannot be validated or canonicalized, when a platform operation prepares to use it, then it returns a typed path error before starting the side effect.
- AC44: Given an async operation that captures its owner ID and generation token, when it completes after that owner or generation has been replaced, then its result is discarded and cannot mutate the replacement's state.
- AC45: Given a window with pending async operations, when the window closes, then its operation tokens are invalidated and later completions neither recreate resources nor emit unhandled errors.

### Verification and CI

- AC46: Given the repository, when `npm run verify` runs, then it executes `tsc --noEmit` in strict mode and fails if type checking fails.
- AC47: Given the repository, when `npm run verify` runs, then it executes ESLint, including the privileged-import restriction, and fails if lint fails.
- AC48: Given the repository, when `npm run verify` runs, then it executes the Vitest Node suite and fails if a Node test fails.
- AC49: Given the repository, when `npm run verify` runs, then it executes the Vitest Browser Mode suite in real Chromium and fails if a Browser Mode test fails.
- AC50: Given the repository, when `npm run verify` runs, then it executes the Playwright browser project against Vite and `MemoryPlatform` and fails if that project fails.
- AC51: Given any constituent verification process that exits non-zero, when `npm run verify` completes, then the aggregate command exits non-zero and preserves the failing process's useful output.
- AC52: Given the repository, when `npm run verify:shell` runs, then it first passes `npm run verify` and then executes the Playwright `_electron` shell-smoke project.
- AC53: Given the real Electron shell-smoke project, when it launches the app, then it can identify a main-owned Markzen window and assert the window title is `Markzen`.
- AC54: Given the real Electron shell-smoke project, when it captures a window screenshot, then a non-empty PNG with non-zero width and height is retained as a diagnostic test artifact.
- AC55: Given the real Electron shell-smoke project and its isolated temporary directory, when it writes and reads a known payload through the real `Platform.fs` adapter, then the bytes round-trip and the test removes its temporary data.
- AC56: Given a push or pull request, when CI is triggered, then `npm run verify` runs once in the required Linux job before the change can pass.
- AC57: Given a push or pull request, when shell CI is triggered, then `npm run verify:shell` runs on pinned macOS, Linux, and Windows runners and reports each platform independently.

### Accessibility and documentation gates

- AC58: Given an interactive element introduced by this milestone, when static checks inspect it, then it has a stable `data-testid` that does not depend on visible text, DOM position, or styling.
- AC59: Given an interactive element introduced by this milestone, when its accessibility tree is inspected, then it has an appropriate native role or explicit semantic role, an accessible name, and required state attributes so state is not conveyed visually alone.
- AC60: Given a keyboard-only user, when they traverse the application shell, then every shell action introduced by this milestone is reachable in a logical order and operable without a pointer; any action that leaves its window open preserves or returns focus to a deterministic element.
- AC61: Given the application shell in its default color scheme, in forced-colors mode, and in each platform-chrome variant, when the automated accessibility audit runs, then it reports no serious or critical violations; keyboard, focus, and window-operation behavior remain covered by explicit interaction tests.
- AC62: Given the first implementation PR for this milestone, when its documentation checks run, then `docs/decisions/README.md` and an accepted Electron security/capability ADR exist and the runtime configuration tests cite that ADR.
- AC63: Given functional Browser Mode or Playwright tests that operate application UI introduced by this milestone, when they locate an interactive element, then they use its stable `data-testid`; accessibility assertions may instead use roles, names, labels, and states.
- AC64: Given a supported CI operating system, when its packaging job runs, then electron-builder produces a runnable unpacked production artifact and shell smoke launches that artifact successfully.

## Test mapping

Each AC has one primary proof layer. Supporting coverage may be added but does not replace the named proof.

| AC | Primary layer |
|----|---------------|
| AC1 | Shell smoke |
| AC2 | Shell smoke |
| AC3 | Shell smoke |
| AC4 | Node |
| AC5 | Shell smoke |
| AC6 | Shell smoke |
| AC7 | Shell smoke |
| AC8 | Shell smoke |
| AC9 | Shell smoke |
| AC10 | Browser Mode |
| AC11 | Browser Mode |
| AC12 | Browser Mode |
| AC13 | Shell smoke |
| AC14 | Shell smoke |
| AC15 | Shell smoke |
| AC16 | Shell smoke |
| AC17 | Shell smoke |
| AC18 | Shell smoke |
| AC19 | Static |
| AC20 | Node |
| AC21 | Node |
| AC22 | Node |
| AC23 | Shell smoke |
| AC24 | Shell smoke |
| AC25 | Shell smoke |
| AC26 | Node |
| AC27 | Node |
| AC28 | Shell smoke |
| AC29 | Shell smoke |
| AC30 | Shell smoke |
| AC31 | Shell smoke |
| AC32 | Playwright-vs-vite |
| AC33 | Static |
| AC34 | Node |
| AC35 | Node |
| AC36 | Node |
| AC37 | Node |
| AC38 | Playwright-vs-vite |
| AC39 | Playwright-vs-vite |
| AC40 | Node |
| AC41 | Node |
| AC42 | Node |
| AC43 | Node |
| AC44 | Node |
| AC45 | Node |
| AC46 | CI |
| AC47 | CI |
| AC48 | CI |
| AC49 | CI |
| AC50 | CI |
| AC51 | CI |
| AC52 | CI |
| AC53 | Shell smoke |
| AC54 | Shell smoke |
| AC55 | Shell smoke |
| AC56 | CI |
| AC57 | CI |
| AC58 | Static |
| AC59 | Browser Mode |
| AC60 | Browser Mode |
| AC61 | Browser Mode |
| AC62 | CI |
| AC63 | Static |
| AC64 | CI |

## Open questions

- (none)
