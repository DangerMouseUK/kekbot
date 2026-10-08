# KekBot project milestones

Updated: 2026-10-07. Target: complete the declared stable v1 product.

This is the milestone plan for upcoming work. It groups the requirements in the [PRD](PRD.md) and the identical [self-hosted PRD](PRD-self-hosted.md) into substantial build stages, followed by a bulk testing and release phase. The existing [roadmap](ROADMAP.md) remains the detailed feature and evidence reference; this document sets the working sequence and testing schedule. [Architecture decisions](ARCHITECTURE.md) continue to apply.

## Working approach

- Milestone 1 is complete. Its foundation proof and publication checks were completed on 2026-10-02, with the resulting work recorded in commit `72d14a1`.
- Build Milestones 2–16 locally using explicit fixtures and isolated data. A running droplet, live credentials, or another manual foundation demonstration is not a prerequisite for each build milestone.
- Keep focused checks with the work: type/lint checks, relevant domain tests, real SQLite checks for persistence and concurrency, and browser checks for changed critical flows. Keep existing CI enabled. Authentication, permissions, migrations and durable state still need evidence as they are built.
- Reserve the complete cross-feature regression, failure, security, accessibility and live acceptance campaigns for Milestones 17–18. Avoid repeating the entire deployment and manual test session after every feature.
- Use milestone gates and evidence rather than speculative dates. Fix faults that invalidate dependent work before building on them; record provider-dependent checks for the later acceptance phase.
- Maintain one creator per installation, owner-supplied provider apps, local accounts, optional integrations, one application container, SQLite/local assets, MIT licensing and independent operation. Missing provider data stays visibly unavailable.

### Infrastructure status

The original test droplet has been destroyed, as reported on 2026-10-07. Milestone 1 remains a completed historical proof; there is no claim that the old installation is currently running.

Provision a new test environment for Milestone 18. Verify its new host identity, set up trusted HTTPS, update provider callback addresses and authorize the intended test accounts. Keep actual addresses, credentials and operating commands in the existing private setup record and protected runtime files outside the repository. Do not attempt to reuse the old address or assume its identity is unchanged.

The old server's database, captures, certificate storage and server-local backups must not be assumed available. Check which independent backups and encryption keys survived before planning recovery. A fresh installation is valid for the new campaign; another-host restoration must then use a newly created, verified backup.

### Status and completion rules

| Status | Meaning |
| --- | --- |
| Planned | Work has not started. |
| In progress | Implementation or verification is underway. |
| Prepared | Runbook/tooling is ready; the actual campaign is deferred and has no acceptance result. |
| Build complete | The documented local workflow and focused checks work; required live acceptance is still pending. |
| Accepted | Required bulk and live evidence for that scope has passed. |
| Blocked | A specific required input or scenario is unavailable; identify it and continue independent work. |

Milestone 1 is accepted from its recorded historical evidence. Milestones 2–16 can become **Build complete** before another server exists. They are not described as live-tested on that basis. Milestones 17–19 provide the acceptance and release gates. Screens, routes or tables alone do not establish completion.

For each milestone record its status, source commit, implemented scope, checks and outcomes, deferred live scenarios, known defects and next dependency. Public evidence contains redacted outcomes; private provider IDs, host details, payloads and credentials stay outside the repository.

## Milestone overview

The default order is numerical. The dependencies identify the capabilities each stage needs; an unavailable optional provider must not block unrelated local implementation.

| Milestone | Deliverable | Depends on | Current status |
| --- | --- | --- | --- |
| 1 | Foundation proof and public repository | None | Accepted — 2026-10-02 |
| 2 | Installation, accounts and permissions | 1 | Build complete — local fixtures; acceptance pending |
| 3 | Shared dashboard, settings and live state | 2 | Build complete — local fixtures; acceptance pending |
| 4 | Kick commands, timers and connection management | 2–3 | Build complete — local fixtures; acceptance pending |
| 5 | Discord notifications and operator controls | 3–4 | Build complete — local fixtures; acceptance pending |
| 6 | Alerts, assets and initial OBS sources | 3–4 | Build complete — local fixtures; acceptance pending |
| 7 | YouTube validation and durable request queue | 3–4 | Build complete — local fixtures; acceptance pending |
| 8 | Connected media workflow and OBS playback | 5–7 | Build complete — local fixtures; acceptance pending |
| 9 | Automated and advanced moderation | 4–5 | Build complete — local fixtures; acceptance pending |
| 10 | Goals, stream presentation and theme packs | 6 | Build complete — local fixtures; acceptance pending |
| 11 | Points, estimated watchtime and rewards | 3–4 | Build complete — local fixtures; acceptance pending |
| 12 | Polls, raffles and engagement controls | 4–6 | Build complete — local fixtures; acceptance pending |
| 13 | Expanded commands and complete widget set | 4, 8, 10–12 | Build complete — local fixtures; acceptance pending |
| 14 | Analytics, privacy, retention and support diagnostics | 3–13 | Build complete — local fixtures; acceptance pending |
| 15 | Configuration portability and owner integration API | 2–14 | Build complete — local fixtures; acceptance pending |
| 16 | Distribution, maintenance and complete documentation | 2–15 | Build complete — source/package and Linux image/proxy/recovery checks passed; live acceptance pending |
| 17 | Bulk automated testing and candidate hardening | 2–16 build complete | Accepted — automated candidate campaign passed 2026-10-07; live acceptance remains Milestone 18 |
| 18 | New deployment, live trials and operational acceptance | 17; test hosts and operators | Prepared — runbook/harness ready; deployment deferred by owner |
| 19 | Stable v1 release and project completion | 17–18 accepted | Prepared — audit, release gates and candidate packaging verified; final live acceptance/publication pending |

### Relationship to release versions

The existing release scopes remain intact. This plan builds their capabilities before the final bulk testing phase; it does not require publishing every intermediate version during development. An earlier release, if chosen, still needs its own complete operational and acceptance gates before publication.

| Release scope | Milestones providing the capabilities |
| --- | --- |
| v0.1 — Connected personal bot | 2–8, with applicable retention, diagnostics, maintenance and distribution work in 3 and 14–16; release acceptance in 17–19. The full Kick request → Discord approval → OBS playback workflow is included. |
| v0.2 — Moderation and stream presentation | 9–10, building on the v0.1 scope. |
| v0.3 — Community engagement | 11–13, building on the preceding scopes. |
| v1.0 — Stable creator toolkit | All preceding capabilities, advanced moderation in 9, remaining widgets/commands in 13, analytics/portability/API in 14–15, and completion of 16–19. |

