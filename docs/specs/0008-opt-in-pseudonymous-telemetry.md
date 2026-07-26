# Spec 0008: Opt-in Pseudonymous Usage and Crash Diagnostics

**Status:** Draft   **Date:** 2026-07
**Origin:** User request from the 2026-07 telemetry exploration. Prior-art research included `pingdotgg/t3code`'s PostHog integration, PostHog Cloud EU privacy controls, Electron Crashpad, and the Sentry Electron SDK. The user chose PostHog Cloud EU for usage summaries and Sentry's EU region for crash diagnostics, behind separate narrow adapters, with fixed installation-random identifiers rather than person identity.

## Problem

Markzen has no reliable way to estimate active installations, retention, feature adoption, or production stability, so product and reliability decisions depend on repository traffic and voluntary bug reports that do not represent actual use. As an open-source local editor, it must collect only understandable, proportionate data after an informed choice and must distinguish low-risk usage summaries from higher-risk crash diagnostics.

This feature measures opted-in **installations**, not people. Fixed random identifiers permit longitudinal analysis across months, but they are pseudonymous because repeated reports can be linked; native crash dumps also require a separate disclosure because they can incidentally contain fragments of process memory.

## Non-goals

- Counting unique people, identifying a person, joining telemetry to an account, or deriving identity from an account ID, email, hardware, operating-system identifier, hostname, username, filesystem, network interface, or other device fingerprint.
- Joining PostHog usage history to Sentry diagnostic history, including sending either service's installation identifier to the other service.
- Intentionally collecting document content, filenames, paths, folder or repository names, link destinations, image sources, search queries, clipboard data, selections, keystrokes, window titles, or arbitrary renderer text.
- Automatically uploading console output, raw or unbounded logs, local variables, screenshots, session replay, performance traces, profiles, request or response bodies, request headers, user feedback, or files other than an Electron native minidump.
- Reporting expected caught operational failures individually to Sentry; approved typed failure outcomes remain bounded PostHog counts and may become closed diagnostic breadcrumbs.
- Detecting hangs, stalls, or unclean shutdowns that produce neither a Sentry session crash nor an Electron process-gone signal; collecting a user-authored description or previewable diagnostic bundle after a failure.
- PostHog autocapture, browser SDK, session replay, surveys, feature flags, experiments, remote configuration, advertising attribution, or person profiles.
- Sentry replay, tracing, profiling, screenshots, console/network/DOM integrations, AI debugging, remote configuration, or a generic application logging service.
- Telemetry from development, test, locally built, forked, or otherwise unofficial packages. This milestone provides no downstream-distributor backend configuration surface.
- A first-party telemetry relay or self-hosted backend. This spec sends directly to PostHog Cloud EU and Sentry's EU region.
- Automatically deleting already-delivered backend history when sharing is disabled; disabling removes local linkage and pending local data, while accepted reports follow the disclosed server retention policy.
- Using telemetry or diagnostics to weaken a security, accessibility, data-integrity, or loss-prevention behavior.

## Constraints and shared invariants

