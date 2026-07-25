# Spec 0006: Remote and Embedded Images

**Status:** Implemented   **Date:** 2026-07
**Origin:** Deferred from the 2026-07 approval review of spec 0005 so the rewrite can establish local exact-resource capabilities before adding a network trust boundary. The 2026-07 contract, codebase, security, accessibility, and independent simplicity reviews resolved the resource, animation, lifecycle, data-format, CSP, and verification decisions below.

## Problem

Markdown commonly references HTTPS and embedded `data:` images, but loading them can disclose document viewing, send ambient credentials, follow unsafe redirects, or consume unbounded resources. Markzen needs an explicit, privacy-preserving load path that reuses the local asset response boundary without making remote content ambient.

## Non-goals

- Automatic remote-image loading, background prefetch, or persistent origin-wide permission.
- HTTP, protocol-relative, credential-bearing, `file:`, `javascript:`, `blob:`, or custom-scheme loading.
- Percent-encoded `data:` payloads, non-base64 embedded forms, additional media-type parameters, SVG, or other active formats.
- Remote image upload, caching across app sessions, download/export, proxy configuration UI, or authentication.
- Authoring or inserting remote/data image URLs; this milestone loads sources already present in Markdown.
- Changing local-file authorization, insertion, metadata, serialization, or Save As rebasing from spec 0005.

## Constraints and shared invariants

- Remote bytes are fetched only by a main-owned service after sender-authorized user intent and are returned to Chromium only through spec 0005's image-only bearer protocol. Production renderer code never receives response bytes, a remote transport, or a generic fetch capability. Browser tests use an injected deterministic acquisition fake, not a production renderer capability.
- Every image node already carries spec 0005's transient, non-serialized `assetId`. Remote/data acquisition reuses it only as correlation: it never grants authority. Main keys current work by the sender-derived window, owned TabId, `assetId`, exact stored source, and monotonically increasing request generation. The renderer applies a result only while that tuple remains current and otherwise immediately revokes it; main does not mirror ProseMirror state or add a separate commit phase.
- A remote or embedded token records its issuing window, TabId, `assetId`, exact stored source, and validated bytes. Separate nodes with the same source own independent generations and tokens. Closing the issuing window/tab, replacing the document, changing/removing the node, superseding its generation, or ending the session aborts pending work, revokes its tokens, and releases retained bytes.
- Remote requests use normal TLS certificate and hostname verification and omit cookies, authorization, proxy authorization, ambient credentials, client certificates, and referrer. They accept no credential challenge and follow no redirect.
- For every connection, main resolves every A and AAAA result, normalizes IPv4-mapped IPv6, rejects the complete request if any result is not globally reachable, and pins the connection to one of the validated results so the transport cannot perform an unchecked second lookup. Loopback, link-local, private, shared/CGNAT, multicast, unspecified, documentation, benchmarking, reserved, and other IANA special-purpose non-global space is denied for IPv4 and IPv6.
- A remote response must be status 200 with identity content encoding. Its Content-Type essence, compared case-insensitively and independently of the URL extension, must be `image/png`, `image/jpeg`, `image/gif`, or `image/webp` and match the byte signature.
- PNG, JPEG, GIF, and WebP reuse spec 0005's signature and canvas validation. Every source remains limited to 16,384 pixels on either canvas axis and 40,000,000 canvas pixels. Animated GIF/WebP additionally contains at most 500 frames and at most 100,000,000 aggregate decoded-frame pixels, counting the complete logical canvas once per frame.
- Each remote response and decoded embedded payload is limited to 10 MiB. Remote/embedded in-flight reservations plus retained bytes are limited to 64 MiB per tab and 256 MiB application-wide; local file-backed tokens do not consume that retained-byte budget. At most four remote requests are in flight application-wide, and each has a 30-second overall deadline from authorized start through body validation.
- The stored image source is never rewritten by loading, retrying, failure, revocation, or rendering. Supported rich Markdown continues to use milestone 0002's canonical serialization; “unchanged” below means the image source value is identical, not that unrelated canonical Markdown spelling becomes byte-for-byte preserved.

## Behavior (acceptance criteria)

### Remote classification and explicit loading