Discord and YouTube remain optional to enable in an installation. Their complete workflows are required release capabilities and must be tested when enabled. Disabled integrations show an honest setup state and do not disable unrelated modules.

## Milestone 1 — Foundation proof and public repository

**Status: Accepted. Completed 2026-10-02.**

Completed work:

- Public MIT repository, product documents, architecture decisions, contribution/security guidance and CI.
- Pinned TypeScript/Node/pnpm/Next.js project, standalone runtime, non-root container and explicit fixture mode with live provider mutations disabled.
- SQLite/Drizzle migrations, durable receipts and jobs, leases, bounded processing and encrypted provider credentials.
- Owner-created Kick OAuth/PKCE, configured creator/scopes, original-byte signature verification and real signed chat/follow intake.
- Real confirmed chat reply with verified account identity, repeated subscription reconciliation, token refresh, subscription repair and revoked-grant reauthorization.
- Encrypted one-event proof capture and duplicate replay after cooldown and restart, without another reply or job.
- Processing with the dashboard closed; forced-termination recovery in fixtures; consistent database/asset backup and separate-directory restoration, including replay protection.
- Trusted public-IP HTTPS, persistent certificate storage and renewal configuration.
- Publication sanitisation, private-runtime-value comparisons, Git-history scanning, Git/Docker exclusions and publication-policy checks.
- Recorded foundation checks: 37 automated tests, type/lint/documentation checks, three production browser checks, standalone CLI and Linux/container evidence.

Detailed evidence and source snapshot versions are in [FOUNDATION.md](FOUNDATION.md). The public implementation was committed and pushed as `72d14a1`; the live proof used the deployment snapshot recorded in that guide.

Carry forward to Milestone 18: controlled stream-state delivery, actual certificate renewal, independent-owner trials, and restoration onto another host. The original server being destroyed does not invalidate completed historical tests or satisfy these outstanding scenarios.

## Milestone 2 — Installation, accounts and permissions

**Outcome:** an owner can securely claim an installation and delegate limited access.

Build:

- One-time owner setup using an expiring host-managed token; atomic first-owner creation and no unrestricted first-user route or default credentials.
- Local login with Argon2id password hashing, revocable database sessions, logout, password changes and account disabling.
- Single-use expiring invitations and the Owner, Admin, Moderator and Read-only roles, with explicit owner-granted administrative permissions.
- A server-enforced permission matrix for routes, live subscriptions, domain actions and queued effects. Account disabling and session revocation take effect immediately.
- Login/setup abuse protection, CSRF protection, safe redirects and documented cookie behaviour for local development and HTTPS deployment.
- Owner-only secret management and connection settings; encrypted storage with a separately supplied installation key and masked responses.
- Audited `recover-owner` through documented host access, including affected-session revocation. Extend `init`, `doctor`, backup and restore for accounts.
- Replace foundation proof-token access to operational dashboard features. Any retained diagnostic proof tools require explicit owner authority and remain disabled by default.

**Build gate:** local setup, invite, login, permission denial, disabling and recovery workflows work against real SQLite. Concurrent setup cannot create two owners; Read-only cannot mutate; Admin cannot grant itself owner powers. Backups preserve account state without exporting installation keys or plaintext credentials.

## Milestone 3 — Shared dashboard, settings and live state

**Outcome:** all modules have a common, usable control room and consistent operational state.

Build:

- Dashboard navigation and shared layouts for Setup, Control Room, Connections, Accounts and Maintenance, with space for the remaining modules.
- Role-aware presentation backed by server permissions, keyboard navigation, labelled inputs, clear focus states and responsive layouts.
- Persistent instance/module settings, setup progress based on verified capabilities, and explicit disabled, unavailable and disconnected states.
- Shared domain-service entry points for dashboard, Kick, Discord and later owner API actions.
- Authenticated server-sent events with durable event IDs, bounded replay and snapshot recovery. Operational state remains uncached; proxy examples support streaming.
- Audited configuration changes and actor/action/outcome records; visible pending, confirmed, failed and uncertain effects.
- Basic diagnostics for provider health, scopes, last verified event, worker health, job backlog and storage failures, without exposing secrets.
- Retention jobs that preserve permanent settings/state and apply the existing 7-day chat, 30-day receipt and 90-day summary defaults as relevant tables are introduced. Full owner controls arrive in Milestone 14.

**Build gate:** two local browser sessions see the same saved transition; dropped connections recover from durable state; a revoked account loses live access. Configuration survives restart, and a missing integration cannot produce invented healthy metrics.

## Milestone 4 — Kick commands, timers and connection management

**Outcome:** the bot can be configured to run ordinary chat automation.

Build:

- Normal owner-authenticated connect, scope inspection, disconnect/revoke, refresh, subscription reconciliation and bounded repair controls, replacing the proof-only workflow.
- Command create/edit/delete/enable/disable, aliases, role restrictions, per-user/global cooldowns, stream-only eligibility and bounded responses.
- Safe declarative variables, response previews, input validation and edit auditing; templates cannot execute JavaScript, shell commands or arbitrary network requests.
- Initial `!commands`, `!uptime`, `!rules`, `!discord`, `!socials` and `!so` utilities, with honest unavailable-data responses.
- Timers with cadence, minimum intervening chat activity, timezone, quiet hours, rotating messages, preview/test mode, pause/resume and stream-state gating.
- Restart-safe scheduling with no catch-up flood; limits and explicit outcomes for rate limits, expired credentials and uncertain sends.

**Build gate:** synthetic signed chat exercises configured replies, restrictions and cooldowns; edits apply without restart. Real SQLite/timer-clock checks prove that paused, offline and restarted timers cannot flood chat. Record real viewer replies and timer sends for Milestone 18.

## Milestone 5 — Discord notifications and operator controls

**Outcome:** permitted moderators can operate the installation from configured Discord servers.

Build:

- Owner-supplied Discord app/bot settings, connection status and a list of allowed guilds and explicitly selected channels.
- Signed HTTP interactions using the configured application public key, PING handling, durable interaction IDs, acknowledgement within three seconds and deferred completion for slower operations.
- Explicit Discord role/linked-identity permission mapping; guild membership alone grants no operator powers.
- Confirmed go-live/offline notifications, configurable routing, disabled unnecessary mentions and per-guild isolation.
- Stream status, timer controls and permitted manual Kick moderation actions, including warnings/deletion/timeout/ban only where official scopes support them.
- Shared action reasons, authorization and confirmed/failed/uncertain delivery outcomes. Bulk or irreversible moderation requires operator acknowledgement.
- Module-aware notification/control registration: alerts, media, goals and engagement become available as their domains are implemented, without placeholder success responses.

