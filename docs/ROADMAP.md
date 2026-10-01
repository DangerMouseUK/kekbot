# KekBot build roadmap

Updated: 2026-10-01. MIT, Next.js, one self-hosted installation per creator.

This is the executable roadmap for both PRDs. They currently contain the same specification; update them together. Discord and YouTube are optional integrations to enable, but their complete supported workflows are required v0.1 capabilities.

## Evidence states

**Planned**: no implementation. **Implemented**: code exists, verification pending. **Fixture-tested**: relevant local checks pass. **Live-tested**: a real provider/operator scenario has recorded evidence. **Blocked**: a required external input or acceptance step is unavailable. A release gate passes only when its complete required evidence exists.

## Foundation — before broader dashboard work

| ID | Work | Depends on | State and evidence |
| --- | --- | --- | --- |
| F01 | Correct KekBot naming, MIT license, Next.js decisions, and v0.1 media boundaries in both PRDs; publish local roadmap and contribution guidance. | None | Implemented: PRDs, LICENSE, ARCHITECTURE.md, README, CONTRIBUTING.md. |
| F02 | Pin toolchain, SQLite/Drizzle migrations, encrypted secrets, separate fixture mode, transactional receipt/outbox pipeline, leased bounded processing. | F01 | Fixture-tested: real SQLite/provider/runtime tests. |
| F03 | Owner-created Kick OAuth/PKCE, identity/scopes, trusted signed callbacks, refresh, subscription reconciliation, and actual chat reply. | F02; owner app and HTTPS ingress | Implemented and fixture-tested; live acceptance blocked on operator credentials/ingress. |
| F04 | Initialization/diagnostics and consistent database + asset backup/restore on new storage, without exporting keys. | F02 | Fixture-tested: real snapshot/restore, checksum/key validation, restart, maintenance lease checks. |
| F05 | Standalone startup processing with no dashboard, build isolation, authenticated proof controls, signed fixture intake, and non-root container/CI path. | F02–F04 | Fixture-tested: production build, three Playwright checks, and packaged CLI outside the checkout. Linux container smoke pending: Docker unavailable locally. |
| F06 | Owner-created app/channel; live chat/follow events, real reply, replay, refresh repair, and public HTTPS proof. Record further independent owners during R01. | F03–F05 | Blocked: no live credentials or public ingress configured locally. |

**Foundation gate:** F03/F06 live evidence, F04 recovery, and F05 lifecycle/container evidence must pass before expanding into the operational dashboard. Local fixtures cannot satisfy the provider gate. The foundation UI and proof bearer token are temporary operator tools; they do not satisfy v0.1 account requirements.

## v0.1 — connected personal bot

Work in this dependency order. Each increment must preserve the preceding workflows.

| ID | Increment | Depends on | Required scenario | State |
| --- | --- | --- | --- | --- |
| A01 | Installation and accounts: deployable setup, owner creation, Argon2id login, revocable sessions, invites/roles, secret controls, diagnostics, backup/restore, audited owner recovery. Replace foundation operator access. | Foundation gate | Fresh operator can securely claim, delegate, revoke, restart, and restore. Unauthorized effects fail. | Planned |
| K01 | Kick commands/timers: CRUD, aliases, role restrictions, cooldowns, declarative variables, previews, utilities, cadence/chat activity/timezone/quiet hours, pause and stream gating. | A01 | Actual response and timer; edits apply immediately; restricted/offline/cooldown/restart cases are safe. | Planned |
| D01 | Discord owner app, allowed guilds/channels, role/identity authorization, signed HTTP interactions, routing, status, timer/manual-alert controls, permitted manual Kick moderation. | A01, K01; controls activate with their domains | Two guilds receive only intended notifications. Authorized operators act; normal members/replays cannot. Initial ACK <3 seconds. | Planned |
| O01 | Local alert assets/configuration and verified provider events; bounded alerts, chat overlay, previews, scoped/revocable source URLs, stored live state and reconnect recovery. | A01, K01 | Real event reaches OBS; reconnect and revocation work; tests do not enter live history. | Planned |
| M01 | YouTube validation/rules and approval/auto-approval modes; transactional request/queue transitions; add/reject/remove/reorder/clear; one active player lease and explicit error/recovery state. | A01, K01; owner YouTube key | Valid/invalid/duplicate/over-limit requests behave correctly; concurrent actions and stale players cannot double-advance. | Planned |
| M02 | Kick `!sr` and queue utilities, Discord/dashboard approval and playback controls, visible OBS player, now-playing/queue widgets, skip/pause/resume/volume. | D01, O01, M01 | Kick request -> Discord approval -> OBS playback -> exactly one local queue advance. | Planned |
| R01 | Retention controls, redacted support diagnostics, complete setup/recovery guides, release notes, independent live trials and CI/container checks. | A01–M02 | Two independent owners run full sessions; restart and restore on another host preserve state. | Planned |