- This spec extends milestone 0003's main-owned settings service without replacing its schema, revision ordering, atomic persistence, retry, warning, or bounded-quit behavior. The closed version-1 schema gains `usageTelemetrySharing` and `crashDiagnosticsSharing`, each accepting only `undecided`, `enabled`, or `disabled` and defaulting to `undecided`.
- The private persisted settings object may additionally contain `usageTelemetryId` and `crashDiagnosticsId`, but bootstrap, settings snapshots, Privacy state, and every renderer capability omit both identifiers.
- Enabling either service is one main-owned atomic settings transition: it creates a cryptographically random RFC 4122 UUID version 4 and persists that identifier with the corresponding `enabled` preference before the service becomes eligible. A loaded `enabled` preference without its valid identifier is repaired to `disabled`; startup never silently creates a replacement.
- The two identifiers are independently random. Each remains fixed across application upgrades and calendar months while its service stays enabled. Disabling removes only that service's identifier and local state; a later explicit re-enable creates a new identifier that cannot relink to the old series.
- Usage collection can begin after its enable transition is durably committed. Crash diagnostics require early Electron initialization, so an enable transition made after startup becomes fully active on the next launch and the UI says so; Markzen does not force or request an immediate restart.
- One application-lifetime main-process telemetry coordinator owns consent transitions, semantic notices, usage accumulation, diagnostic breadcrumbs, scheduling, and both transports. PostHog and Sentry sit behind separate closed adapters: the usage adapter accepts only one validated summary, while the diagnostics adapter accepts only lifecycle commands and already-scrubbed diagnostic records. Neither is a generic event, property, log, attachment, URL, or transport API.
- Renderer code may submit only closed semantic success or typed-outcome notices. It cannot supply event names, breadcrumb names, arbitrary properties, exact counts, timestamps, identifiers, endpoints, project tokens, DSNs, errors, stacks, messages, attachments, or send commands.
- Renderer CSP remains `connect-src 'none'`. Renderer-side Sentry integration, if required by the approved SDK architecture, routes through the main-owned diagnostics adapter and grants no renderer network or arbitrary IPC capability.
- Markzen's official release CI injects one public, ingest-only PostHog project token and the fixed endpoint `https://eu.i.posthog.com/i/v0/e/`, plus one public Sentry EU DSN, as build-time constants from its protected release environment. The values are absent from source and ordinary local or fork builds, and there is no supported non-official configuration path.
- The PostHog project token and Sentry DSN are public submission identifiers, not secrets: a recipient can extract them from the package or observe them in traffic. They grant no PostHog or Sentry read, query, export, project-management, billing, member-management, source-map-upload, or other administrative authority. Direct ingestion therefore cannot prove that an event came from an authentic Markzen installation; fabricated events and quota exhaustion remain accepted residual risks while a first-party relay is a non-goal.
- No PostHog personal API key is created or used by this milestone. Sentry source-map upload uses one organization-issued, least-privilege authentication token exposed only to the protected upload step; it is unset before packaging and never available to pull-request, fork, development, test, or application processes. No PostHog personal key, Sentry authentication token, project-administration credential, source-map upload token, or other secret enters source, build output, logs, caches, packaged files, or uploaded release artifacts.
- PostHog delivery uses a small main-process HTTPS adapter rather than a PostHog SDK. Sentry delivery uses the maintained `@sentry/electron` SDK behind the diagnostics adapter because Electron native minidumps require Electron-aware processing.
- Every PostHog event sets `$process_person_profile` to `false` and `$geoip_disable` to `true`. The PostHog project has GeoIP enrichment disabled and discards stored client IP data.
- Sentry sets `sendDefaultPii` to `false`, disables automatic IP storage, and disables every integration not explicitly allowed by this spec. The direct connections mean both processors can observe the source IP while accepting a request even when configured not to retain it; disclosures state this precisely.
- The only PostHog event is `markzen_usage_summary`. Its closed version-1 payload is:

| Field | Allowed value |
|---|---|
| `distinct_id` | Persisted usage-telemetry UUID |
| `$process_person_profile` | `false` |
| `$geoip_disable` | `true` |
| `telemetry_schema` | Integer `1` |
| `app_version` | Valid packaged Markzen version, at most 32 ASCII characters |
| `platform` | `macos`, `windows`, or `linux` |
| `architecture` | `arm64`, `x64`, or `other` |
| `active_days` | `one`, `two_to_three`, or `four_to_seven` |
| `launches` | A count bucket |
| `used_single_file_window`, `used_workspace_window` | Boolean |
| `documents_created`, `documents_opened`, `documents_saved`, `folders_opened`, `finds_started`, `formatting_commands`, `external_links_opened`, `tables_edited`, `images_inserted` | A count bucket |
| `document_open_failures`, `document_save_failures`, `workspace_failures`, `external_open_failures`, `asset_failures` | A count bucket |