- AC1: Given a valid absolute HTTPS image source of at most 4,096 UTF-8 bytes, when a document opens, then a selectable remote placeholder exposes safe alt/decorative state, shows the source's ASCII-serialized WHATWG origin, offers a named Load action, assigns no authored source to a fetch-capable DOM attribute, and causes no DNS, network, decode, or system request.
- AC2: Given a remote placeholder, when Load is activated once, then it enters a named loading state and starts at most one request; pointer, keyboard, assistive-technology, or repeated activation while that generation is pending starts no duplicate request.
- AC3: Given Load, when its IPC request reaches main, then main validates the exact application-origin main-frame sender before a closed payload and independently resolves the owned TabId, transient `assetId`, exact source, and newer request generation before any DNS lookup, connection, or retained-byte reservation.
- AC4: Given an HTTP, protocol-relative, credential-bearing, malformed, oversized, `file:`, `javascript:`, `blob:`, or custom-scheme source, when rendered or an action is attempted, then it remains a non-retryable blocked placeholder, preserves its exact source value, and causes no DNS, network, decode, navigation, filesystem, or other system request.
- AC5: Given an otherwise valid HTTPS request whose DNS results include loopback, link-local, private, shared/CGNAT, multicast, unspecified, documentation, benchmarking, reserved, IPv4-mapped, or any other non-global address, when resolution completes, then main rejects the complete request before connecting, exposes no hostname resolution or address details, and cannot fall through to a public result from the same answer set.
- AC6: Given a request whose answers are all globally reachable, when a connection is made, then one bodyless GET is pinned to a validated answer, uses normal TLS certificate and hostname verification, sends no cookie, authorization, proxy authorization, ambient credential, client certificate, or referrer, and an unchecked DNS lookup cannot occur in the transport.
- AC7: Given any 3xx or other non-200 response, when headers arrive, then main reads no response body, follows no redirect, exposes no redirect target, response header, or body, issues no token, and returns a retryable server-status failure.
- AC8: Given a status-200 response, when headers and bytes arrive, then main requires identity content encoding, rejects a declared Content-Length above 10 MiB before reading the body, stops streaming as soon as more than 10 MiB is observed, and accepts only a supported Content-Type essence that matches the detected PNG, JPEG, GIF, or WebP signature.
- AC9: Given supported response bytes, when raster validation runs, then main issues no token unless canvas axes, total canvas pixels, frame count, and aggregate decoded-frame pixels are all within their shared bounds.
- AC10: Given source-policy, non-global-address, content-encoding, byte-limit, MIME/signature, canvas, frame, aggregate-frame, active-content, or unsupported-content rejection, when main reports it, then it returns one non-disclosing non-retryable content/policy outcome with no IP, redirect target, response body/header, path, stack, or internal error detail.
- AC11: Given offline operation, public DNS failure, TLS/transport failure, the 30-second deadline, non-200 status, or unavailable resource budget/capacity, when main reports it, then it returns one non-disclosing retryable outcome with no token and without changing Markdown.

### Completion, retry, cancellation, and resource ownership

- AC12: Given a current remote request passes every check, when acquisition completes, then main issues one byte-backed bearer token for that window/TabId/`assetId`/source/generation and the renderer applies it only if the same node correlation and generation remain current.
- AC13: Given an accepted remote token, when Chromium renders it, then it loads only through `markzen-asset:` with no cookies, credentials, referrer, navigation, CORS, Fetch, script, subresource, File System API, or general readable response access; altered, unknown, or wrongly shaped requests receive spec 0005's non-disclosing denial.
- AC14: Given a retryable outcome, when it reaches the current node, then a selectable remote-error placeholder exposes safe alt/decorative state and a named Retry action while preserving the source value; a non-retryable outcome instead exposes a blocked state with no Retry.
- AC15: Given Retry, when explicitly activated, then it advances only that node's request generation and starts a new request subject to the same authorization and bounds; a late outcome or token from any older generation cannot replace it and is immediately revoked.
- AC16: Given a remote request is pending, when its window/tab closes, its document is replaced, its node is removed, its source changes, or a newer generation supersedes it, then main aborts the transport and body read, releases its reservation, issues no usable token, and a late completion cannot recreate state or emit an unhandled error.
- AC17: Given four remote requests are already in flight application-wide, when another node activates Load or Retry, then no fifth request is queued or started and that node receives AC11's retryable capacity outcome; when capacity is released, explicit Retry may start it.
- AC18: Given a remote or embedded acquisition would make its tab exceed 64 MiB or the application exceed 256 MiB of in-flight reservations plus retained byte-backed grants, when reservation or issuance is attempted, then no bytes or token are retained for it and it receives AC11's retryable resource outcome; revocation releases the exact accounted bytes once.
- AC19: Given two nodes in one or more owned tabs reference the same exact source, when they load, retry, change, or are removed independently, then each transient `assetId` keeps its generation, placeholder, token, cancellation, revocation, and byte accounting independent of the other.
- AC20: Given an issuing window/tab closes, its document is replaced, its node no longer has the issued `assetId` and exact source, its generation is superseded, or the app session ends, when its token is later requested, then the token has been revoked, its retained bytes have been released, and the request receives spec 0005's non-disclosing denial.

