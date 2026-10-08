# KekBot build roadmap

This is a release-scope/dependency reference, not an installation guide. Use [milestones](MILESTONES.md) for the current sequence and dated results, [release readiness](RELEASE_READINESS.md) for unresolved gates, and [the handbook](README.md) to install/use the current candidate. Requirements remain in the two identical PRDs; documentation changes do not retroactively accept planned scenarios.

Updated: 2026-10-08. MIT, Next.js, one self-hosted installation per creator.

This is the executable roadmap for both PRDs. They currently contain the same specification; update them together. Discord and YouTube are optional integrations to enable, but their complete supported workflows are required v0.1 capabilities.

Use the [documentation index](README.md) for installation/user guides and [milestones](MILESTONES.md) for the current build/acceptance status. This page records release-capability dependencies and historical evidence; it is not a setup walkthrough.

<!-- contents:start -->
**On this page**

- [Evidence states](#evidence-states)
- [Foundation — before broader dashboard work](#foundation--before-broader-dashboard-work)
- [v0.1 — connected personal bot](#v01--connected-personal-bot)
- [Later releases](#later-releases)
- [Release evidence and defaults](#release-evidence-and-defaults)
<!-- contents:end -->

## Evidence states

**Planned**: no implementation. **Implemented**: code exists, verification pending. **Fixture-tested**: relevant local checks pass. **Live-tested**: a real provider/operator scenario has recorded evidence. **Blocked**: a required external input or acceptance step is unavailable. A release gate passes only when its complete required evidence exists.

## Foundation — before broader dashboard work

| ID | Work | Depends on | State and evidence |
| --- | --- | --- | --- |
| F01 | Correct KekBot naming, MIT license, Next.js decisions, and v0.1 media boundaries in both PRDs; publish local roadmap and contribution guidance. | None | Implemented: PRDs, LICENSE, ARCHITECTURE.md, README, CONTRIBUTING.md. |
| F02 | Pin toolchain, SQLite/Drizzle migrations, encrypted secrets, separate fixture mode, transactional receipt/outbox pipeline, leased bounded processing. | F01 | Fixture-tested: real SQLite/provider/runtime tests. |
| F03 | Owner-created Kick OAuth/PKCE, identity/scopes, trusted signed callbacks, refresh, subscription reconciliation, and actual chat reply. | F02; owner app and HTTPS ingress | Live-tested 2026-10-02: OAuth/IP callback, scopes, signed chat, confirmed account-mode reply/identity, repeated reconciliation, real refresh, missing-subscription repair, revocation and successful browser reauthorization with a new reply. Supporting fixture tests passed. |
| F04 | Initialization/diagnostics and consistent database + asset backup/restore on new storage, without exporting keys. | F02 | Fixture-tested: snapshot/restore, checksum/key validation, restart and maintenance leases. Live-record same-host backup/read-only restore, asset, encrypted grant and original-signature duplicate protection passed 2026-10-02. Another-host restoration remains R01 scope. |
| F05 | Standalone startup processing with no dashboard, build isolation, authenticated proof controls, signed fixture intake, and non-root container/CI path. | F02–F04 | Fixture-tested: production build, three Playwright checks, packaged CLI outside the checkout, and Linux/non-root container smoke. Real chat/reply with the foundation page closed passed 2026-10-02. [GitHub CI evidence](https://github.com/DangerMouseUK/kekbot/actions/runs/36932520021). |
| F06 | Owner-created app/channel; live chat/follow events, real reply, replay, refresh repair, and public HTTPS proof. Record further independent owners during R01. | F03–F05 | Live-tested 2026-10-02: all required single-owner scenarios passed, including OAuth, signed chat/follow/reply/identity, closed-dashboard processing, cooldown/restart duplicate replay, refresh, subscription repair, separate-storage restoration and revoked-grant recovery. Controlled stream-state delivery was not tested because no test stream was available. |

Live acceptance adds generic public-IP HTTPS deployment, external runtime configuration/data paths, protected shared refresh, and opt-in encrypted one-event capture/replay. The application snapshot is recorded in FOUNDATION.md; operator host/app details and raw captures stay outside the repository. IP-based OAuth callbacks and real chat webhook delivery passed on 2026-10-02.

**Foundation gate: passed 2026-10-02.** F03/F06 live evidence, F04 recovery, and F05 lifecycle/container evidence satisfy the required single-owner foundation proof. The local account/module build now replaces normal foundation operator access with sessions/permissions. Retained proof tools are disabled by default and additionally owner-protected in live mode. Independent-owner trials and another-host restoration remain R01 requirements.

## v0.1 — connected personal bot

Work in this dependency order. Each increment must preserve the preceding workflows.

| ID | Increment | Depends on | Required scenario | State |
| --- | --- | --- | --- | --- |
| A01 | Installation and accounts: deployable setup, owner creation, Argon2id login, revocable sessions, invites/roles, secret controls, diagnostics, backup/restore, audited owner recovery. Replace foundation operator access. | Foundation gate | Fresh operator can securely claim, delegate, revoke, restart, and restore. Unauthorized effects fail. | Fixture-tested: local build; required live acceptance pending in Milestone 18. |
| K01 | Kick commands/timers: CRUD, aliases, role restrictions, cooldowns, declarative variables, previews, utilities, cadence/chat activity/timezone/quiet hours, pause and stream gating. | A01 | Actual response and timer; edits apply immediately; restricted/offline/cooldown/restart cases are safe. | Fixture-tested: local build; required live acceptance pending in Milestone 18. |
| D01 | Discord owner app, allowed guilds/channels, role/identity authorization, signed HTTP interactions, routing, status, timer/manual-alert controls, permitted manual Kick moderation. | A01, K01; controls activate with their domains | Two guilds receive only intended notifications. Authorized operators act; normal members/replays cannot. Initial ACK <3 seconds. | Fixture-tested: local build; required live acceptance pending in Milestone 18. |
| O01 | Local alert assets/configuration and verified provider events; bounded alerts, chat overlay, previews, scoped/revocable source URLs, stored live state and reconnect recovery. | A01, K01 | Real event reaches OBS; reconnect and revocation work; tests do not enter live history. | Fixture-tested: local build; required live acceptance pending in Milestone 18. |
| M01 | YouTube validation/rules and approval/auto-approval modes; transactional request/queue transitions; add/reject/remove/reorder/clear; one active player lease and explicit error/recovery state. | A01, K01; owner YouTube key | Valid/invalid/duplicate/over-limit requests behave correctly; concurrent actions and stale players cannot double-advance. | Fixture-tested: local build; required live acceptance pending in Milestone 18. |
| M02 | Kick `!sr` and queue utilities, Discord/dashboard approval and playback controls, visible OBS player, now-playing/queue widgets, skip/pause/resume/volume. | D01, O01, M01 | Kick request -> Discord approval -> OBS playback -> exactly one local queue advance. | Fixture-tested: local build; required live acceptance pending in Milestone 18. |
| R01 | Retention controls, redacted support diagnostics, complete setup/recovery guides, release notes, independent live trials and CI/container checks. | A01–M02 | Two independent owners run full sessions; restart and restore on another host preserve state. | Fixture-tested: retention, support, guides, packaged maintenance and Linux image/proxy/recovery CI. Independent/live acceptance remains pending. |

Media recovery: preserve the queue/current item, pause after restart, require moderator resume, and restart the item from the beginning. A failed/disconnected/stale player never silently advances. Use official metadata and a compliant visible embedded YouTube player; show quota/autoplay/embedding restrictions.

## Later releases

| Release | Ordered work | Dependencies and acceptance | State |
| --- | --- | --- | --- |
| v0.2 | Automated moderation rules/exceptions, incident history, mod notes, rule simulation/emergency pause; goals/status widgets and theme packs. | v0.1. Real moderation, permitted-message exceptions, permission denials, synchronized OBS and reconnect behavior. | Fixture-tested local capabilities; full acceptance pending. |
| v0.3 | Append-only points ledger/accrual, estimated watchtime, atomic rewards/redemption/refunds, leaderboard, polls/raffles and Discord/widgets; command groups/random pools/counters/conditions. | v0.2. Durable balances, no overspending/double-awards/votes, eligibility and audited draws/refunds. | Fixture-tested local capabilities; full acceptance pending. |
| v1.0 | Stream analytics/charts/CSV/JSON, versioned configuration import/conflict previews, remaining declared widgets, advanced moderation, scoped owner integration API, polished operator/contributor docs, upgrade/recovery quality. | v0.3. Complete PRD coverage, three unaided independent installations, reference-host benchmark, and upgrade/migration-failure recovery evidence. | Local analytics/import/API/widget implementation and automated candidate campaign complete; live/benchmark/release gates pending. |

The complete v1 widget inventory remains PRD section 11.4: event feed, goals/multi-goal board, supporter labels, stream status/uptime, supported viewer counters, media/queue, leaderboard, polls, raffles, countdown, shoutout, and rotating social/activity text. Unknown provider values remain unavailable, never fixture numbers or invented zeroes.

After v1: ARM64, optional TTS, supported clip helpers, OBS scene control, declarative community packs, additional streaming platforms, and deeper owner APIs. Executable extensions require a trust model. Multi-channel/hosted offerings need a separate PRD.

## Release evidence and defaults

The distribution increment now includes a [guided terminal lifecycle](INSTALLER.md): latest stable by default, explicit release/branch/PR/commit/bundle evaluation, source or prebuilt image, checkpointed updates/rollback and safe removal. Build/fixture evidence belongs in Milestone 16; published artifacts and unaided/live recovery still require Milestones 18–19. No deployment or publication is implied by installer preparation.

- Run targeted type/lint/unit/SQLite/browser checks and inspect final changes for accidental edits, secrets, debug code, and unnecessary complexity.
- Provider tests cover signature/body trust, wrong channel/guild, replay, malformed input, scopes/auth, 429, uncertain sends, and safe refresh repair. Never enable provider mutations from fixtures.
- Recovery tests cover leases, competing media decisions, revoked accounts/source tokens, dropped connections, disk pressure/read-only storage, assets, and failed migrations.
- Stable-v1 benchmark: Linux x86-64, 2 vCPU/2 GiB/local SSD; 25 events/s for one hour, 100/s burst for 60 seconds, five browser clients, runtime <750 MiB after warm-up, backlog drains within two minutes; measure PRD latency/restart/restore targets.
- Preserve settings/balances/queue; default chat detail 7 days, operational receipts 30 days, aggregate summaries 90 days. Security audit retention is separate. Operator configuration/exports/privacy tools arrive with release capabilities.
- Follow SECURITY.md for private reporting; never publish exploit details or operator data in issues. Images are versioned to source and include dependency/license information. CI verifies documentation, secrets, source/tests, and containers; registry publication waits for release acceptance.

Historical foundation evidence is in [FOUNDATION.md](FOUNDATION.md); current build/automated evidence and later acceptance are in [MILESTONES.md](MILESTONES.md). The assembled campaign is documented in [TESTING.md](TESTING.md), and the complete [live runbook](LIVE_ACCEPTANCE.md) is prepared with deployment deferred by the owner. A milestone is complete because its scenario and failures work, not because routes or schemas exist.

Stable-v1 coverage is tracked in [RELEASE_READINESS.md](RELEASE_READINESS.md), including all widgets and user journeys. [RELEASING.md](RELEASING.md) covers versioned source/image/notices/checksum packages, opt-in hosted soak and final publication. All 33 live/operator sign-off gates remain pending; release preparation does not mark them passed.