- A **count bucket** is exactly `zero`, `one`, `two_to_five`, `six_to_twenty`, or `twenty_one_plus`. No usage payload field accepts an arbitrary string, nested object, array, URL, path, error, or extension property.
- The usage coordinator updates bounded in-memory counters only after usage sharing is enabled. It never traverses editor state, serialized Markdown, ProseMirror nodes, filesystem entries, or UI text to derive telemetry.
- The first post-consent launch or semantic notice starts one seven-day window divided into seven consecutive 24-hour buckets from that start instant. The coordinator records only which buckets contained activity. The accumulator becomes eligible on the next launch after 168 elapsed hours, sends at most once, is consumed when that attempt starts, and is never retried.
- The current bounded usage accumulator lives only in Electron `userData`, contains the fixed capped counters plus its start time and seven-bit activity set, and contains no content-derived value.
- Sentry diagnostics use only these record classes:

| Class | Allowed diagnostic data |
|---|---|
| Release-health session | Diagnostic UUID, release, environment `production`, process start, clean exit or crash state |
| JavaScript failure | Diagnostic UUID, release, app/Electron version, platform, architecture, process type, exception type, source-relative in-app stack frames eligible for server-side source mapping, and the bounded breadcrumb ring |
| Process-gone event | Diagnostic UUID, release, app/Electron version, platform, architecture, process type, Electron reason, and numeric exit code |
| Native crash | One Electron Crashpad minidump plus diagnostic UUID, release, app/Electron version, platform, architecture, and process type annotations |

- JavaScript exception messages and values are removed before transport. Stack frames retain only function/module identity, source-relative source-map identity, line, column, and `in_app`; absolute local paths, source context, local variables, and request context are removed.
- The diagnostics coordinator holds at most 32 in-memory structured breadcrumbs in occurrence order. The closed vocabulary is `app_started`, `window_opened`, `document_created`, `document_opened`, `document_open_failed`, `document_saved`, `document_save_failed`, `workspace_opened`, `workspace_open_failed`, `find_started`, `formatting_used`, `external_opened`, `external_open_failed`, `table_edited`, `image_inserted`, and `asset_failed`. A breadcrumb contains only its vocabulary value plus, where applicable, `window_kind` (`single_file` or `workspace`) or `outcome` (`cancelled`, `conflict`, `not_found`, `permission_denied`, `unavailable`, or `other`).
- Fatal unhandled JavaScript exceptions and rejections, Electron main/renderer/utility/GPU process crashes, process-gone reasons, and release-health state are diagnostic events. Expected caught failures, React render counts, individual clicks, and ordinary successful operations outside the breadcrumb vocabulary are not diagnostic events.
- Native minidumps are not ordinary structured telemetry and cannot be content-scrubbed reliably. They may include stack memory, environment or command-line state, URLs, credentials, and fragments of any document content present in the crashed process. Markzen never intentionally attaches a document or log, and every crash-diagnostics consent surface states this residual risk before enabling uploads.
- Source maps are generated for official renderer and main-process JavaScript, uploaded privately to the Sentry EU project during release CI with a CI-only credential, and excluded from the distributed package after upload. Release identity in the package and uploaded artifacts must match.
- Sentry automatic DOM, keyboard, navigation, console, network, request, local-variable, screenshot, replay, tracing, profiling, and attachment integrations are disabled. No custom attachment is accepted; the sole attachment exception is the Electron-generated native minidump.
- The Sentry project enables a finite client-key ingestion rate limit and spike protection. PostHog's public ingestion endpoint has no client authentication or dependable per-installation rate limit, so the PostHog project monitors volume plus unknown event names, telemetry schema versions, releases, and closed-enum values; monitoring is abuse detection, not an authenticity claim.
- `DO_NOT_TRACK=1` or `MARKZEN_TELEMETRY_DISABLED=1` suppresses the invitation, both collectors, both transports, and both SDK initializations for that process without changing persisted choices or identifiers. `MARKZEN_CRASH_DIAGNOSTICS_DISABLED=1` suppresses only Sentry collection and transport. Removing an override resumes the prior persisted choices on the next eligible launch.
- PostHog identifier-linked raw events have a maximum retention of 12 months. Sentry diagnostic events and native attachments have a maximum retention of 30 days. Longer-lived aggregate issue or product figures cannot contain an installation identifier, minidump, stack event, or breadcrumb sequence.
- Both projects remain on their $0 plans. Paid overages, pay-as-you-go billing, automatic upgrades, and any payment method that could turn excess telemetry into a charge are disabled; provider quota exhaustion drops new data rather than costing money or changing application behavior.
- Implementation updates ADR 0001 for the two main-only outbound destinations, Sentry's Electron integration, preload/renderer constraints, startup ordering, and source-map release boundary; it updates ADR 0007 for the two compound preference/identifier transitions. A dedicated accepted telemetry ADR records adapter ownership, consent lifecycle, crash-dump risk, scrubbing, disable semantics, and test injection before production transport code is accepted.