**Build gate:** signed fixtures prove guild isolation, role denial, deadline/defer handling and duplicate suppression. Two configured guild fixtures receive only their selected notifications; retries cannot repeat actions. Actual Discord routing and Kick moderation are deferred to Milestone 18.

## Milestone 6 — Alerts, assets and initial OBS sources

**Outcome:** creators can configure portable alerts and a chat overlay for OBS.

Build:

- Follow and supported subscription/gift variants, manual alerts, and shared hooks for later goal/media alerts. Mark unverified provider variants explicitly.
- Managed local image/sound uploads with format/size validation, safe asset IDs and filenames, deletion/reference handling and backup coverage. No executable uploads.
- Alert text variables, duration, priority, animations, volume, per-event enablement and bounded delivery queues.
- Initial alert and chat browser sources, transparent backgrounds, documented dimensions, visibility controls and accessible previews.
- Separate, individually revocable widget read tokens that remain usable across normal OBS sessions; minimal public snapshots and scoped reconnect recovery.
- A visibly separate preview/test path that does not add fixture events to live history or send unrequested provider effects.
- Dashboard and permitted Discord manual-alert controls through the same domain service.

**Build gate:** local OBS-style browser checks render signed fixture events, recover current state after reconnect, and reject revoked tokens. Widget credentials cannot read secrets or authorize moderation/media actions. Real alert delivery to OBS is a later live check.

## Milestone 7 — YouTube validation and durable request queue

**Outcome:** requests have validated metadata, explicit decisions and a durable queue.

Build:

- Optional owner YouTube key configuration and official metadata retrieval; clear missing-key, unavailable-video, embedding and quota outcomes.
- URL/video-ID validation, declared title/duration, uploader restrictions, duplicate policy, viewer cooldowns, queue capacity and per-user active-request limits.
- Approval and auto-approval modes, moderator additions, approve/reject/remove/reorder/clear, with permission checks and audit records.
- Atomic request/queue transitions, stable item IDs and durable state/version checks shared by every control surface.
- Explicit pending/approved/rejected/failed states and safe provider failure handling; unrelated modules keep working when new metadata validation is unavailable.
- Request/queue dashboard views and fixture metadata clients that never contact live providers during CI.

**Build gate:** real SQLite tests cover duplicate requests, conflicting approvals, capacity races, stale edits and restart persistence. Invalid videos and quota failures have explicit outcomes without corrupting the queue. Real metadata and playback remain Milestone 18 checks.

## Milestone 8 — Connected media workflow and OBS playback

**Outcome:** Kick requests, Discord approval and OBS playback operate on the same queue.

Build:

- `!sr`, `!queue`, `!nowplaying` and permitted `!skip` controls with actionable chat responses and module-aware registration.
- Dashboard and Discord approval/rejection by request ID, queue management, pause/resume, skip and volume controls.
- A visible embedded YouTube player meeting official controls/dimension requirements; clear autoplay, embedding, API, disconnected, paused and lease-conflict states.
- One active player lease and separate scoped acknowledgement credentials. Read-only widgets cannot claim playback authority.
- Completion bound to the active item, playback version and lease; duplicate, stale or competing callbacks cannot advance another item.
- Durable now-playing/queue widgets and state synchronization across dashboard, Discord and OBS.
- Restart recovery that preserves the queue/current item, pauses playback, requires moderator resume and restarts that item from the beginning. Errors/disconnection never silently advance.

**Build gate:** a complete fixture workflow runs from signed Kick request through signed Discord approval to simulated browser playback and exactly one queue advance. Browser/SQLite checks cover competing players, duplicate approval, stale completion, skip-versus-completion races and recovery. Actual YouTube playback in OBS is required in Milestone 18.

## Milestone 9 — Automated and advanced moderation

**Outcome:** moderators can configure understandable rules and inspect their effects.

Build:

- Link/domain, phrase, repetition, caps and message-burst rules, trusted-role exceptions, allowed domains and bounded evaluation windows.
- Warnings, deletion, timeout and ban where provider-supported; prevent bot/self-message loops and respect emergency pause.
- Incident history, viewer search over observed data, protected moderator notes, reasons and confirmed/failed/uncertain action outcomes.
- Safe rule testing on sample messages that explains matches and sends no provider actions.
- Configurable escalation, temporary incident-mode presets and reviewed bulk workflows, with explicit acknowledgement for bulk/irreversible actions.
- Dashboard and Discord permission enforcement, selected incident notifications and auditable recovery/retry controls.

**Build gate:** representative spam fixtures match the intended rule; permitted/trusted messages remain untouched. Rule testing creates no live effects, unprivileged users cannot act, and provider failures cannot appear as confirmed success. Live moderation and false-positive review join Milestone 18.

## Milestone 10 — Goals, stream presentation and theme packs

**Outcome:** OBS sources provide a coherent stream presentation with durable goals.

Build:

- Goals with stored targets, manual adjustments, supported event increments, completion behaviour and audited reset controls.
- Deduplicated goal increments and completion notifications through the shared alert/Discord services.
- Goal and multi-goal board, event feed, latest supporter labels, stream status/uptime and provider-supported viewer counter widgets.
- Honest unavailable states for counts/status that are not observed or supported.
- Coherent theme packs, safe theme tokens, readable text, transparent backgrounds, dimensions, visibility settings and reduced-motion previews.
- Local theme/asset portability, distributable licenses and attribution; no arbitrary shared HTML/JavaScript execution.
- `!goal` and permitted dashboard/Discord goal controls.

**Build gate:** duplicate events cannot increment a goal twice or repeat completion. Goal reset and theme changes preserve unrelated queue state. Local sources reconnect consistently, and themes remain readable and usable at documented sizes.

## Milestone 11 — Points, estimated watchtime and rewards

**Outcome:** community balances and rewards are durable and auditable.

Build:

- Append-only points ledger, balances, configurable accrual, manual adjustments and leaderboard.
- Accrual from observed activity only, with an explicit activity window/cadence, offline stopping and idempotent award records.
- Estimated watchtime labelled as an estimate; no claim to observe every silent viewer.
- Reward configuration, atomic point deduction and fulfilment creation, moderator completion/rejection and an audited refund policy.
- Dashboard and permitted Discord controls, leaderboard widget and `!points`, `!watchtime` and `!top` utilities.
- Restart/retention behaviour that preserves ledger consistency, balances and pending fulfilments.

