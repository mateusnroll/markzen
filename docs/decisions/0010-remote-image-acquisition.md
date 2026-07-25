# ADR 0010: Remote and embedded image acquisition

**Status:** Accepted
**Date:** 2026-07-24
**Spec:** [0006 — Remote and Embedded Images](../specs/0006-remote-and-embedded-images.md)

## Context

Markdown-controlled image URLs can disclose document viewing, reach private
network services, smuggle active content, or retain unbounded bytes. Chromium
must not receive ambient network authority or raw embedded sources, while
Browser Mode still needs deterministic tests without Electron networking.

## Decision

- A main-owned `ImageAcquisitionService` owns remote DNS, transport, streaming
  bounds, embedded decoding, raster validation, per-node generations,
  cancellation, concurrency, and byte-budget transfer. Its remote transport
  and resolver are injected ports for Node tests; production supplies a
  pinned Node HTTPS adapter, and renderer tests supply only typed outcomes.
- Remote work begins only after sender-first IPC validation and resolution of
  an owned TabId. The service keys current work by issuing WindowId, TabId,
  transient `assetId`, exact stored source, and generation. Supersession aborts
  the prior operation and revokes that node's byte-backed grants.
- DNS returns every A/AAAA answer. Any non-global answer rejects the whole
  request. Global reachability follows the IANA IPv4/IPv6 special-purpose
  registries; IPv4-mapped IPv6 is normalized before classification. The HTTPS
  adapter pins one validated address into its lookup callback while preserving
  ordinary TLS hostname and certificate verification.
- The adapter sends one bodyless credential-free GET, follows no redirect, and
  accepts only status 200, identity encoding, a supported Content-Type, bounded
  bytes, matching signature, and complete bounded raster structure. Exact
  grammars, limits, classifications, and retry policy remain normative in spec
  0006 rather than being duplicated here.
- Embedded data is syntax-checked and its decoded length is budget-reserved
  before allocation. It then uses the same MIME/signature/raster validator and
  byte-backed grant path without DNS, filesystem, or navigation work.
- One `ByteBudget` accounts for remote/embedded in-flight reservations and
  retained grants. A successful operation resizes and transfers its lease to
  `AssetRegistry`; every unsuccessful, revoked, superseded, or disposed path
  releases it idempotently.
- The renderer receives only a typed blocked/retryable/stale/authorized outcome.
  Authorized bytes are reachable solely through ADR 0009's opaque
  `markzen-asset:` protocol. Source, origin, state, generation, token, and bytes
  are transient and never replace the Markdown source.

## Consequences

- Remote images require an explicit per-node action and are not cached across
  sessions. Duplicate sources intentionally perform independent work and own
  independent grants.
- Rejecting a mixed DNS answer is stricter than selecting its public member,
  but prevents rebinding and resolver ambiguity.
- Reserving the maximum remote response before streaming reduces available
  concurrency under retained-byte pressure, but makes the memory ceiling
  enforceable without trusting Content-Length.
- The main process carries more policy than a Chromium fetch would, but the
  renderer gains no cookies, credentials, response bytes, DNS details, or
  general network primitive.

## Verification

- Node tests cover source/data grammar, IANA non-global classification, pinned
  transport input, response/raster bounds, typed failures, concurrency,
  cancellation, generations, byte accounting, and captured external fixtures.
- Browser Mode covers ambient-effect-free placeholders, explicit Load/Retry,
  stale/removal/replacement revocation, embedded resolution, serialization
  neutrality, keyboard access, responsive states, and accessibility.
- Packaged shell smoke covers sender ownership before network work, exact CSP,
  validated embedded bearer rendering, raw data denial, Fetch denial, and
  post-revocation protocol denial.