## Behavior (acceptance criteria)

### Consent, controls, and disclosure

- AC1: Given a new or upgraded installation has no recognized sharing choices, when Markzen starts and is used before a choice, then both preferences are `undecided`, no telemetry identifier or usage accumulator exists, Sentry is not initialized, no activity is counted retroactively, and no telemetry network request occurs.
- AC2: Given either sharing choice is undecided, when the first document open, document save, or folder-workspace bootstrap succeeds and no modal surface is active, then one non-modal invitation appears without stealing focus; it is never shown on launch alone or again after both choices are resolved.
- AC3: Given the invitation, then it names PostHog Cloud EU and Sentry EU, describes the fixed but separate pseudonymous installation identifiers, says usage summaries exclude document content and names, states that native crash dumps can incidentally contain process-memory fragments including document text, and offers equally available “Share both”, “No thanks”, and “Choose what to share” actions.
- AC4: Given the invitation, when “Share both” is activated, then one main-owned transaction enables usage sharing and crash diagnostics with separate new identifiers; usage starts only after durable commit, crash diagnostics show “Starts next launch”, and the invitation closes.
- AC5: Given the invitation, when “No thanks” is activated, then both choices durably resolve to `disabled`, the invitation closes, no opt-out event is sent, and Markzen does not invite again unless settings data is reset.
- AC6: Given “Choose what to share” is activated, then Settings opens directly to Privacy with the ordinary independent usage and crash Off/On controls; each change commits only that service, a failed persistence leaves that control unchanged, and the invitation closes only after both choices are resolved.
- AC7: Given Settings → Privacy in any choice state, then each service has one independent authoritative Off/On control; changing one neither resolves, changes, nor recreates the other service's preference, identifier, local state, or backend history.
- AC8: Given Privacy in any state, then it explains each purpose, destination, fixed-identifier lifecycle, retention, source-IP caveat, environment overrides, complete usage exclusions, JavaScript diagnostic fields, breadcrumb vocabulary, native-minidump residual risk, and disable behavior, and links to AC47's exact public telemetry document, without enabling either service.
- AC9: Given the invitation or Privacy at minimum size, 200% zoom, forced colors, or reduced motion, then its disclosures and controls reflow within the viewport, remain keyboard reachable and visibly focused, expose accurate names/states, and communicate state without color or motion alone.
- AC10: Given the non-modal invitation, when the user continues editing or invokes another command without choosing, then the invitation neither intercepts the action nor repeats or grows into a modal prompt during that run.

### Separate fixed identities and local lifecycle