**Build gate:** balances survive restart, duplicate work cannot award twice, concurrent redemptions cannot overspend and retries cannot issue duplicate refunds. The dashboard, commands and widget agree on the recorded balance.

## Milestone 12 — Polls, raffles and engagement controls

**Outcome:** creators can run participation workflows with reliable identity and results.

Build:

- Poll creation/open/vote/close, optional vote changes, deadlines, results and one effective vote per authenticated chat identity.
- Raffle eligibility, declared entry limits, close/draw, secure random winner selection and audited rerolls.
- Durable deadlines and restart recovery; duplicate provider messages cannot add votes or entries twice.
- Dashboard and authorized Discord operation, command participation and poll/raffle widget outputs.
- Clear eligibility, closing, winner and reroll records. Public widget reads cannot vote, draw or mutate participation.

**Build gate:** duplicated votes/entries remain single effective actions, eligibility is enforced, closing/drawing races have one recorded outcome, and completed results appear consistently across local dashboard and widgets. Live participation is exercised in Milestone 18.

## Milestone 13 — Expanded commands and complete widget set

**Outcome:** every declared v1 command category and OBS widget has a working implementation.

Build:

- Command groups, random response pools, persistent counters and safe conditions, with bounded declarative evaluation and previews.
- Complete module-aware utility registration and documentation; disabled/unavailable modules return useful explanations.
- Countdown, shoutout card and rotating social/activity widgets, using the common theme, scope and recovery model.
- Consistent widget editing, previews, visibility, theme application and source-token revocation across every widget family.
- Resolve missing functionality and inconsistent controls in the earlier modules; no placeholder or fixture-only production widgets.

Widget coverage to verify:

| Widget family | Implemented in |
| --- | --- |
| Alert source and chat overlay | 6 |
| Now-playing and queue | 8 |
| Event feed and latest supporter labels | 10 |
| Goals and multi-goal board | 10 |
| Stream status/uptime and supported viewer counters | 10 |
| Leaderboard | 11 |
| Poll and raffle | 12 |
| Countdown, shoutout card and rotating social/activity text | 13 |

**Build gate:** every row has a working local scenario, permission/token checks and reconnect behaviour. Counters survive restart; theme changes preserve domain state; arbitrary templates and widget text cannot execute code.

## Milestone 14 — Analytics, privacy, retention and support diagnostics

**Outcome:** owners can understand observed activity and control stored history.

Build:

- Persistent per-stream summaries for observed messages, distinct chatters, commands, supported viewer samples, follows/subscriptions, moderation, alerts, media, redemptions and engagement results.
- Historical charts, filters and CSV/JSON exports that agree with stored aggregates and dashboard totals.
- Declared observation windows and disconnection gaps; unknown values remain distinct from zero or complete coverage.
- Owner-adjustable retention, chat-text storage disablement, history export and documented viewer-history removal. Preserve settings, balances and queue state; configure security-audit retention separately.
- Full diagnostics covering application/schema versions, callbacks, provider scopes/state, last verified event, job backlog/outcomes, player connectivity, disk/storage and recent redacted failures.
- Owner-exported support bundles excluding tokens, secret files and raw personal history by default; safe handling of user-generated fields in exports.

**Build gate:** known event sequences produce expected summaries and exports. Retention/history removal does not corrupt balances, queue or aggregates. A fixture connection/storage failure is diagnosable from redacted information without maintainer access.

## Milestone 15 — Configuration portability and owner integration API

**Outcome:** owners can transfer supported configuration and automate trusted operations.

Build:

- Versioned KekBot JSON configuration export/import with schema validation, size limits, dry-run conflict previews and explicit merge/replace decisions.
- Coverage for commands, timers, rules, alerts, widgets, goals, rewards and other declared configuration, with validated portable asset references.
- Exclusion of provider secrets, passwords, sessions, invitation/setup tokens, installation keys and machine-specific runtime paths.
- Atomic application or recoverable rollback of an approved import; unsupported versions/formats remain visible rather than silently dropped.
- A versioned local HTTP API using individually named, scoped, revocable owner-generated tokens shown only at creation.
- Shared domain authorization, rate limits and audit records for API operations; documentation of scopes and examples using placeholders.
- Third-party importers only where a legally obtainable export or documented API supports them. Arbitrary outbound webhooks and executable extensions remain later scope.

**Build gate:** export/import round trips preserve supported settings and assets; rejected/conflicting input leaves the prior installation usable. API revocation takes effect, scopes are enforced, and imports/exports cannot introduce secrets or executable content.

## Milestone 16 — Distribution, maintenance and complete documentation

**Outcome:** an independent creator has a complete installation and operating package.

Build:

- Reproducible source/container builds, supported Linux x86-64 topology, one non-root application container, persistent local storage and loopback application binding.
- Generic HTTPS/proxy examples, streaming configuration, data ownership/ports and documented Docker Desktop paths for Windows/macOS.
- Complete `init`, `doctor`, `backup`, `restore` and `recover-owner` guidance and checks across all new modules.
- Consistent database/asset backups, separately protected encryption keys, empty-target restore, callback migration and reauthorization instructions.
- Explicit version pinning, supported schema/backup compatibility, pre-upgrade backup, migration failure handling and recovery/rollback guidance.
- Owner setup, provider application/scopes, moderator invitations, Discord/YouTube optional setup, OBS sources, themes, permissions and troubleshooting guides.
- Contributor setup with isolated fixtures, API/architecture documentation, feature contribution/review guidance and distributable asset attribution.
- Release notes, supported-version information, dependency/license inventory and image metadata tied to source commits. Prepare publishing; actual release publication waits for Milestone 19.

**Build gate:** a clean checkout can build and exercise the documented fixture setup and maintenance flow. All setup steps and recovery assumptions are written down; commands match the implementation and private installation information is excluded.

## Milestone 17 — Bulk automated testing and candidate hardening

**Outcome:** the assembled product has reproducible evidence across complete workflows.

Run commands, coverage and limits are in [TESTING.md](TESTING.md). Fixture/CI results do not substitute for real-provider or reference-host acceptance.

Run the full suite together:

