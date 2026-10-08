# KekBot: Open-Source, Self-Hosted Kick Control Room

Version: 1.1 draft for the fresh repository
Date: 2026-10-01
Status: Product specification; foundation proved historically; product build and automated campaign complete; live acceptance and stable release pending
License: MIT for newly authored KekBot code
Audience: Individual Kick creators, their moderators, and open-source contributors

## 1. Product Direction

KekBot is an open-source Kick bot and stream control application that a creator installs and runs on infrastructure they control. One installation serves one creator's primary Kick channel, its moderator team, and optional Discord communities.

The creator owns the application, configuration, data, provider credentials, and upgrade schedule. KekBot must operate without a KekBot cloud account, central approval service, subscription check, or project-operated relay.

The product combines chat automation, moderation, OBS overlays, alerts, YouTube requests, community engagement, and stream reporting in a browser dashboard. The first usable release must operate a real stream; stable v1 expands that working core into the full scope defined below.

This specification replaces the previous SaaS product direction for the fresh repository. It is independently usable and assumes no code or documentation from the previous application. It does not declare the existing application complete or authorize deleting it.

## 2. Product Promise

"Your Kick bot, your stream control room, your infrastructure."

A creator should be able to deploy KekBot, connect their channel, add browser sources to OBS, and run their stream with help from moderators. They should understand where their data lives, recover it on another machine, inspect why an action failed, and extend their setup without depending on a commercial KekBot service.

Open source and self-hosting are concrete ownership benefits. Superiority in usability, functionality, or reliability must be demonstrated through testing and operator feedback.

## 3. Users and Installation Model

The primary user is a Kick creator willing to operate a small server, home server, or container on an always-on computer. They may need guided instructions for domains, HTTPS, provider applications, and backups.

Moderators use the same installation through restricted dashboard accounts or authorised Discord actions. A contributor builds fixes, translations, themes, or future extensions using public interfaces and a reproducible development environment.

Each installation has one owner, one primary Kick channel, multiple local operator accounts, and zero or more Discord guilds. A guild is a Discord server. Operator accounts belong to the installation; connecting Kick or Discord does not automatically grant dashboard administrator access.

Creators who operate multiple independent channels run separate installations with separate data directories and credentials in v1. SaaS customer accounts, organizations, workspace switching, agency portfolios, and cross-installation administration are outside v1.

The owner controls the visible bot and overlay branding within the options the providers support. A custom Kick bot identity must use a provider-supported authorization flow; the product must not promise arbitrary chat impersonation.

## 4. Competitive Position

The following observations are based on official public descriptions checked on 2026-10-01. They establish a feature baseline, not a hands-on comparison or proof that other products lack a capability.

