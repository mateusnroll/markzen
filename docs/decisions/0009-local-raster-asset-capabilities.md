# ADR 0009: Local raster asset capabilities

**Status:** Accepted
**Date:** 2026-07-13
**Spec:** [0005 — Structured Content and Local Assets](../specs/0005-structured-content-and-assets.md)

## Context

Markdown image sources are untrusted path text. Chromium must display explicitly scoped local pixels without receiving a filesystem API, learning canonical paths, or turning the application protocol into a readable general resource server.

## Decision

- Main validates the live application-origin sender and owned TabId/generation before every selection, resolution, or authorization intent. Native selection filters PNG, JPEG, GIF, and WebP; SVG is excluded.
- Main canonicalizes the target after symlink resolution and compares `FileKey`. Automatic authority is limited to canonical opened roots or the canonical standalone-document directory. Authorize succeeds only when the chooser returns the exact referenced `FileKey`.
- Before issuing a grant and again on every response, main reads the exact file and validates PNG/JPEG/GIF/WebP signature, extension/MIME agreement, at most 25 MiB encoded bytes, at most 16,384 pixels on either axis, and at most 40,000,000 canvas pixels.
- A grant uses 32 cryptographically random bytes encoded as 43 base64url characters. The registry maps it to one exact `{issuer WindowId, TabId, FileKey, canonical Path}`. The URL exposes only that token. Possession is sufficient from any Markzen window until tab/window revocation; no renderer-supplied owner ID participates in response authorization.
- `markzen-asset` is registered before readiness as secure but non-standard, non-streaming, non-CORS, unavailable to Fetch, without service workers or CSP bypass. CSP admits it only in `img-src`.
- The handler accepts only GET with a single exact token and no credentials, port, query, fragment, encoded traversal, or navigation form. Electron does not expose a destination signal to custom-protocol handlers, so image-only reachability is enforced by the combined non-Fetch/non-CORS/non-standard scheme registration and CSP `img-src` admission; packaged smoke proves renderer Fetch denial. Every denial is the same non-cacheable 404. Success is non-cacheable, `nosniff`, and the validated raster MIME.
- Image-node `assetUrl`, internal-reference state, and load status are transient schema attributes and never serialize. Remote, data, file, active, malformed, and other custom sources remain blocked in this milestone.

## Consequences

- Each render performs fresh identity and raster validation, favoring revocation and replacement safety over a persistent byte cache.
- The bearer exception must remain narrow: leaking a live token permits only that raster until revocation, never directory access or path disclosure.
- Remote and embedded sources require the distinct network/privacy design in Draft spec 0006.

## Verification

- Node tests cover signatures, raster bounds, source rebasing, Windows/UNC/cross-volume behavior, and serialization fixtures.
- Browser Mode covers insertion metadata, cancellation, blocked placeholders, selection, editing, and table/image accessibility.
- Packaged shell smoke proves image-destination loading, direct Fetch denial, altered-token denial, cross-window possession, and issuer-close revocation.