- Type/lint/documentation/publication checks, unit tests, real SQLite integration tests, migration checks, dependency checks and redacted source/history secret scans.
- Production standalone/browser tests and Linux container checks covering setup, invitations, all roles, configuration edits, command/timer flows, moderation, engagement and OBS-style sources.
- Complete Kick request → Discord approval → player acknowledgement → one queue advance, including competing approvals/players, stale callbacks and skip/completion races.
- Provider boundary cases: forged/modified signatures, malformed/oversized bodies, wrong channels/guilds, duplicate IDs, missing scopes, expired/revoked credentials, rate limits and uncertain delivery.
- Revoked sessions/API/widget/player tokens, dropped live connections, snapshot recovery and cross-surface state agreement.
- Process termination, expired leases, acknowledged-state survival, read-only/full storage, failed migrations and backup/restore with all module data and uploaded assets.
- Accessibility/responsive checks, bounded alert/player queues, safe rendered text/assets/templates and redacted export/support bundles.
- Independence checks: no project cloud account/relay/telemetry requirement, disabled integrations remain isolated, and fixtures cannot send real provider mutations.
- Prepare the reproducible workload/latency and recovery measurement harness for the reference host in Milestone 18. Shared CI timing alone does not establish performance targets.

**Acceptance gate:** the complete automated campaign passes against an identified candidate commit/image, meaningful failures have been fixed and rerun, and the live test script/evidence checklist is ready. No unresolved authorization, secret exposure, data loss, duplicate points/queue transition or unsafe retry defect can be waived into release.

## Milestone 18 — New deployment, live trials and operational acceptance

**Outcome:** the complete candidate works for independent owners on real infrastructure.

The complete scenario/evidence runbook is [LIVE_ACCEPTANCE.md](LIVE_ACCEPTANCE.md). On 2026-10-07 the owner explicitly deferred deployment; preparation is complete, but all new live outcomes remain pending.

### Deploy and validate the new environment

- Provision fresh test infrastructure; verify the SSH host fingerprint through a trusted console and configure documented access rules without silently changing operator access.
- Install the documented container tooling and deploy the identified candidate. Keep secrets, configuration, persistent data and backups outside source.
- Verify trusted TLS without bypasses, persistent certificate storage and actual automated renewal. Re-register exact callback addresses and authorize the intended creator; old grants/certificates are not assumed reusable.
- Exercise supported stream-state delivery, reconnect, real refresh/subscription repair and revoked-grant recovery against current provider contracts.

### Run complete live sessions

- At least two independent owners use separate installations, provider applications, channels and data directories.
- Verify local owner/moderator/read-only access, invitations, revocation and rejection of unauthorized dashboard, Discord, widget and player actions.
- Exercise real commands, offline/paused/restarted timers, authorized manual/automated moderation, trusted-role exceptions and provider error reporting.
- Check actual follows and supported subscription variants, manual/goal alerts, themes and all relevant OBS widget families.
- Verify multi-guild notification routing and permitted controls, including duplicate/deferred Discord interactions.
- Run real `!sr` validation → Discord approval → visible OBS playback → exactly one durable advance; cover embedding/autoplay restrictions, competing players, stale callbacks and restart/resume.
- Exercise points, estimates, redemptions/refunds, polls/raffles, analytics/exports and redacted diagnostics. Confirm the interface reports only observed/supported data.
- Close the dashboard during processing and restart the application mid-session. Prove preserved commands/accounts/goals/queue/ledger/history and safe job recovery.
- Create a current consistent backup with uploaded assets, restore onto another host and revalidate callbacks/authorization. A second directory on the same server does not satisfy this check.
- Verify an installed instance operates when project-operated domains are blocked while its declared provider dependencies remain reachable.
- Have three independent operators complete documented installation without maintainer intervention; at least two also complete the live sessions above. Record assistance and failed attempts honestly.

### Measure the stable-v1 targets

Use the PRD reference environment: Linux x86-64, 2 vCPUs, 2 GiB RAM and local persistent SSD. Exclude image compilation and OBS/browser memory on a separate machine.

| Measurement | Required target |
| --- | --- |
| Sustained workload | 25 inbound chat events/second for one hour |
| Burst workload | 100 events/second for 60 seconds |
| Connected browser clients | Five |
| Application memory after warm-up | Below 750 MiB |
| Backlog after the burst | Bounded; drains within two minutes |
| p95 local command decision | Under 250 ms |
| Visible dashboard/widget update | Under one second |
| Healthy-provider command reply | Under two seconds; report provider/network/rate-limit waits separately |
| Healthy local job recovery after restart | Within 30 seconds |
| Supported small-instance backup restore | Within 15 minutes; report provider reauthorization time separately |
| Acknowledged durable state | Survives restart/power-loss acceptance checks |

Use synthetic traffic for sustained/burst load; do not flood real provider chat to manufacture a benchmark. Measure real-provider reply latency with controlled normal traffic. Keep configuration, dataset, runtime versions and measurement method with the evidence. A different machine or an unrun test cannot be reported as satisfying the reference target.

**Acceptance gate:** independent trials, full live workflows, another-host restore, renewal, workload and recovery targets have recorded results. Repair discovered problems in their owning milestones and rerun the affected campaign. Document verified provider limitations and explicitly resolve any requirement change before sign-off.

## Milestone 19 — Stable v1 release and project completion

**Outcome:** the declared self-hosted product is ready for independent public use.

**Current status:** prepared for the final live/sign-off campaign; autonomous audit and candidate tooling have passed the checks below. Stable sign-off is pending Milestone 18. The [complete requirement audit](RELEASE_READINESS.md) covers R01–R60 and all declared widgets/journeys. [Release tooling and instructions](RELEASING.md) prepare clean versioned source/image/notices/checksum bundles and reject stable sign-off while required evidence is absent. All 33 live/operator entries in [release-evidence.json](release-evidence.json) remain pending. No deployment, provider consent, tag, registry upload or GitHub release is authorized by candidate preparation.

Finish:

- Reconcile every v1 PRD requirement with an implementation and evidence record, including the complete widget inventory and all user journeys.
- Confirm three unaided independent installs, two complete independent live trials, another-host restoration and all required benchmark/recovery results.
- Resolve release-blocking defects; list supported provider limitations and later scope without presenting missing required functionality as complete.
- Freeze and verify the final source/image combination, rerunning affected acceptance if fixes changed it after testing.
- Complete setup/upgrade/recovery documentation, supported-version notes, release notes, license/dependency attribution and public issue/security guidance.
- Repeat final repository/history, image, configuration-export and support-bundle sanitisation. No credentials, captured history, actual host configuration or private setup records enter publication.
- Publish the accepted tagged source release and versioned container image with source identity and dependency/license information. Confirm a clean install from those published artifacts.
- Update milestone/roadmap statuses with evidence and record the remaining optional backlog.

