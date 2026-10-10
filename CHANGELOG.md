# Changelog

## Unreleased

## 0.1.0-beta.4 — Candidate, 2026-10-10

- Prepare beta 4 with aligned application/Docker/Compose versions and matching simplified launcher/management tools. Preserve schema 3, backup/configuration format 1 and exact dependency pins. Publication and fresh source/image sign-off are separate steps; beta 1/2/3 assets remain immutable.
- Extend beta source/image asset verification and stable-rejection regressions through beta 4. Update beginner, maintenance, compatibility and contributor/release guidance while keeping currently published instructions usable.

- Simplify the current repository launcher with a short download-and-run entry, plain-English official-project consent and Recommended setup using published images and standard host settings. Retain every advanced source/format/hosting option and exact-source trust for development/local selections. Stable stays preferred; only a confirmed absence of stable can offer a separately declined-by-default beta. Final APPLY, backup/recovery and retained-data removal guards remain.
- Rewrite the public README/documentation hub, add a beginner server-to-dashboard walkthrough and glossary, and refresh operator, contributor, security and reference guidance. Document managed-host provider lookup/backup commands, older-tool differences and separate current-tool/published-application identities. No dependency, schema, data-format or published-artifact change.
- Add recommended/beta-refusal/transport/pinned-stable/final-review and live-hostname contracts plus Linux terminal consent/advanced checks. Existing lifecycle/image/SQLite/browser verification remains required; no live or independent-installer acceptance is inferred.

- Add opt-in public-only proxy-build diagnostics and a digest-preserving Docker Hub cache on disposable CI runners after an anonymous pull-limit failure. Released artifacts and operator hosts remain unchanged.

## 0.1.0-beta.3 — 2026-10-09

- Publish beta 3 with matching application/Docker/Compose versions and a standalone `install.sh` asset in audited source/image bundles. Export exact committed bytes, include the launcher in release metadata/checksums, and compare it with the source archive during verification. Older format-1 bundles remain supported.
- Update public installation, launcher verification, existing-beta upgrades, contributor and release/evidence guidance. Fresh candidate source/image security and binary-license reviews passed; beta 2 sign-off remains historical. No dependency, SQL, backup/configuration format or stable-acceptance change. Published as an evaluation prerelease; live/stable acceptance remains pending.
- Add a downloadable `install.sh` entry without cloning the repository, with explained install/manage menus, offline host checks, optional confirmed Ubuntu 24.04 prerequisites, pinned branch/tag/PR/commit management downloads, prepare-for-review mode and explicit local/installed tool selection.
- Integrate update/rollback/status/start/stop/uninstall through the same guarded lifecycle engine. Add application release/branch/PR/commit/bundle shortcuts while preserving exact source trust, final review, stopped-host backup and retained-data removal defaults. Retain the reviewed launcher on new installations; successful one-action installation exits after next steps.
- Add launcher argument/transport/trust/terminal tests and real-image Linux installation through the public entry. Update public setup, maintenance, contributor and evidence guides. No new dependency, app feature or schema/format change; original beta 1/2 assets and all pending live/stable acceptance remain unchanged.
- Fix the fixture rehearsal's confirmation sequence for acceptance-verified bundles: send application source trust only when the wizard requests it, then retain final `APPLY`. Add a regression through the real wizard for accepted and candidate metadata; synthetic accepted metadata does not establish a stable release.

## 0.1.0-beta.2 — 2026-10-09

- Fix bundled domain/IP HTTPS installation by staging the locked Caddy Go sources at the Dockerfile's required paths and retaining them with the copied management tool. Add portable regressions for both modes, retained resources and missing inputs before root creation; Linux CI now builds from that staged context and adapts both configurations without requesting certificates.
- Publish the corrected host tool with beta 2 and align application/Docker/Compose versions, installation/update guidance and release records. Fresh exact-source/image security and binary-license reviews passed; all five published assets match the audited files. Preserve beta 1 artifacts and its historical workaround. No production dependency, SQL or data-format change; live/stable acceptance remains pending.

## 0.1.0-beta.1 — 2026-10-09

