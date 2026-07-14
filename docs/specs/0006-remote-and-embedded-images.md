# Spec 0006: Remote and Embedded Images

**Status:** Draft   **Date:** 2026-07
**Origin:** Deferred from the 2026-07 approval review of spec 0005 so the rewrite can establish local exact-resource capabilities before adding a network trust boundary.

## Problem

Markdown commonly references HTTPS and embedded `data:` images, but loading them can disclose document viewing, send ambient credentials, follow unsafe redirects, or consume unbounded resources. Markzen needs an explicit, privacy-preserving load path that reuses the local asset response boundary without making remote content ambient.

## Non-goals

- Automatic remote-image loading or persistent origin-wide permission.
- HTTP, protocol-relative, credential-bearing, `file:`, `javascript:`, `blob:`, or custom-scheme loading.
- SVG or other active formats.
- Remote image upload, caching across app sessions, download/export, proxy configuration UI, or authentication.
- Authoring or inserting remote/data image URLs; this milestone loads sources already present in Markdown.
- Changing local-file authorization, insertion, metadata, serialization, or Save As rebasing from spec 0005.

## Constraints and shared invariants

- Remote bytes are fetched only by a main-owned service after sender-authorized user intent and are returned to Chromium only through spec 0005's image-only bearer protocol; the renderer never receives response bytes or a generic fetch capability.
- Permission reuses the main-validated request-generation pattern, keyed by TabId and exact source URL. Each issued token records that owner/source; the renderer may commit or revoke it only while the current node still references the same token and source. Closing the issuing window/tab, editing/removing the node, or ending the session revokes its token.
- Requests omit credentials, cookies, authorization, client certificates, and referrer. Every redirect is rejected.
- HTTPS resolution must not reach loopback, link-local, private, multicast, unspecified, or otherwise non-public IP space; DNS changes are revalidated for every connection.
- PNG, JPEG, GIF, and WebP reuse spec 0005's signature and canvas validation. Remote response and decoded `data:` payload limits are stricter than or equal to the local encoded-byte bound.
- Source Markdown is never rewritten by loading, retrying, failure, or session revocation.

## Behavior (acceptance criteria)

- AC1: Given an HTTPS image source, when a document opens, then a selectable remote placeholder shows the source origin and a named Load action, and no network request occurs.
- AC2: Given the user activates Load, when the request is authorized, then main independently validates the live sender, TabId, exact URL, and current request generation before starting one credential-free request.
- AC3: Given an HTTP, protocol-relative, credential-bearing, malformed, `file:`, `javascript:`, `blob:`, or custom-scheme source, when rendered or Load is attempted, then no network/system request occurs and the blocked placeholder preserves the source.
- AC4: Given an approved request resolves to loopback, link-local, private, multicast, unspecified, or other non-public address space, then loading stops before connecting and exposes no address details.
- AC5: Given any redirect response, then loading stops without following it or exposing its target.
- AC6: Given a final response, then it must be successful, declare and match PNG, JPEG, GIF, or WebP, contain no more than 10 MiB response bytes, and satisfy spec 0005's canvas bounds before a session token is issued.
- AC7: Given a response exceeds its byte bound while streaming, redirects, fails MIME/signature/dimension checks, or returns active/unsupported content, then main aborts reading, issues no token, and shows a non-disclosing blocked/error placeholder.
- AC8: Given remote loading succeeds, then the resulting bearer token renders only through `markzen-asset:` with no cookies, credentials, referrer, navigation, CORS, Fetch, script, subresource, or general response access.
- AC9: Given a remote request fails or the app is offline, then an accessible remote-error placeholder remains selectable and offers Retry without changing Markdown.
- AC10: Given Retry, then it starts a new generation-scoped request only after explicit activation; stale completion from an earlier request cannot replace it.
- AC11: Given an issuing window/tab closes, the source node no longer references the issued token and exact source, or the app session ends, then its remote bearer token is revoked and later requests receive spec 0005's non-disclosing denial.
- AC12: Given a `data:` source with a matching PNG, JPEG, GIF, or WebP MIME/signature and no more than 10 MiB decoded payload bytes, when rendered, then main validates its canvas bounds and issues an image-only bearer token without network access.
- AC13: Given SVG/SVG data, malformed encoding, unsupported or mismatched MIME/signature, or a data payload above its bound, when rendered, then it is blocked while its original Markdown round-trips unchanged.
- AC14: Given remote/data placeholders and errors at minimum size, 200% zoom, forced colors, or reduced motion, then actions remain keyboard reachable, focus/state remain distinguishable, and non-essential loading animation is disabled.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1 | Browser Mode | Playwright request observation |
| AC2–AC7 | Playwright-vs-vite | Node URL/address/redirect policy; shell smoke real net negative |
| AC8 | Shell smoke | Node bearer policy |
| AC9–AC10 | Browser Mode | Playwright scripted network failure |
| AC11 | Shell smoke | Node generation/revocation policy |
| AC12–AC13 | Node | Browser Mode placeholder/render state |
| AC14 | Browser Mode | Automated accessibility scan |

## Open questions

- What aggregate decoded-frame limit should apply to animated GIF/WebP for local, remote, and embedded sources?