**Project completion gate:** a new independent creator can install, connect owner-controlled apps, run the declared workflows, delegate safely, export/restore data and upgrade using the documentation. All required behaviour has evidence. No project-operated service or maintainer credential is required for normal operation.

## Requirements coverage

Use this crosswalk during implementation and final sign-off; it does not replace the PRDs' detailed requirements.

| Requirement area | PRD reference | Milestones |
| --- | --- | --- |
| Product ownership, scope and complete user journeys | 1–7 | 1–16 build; 18–19 acceptance |
| Self-hosting, installation and supported topology | 8 | 1–2, 16, 18 |
| Persistence, durable jobs, assets and recovery | 9 | 1–3, relevant domain milestones, 16–18 |
| Local accounts, roles, invitations and recovery | 10 | 2–3, 5–6, 8, 15, 17–18 |
| Kick connection and verified intake | 11.1 | 1, 4, 17–18 |
| Commands and timers | 11.2 | 4, 8, 10–13, 17–18 |
| Manual, automatic and advanced moderation | 11.3 | 5, 9, 17–18 |
| Alerts, complete widgets, goals and themes | 11.4 | 6, 8, 10–13, 17–18 |
| Discord routing and controls | 11.5 | 5; module controls in 6, 8–12; 17–18 |
| YouTube requests and playback | 11.6 | 7–8, 17–18 |
| Points, rewards, watchtime, polls and raffles | 11.7 | 11–12, 17–18 |
| Analytics, diagnostics and portability | 11.8 | 3, 14–16, 17–18 |
| HTTP/live interfaces and owner API | 12 | 3, 5–6, 8, 15, 17–18 |
| Architecture and security boundaries | 13–14 | 1–16 throughout; 17–19 verification |
| Provider dependencies and honest limitations | 15 | Relevant provider milestones; 18–19 verification |
| Performance, recovery and accessibility | 16 | 3, 6, 13, 16–18 |
| Testing, release evidence and public distribution | 17–19 | 1, focused checks throughout, 16–19 |
| Later scope | 20 | Separate future programmes below |
| Risks, assumptions and provider references | 21–23 | Recheck while implementing; resolve in 17–19 |
| Stable-v1 definition of done | 24 | 19 |

Existing roadmap mapping: F01–F06 → Milestone 1; A01 → 2–3; K01 → 4; D01 → 5 and the later module controls; O01 → 6; M01 → 7; M02 → 8; R01 → 14 and 16–19. Later release rows map to the release-scope table above. Milestone numbers here are separate from the roadmap's `M01`/`M02` media work IDs.

## After stable v1

These are separate future programmes, not hidden prerequisites for completing Milestone 19. Choose and specify them after the stable baseline is accepted.

| Future programme | Required starting scope |
| --- | --- |
| ARM64 distribution | Native dependency/image builds, representative hardware, performance and recovery evidence |
| Optional TTS | Local or owner-supplied provider, consent/permissions, bounded queues and failure controls |
| Clip helpers | Supported provider APIs/workflows, storage/permissions and honest availability limits |
| OBS scene control | Explicit connection/authority model, safe actions and disconnect recovery |
| Declarative community packs | Versioned safe imports, licensed assets, review and compatibility |
| Additional streaming platforms | Provider-specific authorization/events/identity and isolated domain integration |
| Executable extensions and deeper integrations | A defined trust, permission, isolation and upgrade model before executing third-party code |
| Multi-channel or hosted offerings | A separate PRD; preserve the independent single-creator baseline |

## Local implementation evidence — 2026-10-07

Source: initial local build based on `72d14a1`, before the candidate commits recorded below. Application `0.1.0-dev.0`, Node 24.21.0, pnpm 10.26.0, Next.js 16.3.8, React 19.3.0, schema 2 / backup format 1. No production dependency was added. All generated fixtures, account credentials, signing keys, screenshots and databases stay in ignored temporary storage.

Verification results:

- `pnpm check`: publication policy, 16 Markdown documents/matching PRDs, type checking, lint and the complete 62-case unit/provider/SQLite suite passed. A subsequently added publication-deletion regression passed with its five-case focused file; 63 distinct unit/integration cases have passing evidence.
- `pnpm build`: optimized standalone production build passed, with build-time jobs disabled. Target-platform dependency/license notices were generated for the image package.
- `pnpm test:e2e`: all six production browser checks passed, including two-session updates/reconnect/revocation, private-source output clearing on sign-out, signed media approval/playback, all widget families and scoped API denial.
- `pnpm test:standalone`: packaged init, fixture seed, owner recovery, doctor, backup and separate-directory restore passed outside the source checkout without development dependencies.
- Migration metadata check and production dependency audit passed; the audit reported no known vulnerabilities. Desktop/mobile screenshots were inspected locally. Final diff/publication review found no new private installation data, credential literals or debug code; the dedicated full-history security campaign remains Milestone 17 work.
- Current Docker/proxy/image execution and all new live-provider scenarios were not run. No deployment, image publication or repository push was performed for this batch.

