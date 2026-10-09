# Stable v1 requirements and release readiness

Updated: 2026-10-09. Application `0.1.0-beta.2`; SQLite schema 3; backup/configuration formats 1. Beta 2 includes the bundled HTTPS installer fix and is being verified for publication. [Beta 1](releases/v0.1.0-beta.1.md) remains an immutable published evaluation release. Milestone 18 deployment/live acceptance is deferred; stable Milestone 19 remains pending. [Current beta verification](releases/v0.1.0-beta.2.md#verification-record) does not pass any of the 33 live/reference/operator gates.

This crosswalk covers the normative scope in both identical [PRDs](PRD.md). It links implementation and behavioural checks rather than counting routes. **Automated** means synthetic/SQLite/browser/container evidence exists; it does not mean that all live scenarios have passed. **Pending** means required external acceptance or publication has no result. Historical Milestone 1 evidence applies only to that older foundation snapshot. The [milestones](MILESTONES.md) record exact tested commits and runs.

The 2026-10-09 review fixes add targeted evidence for R25 (OAuth/refresh races), R27–R28 (command-error cooldowns), R46 (older pending reward decisions), R50 (older uncertain deliveries), and configuration/privacy safeguards. See [review regressions](../tests/review-regressions.test.ts), [Kick contracts](../tests/kick.test.ts) and [production browser workflows](../tests/e2e/application.spec.ts). Schema 3, backup/configuration format 1 and pending live acceptance remain unchanged. The beta package/image reviews are recorded below; complete sign-off is still absent.

Operator journeys are documented separately in [installation](INSTALLATION.md), [provider setup](PROVIDERS.md), [user workflows](USER_GUIDE.md), [OBS](OBS.md) and [recovery](BACKUP_RECOVERY.md). Documentation coverage does not pass the independent-installer or live gates. Return to the [documentation index](README.md).

The handbook additionally includes [first session](FIRST_SESSION.md), [accounts/capabilities](ACCOUNTS.md), [Docker Desktop fixtures](DOCKER_DESKTOP.md), complete [CLI](CLI.md), [field/example](CONFIGURATION_FIELDS.md) and [action](API_ACTIONS.md) references. [Documentation verification](DOCUMENTATION.md) checks navigation/schema examples and rehearses changed procedures. This 2026-10-08 editorial review does not change historical acceptance results or the pending gate index.

<!-- contents:start -->
**On this page**

- [Ownership, journeys and installation](#ownership-journeys-and-installation)
- [Storage, authority and live interfaces](#storage-authority-and-live-interfaces)
- [Kick, moderation, presentation and Discord](#kick-moderation-presentation-and-discord)
- [Media, engagement and operations](#media-engagement-and-operations)
- [Quality, distribution and completion](#quality-distribution-and-completion)
- [Acceptance record](#acceptance-record)
- [Repository quality follow-up](#repository-quality-follow-up)
- [Beta dependency review](#beta-dependency-review)
- [Beta image remediation and binary review](#beta-remediation-review)
- [Beta 1 host installer correction](#beta-1-installer-correction)
- [Beta 2 candidate review](#beta-2-review)
<!-- contents:end -->

## Ownership, journeys and installation

| ID | PRD requirement | Implementation / reusable guidance | Automated evidence | Remaining acceptance |
| --- | --- | --- | --- | --- |
| R01 | §§1–6, 20: one creator, local ownership, optional integrations, MIT, no paid/central runtime service; later scope separate | [architecture](ARCHITECTURE.md), [config](../src/server/config.ts), [LICENSE](../LICENSE) | [boundary tests](../tests/boundaries.test.ts), [publication tests](../tests/publication.test.ts) | L24; independent owners O01 |
| R02 | §§5, 7.1: unaided fresh install, owner app setup, verified capability rather than entered credentials | [installation](INSTALLATION.md), [providers](PROVIDERS.md), [dashboard](../src/app/dashboard.tsx), [Kick connection](../src/server/providers/kick.ts) | [browser setup](../tests/e2e/application.spec.ts), [accounts](../tests/accounts.test.ts) | L01–L08; O02 |
| R03 | §7.2: live stream, commands/timers, Discord, moderation/alerts and observed end summary | [bot events](../src/server/domain/bot.ts), [automation](../src/server/domain/automation.ts), [analytics](../src/server/domain/operations.ts) | [modules](../tests/modules.test.ts), [boundaries](../tests/boundaries.test.ts) | L08–L12, L17 |
| R04 | §7.3: Kick request → Discord approval → OBS; exact current title/requester and one advance | [media](../src/server/domain/media.ts), [source projection](../src/server/domain/presentation.ts) | [signed browser flow](../tests/e2e/application.spec.ts), [races](../tests/concurrency.test.ts), [validation/requester](../tests/release-gaps.test.ts) | L13–L14 |
| R05 | §§7.4, 9: move all state/assets, original encryption key, new callbacks/reauthorization | [maintenance](../src/server/maintenance.ts), [recovery guide](OPERATIONS.md) | [maintenance](../tests/maintenance.test.ts), [upgrade/restore](../tests/operations.test.ts), [container recovery](../scripts/container-smoke.mjs) | L22 on a genuinely different host |
| R06 | §8: one non-root container, persistent local disk, x86-64 Linux; Desktop container instructions | [Dockerfile](../Dockerfile), [Compose](../compose.yaml), [operator guide](OPERATIONS.md) | [Linux container flow](../scripts/container-smoke.mjs) | L01–L04; Windows/macOS Docker Desktop operator trials |
| R07 | §8: optional HTTPS proxy, loopback direct port, external configuration/data, ownership/ports/always-on burden | [proxy examples](../compose.proxy.yaml), [IP example](../compose.ip.yaml), [guide](OPERATIONS.md) | [CI configuration checks](../.github/workflows/ci.yml), hostname/CA/SSE/restart in [container flow](../scripts/container-smoke.mjs) | L02, L06 actual public trust/renewal |
| R08 | §8: init/doctor/backup/restore/recover-owner work from distributed runtime | [CLI](../src/cli.ts), [maintenance](../src/server/maintenance.ts) | [packaged standalone](../scripts/standalone-cli-smoke.mjs), [container](../scripts/container-smoke.mjs) | L04, L22–L23 |
| R09 | §8: explicit pinned upgrades, pre-upgrade backup, schema checks and recovery | [migrations](../drizzle/meta/_journal.json), [upgrade guide](OPERATIONS.md) | [legacy restore](../tests/operations.test.ts), [migration rollback](../tests/faults.test.ts) | L05 old-image recovery rehearsal |
| R10 | §8: explicit isolated fixtures, no silent fallback or live mutations | [config](../src/server/config.ts), [seed](../src/server/fixture-seed.ts), [runtime](../src/server/runtime.ts) | [boundaries](../tests/boundaries.test.ts), [workload isolation](../tests/workload.test.ts) | L24 disabled integration/independence trial |

## Storage, authority and live interfaces

| ID | PRD requirement | Implementation / reusable guidance | Automated evidence | Remaining acceptance |
| --- | --- | --- | --- | --- |
| R11 | §§9, 13: real SQLite, FK/WAL/FULL, short transactions, constraints, migrations; all declared state | [database](../src/server/storage/database.ts), [schema](../src/server/storage/schema.ts), [state](../src/server/domain/state.ts) | [storage](../tests/storage.test.ts), [concurrency](../tests/concurrency.test.ts), [faults](../tests/faults.test.ts) | L21, P07 physical host failure |
| R12 | §9: portable local assets, validated IDs, consistent snapshot and asset hashes | [presentation](../src/server/domain/presentation.ts), [maintenance](../src/server/maintenance.ts) | [modules](../tests/modules.test.ts), [maintenance](../tests/maintenance.test.ts), corrupted media in [faults](../tests/faults.test.ts) | L10, L22 |
| R13 | §9: installation-key encryption; no key/plaintext tokens in DB, exports, bundles or public files | [crypto](../src/server/crypto.ts), [secrets](../src/server/domain/state.ts), [config](../src/server/config.ts) | [security](../tests/security.test.ts), [boundaries](../tests/boundaries.test.ts), [publication](../tests/publication.test.ts), [image-layer audit](../scripts/image-audit.mjs) | Private inspection L17; final release review |
| R14 | §9: authoritative state, unique receipts, atomic decisions/outbox, job attempts/due/leases, explicit uncertain delivery | [repository](../src/server/storage/repository.ts), [runtime](../src/server/runtime.ts) | [storage](../tests/storage.test.ts), [runtime](../tests/runtime.test.ts), [races](../tests/concurrency.test.ts), [faults](../tests/faults.test.ts) | L19–L21, P02–P07 |
| R15 | §9: versioned secret-free import, conflict preview, validation, unsupported formats explicit | [operations](../src/server/domain/operations.ts), [API](API.md) | [modules](../tests/modules.test.ts) including asset remap/invalid replacement | L17 real operator portability |
| R16 | §9: 7/30/90-day defaults, configurable separate audit retention, disable chat text, viewer export/erasure, preserve integrity | [retention/privacy](../src/server/domain/operations.ts), [repository retention](../src/server/storage/repository.ts) | [operations](../tests/operations.test.ts), [boundaries](../tests/boundaries.test.ts) | L17 private data review; retained economic/audit identifiers documented |
| R17 | §9: disk/full/read-only/migration/backup failures visible; no durable ACK before commit | [health](../src/app/api/health/ready/route.ts), [intake](../src/app/api/providers/kick/events/route.ts), [runtime](../src/server/runtime.ts) | [storage](../tests/storage.test.ts), actual capacity/query-only/migration failures in [faults](../tests/faults.test.ts) | Device-level disposable-storage campaign L21 |
| R18 | §10: independent local login, Argon2id, revocable sessions, private expiring one-time claim | [auth](../src/server/auth.ts), [auth route](../src/app/api/auth/route.ts) | [accounts](../tests/accounts.test.ts), [browser](../tests/e2e/application.spec.ts) | L04 HTTPS deployment |
| R19 | §10: expiring single-use role invitations; audited safe recovery/session revocation | [auth](../src/server/auth.ts), [maintenance](../src/server/maintenance.ts) | [accounts](../tests/accounts.test.ts), [operations](../tests/operations.test.ts), [standalone](../scripts/standalone-cli-smoke.mjs) | L23 stopped-host recovery |
| R20 | §§10, 14: full roles/grants at every entry and deferred action; disable immediately; sensitive access explained | [auth](../src/server/auth.ts), [domain checks](../src/server/domain/state.ts), [Accounts UI](../src/app/module-panels.tsx) | [boundaries](../tests/boundaries.test.ts), [HTTP roles](../tests/e2e/hardening.spec.ts), [modules](../tests/modules.test.ts) | L11, L18 real revocation |
| R21 | §§10, 14: rate limits, CSRF, safe redirects, correct HTTPS cookies, verified-only intake/scoped public sources | [HTTP](../src/server/http.ts), [auth](../src/server/auth.ts), [providers](../src/server/providers/kick-webhook.ts) | [security](../tests/security.test.ts), [boundaries](../tests/boundaries.test.ts), [HTTP browser](../tests/e2e/hardening.spec.ts), [container](../scripts/container-smoke.mjs) | L04, L18, L20 |
| R22 | §§12–13: uncached routes, shared domain decisions, health/callbacks/intake/control, single startup hook and bounded runner | [instrumentation](../src/instrumentation.ts), [runtime](../src/server/runtime.ts), [control](../src/server/control.ts), [API](API.md) | [runtime](../tests/runtime.test.ts), [browser](../tests/e2e/foundation.spec.ts), [container](../scripts/container-smoke.mjs) | L08 closed dashboard; L21 recovery |
| R23 | §12: durable SSE IDs, bounded replay, current snapshot on old cursor, revocation/reconnect | [stream](../src/server/stream.ts), [event route](../src/app/api/events/route.ts) | [HTTP/SSE](../tests/e2e/hardening.spec.ts), [reconnect](../tests/e2e/application.spec.ts), [proxy](../scripts/container-smoke.mjs) | L16, L18, L20 real network |
| R24 | §12: versioned owner API, named/revocable/scoped tokens, shown once | [API adapter](../src/app/api/v1/control/route.ts), [token service](../src/server/domain/presentation.ts), [API guide](API.md) | [modules](../tests/modules.test.ts), [scoped browser flow](../tests/e2e/application.spec.ts), [boundaries](../tests/boundaries.test.ts) | L18; stable interface freeze |

## Kick, moderation, presentation and Discord

| ID | PRD requirement | Implementation | Automated evidence | Remaining acceptance |
| --- | --- | --- | --- | --- |
| R25 | §11.1: owner credentials, OAuth/PKCE/state/browser binding, creator/scopes, encrypted grant, serialized refresh/disconnect | [Kick client](../src/server/providers/kick.ts) | [Kick](../tests/kick.test.ts), [security](../tests/security.test.ts), [boundaries](../tests/boundaries.test.ts) | L07, L19; historical foundation only passed for one owner |
| R26 | §11.1: original-byte signatures, trusted key, timestamp/retry policy, creator isolation, committed receipt/subscription repair | [webhook](../src/server/providers/kick-webhook.ts), [intake](../src/app/api/providers/kick/events/route.ts), [Kick](../src/server/providers/kick.ts) | [security](../tests/security.test.ts), [Kick](../tests/kick.test.ts), [capture](../tests/proof-capture.test.ts), [HTTP](../tests/e2e/hardening.spec.ts) | L07–L10, L19; second owner O01 |
| R27 | §11.2: editable/enabled commands, aliases, restrictions, cooldowns, live-only, bounded variables/previews/audit | [automation](../src/server/domain/automation.ts), [editor](../src/app/config-editor.tsx) | [modules](../tests/modules.test.ts), [browser editor](../tests/e2e/application.spec.ts) | L08 |
| R28 | §11.2: declared utility commands, groups, random pools, persistent counters and safe conditions | [automation](../src/server/domain/automation.ts), [catalog](../src/server/domain/catalog.ts) | [modules](../tests/modules.test.ts), [literal template/axe](../tests/e2e/hardening.spec.ts), [workload](../tests/workload.test.ts) | L08; unavailable data remains explicit |
| R29 | §11.2: cadence/activity/timezone/quiet-hour/rotation, pure preview, pause/offline/restart no catch-up | [automation](../src/server/domain/automation.ts) | [modules](../tests/modules.test.ts), [boundaries](../tests/boundaries.test.ts) | L09 actual stream state |
| R30 | §11.3: link/phrase/repetition/caps/burst, trust/domain exceptions, warn/delete/timeout/ban | [moderation](../src/server/domain/moderation.ts), [Kick effects](../src/server/providers/kick.ts) | [modules](../tests/modules.test.ts), [false-positive/delivery boundaries](../tests/boundaries.test.ts) | L12 consenting identities/provider permissions |
| R31 | §11.3: live health/events, observed viewer search, incidents/notes, acknowledged irreversible/bulk, safe test/emergency pause | [control room](../src/app/dashboard.tsx), [panels](../src/app/module-panels.tsx), [moderation](../src/server/domain/moderation.ts) | [modules](../tests/modules.test.ts), [boundaries](../tests/boundaries.test.ts), [HTTP/axe](../tests/e2e/hardening.spec.ts) | L12, L18, L20 |
| R32 | §11.3: configurable escalation, temporary incident presets, reviewed bulk | [moderation](../src/server/domain/moderation.ts), [rule schema/editor](../src/server/domain/catalog.ts) | [rule-scoped thresholds/windows, preset review/restart/expiry](../tests/release-gaps.test.ts), [UI](../tests/e2e/hardening.spec.ts), [bulk](../tests/modules.test.ts) | L12 real effects |
| R33 | §11.4: supported follow/subscription/gift/manual/goal/media alerts; variables/assets/duration/priority/animation/volume; separate tests | [bot events](../src/server/domain/bot.ts), [presentation](../src/server/domain/presentation.ts) | [modules](../tests/modules.test.ts), [bounds](../tests/boundaries.test.ts), [browser](../tests/e2e/application.spec.ts) | L10 each available real variant/audio |
| R34 | §11.4: durable scoped/revocable source URLs, minimal snapshots, independent player credentials | [presentation](../src/server/domain/presentation.ts), [widget route](../src/app/api/widgets/[id]/route.ts) | [modules](../tests/modules.test.ts), [browser source/API](../tests/e2e/application.spec.ts), [boundaries](../tests/boundaries.test.ts) | L16, L18 |
| R35 | §11.4: all declared widgets, unknown counts, manual/event goals with completion/reset | [projection](../src/server/domain/presentation.ts), [widget renderer](../src/app/widgets/[id]/widget.tsx) | [18 families](../tests/e2e/application.spec.ts), [modules](../tests/modules.test.ts), [requester names](../tests/release-gaps.test.ts) | L10, L16; inventory below |
| R36 | §11.4: coherent themes, safe tokens, previews/dimensions/transparency/visibility/reduced motion, bounded alerts/player | [CSS](../src/app/style.css), [renderer](../src/app/widgets/[id]/widget.tsx), [player](../src/app/widgets/[id]/player.tsx) | [axe/responsive/keyboard](../tests/e2e/hardening.spec.ts), [bounded queues](../tests/boundaries.test.ts) | L16 OBS/assistive-technology visual review |
| R37 | §11.5: owner Discord app, allowed guild/channel routing, selected notifications, disabled mentions | [Discord](../src/server/providers/discord.ts), [routing](../src/server/domain/state.ts) | [boundaries](../tests/boundaries.test.ts), [modules](../tests/modules.test.ts) | L11 two real guilds |
| R38 | §11.5: role/identity permissions, status/queue/approval/reject/skip/manual alerts and shared controls | [Discord](../src/server/providers/discord.ts), [bot actions](../src/server/domain/bot.ts) | [modules](../tests/modules.test.ts), [signed workflow](../tests/e2e/application.spec.ts), [boundaries](../tests/boundaries.test.ts) | L11, L13 |
| R39 | §11.5: original-body signature/PING/app trust, persisted interaction ID, immediate defer, eventual result and safe retries | [Discord](../src/server/providers/discord.ts), [runtime](../src/server/runtime.ts) | [boundaries](../tests/boundaries.test.ts), [modules](../tests/modules.test.ts), [browser](../tests/e2e/application.spec.ts) | L11 actual <3-second acknowledgement |

## Media, engagement and operations

| ID | PRD requirement | Implementation | Automated evidence | Remaining acceptance |
| --- | --- | --- | --- | --- |
| R40 | §11.6: official metadata, missing key/quota isolation, identity/availability/embedding/title/duration/uploader/duplicate/cooldown/capacity/user rules | [media](../src/server/domain/media.ts) | [modules](../tests/modules.test.ts), [boundaries](../tests/boundaries.test.ts) | L13–L14 actual metadata/provider failures |
| R41 | §§7.3, 11.6: chat validation status, approval/auto-approval/moderator add, reject/remove/reorder/clear | [media](../src/server/domain/media.ts), [automation](../src/server/domain/automation.ts), [Media panel](../src/app/module-panels.tsx) | [validation outcome](../tests/release-gaps.test.ts), [modules](../tests/modules.test.ts), [concurrency](../tests/concurrency.test.ts) | L13–L14 |
| R42 | §11.6: durable queue, one active scoped player lease, item/version-bound end/skip, pause/resume/volume | [media](../src/server/domain/media.ts), [player route](../src/app/api/player/[id]/route.ts) | [concurrency](../tests/concurrency.test.ts), [modules](../tests/modules.test.ts), [browser](../tests/e2e/application.spec.ts) | L13–L14 |
| R43 | §11.6: restart preserved current item paused, moderator resume from start, no silent error/disconnect advance | [media](../src/server/domain/media.ts), [player](../src/app/widgets/[id]/player.tsx) | [modules](../tests/modules.test.ts), [boundaries](../tests/boundaries.test.ts), [faults](../tests/faults.test.ts) | L14, L20–L21 |
| R44 | §11.6: compliant visible embed, autoplay/unavailable/error/lease conflict state; no extraction/guarantees | [player](../src/app/widgets/[id]/player.tsx), [operator constraints](OPERATIONS.md) | [boundaries](../tests/boundaries.test.ts); fixture player deliberately loads no YouTube | **Pending** L13–L14 visible OBS/real audio/embed compliance |
| R45 | §11.7: append-only ledger/balances, configured activity accrual/window/cadence, honest estimated watchtime/offline stop | [engagement](../src/server/domain/engagement.ts), [automation](../src/server/domain/automation.ts) | [modules](../tests/modules.test.ts), [concurrency](../tests/concurrency.test.ts) | L15 |
| R46 | §11.7: atomic reward debit/fulfilment/refund, no overspend, manual adjustments/reasons/leaderboard | [engagement](../src/server/domain/engagement.ts) | [modules](../tests/modules.test.ts), [separate-connection races](../tests/concurrency.test.ts), [restore](../tests/operations.test.ts) | L15 |
| R47 | §11.7: polls/open/vote/change/deadline/results and eligible one-entry raffles/secure draw/audited reroll | [engagement](../src/server/domain/engagement.ts), [widgets](../src/server/domain/presentation.ts) | [modules](../tests/modules.test.ts), [concurrency](../tests/concurrency.test.ts), [boundaries](../tests/boundaries.test.ts) | L15–L16 |
| R48 | §11.8: per-stream observed messages/chatters/commands/viewer samples/support/moderation/alerts/media/redemptions/engagement | [observations](../src/server/domain/automation.ts), [bot](../src/server/domain/bot.ts), [analytics](../src/server/domain/operations.ts) | [modules](../tests/modules.test.ts), [operations](../tests/operations.test.ts) | L17 controlled real totals |
| R49 | §11.8: historical chart/filter/CSV/JSON, aggregates, unknowns/windows/gaps, no fixture numbers in live dashboard | [analytics](../src/server/domain/operations.ts), [Analytics panel](../src/app/module-panels.tsx), [route](../src/app/api/control/route.ts) | [modules](../tests/modules.test.ts), [HTTP/axe](../tests/e2e/hardening.spec.ts) | L17 historical session/export review |
| R50 | §11.8: version/schema/callback/scopes/event/job/player/storage/error diagnostics, secret-free default support | [snapshot](../src/server/domain/state.ts), [support](../src/server/domain/operations.ts), [Connections/Maintenance](../src/app/module-panels.tsx) | [operations](../tests/operations.test.ts), [boundaries](../tests/boundaries.test.ts), [maintenance](../tests/maintenance.test.ts) | L17, L19–L23 operator diagnosis |

## Quality, distribution and completion

| ID | PRD requirement | Implementation / evidence | Remaining acceptance |
| --- | --- | --- | --- |
| R51 | §§13–14: exact pinned supported toolchain, architecture separation, no live jobs in build/test, no arbitrary code/URL/HTML, bounded safe inputs/uploads | [architecture](ARCHITECTURE.md), [package](../package.json), [build](../scripts/build.mjs), [security](../tests/security.test.ts), [boundaries](../tests/boundaries.test.ts), [HTTP](../tests/e2e/hardening.spec.ts) | L18; final review |
| R52 | §§14–15: explicit proxy trust, project telemetry off, provider dependencies/limits/setup/public HTTPS explained | [operator guide](OPERATIONS.md), [HTTP origin checks](../src/server/http.ts), [Next config](../next.config.ts), [boundaries](../tests/boundaries.test.ts), [container](../scripts/container-smoke.mjs) | L06–L07, L19–L20, L24; current provider contracts rechecked during deployment |
| R53 | §16: reference host, full sustained/burst/five clients, memory/backlog/latency/restart/restore/power-loss targets | [workload driver](../scripts/workload.mjs), [fixture aggregate endpoint](../src/server/workload.ts), [live protocol](LIVE_ACCEPTANCE.md), [fault tests](../tests/faults.test.ts) | **Pending** P01–P07; hosted CI is not reference acceptance |
| R54 | §16: keyboard/focus/labels/mobile/reduced motion/readable themes | [styles](../src/app/style.css), [axe/keyboard/responsive](../tests/e2e/hardening.spec.ts) in all three CI engines | L16 independent human/assistive-technology/OBS review |
| R55 | §17: meaningful unit/real-SQLite/provider/browser/crash/migration/storage/replay/permission/backlog evidence, explicit states | [testing guide](TESTING.md), [CI](../.github/workflows/ci.yml), [milestone results](MILESTONES.md) | Live campaign; no route-only completion claims |
| R56 | §§5, 17–18, 24: two independent owner sessions, three unaided installers, another-host restore and complete journeys | [live campaign](LIVE_ACCEPTANCE.md), [machine-readable gates](release-evidence.json) | **Pending** O01–O02, L22; no replacement by same-host fixtures |
| R57 | §§18–19: versioned source/image, explicit supported versions/upgrade path, source identity/checksums, licenses and release notes | [release procedure](RELEASING.md), [packager](../scripts/release-package.mjs), [image audit](../scripts/image-audit.mjs), [notices](DEPENDENCIES.md), [changelog](../CHANGELOG.md) | Final accepted candidate, publication authorization, published-artifact clean install |
| R58 | §19: public MIT source, README/install/contributing/security/changelog/roadmap, no private packages/accounts/data, rights/attribution, no CLA/paywall | [README](../README.md), [contribution policy](../CONTRIBUTING.md), [security](../SECURITY.md), [license fallbacks](../licenses/README.md), [publication guard](../scripts/check-publication.mjs), [CI](../.github/workflows/ci.yml) | Final source/history/image/export sanitisation; operator usability |
| R59 | §§20–23: later features remain separate, explicit scope/risks/provider limits/evidence revisions | [PRD](PRD.md), [roadmap](ROADMAP.md), [live runbook](LIVE_ACCEPTANCE.md) | Provider limitations dated when actually observed; scope changes require explicit decision |
| R60 | §24: independent install → own apps → declared operation/delegation → backup/restore → safe update | R01–R59 and [release gate](RELEASING.md) | **Pending** Milestones 18 and final 19 sign-off |

### Complete widget inventory

The projection and renderer implement these types: `alerts`, `chat`, `player`, `nowplaying`, `queue`, `eventfeed`, `supporter`, `goal`, `multigoal`, `status` (stream/uptime and fresh supported viewer sample), `counter`, `leaderboard`, `poll`, `raffle`, `countdown`, `shoutout`, `socials` (rotating lines), and `activity` (rotating observed supporter events). Themes: mint, midnight, paper. Disabled sources render empty. Unknown/stale counts render unavailable. Public media sources resolve a requester display name, not a private account/viewer identifier. Real visuals, audio and embedded player requirements remain L16/L13 acceptance.

### Audit changes

This audit added configurable rule-scoped escalation thresholds/windows/actions, reviewed expiring incident presets, final chat validation status, requester names in OBS media labels, and owner-granted restricted admin invitations with creator/grant rechecks at acceptance. Queued timers now recheck pause, stream state, edits, expiry and restart eligibility before sending, and schedule/effect changes commit together. It also added the operator access explanation, a schema-1 backup restore/upgrade drill, complete license fallbacks, image-layer scanning, package identity/checksums, and fail-closed release evidence. These close implementation gaps; their live results remain pending.

<a id="acceptance-record"></a>

## Acceptance record

The guided host lifecycle adds implementation coverage for R02/R08/R57/R60: explained source/format choices, immutable image selection, backup-before-update, separate-root rollback and retained-data/default versus typed-purge removal. Offline and isolated Linux fixture tests are described in [testing](TESTING.md). Actual published-release installation/update, trusted public TLS/provider setup and three unaided operators remain required; no sign-off record changes because the tool exists.

No new live acceptance is recorded. All 33 entries in [release-evidence.json](release-evidence.json) remain pending: L01–L24 and P01–P07 from the [runbook](LIVE_ACCEPTANCE.md), O01 (two independent complete owner sessions) and O02 (three unaided installations). An unaccepted/failed/unavailable required scenario blocks stable sign-off. Add dated, sanitised outcomes and explicit anchors here only after the frozen source/image actually passes. Keep raw details in private operator evidence outside Git.

Automated run identities/results belong in [MILESTONES.md](MILESTONES.md). Package availability or a valid evidence schema does not establish acceptance. Publication itself and a clean installation from the final published artifacts remain separate final Milestone 19 tasks.

## Repository quality follow-up

[Eight follow-ups](QUALITY_HARDENING.md) cover active/history media, payload privacy, temporary-state expiry, installer cleanup/diagnostics, focused panels, dependency review and long-lived regressions. Storage is now schema 3; backup/configuration formats stay 1. These implementation/fixture checks do not change pending live gates. The two development-tool vulnerabilities have an exact esbuild override and a verified local braces patch; the raw registry audit still flags the unpatched upstream braces version. See the [remediation record](DEPENDENCY_MAINTENANCE.md#review-record). The historical beta package/image review is preserved below. The [remediation review](#beta-remediation-review) supersedes its image and binary-license blockers for the newly frozen candidate. Stable sign-off is not established.

<a id="beta-dependency-review"></a>
## Beta dependency review — 2026-10-09

Source **`facd7da62874655247eed3bc52f683416aed78ae`**, application **`0.1.0-beta.1`**. [Manual review run 37866420949](https://github.com/DangerMouseUK/kekbot/actions/runs/37866420949) and [ordinary PR run 37866425101](https://github.com/DangerMouseUK/kekbot/actions/runs/37866425101) identify the same source. Ordinary verification, all three browser engines, Linux container/proxy/recovery, exported-image round trip and both installer formats passed. The optional image review **failed** and withheld the candidate artifact upload; no release is authorized by these results.

| Review | Actual outcome |
| --- | --- |
| Application packages | **Pass:** production registry audit reports zero findings |
| Tooling packages | **Pass with identified code remediation:** raw registry audit reports one high braces advisory; exact manifest/lockfile/patch/installed-parser verification and exploit/compatibility regressions pass. This is not a clean raw scan. |
| Application image | **Fail:** Trivy 0.75.0 reports 0 critical, 43 high, 58 medium, 60 low and 1 unknown entries, with no omitted rows |
| Proxy image | **Fail:** Trivy reports 1 unknown entry, with no omitted rows; the earlier zlib medium entry is absent after the pinned update |
| Licenses/notices | Runtime inventory/copy/package checks pass. Final binary redistribution review, including native-library corresponding-source delivery and base-image obligations, remains **pending**; no license sign-off is inferred. |

Application image ID: `sha256:5fddb866c15d307d4b43ff4a35f0a9590a62ed52908a24e03bdb977941da845d`. Proxy image ID: `sha256:1b944ddebb9a43e463d0a024a8569362f3297f22f7f0c2d6a554c219e44423bf`. These identify the tested ephemeral images; upload was withheld, so they are not retained downloadable release assets. A later image must be scanned and reviewed under its own identity.

The initial Bookworm image reported 4 critical / 60 high / 113 medium / 78 low / 1 unknown entries. Available Debian updates and removal of unused bundled npm/Corepack/Yarn reduced that to 1 / 48 / 95 / 77 / 1. The final official Node 24.21.0 Debian 13 slim base produced the current 0 / 43 / 58 / 60 / 1 result. Build tooling remains intact; Linux CI verifies the runtime tools are absent and maintenance still works. No application dependency or data format changed, and no scanner exclusion was added.

### Remaining image work

Counts are package/advisory **entries**, not distinct remotely exploitable KekBot defects. The 43 high entries cover eight advisory IDs repeated across inherited OS packages:

| Package group | Reported high entries / versions | Next review |
| --- | --- | --- |
| util-linux family | 36 entries for CVE-2026-76642, CVE-2026-78408, CVE-2026-78409 and CVE-2026-78410; `2.41.5-0+deb13u1` (epoch/compatibility prefixes on some packages) | Check upstream fixes/backports and exact installed binaries; do not treat repeated package matches as independent application bugs |
| libacl | CVE-2026-54369; `2.3.2-2+b1` | Verify available remediation and application/native-library exposure |
| systemd/udev libraries | 2 entries for CVE-2026-16742; `257.13-1~deb13u1` | Establish affected functionality and actual image reachability |
| ncurses family | 3 entries for CVE-2025-69720; `6.5+20250216-2` | Establish affected consumers and available remediation |
| Perl | CVE-2026-9538; `5.40.1-6+deb13u1`; unknown CVE-2026-82560 also remains | Review upstream status and whether affected text/regex functionality is used |

The proxy's unknown entry is [GO-2026-5932](https://vuln.go.dev/ID/GO-2026-5932.json) in `golang.org/x/crypto v0.57.0`. Go's record concerns the unmaintained OpenPGP subpackages. A module-level match does not establish that the Caddy binary calls those packages; binary reachability still needs verification before any exception. No waiver is recorded. Lower-severity OS entries also remain part of the failed review.

`--image-findings` exposes only bounded allowlisted identifiers/versions/statuses; `unavailable` means absent or outside the allowed format, not proof that upstream has no fix. Raw reports/runtime data stay private. Remediate applicable findings, or obtain explicit maintainer approval for each justified residual with affected versions, exposure, mitigation and review deadline as required by [dependency policy](DEPENDENCY_MAINTENANCE.md#record-sign-off). Do not approve the image from the production npm result alone, suppress all unfixed entries, or bypass the failed profile to upload assets.

At the time of this historical review, [dependency-review.json](dependency-review.json) recorded two package passes, failed image review and pending license review. Its current record now identifies the separately reviewed remediation candidate below. All 33 live/reference/operator gates in [release-evidence.json](release-evidence.json) remain pending and separate. This preparation review does not authorize deployment or beta/stable publication.


<a id="beta-remediation-review"></a>
## Beta image remediation and binary review — 2026-10-09

Frozen source **`42f23070c085b445760429beac6f0e7c897830c5`**, application **`0.1.0-beta.1`**, retained application image **`sha256:3ed479c993b7ce69f7fcb49f3de2f1b03ff3266ea74ede13cee1bfc4529d0c20`**. [Full candidate campaign 37949098148](https://github.com/DangerMouseUK/kekbot/actions/runs/37949098148) passed functional checks, package/secret/image reviews, exported-image round trip, both installer formats, failed-update recovery and artifact upload. Its audited five-file bundle was downloaded into protected storage outside source and all four listed SHA256 checksums were independently verified. An evidence-only revision records these results without rebuilding or changing that bundle.

| Review | Actual result for this source/image |
| --- | --- |
| Application packages | **Pass:** production registry audit has zero findings. |
| Tooling packages | **Pass with verified local remediation:** raw registry audit retains one high braces entry, GHSA-vfj7-8cjw-p6xm. The exact checked-in/installed patch and exploit/compatibility tests pass. This is not a zero-finding raw tooling scan. |
| Application image | **Pass:** Trivy 0.75.0 reports zero entries at every severity, with no omitted findings. The real apk inventory is retained. Unused Debian tools and the disabled Sharp/libvips optimizer are absent. |
| Proxy image | **Pass with verified not-affected classification:** raw Trivy reports one UNKNOWN GO-2026-5932 module entry. The exact scanned Caddy binary contains no affected OpenPGP packages; no additional finding or package/symbol finding is accepted. Raw counts remain visible. |
| Licenses/notices | **Pass for this combined application distribution:** manual inspection of the actual exported binaries, 27-package conservative notice inventory and full runtime legal texts/source notices completed as described below. No proxy binary is offered as a release asset. |

The separately built proxy image is **`sha256:b8ebc22b357dbd378a57cf66e4bb71518352bce057151fde05fe1aace6c94701`**; its extracted Caddy binary SHA256 is **`38b67675fea4a97df92daef1f97e98db402b64f6c7a36cba74163c5879527bd8`**. Caddy 2.11.6 uses Go 1.27.2, x/net 0.60.0 and x/crypto 0.57.0. govulncheck 1.8.0 and 81,520 verified Go symbols establish a module-only OpenPGP match and absence of the affected packages. This is evidence that affected code is absent, not a waiver for an affected implementation. A stripped binary, changed versions/image, unavailable proof or additional advisory fails. The prior images and their failed reviews remain historical; they are not published or approved by this result.

### Actual binary redistribution review

Inspection of every exported image layer found exactly six ELF files: Node, musl's loader/libc, libgcc, libstdc++, and two identical target-platform `better-sqlite3` bindings (application and CLI copies). Both bindings are Linux musl amd64. No Windows/macOS/glibc/ARM prebuild, Sharp/libvips, shell, package manager or build executable is shipped. The image config hash matches the recorded image ID, runs as `1000:1000` and targets `linux/amd64`.

- **Node 24.21.0:** the full upstream 157,609-byte license file is included with its MIT and embedded third-party terms, including ICU/OpenSSL/certificate data. The executable is copied from the digest-pinned official Node Alpine image.
- **musl 1.2.6-r2:** upstream MIT/component notices and the unchanged complete 1.2.6 source archive accompany the binary in both image and notices archive. Their hashes match the [recorded provenance](../licenses/runtime/README.md).
- **libgcc/libstdc++ 15.2.0-r5:** unmodified Alpine runtime libraries accompany the independently licensed Node/SQLite target code. Full GPLv3 and Runtime Library Exception 3.1 texts are included; package license metadata and exact Alpine build commit remain intact. Review used the exception's eligible-compilation/combined-target-code permission and [FSF's dynamic/static linking explanation](https://www.gnu.org/licenses/gcc-exception-3.1-faq.en.html). This release conveys the combined application, not an independent GCC library product; the exception does not remove source obligations for separate distribution of GCC libraries. No compiler plugin or library modification is introduced.
- **better-sqlite3 13.0.3 / SQLite:** the upstream target-platform binding is retained with MIT attribution. SQLite itself is [public domain](https://www.sqlite.org/copyright.html); its compiled deliverable requires no separate license grant. The duplicate CLI binding is the same binary, not another unreviewed platform build.
- **JavaScript and bundled modules:** the conservative 27-package inventory retains MIT/ISC/BSD/0BSD/Apache notices and upstream embedded license texts. It includes optional/build graph entries that are not runtime binaries. No caniuse-lite dataset is present in the actual standalone runtime. Sharp/libvips is excluded and verified absent, so its native LGPL distribution is not part of this image.

The real runtime inventory records musl build commit `f5640d3a10f664c9119720c60515265d3d6f6d01` and GCC build commit `423a8ad043d07f2c7546c8ec3e2b0384cda360ae`. Full runtime notices are present in the image and downloadable notices archive; the source archive contains the build recipes and legal provenance. This review applies to these retained artifacts only. A different source/image, package version, native binding or distribution format requires renewed review.

Gitleaks 8.30.1 passed on the source archive, full Git history and CI image layers with redacted output. Publication policy, personal-path/retired-address and UTF-8 checks passed. Only audited source/image/notices/metadata/checksum assets are retained for publication; no raw scanner report, runtime configuration, account, private key, database, capture or operator evidence is included.

The beta 1 review completed all four candidate reviews against this exact source/image. [dependency-review.json](dependency-review.json) tracks the current candidate separately; this historical sign-off is not transferred to it. All 33 live/reference/operator gates remain pending in [release-evidence.json](release-evidence.json). These results permit the separately authorized evaluation beta, not stable acceptance, live deployment or reference-host performance claims. Published-download installation is recorded separately in the [beta notes](releases/v0.1.0-beta.1.md#verification-record) after it actually runs.

<a id="beta-1-installer-correction"></a>
## Beta 1 host installer correction — 2026-10-09

Review found that the original tag's tool staged only the Caddy Dockerfile/configurations, omitting its locked Go inputs and their `deploy/caddy/` layout. Fresh bundled domain/IP installations failed before creating the managed root. Host-tool commit `971656b7a4c8bf0d6e908b6ae786422716669f49` fixes staging and retained resources; the [operator workaround](INSTALLER.md#beta-1-bundled-https-installer-fix) pins it separately while selecting the unchanged published application.

Local `pnpm check` passed policy/docs/types/lint, 155 application tests and 30 portable installer contracts. [Correction CI 37955804079](https://github.com/DangerMouseUK/kekbot/actions/runs/37955804079), source `4ec86e40208965d833b5571825736a750572ffd8`, passed all required jobs, including all 37 Linux installer contracts, the real retained/staged Caddy build and domain/IP adaptation, production/standalone, three browser engines, container/storage checks and fixture install/update-failure/rollback/uninstall. No public certificates were requested. The earlier published-release fixture rehearsal used a local proxy; it did not establish bundled HTTPS installation.

Published beta tag/assets and their exact dependency/license review above remain unchanged. This host-tool correction changes no Go/native/application dependency or data format. All 33 live/reference/operator gates remain pending; certificate issuance/renewal, real providers and unaided installation still need their own evidence.

<a id="beta-2-review"></a>
## Beta 2 candidate review — 2026-10-09

Preparation starts from merged main `be578d30b52a1262e30f024dd65ca6dcee8fe53d` and includes the bundled HTTPS installer correction. Application/Docker/Compose select `0.1.0-beta.2`; production dependencies, SQL and data formats are unchanged. Frozen source/image, current application/tooling/image/proxy scan results, actual binary/notices review and asset checksums remain pending. No beta 1 acceptance is transferred.

The [beta 2 notes](releases/v0.1.0-beta.2.md#verification-record) will record exact outcomes after checks pass. All 33 live/reference/operator gates remain pending; no live host or registry image is provisioned/published by preparation.