- AC11: Given a usage enable transition succeeds, then main creates one cryptographically random RFC 4122 UUID version 4 unrelated to account, device, hardware, path, network, document, or diagnostics data.
- AC12: Given usage sharing remains enabled across reporting windows, restarts, upgrades, and calendar-month boundaries, then every eligible PostHog summary uses that same usage identifier.
- AC13: Given a crash-diagnostics enable transition succeeds, then main creates a different cryptographically random RFC 4122 UUID version 4 unrelated to the usage identifier or any identity-derived data.
- AC14: Given crash diagnostics remain enabled across restarts, upgrades, and calendar-month boundaries, then Sentry release-health and diagnostic records use that same diagnostics identifier, and no Sentry record contains the PostHog usage identifier.
- AC15: Given either service is enabled, when the user turns that service off, then its collection and new delivery stop immediately, its in-memory and pending local data plus persisted identifier are removed after the disable is durably committed, and the other service remains unchanged.
- AC16: Given crash diagnostics were initialized at process start and are disabled during that run, then Sentry event capture and uploads stop, Crashpad upload is disabled, breadcrumbs are cleared, and any dump that Crashpad must still collect before process exit remains local-only and is deleted at shutdown or next startup without upload.
- AC17: Given a service was disabled after having been enabled, when it is explicitly enabled again, then a new random identifier is durably committed before eligibility and differs from the removed identifier.
- AC18: Given one service's preference, identifier, or local telemetry state is malformed, oversized, schema-incompatible, or internally inconsistent inside an otherwise valid settings document, when it loads, then no request for that service occurs, only that service resolves to disabled with its private state removed or quarantined, the other valid service remains eligible, and one accessible non-blocking warning identifies which sharing control was turned off; if the whole settings document is unavailable or corrupt, milestone 0003's default-and-warning behavior applies and neither service starts.
- AC19: Given an enable transition or identifier write fails, then that service remains inactive with no active identifier, collection, or delivery; given disabling was accepted in memory but its settings write is pending or fails, then that service remains suspended for the rest of the process and the existing settings warning explains that the choice may not survive restart.
- AC20: Given `DO_NOT_TRACK=1`, `MARKZEN_TELEMETRY_DISABLED=1`, or the diagnostics-only override as applicable, when Markzen runs, then affected services initialize no collector or SDK, record no local state, make no request, show “Disabled by environment” in Privacy, and do not overwrite the persisted choices or identifiers.

### Bounded usage summaries and PostHog delivery

- AC21: Given a development server, browser test, local source build, automated-test process, fork pull request, or package without the complete pair of release-injected PostHog and Sentry configurations, when any telemetry path runs, then it cannot create either identifier, collect usage or breadcrumbs, initialize Sentry, show the invitation, or contact a public telemetry endpoint.
- AC22: Given usage sharing is enabled, when an approved semantic action succeeds, then only its corresponding bounded counter or boolean from the version-1 PostHog schema changes; failure counters change only from existing typed operation outcomes, never from error text.
- AC23: Given one semantic action is initiated several times but succeeds once, or one main-owned operation fans out to several windows, then the usage accumulator and diagnostic breadcrumb ring each record the user-visible outcome once rather than counting renderer renders, IPC hops, retries, watcher events, or recipient windows.
- AC24: Given a usage counter exceeds its highest useful threshold, then local state remains capped and the report emits `twenty_one_plus`; no exact value above the bucket boundary is retained or sent.
- AC25: Given usage collection or payload construction, then content, filenames, paths, roots, destinations, sources, queries, clipboard data, selections, keystrokes, titles, raw errors, messages, stacks, logs, timestamps of individual actions, diagnostic identifiers, and unknown properties cannot enter the usage accumulator or PostHog body.
- AC26: Given a semantic notice on a user-action path, then handling performs no network or disk operation, traverses no document or tree data, and only updates constant-size application-lifetime state; persistence and delivery run later without delaying the originating command.
- AC27: Given post-consent activity started a reporting window, when Markzen next launches at least 168 hours later, then it constructs exactly one `markzen_usage_summary` with the fixed envelope and allowlisted fields, one through seven active 24-hour buckets, and all counts bucketed before transport; the current launch begins the next window.
- AC28: Given an eligible usage summary in an official build, when delivery begins, then only the main process sends one bounded HTTPS POST to `https://eu.i.posthog.com/i/v0/e/` with the public project token, `$process_person_profile: false`, and `$geoip_disable: true`; it performs no identify, alias, person-property, feature-flag, decide, replay, survey, or remote-configuration request.
- AC29: Given a PostHog delivery attempt, then its accumulator is consumed when the request starts and the adapter never retries it; redirect, certificate failure, non-success response, timeout, or offline network follows no redirect, reaches no fallback host, queues no report, and exposes no telemetry failure modal.
- AC30: Given normal application quit with a current or eligible usage accumulator, then quit starts, flushes, and waits for no PostHog request; bounded accumulator persistence may use the existing quit window but cannot extend milestone 0003's 2,000ms settings-flush bound.