| Milestone | Implemented evidence | Focused local evidence | Deferred acceptance / next dependency |
| --- | --- | --- | --- |
| 2 | Auth service, setup/invite/session routes, account UI, host recovery; migration 0001 | Atomic setup/invite, Argon2id/roles, disabling/revocation, browser setup/CSRF and stopped-host recovery | Bulk auth/security campaign; independent install and real HTTPS cookies |
| 3 | Shared dashboard, validated versioned State, audit/outbox, durable SSE and diagnostics | Production browser shared-state/reconnect/revocation, persisted edits and role denials | Bulk accessibility/storage/streaming failure campaign |
| 4 | Shared automation, custom groups/pools/counters/conditions/previews, utilities, timer schedules, normal Kick lifecycle | SQLite aliases/cooldowns/restrictions/stale edits; restart/offline timer behaviour; existing Kick provider contract tests | Real custom commands/timers/current scope/stream-state checks |
| 5 | Signed HTTP Discord adapter, encrypted deferred jobs, routing/mappings and module-aware slash controls | Signature/body tamper, guild/grant isolation, duplicate IDs, safe rate-limit/uncertain classification; signed browser approval | Real command registration, multi-guild sends and ACK timing |
| 6 | Bounded alerts, recognized local assets, safe previews, exact read scopes and revocation | Preview/history isolation, asset checks, source revocation and production widget rendering | Real follow/subscription variants, OBS rendering/audio and reconnect campaign |
| 7 | Official metadata client, rules/limits and atomic validated queue | Request/approval versions, invalid URL/duration, mocked missing-key/quota/embedding failures | Live metadata/quota/provider availability |
| 8 | Kick request → signed Discord decision → fixture player, active lease and bound acknowledgements | Complete production browser fixture workflow, no YouTube requests in fixtures, competing/stale players and restart/error pause | Visible real YouTube/OBS playback and full race/failure campaign |
| 9 | Moderation rules, trusted domains/roles, protected notes, incidents, escalation/time windows, pause and reviewed bulk | Pure rule test, trusted exceptions, temporary windows, acknowledgement/permission denial, accurate pending/outcome state | Live provider effects and broad false-positive review |
| 10 | Durable/event goals, completion notifications, status samples, themes and sources | Goal duplicate suppression, built-in themes/source rendering; unavailable sample checks | Real stream/viewer samples, OBS sizes/theme readability |
| 11 | Append-only ledger, activity accrual/estimates, rewards/fulfilments/refunds | Duplicate accrual, offline stop, overspending and double-refund prevention; restored balances | Full concurrent/load/live reward campaign |
| 12 | Identity participation, persistent deadlines, close/draw/reroll and results | Single effective votes/entries, eligibility/closure, secure audited draw; source rendering | Bulk deadline/race/restart cases and live participation |
| 13 | Expanded utilities/templates/counters and all 18 widget kinds | Fixture seed includes all kinds; browser renders every family, protected player separately; safe pure response previews | Complete widget content/visual/a11y/reconnect campaign |
| 14 | Observed summaries/date/stream filters, sample statistics/gaps, CSV/JSON, retention/privacy/support | Sample mean/gap/stale stream tests; disabled chat history and pending-erasure guard; preserved ledger/support redaction | Long-session aggregate comparison, storage faults, privacy/security campaign |
| 15 | Versioned native config/assets, dry-run conflicts/merge/replace, scoped owner API | Invalid replacement preserves prior state; asset round trip remaps references; scope/revocation and browser API denials | Larger imports/crash/permission campaign; no third-party importer claimed |
| 16 | Complete operator/API/contributor docs, dependency licenses, image metadata, maintenance across modules | Production source build and packaged init/seed/recover/doctor/backup/restore outside checkout; actual v1→v2 migration; subsequent Linux image/proxy/recovery CI passed below | Independent installation/live acceptance remains pending; no registry publication |

Local checks above were recorded against the working tree, not a release artifact. Docker/container execution is unavailable on this Windows host; the subsequent Linux image/proxy/recovery campaign below supplies current candidate evidence. Historical Milestone 1 container evidence alone does not establish that the expanded image passes.

Known boundaries: configuration envelopes are bounded to 12 MiB (use a full backup for larger installations); moderator viewer search displays the latest 100 observed profiles; analytics reconstruct summaries from retained observations and never claim complete provider coverage. A crash while importing files can leave an unreferenced asset for host inspection. These constraints and recovery steps are documented in OPERATIONS.md. At this initial build checkpoint, the bulk failure/concurrency/accessibility campaign was pending; its additional results follow below. Reference benchmarks, physical power loss, assistive-technology review and independent live operators still require Milestone 18 evidence.

## Automated campaign and live preparation — 2026-10-07

This batch expands the candidate based on `72d14a1`. Existing local implementation results above remain historical working-tree evidence; the current candidate must also pass GitHub Actions before Milestone 17 is accepted.

- Added separate-connection SQLite races for receipt deduplication, approval/edit versions, redemptions/refunds, votes/draws and player lease/skip/completion decisions.
- Added subprocess crash/rollback/expired-job recovery, real SQLite page-limit/read-only failures, failed-migration rollback and damaged backup checks.
- Added provider/app/guild/channel/role boundaries, encrypted interaction expiry, deferred response retry without repeating the action, route revocation, fixture network isolation, bounded retry/backlog and export/support privacy checks.
- Added production HTTP/SSE, admin/moderator denial, cursor/session revocation, keyboard/responsive/literal-template and axe WCAG checks. GitHub CI runs Chromium, Firefox and WebKit; local browser evidence uses Chromium because the Browser plugin is unavailable.
- Added a synthetic 25/s sustained and 100/s burst smoke harness with five real browser clients, a full opt-in reference-duration profile and a trusted-HTTPS remote fixture driver. Its reports never automatically claim reference acceptance.
- Reduced repeated SQLite completion writes, bounded batches by count/elapsed time and added independent lease renewal during provider I/O. The workload exposed slow local queue drainage and update cadence; targeted fixes improved them. Exact timings remain host-dependent and do not pass Milestone 18's targets.
- Prepared the complete live runbook, including 24 operational/provider scenarios, seven measurement groups, independent operators, certificate renewal and another-host restoration. No new host, provider grant, deployment or paid test was used.
- Updated root README/AGENTS/contributor guidance and operator/API/architecture/testing/live/release documentation. Private setup information, raw reports and fixture credentials remain outside the publication set.

Final local verification passed: `pnpm check` (19 Markdown documents, matching PRDs, publication policy, types, lint and 95 unit/integration tests), production build, packaged standalone recovery, migration metadata, production dependency audit and all 10 Chromium browser tests. Dashboard/editor axe scans and the private desktop screenshot passed review. Redacted Gitleaks 8.30.1 scans found no leaks in all 142 publication candidates or the three existing commits.

The latest short workload completed 400/400 decisions and fixture replies with zero failures and five browser clients. Local peak RSS was about 256 MiB, peak backlog 136 jobs, post-burst drainage 2.7 seconds and three visible-update probes 225–342 ms. Receipt-to-decision p95 was 1.54 seconds including burst queueing; Windows forced-termination restart readiness was 30.7 seconds including lease expiry. These results establish functionality, not reference-host performance acceptance; latency/restart targets still need the prescribed isolated host and full profile.

### Candidate CI acceptance