### Embedded data and shared raster limits

- AC21: Given a base64 `data:image/png`, `data:image/jpeg`, `data:image/gif`, or `data:image/webp` source whose scheme, MIME, and `base64` marker are matched ASCII-case-insensitively and whose payload uses the standard base64 alphabet, optional correct `=` padding, no whitespace, no percent escapes, and no additional media parameters, when the same sender/owner/node/generation checks as AC3 pass, its derived decoded length is at most 10 MiB, and resources are available, then main strictly decodes it, matches MIME to signature, applies the shared canvas/frame limits, issues one byte-backed image token, and performs no DNS, network, navigation, filesystem, or other system request.
- AC22: Given SVG/SVG data, a non-base64 form, an additional media parameter, malformed alphabet or padding, whitespace, percent escaping, unsupported or mismatched MIME/signature, a derived or decoded payload above 10 MiB, or raster/frame bounds failure, when rendered, then main retains no decoded bytes or token, the node shows AC10's non-retryable blocked state, and its exact source value remains unchanged.
- AC23: Given the packaged application after this spec is implemented, when CSP and image behavior are inspected, then production `img-src` is exactly `'self' markzen-asset:` without `data:`, `https:`, or `blob:`; a renderer-created raw remote/data image cannot load while a validated embedded bearer can.
- AC24: Given remote/data image sources are loaded, retried, rejected, revoked, rendered, saved, or reparsed, then transient IDs, generations, states, tokens, errors, and decoded bytes never serialize, each stored source value remains identical, and the existing independently authored Markdown fixtures prove canonical serialize/reparse semantic equality.
- AC25: Given any local, remote, or embedded GIF/WebP candidate, when its complete frame structure is validated, then a still image or animation of at most 500 frames and 100,000,000 aggregate full-canvas pixels may proceed if every other bound passes; an incomplete/malformed frame structure, a 501st frame, or an aggregate total above the limit is blocked before a token is issued.

### Accessibility and responsive presentation

- AC26: Given remote/data loading, blocked, and error placeholders at the 480×320 minimum window size, 200% zoom, forced colors, or reduced motion, then the node remains selectable, its safe alt/decorative and loading/blocked/error state is programmatically exposed, Load/Retry remains keyboard reachable, focus/state remains distinguishable without color alone, status changes are announced without moving focus, and non-essential loading animation is disabled.

## Implementation ADR and cross-spec requirements

Before remote/data production code is accepted, add an accepted ADR recording the acquisition-service and injected-transport boundary, the byte-backed bearer/accounting ownership model, and the rationale for the chosen network trust boundary. The ADR references this spec for exact grammars, limits, outcomes, and validation behavior rather than duplicating them.

Implementation must also:

- revise spec 0001 AC20 and accepted ADR 0001 so production CSP removes direct `data:` admission and records the narrow remote/data intents without adding renderer network authority;
- narrow and reapprove spec 0002 AC167 only for the explicit current-generation Load/Retry and validated embedded-token paths in this spec while preserving its no-ambient-load floor;
- update spec 0005's animated-raster constraint, AC41, and tests with the shared 500-frame/100,000,000-pixel limits, and update ADR 0009 for byte-backed grants, per-node correlation, accounting, and revocation;
- update ADR 0003 and independently authored image fixtures for exact remote/data source preservation under canonical Markdown serialization.

These earlier Implemented contracts remain unchanged while spec 0006 is Draft or merely Approved; their status and exact text change only with the implementation and mapped green verification so the repository never claims behavior the code does not yet provide.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1–AC2 | Browser Mode | Playwright request observation |
| AC3 | Shell smoke | Node closed-schema and generation policy |
| AC4 | Node | Browser Mode blocked state; Playwright request observation |
| AC5–AC11 | Node | One packaged adapter-wiring smoke plus Electron-specific negatives |
| AC12 | Node | Browser Mode current-node application |
| AC13 | Shell smoke | Node bearer policy |
| AC14–AC15 | Browser Mode | Node outcome/generation policy |
| AC16–AC20 | Node | Browser Mode node lifecycle; shell smoke denial after revocation |
| AC21–AC22 | Node | Browser Mode embedded render/blocked state |
| AC23 | Shell smoke | Static exact-CSP assertion |
| AC24–AC25 | Node | Browser Mode render state |
| AC26 | Browser Mode | Automated accessibility scan |

## Open questions

- (none)