- Assemble a shell-free application runtime from digest-pinned Node 24.21.0 Alpine stages with only musl/GCC runtime libraries, retaining its real OS package database and runtime notices in the image and notices archive. Disable the unused Next image optimizer and reject Sharp/libvips in standalone output.
- Rebuild standard Caddy 2.11.6 using pinned Go 1.27.2 and x/net 0.60.0. Add exact-image binary vulnerability review; the OpenPGP module match requires proof that the packages are absent, with raw counts preserved. Additional findings and unavailable evidence block publication.
- Add packaging/proof regression tests and maintenance/redistribution guidance. The frozen candidate passes image and manual binary/notices review; the first evaluation prerelease is published with retained source/image/notices/checksums. Actual published source/image download and Linux install/update-failure/rollback/uninstall rehearsals passed; latest-stable discovery still rejects the beta. Live/stable gates are unchanged.

### Earlier beta preparation

- Named the first beta candidate and aligned application, Docker and Compose versions. Added beta installation/update/feedback guidance, release notes and a separate prerelease checklist. Explicit beta selection remains separate from the fail-closed latest-stable default.
- Added beta source/image installer contracts and distribution-version checks. Candidate packaging retains audited source, Linux amd64 image, notices, metadata and checksums; CI performs fixture verification without live credentials or automatic release publication.
- Added opt-in, bounded image advisory metadata to dependency reviews so failed scans can be investigated without publishing raw scanner reports or paths. Findings still block asset upload; no advisory is waived.
- Moved both application stages to the official Node 24.21.0 Debian 13 slim base, applied available Debian security updates, removed unused bundled npm/Corepack/Yarn tools from the runtime image, and selected the proxy's fixed zlib `1.3.2-r1`. Build tooling remains intact. Linux CI checks maintenance without those runtime tools; remaining image findings still require review before publication.
- No application dependency, database migration, backup or configuration format change from the final development candidate. The features and fixes below are included. Full-product live sessions, real OBS/provider delivery, reference-host and independent-operator acceptance remain pending; see the [beta verification record](docs/releases/v0.1.0-beta.1.md#verification-record).
- Recorded the earlier candidate package passes, failed image scans and then-pending binary license review. Those historical blockers are superseded by the separately frozen remediation candidate above; prior images are not reused.

## 0.1.0-dev.0 — Local product build, unreleased

- Fixed seven repository-review findings: stale Kick refreshes cannot overwrite or invalidate a new OAuth grant; replacement imports advance retained configuration versions; generated job IDs can be reconciled; uncertain deliveries and pending rewards have independent bounded pages; gift-recipient erasure covers retained legacy associations; and command-error replies respect the utility cooldown. Added real SQLite/provider/browser regressions and updated operator/API/contributor guidance. No dependency, schema or backup-format change; live acceptance remains pending.
- Remediated development-tool advisories with a parent-scoped esbuild 0.25.12 override and a local braces 3.0.3 AST-depth guard. Added exploit/compatibility regressions and production/full-tooling CI auditing that verifies the exact patch while retaining the upstream advisory count. No production package or lint rule was removed; candidate dependency sign-off remains pending.
- Separated all active media requests from bounded paginated history; extracted typed dashboard panels and adopted scoped formatting for core services.
- Added schema 3 with job payload retention, encrypted uncertain work, derived viewer associations, transient-state expiry and schema-2 upgrade regressions. Backup/configuration formats remain 1.
- Hardened installer Start cleanup and added optional bounded private diagnostics. Added release-controlled dependency review, exact pin checks and optional candidate image auditing. No production dependency was added. Stable/live acceptance and dependency sign-off remain pending.

- Fixed guided lifecycle recovery: prepare Caddy before creating installation state, attempt shutdown even when final/failure record writes fail, and preserve incomplete update/rollback guards and checkpoints during retained uninstall. Added portable failure regressions and clarified operator recovery guidance.

- Added a guided Linux terminal installer, explicit updater with stopped-host backups and separate-root rollback, status/start/stop, and an uninstaller that retains data by default with an additional typed purge. Version selection supports latest stable (fail-closed until stable publication), exact releases, branches, PR heads, full commits and local audited source/image bundles. Added offline contract/failure tests, a real-image Linux CI lifecycle rehearsal and complete managed-host guides; provider/independent-installer acceptance remains pending.

- Expanded the public handbook with first-session, account/capability, Docker Desktop, complete CLI, field/example and action references. Added detailed command/timer/moderation/economy/activity workflows, installation checkpoints, separate-key mounts, monitoring and recovery procedures. CI now checks every configuration field is documented, validates all 12 JSON examples against strict schemas and parses handbook Compose overrides against the base service. Historical evidence and pending live release gates are unchanged.

- Reworked the public README and contributor/agent guidance; added a documentation index and dedicated fixture, installation, configuration, provider, user, OBS, troubleshooting and recovery guides. Documentation checks now validate local heading/evidence anchors as well as files; existing acceptance results remain unchanged.

- Added one-time owner setup, Argon2id local accounts, invitations, role/grant checks, revocable sessions, CSRF protection and stopped-host owner recovery.
- Added the shared dashboard, versioned configuration, authenticated durable SSE, audits, diagnostics and explicit opt-in foundation tools.
- Added custom commands/aliases/response pools/counters/conditions, safe previews, utilities, restart-safe timers and owner Kick lifecycle controls.
- Added signed deferred Discord interactions, configured guild/channel routing and role/user permissions through shared services.
- Added bounded alerts, local image/audio assets, goals, three themes and 18 scoped OBS widget/player kinds.
- Added official YouTube metadata validation, durable requests/approvals/queue, one player lease, bound acknowledgements and restart/error pause semantics.
- Added moderation rules/safe tests/notes/escalation/temporary windows/reviewed bulk actions, points/rewards/refunds, polls and secure audited raffles.
- Added observed-history analytics/CSV/JSON, retention/privacy controls, redacted support data, native configuration/asset portability and scoped owner API tokens.
- Added schema 1→2 migration, account/module recovery checks, packaged CLI flows, production browser workflows, operator/API documentation, image source metadata and production license inventory. No new production dependencies were introduced.
- Expanded assembled-product verification with separate-connection races, abrupt process termination, real SQLite capacity/read-only failures, migration rollback, provider permission/retry boundaries, production HTTP/SSE checks and development-only axe accessibility scans.
- Added Chromium/Firefox/WebKit CI, read-only image/TLS/SSE proxy/restart checks, a fixture-only signed workload harness and complete testing/live acceptance guides. Added root coding-agent instructions and aligned public documentation.
- Bounded job processing by count/time, committed completion/audit/live events together, and renewed the installation lease independently of slow provider requests.
- Audited all stable-v1 requirements and added configurable rule-scoped escalation, reviewed expiring incident presets, final media validation replies, requester labels and owner-granted restricted admin invitations with acceptance-time revocation checks.
- Added a foundation-schema backup restore/upgrade drill, complete upstream notice fallbacks, all-application-layer image scans, versioned candidate source/image/notices/checksum packages and an opt-in one-hour GitHub fixture soak. Stable evidence checks fail closed while any of the 33 live/operator gates remain unaccepted. No release or deployment is published by preparation.
- Timer outbox work now commits with its schedule and rechecks current enablement, stream/quiet-hour state, version and schedule after pause/restart before sending; superseded or stale reminders cannot form a catch-up burst.

Exact automated results and remaining acceptance are tracked in [MILESTONES.md](docs/MILESTONES.md). New live deployment, independent trials and reference benchmarks remain required and deferred; this entry does not announce a stable release.

## 0.0.1 — Foundation work, unreleased

- Corrected the project name to KekBot, selected MIT and Next.js, and moved the complete connected media workflow into v0.1.
- Added the pinned Next.js/Node/pnpm project, SQLite migrations, durable receipt/job pipeline, and standalone background runtime.
- Added owner-supplied Kick OAuth with PKCE, encrypted tokens, refresh, trusted-key webhook verification, channel isolation, subscription reconciliation, and a bounded `!kekbot` proof reply.
- Added protected foundation controls, explicit fixture mode, health checks, initialization/diagnostics, and offline consistent backup/restore with assets.
- Added test fixtures, real SQLite/provider/runtime tests, browser checks, container examples, and CI configuration.
- Prepared public contribution/security guidance, issue and pull-request templates, consistent line endings, ignored private artifacts, pinned CI actions, documentation checks, and a redacted Git-history secret scan.
- Added protected shared Kick refresh, one-event encrypted proof capture, committed-event replay checks, and additional provider/SQLite/browser acceptance coverage.
- Added a pinned Caddy public-IP HTTPS example, external Compose configuration/data paths, and offline proxy configuration checks in CI.
- Made new SQLite backup snapshots portable to read-only recovery mounts; added container restoration, asset and replay checks to fixture-only CI.
- Added publication-policy checks and wider Git/Docker exclusions for private runtime configuration, credentials, captures, diagnostics and setup records.

The single-owner live Kick foundation gate passed on 2026-10-02, supported by local and Linux/container verification. At that snapshot, installation/accounts and the remaining v0.1 modules were still future work. Independent-owner trials and another-host restoration remain release-candidate requirements.