**Milestone 17 accepted for its automated scope on 2026-10-07.** [GitHub Actions run 37661724236](https://github.com/DangerMouseUK/kekbot/actions/runs/37661724236) passed all six jobs for candidate head `d844566998283e4b35f01718a159abf584c9ce75`. The pull-request checkout/OCI revision was `b71dc6674c7fa32371a87c5ad477018cb70701d5`, combining that head with the unchanged foundation base. The tested application image ID was `sha256:57d73500893175542138548fa957123e398dfc2a5815fb04353c968612e39673`; this was an ephemeral CI build, not a published registry image.

| Job | Passing evidence |
| --- | --- |
| `verify` | Publication/docs/types/lint, all 95 unit/integration tests including real SQLite/provider/fault/concurrency cases, migration metadata, production audit, production build and packaged CLI recovery |
| `secrets` | Redacted checksum-pinned Gitleaks scans of candidate files and complete fetched history |
| `browser (chromium)` | All 10 production browser tests; five-client workload completed 400/400 decisions and replies without failures |
| `browser (firefox)` | All 10 production browser tests |
| `browser (webkit)` | All 10 production browser tests; dependency installation was delayed but the job completed successfully |
| `container` | Compose and pinned Caddy adaptation, source-labelled non-root/read-only image, hostname/CA-verified fixture TLS, Secure cookies, actual streamed SSE, persistent CA storage, abrupt restart, signed intake, database/assets/module restore from read-only backup and duplicate protection |

Earlier CI attempts exposed missing public-origin configuration and an incorrect HTTP Host header in the container driver. The driver was corrected without changing application permissions or TLS verification, and the full campaign above passed afterwards. The workload also led to the lease/batching/update fixes described above; their regression checks passed. No unresolved automated gate failure remains for this candidate.

Physical host failure, real provider/OBS behaviour, public certificate renewal, reference-host targets and independent operators have no new acceptance result. Deployment is explicitly deferred by the owner; Milestone 18 is prepared, not accepted. Milestone 19's subsequent autonomous preparation is recorded below; final sign-off remains pending.

## Milestones 18–19 autonomous preparation — 2026-10-07

**Milestones 18 and 19 are prepared, not accepted.** The requirement crosswalk covers 60 groups of normative PRD requirements, all 18 widget families and three themes, with implementation/test links and explicit external gates. The audit closed configurable escalation, expiring incident mode, media validation replies/requester labels, restricted admin invitations and queued timer eligibility gaps. It added no production dependency or database migration.

[CI run 37681486063](https://github.com/DangerMouseUK/kekbot/actions/runs/37681486063) passed all six ordinary jobs for head `131421efc7babab0c2b0a7d5dc7a0d2f01a074c2`: publication/document/evidence/type/lint checks, **107 unit/integration cases across 18 files**, migration metadata, production dependency audit, production build/standalone recovery, all **11 browser cases in Chromium, Firefox and WebKit**, the short five-client workload and Linux container/TLS/SSE/recovery checks. The stable checker deliberately fails on all 33 pending live/operator gates and unmatched candidate/version fields. Separate tests prove missing gates, impossible dates, missing evidence anchors and incorrect frozen-source identity fail closed.

[Packaging rehearsal 37680522119](https://github.com/DangerMouseUK/kekbot/actions/runs/37680522119) passed all six jobs for source `6162bc28193aa6cc4cc76d0bee871c37ad31ac8a`. Its **unaccepted** Linux/amd64 image ID is `sha256:e8d7fbab0b5e8c3434fd16b347c323ba748914bed097cd6c9baed3d5696c8cc1`. All six application layers plus image metadata passed private-file/redacted secret checks; only narrowly validated Next-generated metadata fields with empty Server Action maps are excepted. The exported image loaded with its recorded identity and initialized/seeded/diagnosed a fresh volume as non-root with a read-only root and no network access. All downloaded archive/metadata checksums matched. The notices archive contains 35 dependency entries and 181 unique, non-empty notice files, including separate native-library provenance.

The optional GitHub artifact contains only public source/image/notices/checksum bundles and expires after 14 days. Source archive `06f4caa056c117f0d62c90451cb5e3ebdefa3715` also passed a fresh-directory frozen-lockfile installation, production build and redacted source scan outside the checkout. These are candidate distribution rehearsals, not published-artifact or independent-operator acceptance.

Final publication checks cover the complete public file set, Git history and commit metadata, installation addresses/personal paths, empty provider examples, image layers and downloaded source. No provider credential or installation detail was found; public aliases/noreply identities and required upstream attribution are retained. Raw reports, fixture credentials, runtime data and private operator records stay outside the publication set. No test host, live provider action, registry image, tag or GitHub release was created.

### Full-duration synthetic soak

The [full-duration soak job](https://github.com/DangerMouseUK/kekbot/actions/runs/37678168180/job/112986957003) **passed** on 2026-10-07 for source `d269afa39214384669da80a46456ba4836d46bc0`. It submitted 25 signed commands/second for 3,600 seconds and 100/second for 60 seconds, with five Chromium sources, backlog drainage and application restart. All **96,000 requests produced 96,000 decisions and 96,000 fixture replies**, with zero failed operations or driver errors.

| Hosted-CI measurement | Result |
| --- | --- |
| Peak sampled application RSS | 492.15 MiB |
| Peak sampled pending decisions + replies | 16 |
| Post-burst backlog drainage | 516.39 ms |
| HTTP intake p95 | 60.57 ms |
| Receipt-to-decision p95 | 120 ms |
| Receipt-to-fixture-reply p95 | 151 ms |
| Restart readiness | 956.99 ms |
| Five-client visible-update probes | 305.04 / 291.15 / 285.08 ms |

These are shared hosted-runner measurements, not reference-host or real-provider acceptance. Application source and the workload driver are unchanged between that soak and candidate `5305f202cddbdf100c835aa47a9f9ce8a5ab77da`; subsequent changes concern release tooling, license packaging, tests and documentation. The same initial workflow's packaging job failed on framework-generated key classification; the corrected packaging runs below passed. The passing soak job must not be described as an entirely passing initial workflow.

[Final candidate rehearsal 37684049586](https://github.com/DangerMouseUK/kekbot/actions/runs/37684049586) passed all six ordinary jobs, including 107 unit/integration cases and all 11 browser cases in each engine. Its source is `5305f202cddbdf100c835aa47a9f9ce8a5ab77da` and retained Linux/amd64 image ID is `sha256:722d3727e9465d3a8e6e6cff8072fa94e71f89078a5caa578f60dc7ce521ee53`. The downloaded candidate's source/image/notices/metadata checksums all matched. The [PR verification run](https://github.com/DangerMouseUK/kekbot/actions/runs/37684054756) also passed all six ordinary jobs. These artifacts remain unaccepted; all 33 live/operator gates remain pending.

## Next work

The build gate for Milestone 16, automated Milestone 17 campaign and autonomous Milestones 18–19 preparation are complete. When the owner authorises deployment, run Milestone 18 on fresh infrastructure using the live runbook, isolated provider apps, verified host identity and protected runtime storage. Complete reference-host measurements, independent owner/installer trials and another-host restoration; then finish Milestone 19's stable sign-off, authorized publication and published-artifact clean installation. Do not reuse old host details or infer missing live outcomes from automation.