### Sentry crash diagnostics

- AC31: Given crash diagnostics are not `enabled` at process start or are suppressed by environment, when Markzen launches, then `@sentry/electron` and Crashpad upload are not initialized and no diagnostic session, breadcrumb, error, dump, or request is created.
- AC32: Given valid persisted crash diagnostics are enabled at process start in an official build, when Markzen launches, then the main-owned diagnostics adapter initializes Sentry's EU DSN before creating any renderer, starts one release-health session, and ensures each monitored Markzen process uses the same diagnostics identifier and release identity.
- AC33: Given an enabled diagnostic session, when Markzen exits normally, crashes, or observes an Electron renderer, utility, or GPU process exit, then Sentry receives the corresponding clean/crashed session state or closed process-gone record without a PostHog identifier or arbitrary application data.
- AC34: Given a fatal unhandled JavaScript exception or rejection in main or renderer, when the diagnostics adapter constructs its record, then it sends only the allowlisted JavaScript fields, removes exception messages, values, absolute paths, source context, locals, requests, and unknown context, and rejects the record if scrubbing cannot prove the closed shape.
- AC35: Given diagnostics are enabled and approved semantic outcomes occur, then the coordinator retains at most the latest 32 closed breadcrumbs in occurrence order; each uses only the documented vocabulary and allowed enum property, and no renderer-supplied string or identifier can enter the ring.
- AC36: Given an Electron process produces a native crash report, when upload is enabled, then Sentry receives at most the Electron minidump plus the allowlisted annotations; no screenshot, log, document, custom attachment, or optional Sentry integration data accompanies it.
- AC37: Given an expected caught application or platform failure, when Markzen handles it without a fatal exception or process-gone condition, then no Sentry error event is sent; an allowlisted breadcrumb and PostHog failure bucket may still update under their independent consents.
- AC38: Given official release JavaScript, when protected release CI builds it, then source maps for the exact release are uploaded to Sentry EU using an organization-issued least-privilege token available only to that upload step, the upload is verified before release publication, the token is unset before packaging, and neither the token nor distributable source-map files enter any application or release artifact.
- AC39: Given any Sentry initialization, when its effective options and integrations are inspected, then default PII, stored IP, DOM/keyboard/navigation/console/network/request/local-variable/screenshot/replay/tracing/profiling/AI behavior, source scraping, and non-minidump attachments are disabled.
- AC40: Given Sentry transport failure, quota rejection, certificate failure, timeout, or offline network, then Markzen exposes no failure modal, does not delay editing or normal quit, uses no fallback host, and adds no application-owned retry or offline queue; any SDK- or Crashpad-owned pending reports use the dependency's documented local limits and remain subject to AC41.
- AC41: Given crash diagnostics are turned off while Sentry work is pending, then no new event starts, active requests are cancelled where the SDK permits, locally pending reports are deleted before a later upload, and the UI explains that a report already accepted by Sentry cannot be recalled; given a diagnostics environment override is present at process start, the same deletion occurs before Sentry initialization.

### Boundaries, verification, and transparency