Media recovery: preserve the queue/current item, pause after restart, require moderator resume, and restart the item from the beginning. A failed/disconnected/stale player never silently advances. Use official metadata and a compliant visible embedded YouTube player; show quota/autoplay/embedding restrictions.

## Later releases

| Release | Ordered work | Dependencies and acceptance | State |
| --- | --- | --- | --- |
| v0.2 | Automated moderation rules/exceptions, incident history, mod notes, rule simulation/emergency pause; goals/status widgets and theme packs. | v0.1. Real moderation, permitted-message exceptions, permission denials, synchronized OBS and reconnect behavior. | Planned |
| v0.3 | Append-only points ledger/accrual, estimated watchtime, atomic rewards/redemption/refunds, leaderboard, polls/raffles and Discord/widgets; command groups/random pools/counters/conditions. | v0.2. Durable balances, no overspending/double-awards/votes, eligibility and audited draws/refunds. | Planned |
| v1.0 | Stream analytics/charts/CSV/JSON, versioned configuration import/conflict previews, remaining declared widgets, advanced moderation, scoped owner integration API, polished operator/contributor docs, upgrade/recovery quality. | v0.3. Complete PRD coverage, three unaided independent installations, reference-host benchmark, and upgrade/migration-failure recovery evidence. | Planned |

The complete v1 widget inventory remains PRD section 11.4: event feed, goals/multi-goal board, supporter labels, stream status/uptime, supported viewer counters, media/queue, leaderboard, polls, raffles, countdown, shoutout, and rotating social/activity text. Unknown provider values remain unavailable, never fixture numbers or invented zeroes.

After v1: ARM64, optional TTS, supported clip helpers, OBS scene control, declarative community packs, additional streaming platforms, and deeper owner APIs. Executable extensions require a trust model. Multi-channel/hosted offerings need a separate PRD.

## Release evidence and defaults

- Run targeted type/lint/unit/SQLite/browser checks and inspect final changes for accidental edits, secrets, debug code, and unnecessary complexity.
- Provider tests cover signature/body trust, wrong channel/guild, replay, malformed input, scopes/auth, 429, uncertain sends, and safe refresh repair. Never enable provider mutations from fixtures.
- Recovery tests cover leases, competing media decisions, revoked accounts/source tokens, dropped connections, disk pressure/read-only storage, assets, and failed migrations.
- Stable-v1 benchmark: Linux x86-64, 2 vCPU/2 GiB/local SSD; 25 events/s for one hour, 100/s burst for 60 seconds, five browser clients, runtime <750 MiB after warm-up, backlog drains within two minutes; measure PRD latency/restart/restore targets.
- Preserve settings/balances/queue; default chat detail 7 days, operational receipts 30 days, aggregate summaries 90 days. Security audit retention is separate. Operator configuration/exports/privacy tools arrive with release capabilities.
- Follow SECURITY.md for private reporting; never publish exploit details or operator data in issues. Images are versioned to source and include dependency/license information. CI verifies documentation, secrets, source/tests, and containers; registry publication waits for release acceptance.

Detailed local results and live evidence fields are in FOUNDATION.md. A milestone is complete because its scenario and failures work, not because routes or schemas exist.