| Alternative | Publicly documented overlap | Implication for KekBot |
| --- | --- | --- |
| [Kicklet](https://kicklet.app/docs/) | Commands, moderation, points, rewards, giveaways, songs, timers, and alerts. | Basic feature breadth alone is insufficient. |
| [KickBot](https://kickbot.com/) | Hosted commands, overlays, moderation, alerts, TTS, clipping, and tipping. | Cloud delivery and widgets alone are insufficient. |
| [BotRix](https://botrix.live/docs/) | Multi-platform chat automation, moderation, widgets, alerts, and media queues. | Discord and song requests must form useful connected workflows. |
| [Streamer.bot](https://streamer.bot/features) | Kick automation and integrations with broadcasting software. | User-run automation already exists; ownership must be paired with installation quality and a focused browser experience. |

KekBot will aim to win in four measurable areas.

First, independent operation: the complete core runs on the operator's infrastructure, with portable data and no project-operated service needed at runtime. Second, a coherent moderator workflow: actions in Kick, Discord, the dashboard, and OBS reflect the same confirmed state. Third, transparent recovery: connections, queues, failed actions, and upgrade health are visible and recoverable. Fourth, practical customization: matching overlay packs, configuration imports, and documented extension points reduce repetitive setup.

Self-hosting adds administration and may take longer to set up than a hosted competitor. The project must explain this tradeoff plainly. It must not claim faster Kick delivery, more accurate platform data, lower total costs, or better reliability without comparable evidence.

## 5. Goals and Success Criteria

| Goal | Evidence required |
| --- | --- |
| An individual can install it | At least three independent operators complete the documented deployment without maintainer intervention. |
| It works independently | Blocking access to project-operated domains does not interrupt an already installed instance's core functions; documented provider services remain reachable. |
| Data belongs to the creator | Backup, restore, export, and import work on a second machine. |
| A real stream can use it | Commands, timers, moderation, alerts, and widgets operate during a live acceptance session. |
| Moderators can help safely | Authorised actions succeed; unauthorised dashboard, Discord, and overlay mutations fail without effects. |
| Connected workflows are consistent | A request approved in Discord updates the dashboard, queue, and OBS presentation from the same stored transition. |
| Failures are understandable | The operator can trace a failed action to a provider, permission, configuration, playback, or infrastructure cause. |
| Community participation is practical | A contributor can run tests and implement a documented small change without paid accounts, private packages, or maintainers' credentials. |

These are release gates, not claims about current performance or adoption.

## 6. Release Scope and Non-Goals

The first usable release is v0.1. It includes the complete Kick request -> Discord approval -> OBS playback workflow; Discord and YouTube remain optional integrations to enable, but their supported workflows are required release capabilities. Stable v1 consists of all requirements explicitly marked v1 in this document, including the preceding v0.x milestones. Later work is not required to call v1 complete.

All core capabilities are available in the open-source release. There are no premium feature locks, account-based quotas, private dependencies, or centrally enforced entitlements. Local resource limits, permission gates, and provider quotas still apply.

Stable v1 excludes hosted multi-customer operation, billing, private-beta approvals, mandatory SMTP, agency accounts, tipping and payouts, native mobile apps, Spotify playback, full Twitch/YouTube streaming integration, a graphical OBS scene controller, cloud clipping/VOD processing, AI chat agents, and arbitrary untrusted code execution.

Optional TTS, clip helpers, local automation extensions, additional streaming providers, ARM64 support, and deeper integrations belong to the later roadmap. None may become an undeclared prerequisite for core operation.

## 7. Expected User Journeys

### 7.1 Install and connect

The owner prepares a machine with Docker Compose, a persistent local disk directory, and a stable public HTTPS address for callbacks. They create their own Kick developer application, configure callback URLs, start the application, use a one-time setup token to create an owner account, and authorize their Kick channel.

The setup wizard shows what is configured, what is missing, and how to verify each step. A public callback address can use a reverse proxy, meaning a server forwarding HTTPS requests to KekBot, or an operator-controlled tunnel. A tunnel provider is optional and is not a central KekBot dependency.

The owner creates a command, invokes it in actual Kick chat, tests an alert, and adds a generated browser-source URL to OBS. An installation is not labelled connected merely because credentials were entered.

### 7.2 Run a stream

When the channel goes live, enabled timers become eligible and the configured Discord notification is delivered. Moderators see actual connection and queue state in the control room.

A viewer uses a command, an enabled moderation rule evaluates a message, and a supported follower or subscriber event creates an on-screen alert. Each confirmed effect is inspectable; unsuccessful effects show a useful reason.

When the stream ends, stream-only timers stop and a local summary records activity the application actually observed.

### 7.3 Moderate a media request

A viewer submits a YouTube URL or video ID through `!sr`. KekBot validates metadata and local rules, reports accepted/pending/rejected status in chat, and places valid requests in the configured approval workflow.

An authorised moderator approves a specific request from the dashboard or Discord. The approved queue changes durably, the active OBS player follows that state, and the now-playing widget displays the correct requester and title.

Skipping or playback completion advances once. Duplicate approvals, a stale moderator page, multiple preview windows, or repeated provider deliveries cannot start or advance the same item twice.

### 7.4 Recover or move

The owner creates a consistent backup, including the database and uploaded assets, and keeps the encryption key securely with the recovery material. They deploy the documented compatible version on another machine, restore the backup, configure the new address, and revalidate provider callbacks.

Commands, accounts, rewards, goals, media queue, and recorded history remain available. Changing callback addresses may require provider-side configuration or reauthorization; the restore guide must explain this.

## 8. Self-Hosting and Deployment Requirements

The primary distribution is a versioned Docker image and a Docker Compose example. The default application is one container with one durable data volume. It must not require PostgreSQL, Redis, Kubernetes, object storage, a paid hosting vendor, or a separate worker container.

The baseline supported production environment is Linux x86-64 with local persistent disk. Windows and macOS may run the documented container path through Docker Desktop. Native Windows/macOS packages and ARM64 images are not initial release requirements.

Ship examples for an existing HTTPS reverse proxy and a Compose deployment with an optional proxy. Bind the direct application port to loopback by default; intentional remote access goes through documented HTTPS or private-network access. Provider callbacks must still be publicly reachable.

The app image runs as a non-root user. The installation guide explains data ownership, allowed ports, resource usage, supported deployment topology, and why the host must remain on to receive events.

The distribution must contain usable commands for initialization, diagnostics, consistent backup, restore, and safe owner recovery. Those commands and their output must be documented and tested in the fresh repository; command names are chosen during implementation.

Version pinning is the default. Updates are explicit, with release notes, a pre-upgrade backup, schema compatibility checks, and a rehearsed recovery procedure. Unattended upgrades are later scope.

A demo or fixture mode is permitted for contributors, but is explicitly selected, clearly labelled, uses separate data, and cannot send real provider actions. Missing credentials or storage in a real installation produce an actionable setup state or failure, never a silent demo fallback.

## 9. Data Ownership and Persistence

SQLite is the default permanent database, stored on the application's local persistent volume. Use relational records, migrations, foreign keys, uniqueness constraints, short transactions, and bounded lock retries. Write-ahead logging, a database mode that allows reading during writes, is appropriate for this single-host topology. Network filesystem storage and multiple application replicas writing the same database are unsupported. [SQLite documentation](https://www.sqlite.org/wal.html)

Store operator accounts and sessions, instance configuration, provider connections, commands, timers, moderation rules and incidents, alerts, widget configuration, goals, media metadata and queue state, points ledgers, rewards, engagement sessions, metrics, audit records, webhook receipts, and durable jobs in that database.

Uploaded images and sounds live in a managed directory on the same volume; records reference them by local asset ID. External URLs do not substitute for portable storage unless the owner explicitly chooses an external asset.

Provider secrets are encrypted with a per-installation key supplied through a mounted secret file or environment configuration. Store neither that key nor decrypted tokens in the database, exports, URLs, logs, browser bundles, or public repository. Backups containing credential data require the key to restore it; configuration exports exclude secrets by default.

The database is the authoritative source of queue and configuration state. Derived dashboard caches must not become a second conflicting copy of permanent data. Avoid updating an entire channel JSON snapshot for each message.

Durable jobs are database records containing status, due time, retry count, lease expiry, and a stable action identifier. A lease grants one processor temporary ownership of a job and permits recovery if that processor dies. Commit state changes and their pending effects together where possible. An outbox is the durable list of effects still waiting to be delivered.

Use unique delivery IDs to suppress duplicate inbound effects. For outbound APIs without idempotency support, a timeout may leave delivery uncertain; display that ambiguity and avoid blindly repeating irreversible actions. Do not claim exactly-once external delivery.

Provide a consistent database backup mechanism and assets manifest. Copying a live SQLite file without accounting for its write-ahead log is not an acceptable backup procedure. Restore and migration failure must preserve the last usable backup.

Configuration import supports KekBot's versioned JSON format, conflict previews, validation, and secret exclusion. Third-party importers require a legally obtainable user export or documented API; do not require competitor scraping. Configurations from unsupported formats remain visible as unsupported rather than silently dropped.

Default retention should preserve settings, balances, and queue state, retain full chat text for 7 days, operational event receipts for 30 days, and aggregate stream summaries for 90 days. The owner can adjust these values, disable chat-text storage, export history, and remove a viewer's stored history through documented tools. Security audit retention is configured separately.

Disk pressure, a read-only volume, migration errors, and backup failures are visible. Never acknowledge a webhook as durably accepted when its receipt has not committed.

## 10. Authentication and Permissions

Dashboard login is independent of Kick OAuth. Kick authorization grants channel API access; it is not the instance's administrator credential.

Use local owner-created accounts with securely hashed passwords and revocable sessions. A short-lived setup token creates the first owner once; installation cannot be claimed through an unrestricted public first-user route. There are no hardcoded default credentials or required email services.

Invitations are owner/admin-generated, single-use links with expiry and a selected role. The recipient chooses their own credentials. Recovery requires authenticated owner access or documented administrative access to the host; recovery events are audited and revoke affected sessions.

Roles are Owner, Admin, Moderator, and Read-only. Owner manages secrets, backups, recovery, and delegation. Admin manages operational configuration within owner-granted permissions. Moderator operates permitted chat actions, media approval, and engagement controls. Read-only accounts cannot mutate state.

Authorize every HTTP mutation, live subscription, Discord action, and background action at the server boundary. Account disabling revokes access immediately. Prevent login brute force, cross-site request forgery, and unsafe redirects; secure cookie behaviour must match the documented local and HTTPS deployment modes.

Public routes are limited to verified provider callbacks and individually scoped browser sources. Public request pages are deferred until an identity/anti-abuse design is implemented; chat-based `!sr` remains the v1 public request path.

## 11. Functional Requirements and Acceptance

### 11.1 Kick connection and event intake: v0.1

Support owner-supplied developer credentials, an authorization-code flow with PKCE and one-time state, scope checks, encrypted token storage, token refresh, event subscriptions, disconnect/revoke, and observable connection status.

PKCE binds the authorization request to the application performing the code exchange. Fetch webhook verification keys only from the trusted Kick source; a caller cannot supply the trusted key. Verify the original body and signed headers before applying effects. Define and test a timestamp policy compatible with observed provider retries.

Only the configured creator's channel can create instance effects. Persist verified receipts and schedule work before replying successfully. Schema errors, failed signatures, duplicates, rate limits, missing scopes, and disabled subscriptions have explicit outcomes. The provider contracts are documented in [Kick OAuth](https://docs.kick.com/getting-started/generating-tokens-oauth2-flow) and [Kick webhook security](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/events/webhook-security.md).

Acceptance: connect a real channel, receive verified chat and follower events, respond in chat, exercise refresh failure and repair, replay a delivery without repeating its effects, and reject a signed event for another channel. A separate developer's installation must connect using its own provider app.

### 11.2 Commands and timers: v0.1, expanded in v1

Support create/read/edit/delete, enable/disable, aliases, role restrictions, per-user/global cooldowns, stream-only operation, variables, bounded response length, response previews, and explicit audit records for edits.

Initial utilities are `!commands`, `!uptime`, `!rules`, `!discord`, `!socials`, and `!so`. Add `!sr`, `!queue`, `!nowplaying`, `!skip`, `!points`, `!watchtime`, `!top`, and `!goal` with their corresponding modules. Utilities relying on unavailable provider data report that limitation.

Stable v1 adds command groups, random response pools, persistent counters, and safe conditions. Templates are declarative and must not evaluate arbitrary JavaScript, shell commands, or arbitrary user-selected network URLs.

Timers support cadence, minimum intervening chat activity, owner-selected timezone and quiet hours, rotating messages, test mode, pause/resume, and stream-state gating. Missed intervals after downtime do not flood chat.

Acceptance: a real viewer receives the expected response; a restricted command rejects an unauthorised viewer; repeated use hits the configured cooldown; edits take effect without restart; paused/offline timers do not send; scheduler restart does not emit a catch-up burst.

### 11.3 Moderation and live control room: manual actions in v0.1; automated rules in v0.2; expanded in v1

Initial rules cover unwanted links, phrases, repeated messages, caps, and message bursts, with trusted-role exceptions, allowed domains, warnings, delete, timeout, and ban where official permissions support them.

The control room includes stream state, inbound/outbound health, recent confirmed events, viewer search over observed data, incident history, mod notes, and quick authorised actions. Operator acknowledgement is required for bulk or irreversible actions; action reasons and outcomes are recorded.

A test view evaluates sample messages without sending provider actions. Show which rule matched and why. Avoid bot loops, moderate untrusted inputs safely, and make emergency pause controls available.

Stable v1 adds configurable escalation rules, temporary incident-mode presets, and reviewed bulk workflows. Do not infer hidden viewer identities or unsupported platform powers.

Acceptance: a known spam message causes the selected real action and incident entry; a permitted message remains untouched; unprivileged operators cannot act; provider failure displays a failed or uncertain outcome rather than success.

### 11.4 Alerts, widgets, and goals: initial in v0.1/v0.2; complete in v1

Alerts cover available follow, subscription, gifted-subscription, goal, media, and manual events. Support text variables, local image/sound assets, duration, priority, animations, volume, per-event enablement, and a distinct test mode. Event variants depend on verified provider support.

Each widget gets an unguessable scoped read token and an individually revocable URL. Browser-source credentials must remain usable across normal sessions; do not issue a short expiry with no automatic recovery. Public widget state contains only the fields required for that widget.

Launch widgets include an alert source and chat overlay. Stable v1 adds event feed, goals and multi-goal board, latest supporter labels, stream status/uptime, supported viewer counters, now-playing and queue displays, leaderboard, poll, raffle, countdown, shoutout card, and rotating social/activity text.

An unavailable count is shown as unavailable, never guessed or displayed as zero to imply precision. Goals have stored targets, manual adjustments, optional supported event increments, completion behaviour, and reset controls.

Offer coherent theme packs, accessible previews, documented dimensions, transparent OBS backgrounds, visibility controls, and safe theme tokens. The alert/player components use bounded queues so a large event burst cannot freeze the browser. Arbitrary shared HTML/JavaScript widgets are later scope.

Acceptance: a real event updates the intended OBS source; changing a theme does not reset queue state; tests are visibly separate from live history; revoked widget URLs lose access; an overlay cannot read credentials or mutate moderation/media state.

### 11.5 Discord integration: notifications and controls in v0.1

The owner supplies their own Discord application and bot credentials, installs it in allowed guilds, and selects notification/moderation channels. No global KekBot bot account is required.

Send confirmed go-live/offline messages, media approval notices, selected moderation incidents, and goal notifications. Disable unnecessary mentions by default and make routing explicit.

Provide stream/queue status, approve/reject a request by ID, skip, and permitted manual-alert actions through slash commands or buttons. Map configured guild roles or explicitly linked Discord identities to local permissions. Membership in a Discord guild alone grants no control.

Use HTTP interactions by default with the configured application public key, mandatory signature verification, PING handling, acknowledgement within Discord's three-second deadline, and deferred completion for long operations. Persist interaction IDs and enforce authorization even if Discord hides the command in its UI. [Discord interaction security](https://docs.discord.com/developers/interactions/overview), [response deadlines](https://docs.discord.com/developers/interactions/receiving-and-responding)

Acceptance: two configured guilds receive only their selected notifications; an approved moderator can act on a request; an ordinary guild member cannot; retries do not double-approve; delayed operations report eventual completion or failure.

### 11.6 YouTube media requests: v0.1

Use the official YouTube Data API for metadata validation and IFrame Player API for playback. The owner supplies a YouTube API key when enabling this module; missing keys or exhausted quota disable new validation with an actionable explanation while unrelated features continue working. Retrieve declared metadata through the [official video-list endpoint](https://developers.google.com/youtube/v3/docs/videos/list), rather than placeholder titles or durations.

Validate video identity, availability/embeddability, title, duration, uploader restrictions, duplicate policy, user cooldown, queue capacity, and per-user active-request limits. Support approval and auto-approval modes, moderator additions, reject, remove, reorder, clear, skip, pause/resume, and volume.

Queue transitions are persisted and atomic. Maintain one active player lease per installation so a preview, reconnect, or second OBS browser cannot compete to advance playback. A player credential is scoped to its lease and playback acknowledgements; read-only overlays cannot perform those mutations.

Playback completion identifies the current item and lease. Stale callbacks cannot skip a newer item. A crash preserves the queue and current item. On return, playback remains paused until a moderator resumes it; resume restarts the current item from the beginning. A disconnected or errored player does not silently advance. Only confirmed completion or an authorised skip advances the queue.

Show autoplay-blocked, unavailable, embedding-disabled, API-error, disconnected, paused, and lease-conflict states to moderators. Keep player controls and dimensions compliant with the official embed requirements. Do not promise ad-free playback, audio extraction, hidden/background-only YouTube playback, or guaranteed availability. [YouTube player API](https://developers.google.com/youtube/iframe_api_reference), [required functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)

Acceptance: a real `!sr` request passes validated metadata and rules, receives approval from Discord, plays in OBS, updates its title/requester widget, and advances once. Invalid, duplicate, over-limit, expired-player, and playback-error cases produce explicit outcomes.

### 11.7 Loyalty, rewards, polls, and giveaways: v0.3; stable in v1

Maintain an append-only points ledger, current balances, configurable accrual, manual adjustments, reward costs/redemptions, and leaderboard. A ledger records each balance-changing transaction so balances can be audited and restored.

Accrual uses signals the official integration actually observes. Watchtime based on recent chat activity is labelled an estimate; it must not claim to know every silent viewer's attendance. Define the activity window and accrual cadence in settings. Accrual stops when offline and duplicate jobs cannot award twice.

Redemption deducts points and creates the fulfilment record in one transaction. Concurrent requests cannot make a balance negative. Moderators can complete or reject a redemption with an audited refund policy.

Polls support create/open/vote/close, one effective vote per authenticated chat identity, optional vote changes, deadlines, results, and widget output. Raffles support clear eligibility rules, one entry per identity unless a declared rule allows otherwise, close/draw, and audited rerolls. Winners are selected with a suitable secure random source.

Acceptance: accrued points survive restart, concurrent redemptions remain consistent, repeated poll messages do not create extra votes, eligibility is enforced, and completed results appear in the dashboard and OBS.

### 11.8 Analytics, diagnostics, and portability: v1

Produce per-stream summaries of observed chat messages, distinct chatters, commands, supported viewer samples, follows/subscriptions, moderation, alerts, requests, redemptions, and engagement results.

Persist aggregates and provide historical charts and CSV/JSON exports. Distinguish unknown values from zero, declare the observation window, and avoid implying complete coverage while disconnected. Dashboard metrics must be sourced from stored events or aggregates, not fixture numbers.

The diagnostics page shows application version, schema version, callback address, provider scopes/status, last verified event, pending/failed/uncertain jobs, player connectivity, disk/storage health, and recent redacted failures. Owners can export a redacted support bundle without tokens or raw personal history by default.

Acceptance: known fixture/live sequences produce the expected summary, exports match dashboard totals, retention removes selected detail without corrupting balances, and an operator can diagnose a failed connection without maintainer access to the instance.

## 12. Public and Internal Interfaces

Suggested dashboard surfaces are Setup, Control Room, Commands, Timers, Moderation, Alerts, Widgets, Media, Engagement, Analytics, Connections, Accounts, and Maintenance. Setup progress reflects verified capabilities rather than checked boxes alone.

The application exposes health/readiness endpoints, OAuth callbacks, verified Kick event intake, verified Discord interactions, scoped widget state/live updates, authenticated configuration mutations, and the scoped player protocol.

Provide a versioned local HTTP API for trusted owner integrations after core workflows are stable. API tokens are individually named, scoped, revocable, and hidden after creation. Generating a token requires owner permission. Public read APIs, arbitrary outbound webhooks, and third-party extension execution are later scope.

Live updates use authenticated server-sent events or WebSockets with a database snapshot and reconnect recovery. A server-sent event is an update sent from the server over a persistent browser connection. Durable event IDs permit replay from a bounded retained window; older clients reload a current snapshot rather than losing permanent state.

## 13. Technical Direction for the Fresh Repository

Use TypeScript, Node.js 24 LTS, pnpm, Next.js App Router with React, SQLite through better-sqlite3 and Drizzle ORM, checked-in SQL migrations, and Docker Compose. Pin exact application dependencies and record supported versions in architecture decisions.

Use one Node application runtime to host the dashboard/API and execute bounded background jobs. Separate concerns in code: provider clients, persistent repositories, command/moderation logic, scheduler, alert delivery, media state machine, and browser presentation. This is a code organization requirement, not a requirement to create many independently deployed services.

The durable database and explicit effects pipeline are the core. Incoming events become verified receipts, domain transitions, pending jobs, provider effects, and confirmed live projections. Browser pages and Discord actions call the same domain services.

Next.js owns presentation and HTTP routes; separate TypeScript domain services, provider clients, repositories, and the durable job runner own bot behaviour. Use standalone output, a Node startup hook guarded against duplicate initialization, authenticated server-sent events, and uncached operational state. Argon2id password hashing arrives with local accounts. Builds and tests must not start live provider jobs. Record and validate these choices in short architecture decisions; do not inherit the old monorepo.

No Redis is required for the default installation. Avoid a generic multi-platform framework, distributed worker fleet, dual database support, or arbitrary plugin marketplace in v1. Keep provider boundaries explicit enough for later integrations.

## 14. Security and Operator Boundaries

Reject unverified provider requests and never obtain verification trust from caller-supplied headers. Missing verification credentials make the integration unavailable. Configure trusted proxy handling explicitly rather than trusting arbitrary forwarded IP/host headers.

Validate inputs, roles, guild/channel IDs, entity IDs, token scopes, and content sizes at every entry point. Render viewer names and command text as text; sanitize permitted markup. Uploaded media uses validated formats, bounded size, safe filenames, and no executable content.

Rate-limit inbound mutations and outbound provider effects. Limit retry queues and retained raw payload sizes. Separate readable widget state from player-control authority and owner permissions.

A remote administrator can access sensitive local data and operational controls; the UI must explain that grant. Sharing a support bundle, theme, or configuration export must not silently share credentials.

No telemetry is sent to the project by default. Core operation does not require contacting project infrastructure; installation/image download and explicit update checks are separate lifecycle activities. Disclose all third-party services contacted by enabled integrations.

## 15. Platform Dependencies and Honest Limits

Kick developer application access, OAuth, scopes, supported event types, rate limits, and callback availability are external dependencies. Self-hosting does not remove them. The install wizard must link to the relevant provider configuration and prove a real inbound/outbound path before core feature work is considered de-risked.

Kick's documented event delivery requires a public callback URL. A home/LAN installation needs publicly reachable ingress, such as an operator-controlled proxy or tunnel. A local-only setup is useful for fixtures and configuration but cannot independently receive internet callbacks. [Kick event setup](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/events/introduction.md)

Discord permissions, interaction signatures, and acknowledgement deadlines must be respected. YouTube playback remains subject to browser policies, content restrictions, ads, API quotas, and official embed requirements.

Unavailable provider features are documented with the verified date. Do not invent follower counts, viewer presence, playback duration, bot identity, or successful delivery to satisfy a screen. No project claim overrides provider limitations.

## 16. Reliability, Performance, and Accessibility Targets

These are proposed acceptance targets, to be measured rather than advertised as achieved.

The reference production host is a Linux x86-64 machine with 2 vCPUs, 2 GiB RAM, and persistent local SSD storage. Runtime tests exclude image compilation and OBS/browser memory on another machine.

At the stable v1 benchmark, sustain 25 inbound chat events per second for one hour and a 100-events-per-second burst for 60 seconds, with five live browser clients. Application memory should remain below 750 MiB after warm-up, queues must remain bounded, and the backlog must drain within two minutes once the burst ends.

For events received and accepted by KekBot, target p95 local command decision time under 250 ms, visible dashboard/widget changes under one second, and healthy-provider command replies under two seconds. p95 means 95 percent of samples meet the threshold. Provider transmission delays, network outages, and rate-limit waits are measured separately, not hidden.

A healthy instance should recover local job processing within 30 seconds of restart. Recovery of provider subscriptions/tokens is retried with bounded backoff and clearly reported; no promise is made to recover while a provider remains unavailable.

Saved configuration, queue decisions, point transactions, and receipts acknowledged as durable must survive the restart/power-loss acceptance harness. Restoring a supported small-instance backup should complete within 15 minutes, with additional time for any provider reauthorization reported separately.

Dashboard core controls must work with keyboard navigation, readable focus indicators, labelled inputs, and responsive mobile layouts. Widget animations respect reduced-motion preferences in previews; themes maintain readable text and support transparent OBS scenes.

## 17. Testing and Release Evidence

Unit tests exercise decisions such as command matching/cooldowns, rule evaluation, timer eligibility, request validation, queue transitions, points arithmetic, and role permissions.

Database integration tests use the real SQLite driver and schema. Prove migrations, atomic redemption, competing media approvals, unique receipts, leased jobs, token rotation, backup/restore, and bounded retention. Avoid an in-memory map as the only persistence evidence.

Provider tests verify recorded/synthetic fixtures against the current official contracts, including forged signatures, real key sources, duplicate IDs, malformed payloads, expired auth, 429 responses, and uncertain network delivery. Development fixtures cannot reach live production mutation routes.

Browser tests exercise first-owner setup, moderator invitation, restricted actions, editable configuration, OBS-style sources, media state synchronization, and error displays. A page returning HTTP 200 is a smoke check, not proof the feature works.

Live acceptance requires at least two independent owners operating separate installations with different provider applications, directories, and channels. Record actual command responses, timer effects, moderator actions, alerts, Discord routing, media playback, a restart, and a backup/restore. Redact credentials and sensitive history in evidence.

Run restart, duplicate-delivery, dropped-connection, permission-denial, disk-pressure, migration-failure, autoplay-blocked, stale-player, and backlog tests before stable v1. Completion records identify what was live-tested, fixture-tested, or still unsupported.

No milestone is complete because it has routes, schemas, registered module names, or queue logging. It is complete when its documented user scenario works and its failure paths have evidence.

## 18. Delivery Milestones

| Release | User-visible result | Required evidence |
| --- | --- | --- |
| Foundation proof | Independent owner app credentials and public ingress can receive Kick events and send a real reply; the chosen runtime can persist and restore a record. | A documented live integration proof and real database migration/restore test before a broad UI build. |
| v0.1 - Connected personal bot | Install, local accounts and permissions, Kick commands/timers, Discord notifications and controls, manual moderation, alerts/chat overlay, validated YouTube requests, durable queue/player lease, Discord approval, OBS playback and media widgets, diagnostics, and backup/restore. | Fresh installation, real commands/timers/alerts, Kick request -> Discord approval -> OBS playback -> one queue advance, signed/duplicate/stale-player tests, independent owners, restart, and restore on another host. |
| v0.2 - Moderation and stream presentation | Automated moderation rules, incident console, mod notes, emergency pause, shared live state, goals/status widgets, and theme packs. | Real moderation, trusted-role exceptions, permission denials, synchronized OBS updates, and connection recovery. |
| v0.3 - Community engagement | Points ledger, rewards/redemptions, estimated watchtime, leaderboard, polls/raffles, related Discord controls/widgets, and expanded commands. | Persistent balances, atomic concurrent redemption, deduplicated accrual/votes, audited draws/refunds, and complete engagement workflows. |
| v1.0 - Stable creator toolkit | Loyalty/rewards, polls/giveaways, full declared v1 widget set, accurate analytics/exports, import tooling, polished operator documentation, and release quality. | Full acceptance suite, independent operator trials, reference-host benchmark, upgrade/recovery drill, and all v1 requirements accounted for. |

Each release builds on working prior behaviour. Stable v1 does not imply parity with every feature of every commercial tool. Experimental capabilities are clearly labelled and cannot satisfy a stable release gate.

## 19. Open-Source Distribution and Community

The repository must be public and usable from source, with a clear license, readable README, installation guide, contribution guide, security-reporting contact, changelog, and a visible roadmap. Public source and images must contain no maintainer credentials, production data, private package requirements, or paid account checks.

Confirmed license for newly authored KekBot code: MIT. Include the MIT license in the repository and retain applicable third-party licenses and attribution. This choice does not apply automatically to old or third-party code. [MIT overview](https://choosealicense.com/licenses/mit/)

Do not add a contributor license agreement requiring copyright assignment by default. Publish how contributions are reviewed, which deployment/provider versions are supported, and how maintainers decide whether a feature belongs in core.

All included themes and media need distributable licenses and attribution. Contributions should include the behaviour they change and appropriate evidence. Automated CI checks types, relevant tests, image construction, migrations, and a container smoke flow. Release images are tagged to source commits and include dependency/license information.

Optional donations may support development. Core functionality, updates, recovery tools, and documentation remain available to individuals without donating.

## 20. Later Roadmap

After stable v1, consider ARM64 images, local/BYO-provider TTS, clip helpers using supported provider workflows, OBS scene control, community-maintained declarative automation packs, additional streaming platforms, and stronger local API integrations.

Executable extensions require a defined trust and permission model before adoption. A community gallery must not execute arbitrary submitted code with owner credentials.

Multi-channel installations or a hosted offering require a separate PRD. They must not reintroduce central dependencies, feature locks, or multi-customer complexity into the individual self-hosted baseline.

## 21. Risks and Required Mitigations

| Risk | Required response |
| --- | --- |
| Provider application setup blocks users | Test with independent owners early; document current account/app requirements and actionable scope errors. |
| Home-server callback access is confusing | Ship a verified public-HTTPS deployment example and explain domain/tunnel tradeoffs. |
| Host stops during a stream | Show downtime/recovery limits; preserve accepted jobs and state; document always-on operation. |
| SQLite contention or disk exhaustion | Use short transactions, bounded retries, storage diagnostics, retention, and the published workload test. |
| Duplicate or uncertain actions | Unique inbound receipts, atomic transitions, player leases, explicit uncertain outbound status, and careful retry rules. |
| Unsafe shared configuration/extensions | Validate versioned imports, exclude secrets, use safe themes, and defer arbitrary executable plugins. |
| Competitive scope expands endlessly | Keep release gates explicit and prioritize the owned installation and live moderator workflow. |
| Maintainers cannot reproduce issues | Fixtures, clean development setup, redacted diagnostics, and published supported versions. |
| Self-hosting is less convenient than hosted tools | Test installation with new operators and state the administration burden plainly. |

## 22. Assumptions and Decisions to Confirm

The working defaults are one creator per installation, SQLite/local assets, one application container, owner-controlled provider applications, local account login, optional Discord, no central service dependency, no billing, and no default project telemetry.

The owner has selected MIT and Next.js. Before publication, record initial maintainer identity/contact and security reporting instructions. Before broad dashboard development, prove the Kick callback, chat identity, scopes, and public-HTTPS setup with independently created apps, along with SQLite recovery and the standalone job lifecycle.

The proposed resource and latency targets may be revised only with published evidence and an explicit decision. Provider changes may require a scoped requirement revision; unavailable capabilities are not silently replaced with fake values.

## 23. Primary Sources

These references were inspected on 2026-10-01. Competitor statements establish overlap only. Provider and database documentation constrain the implementation and must be rechecked when building.

- [Kicklet documentation](https://kicklet.app/docs/)
- [KickBot product features](https://kickbot.com/)
- [BotRix documentation](https://botrix.live/docs/)
- [Streamer.bot features](https://streamer.bot/features)
- [Kick application setup](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/getting-started/kick-apps-setup.md)
- [Kick OAuth 2.1](https://docs.kick.com/getting-started/generating-tokens-oauth2-flow)
- [Kick chat API](https://docs.kick.com/apis/chat)
- [Kick event setup](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/events/introduction.md)
- [Kick webhook security](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/events/webhook-security.md)
- [Kick event subscriptions](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/events/subscribe-to-events.md)
- [Discord interaction setup and signatures](https://docs.discord.com/developers/interactions/overview)
- [Discord response deadlines](https://docs.discord.com/developers/interactions/receiving-and-responding)
- [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference)
- [YouTube video metadata](https://developers.google.com/youtube/v3/docs/videos/list)
- [YouTube required player functionality](https://developers.google.com/youtube/terms/required-minimum-functionality)
- [SQLite write-ahead logging](https://www.sqlite.org/wal.html)
- [AGPL-3.0 license overview](https://choosealicense.com/licenses/agpl-3.0/)
- [MIT license overview](https://choosealicense.com/licenses/mit/)

## 24. Definition of Done

Stable v1 is complete when an independent creator can install from the public release, configure their own applications, operate the declared stream workflows, delegate restricted moderator actions, back up and restore their data, and update safely using the supplied documentation.

Every v1 feature has behavioural evidence; missing features and provider limitations are explicit. The core runs without project-operated infrastructure, and no existing application or company account is required to use it.

The new repository starts from this specification and an executable implementation plan. It must not inherit unverified completion claims, private data, or the abandoned SaaS model.