- AC42: Given both services are enabled, when semantic notices or transports run, then the usage adapter can access only the usage identifier and PostHog summary while the diagnostics adapter can access only the diagnostics identifier and diagnostic records; no code path emits a record containing both identifiers.
- AC43: Given the packaged renderer response and preload surface, when inspected after both services are enabled, then renderer CSP still contains `connect-src 'none'` and the preload exposes only closed semantic notices plus Privacy choice intents, with no URL, transport, PostHog, Sentry, identifier, stack, attachment, arbitrary-event, arbitrary-property, log, preview, or send capability.
- AC44: Given telemetry tests at any layer, then they use injected clocks, UUIDs, release configurations, stores, scrubbers, and transports; automated tests never contact PostHog, Sentry, or another public endpoint and cannot read or write a developer's real telemetry state.
- AC45: Given the packaged shell telemetry integration tests, then one local fake PostHog endpoint proves the exact summary request, and one Sentry-compatible local test sink plus deliberate main JavaScript failure, renderer JavaScript failure, main native crash, and renderer process crash proves capture and closed metadata without sending test data publicly.
- AC46: Given the pre-release backend checklist, then it records PostHog EU destination, personless/GeoIP/IP-discard settings, 12-month retention, volume and unknown-schema monitoring, and the absence of a personal API key; Sentry EU destination, default-PII/IP and optional-integration disablement, finite client-key rate limit, spike protection, 30-day event/attachment retention, source-map success, attachment access restriction, and no AI processing; restricted maintainer access for both; $0 plans with paid overages, pay-as-you-go billing, automatic upgrades, and chargeable payment methods disabled; and a failed check blocks release.
- AC47: Given packaged telemetry documentation and its repository source, then both publish the exact PostHog schema and cadence, separate fixed-ID lifecycles, Sentry record classes and breadcrumb vocabulary, native-minidump residual risk, destinations, source-IP caveat, exclusions, retention, disable and environment behavior, at-most-once PostHog delivery, diagnostic session behavior, and a source link to each adapter; the documentation also explains that the PostHog project token and Sentry DSN are extractable submission identifiers with no read or administrative authority, direct ingestion cannot authenticate an installation, and fabricated data or quota exhaustion remain possible without a first-party relay.
- AC48: Given Privacy is opened after either service has been enabled, then it shows that service's state and environment override, explains that its private installation identifier stays fixed until sharing is disabled, links to AC47's exact public telemetry document, and shows Sentry activation state (`Starts next launch`, `Active`, or `Off`) where applicable, without exposing identifiers, payloads, raw network errors, stacks, or minidumps.
- AC49: Given a service is disabled after prior delivery, then Privacy and public documentation state that its local identifier and pending data were removed while already accepted reports remain until that backend's retention limit.
- AC50: Given repository, packaged-product, dashboard, or release-note text labels a distinct count from this feature, then it says `opted-in active installations`, `diagnostics-enabled installations`, or `crash-affected installations` as applicable, never `users`; usage reporting also states that opt-in coverage is unknown because no event is sent before consent or for a declined invitation.
- AC51: Given protected release CI has uploaded source maps and built the final application, when its credential-boundary verification runs, then it scans the final unpacked application and every distributable artifact for PostHog personal-key and Sentry authentication/source-map-token patterns, permits the expected public PostHog project token and public Sentry DSN, fails with a redacted finding if a private-token pattern is present, and blocks publication.

## Test mapping

| AC | Primary layer | Supporting coverage |
|----|---------------|---------------------|
| AC1 | Shell smoke | Node default-state policy |
| AC2–AC10 | Browser Mode | Playwright-vs-vite consent journey; automated accessibility scan |
| AC11–AC14 | Node | Shell smoke restart/upgrade continuity |
| AC15–AC17 | Node | Browser Mode Privacy states; shell smoke persisted removal |
| AC18–AC20 | Node | Browser Mode warnings and environment state |
| AC21 | Static | Node release-configuration negatives; shell smoke environment-override negative |
| AC22–AC27 | Node | Playwright-vs-vite multi-window journey |
| AC28–AC30 | Node | Shell smoke local PostHog adapter journey |
| AC31–AC33 | Shell smoke | Node startup/session policy |
| AC34–AC37 | Node | Shell smoke main/renderer failure coverage |
| AC38 | CI | Packaged release-identity inspection |
| AC39 | Static | Node effective-options assertion |
| AC40–AC42 | Node | Shell smoke cancellation and local-sink journey |
| AC43 | Shell smoke | Static preload/import boundary |
| AC44 | Static | Node transport guards |
| AC45 | Shell smoke | — |
| AC46 | Maintainer release checklist | — |
| AC47 | Static | Browser Mode packaged-document view |
| AC48–AC49 | Browser Mode | Node state equivalence |
| AC50 | Static | — |
| AC51 | CI | Packaged-artifact inspection |

## Open questions

- (none)
