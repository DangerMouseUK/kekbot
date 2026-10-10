# Repository quality follow-up

**Historical engineering record:** these are earlier fixes and their evidence. For current installation use [Getting started](GETTING_STARTED.md); for remaining stable acceptance use [release readiness](RELEASE_READINESS.md).

This records the eight follow-ups after the guided installer work. It complements [milestones](MILESTONES.md), [testing](TESTING.md) and [release readiness](RELEASE_READINESS.md); it does not replace their live gates.

| Item | Implemented behavior | Acceptance evidence |
| --- | --- | --- |
| Active media and history | Snapshot contains all active requests; terminal history has bounded keyset pages | Large-history/queue and browser regressions |
| Job payload privacy | Resolved payloads expire on chat retention; uncertain payloads are encrypted until reconciliation; viewer associations follow derived work | Real SQLite retention, erasure, restart and uncertain-lease tests |
| Installer Start cleanup | Failed readiness or final state persistence stops managed services independently of saving failure state | Portable failure tests and Linux lifecycle rehearsal |
| Temporary state expiry | Login locks, cooldowns, utility/request guards, sent markers, chat windows and Discord results have bounded lifetimes | SQLite clock/reopen tests; pending interactions keep results |
| Maintainable components | Focused typed dashboard panels and readable core service functions | Scoped formatting, type/lint and browser checks |
| Private installer diagnostics | Opt-in bounded metadata logs with restrictive permissions, no command arguments or output | Rotation, write-failure, permission and publication tests |
| Release-controlled dependencies | Exact pin checks, separate aggregate audits, optional image scan and source/image-bound sign-off | Offline policy and fail-closed release tests; actual candidate review remains pending |
| Long-lived regressions | Schema-2 upgrade, large history, expiry, privacy and lifecycle failures | Local suite plus Linux CI; no new live acceptance claimed |

The migration advances storage to schema **3**. Application version remains a development candidate; backup/configuration/management formats remain version 1. No production dependency was added; Prettier is a pinned development tool. Requirements and both PRDs are unchanged.

## Verification record

Work began 2026-10-08 from main `9a7035c0377644a30bfcfeecbce2c15c2c2a6c6d`. The PR's commits and CI identify the final source. Local verification completed: `pnpm check` (124 tests in 21 files, type/lint/format, docs/publication/release guards and 26 portable installer tests), `pnpm build`, `pnpm test:standalone`, `pnpm test:e2e` (12 Chromium tests), `pnpm test:workload` (400 decisions/replies, zero failures), and `pnpm exec drizzle-kit check`. Targeted dependency/release and schema-2 upgrade tests also passed after final adjustments. The seven Linux-only installer contracts and container/proxy/storage-fault rehearsal run in PR CI; their results belong to that run, not the Windows check.

Checksum-verified Gitleaks 8.30.1 found no leaks in the complete local Git history or the 230-file public candidate export. The publication check and separate installation/personal-identity scan passed. Generated fixture data, logs and browser artifacts stayed private/ignored. No release, deployment or live provider mutation occurred.

The previous droplet is destroyed. Real provider/OBS delivery, independent operators, certificate renewal, reference-host performance and another-host recovery remain pending. The existing live gate count is unchanged; the four dependency reviews are also pending. Fixture tests do not establish those outcomes.

## Dependency remediation follow-up — 2026-10-08

PR #6 also remediates the two development-tool vulnerabilities found during review: a parent-scoped esbuild 0.25.12 override and the checked-in braces 3.0.3 parser-depth patch. The [maintenance record](DEPENDENCY_MAINTENANCE.md#review-record) explains their exposure, compatibility tests and removal conditions. The Docker build copies patches before its frozen install. Ordinary CI now audits the full tooling tree as well as production dependencies and verifies the exact installed remediation; it never globally ignores the advisory.

The original packages reproduced permissive esbuild CORS and recursion exhaustion. The new six security regressions verify cross-origin protection, bounded errors for nested/mixed/malformed patterns, ordinary glob discovery, Next's link rule and Drizzle transforms. Two additional audit tests reject patch tampering and unknown versions/paths/findings. Local `pnpm check` passed **132 tests across 22 files**, with all 26 portable installer contracts passing and seven Linux-only contracts left to CI. Drizzle generation reported no schema change. Raw `pnpm audit` continues to flag the upstream braces version; `pnpm dependencies:audit` preserves that count and identifies its verified local patch. This does not approve a frozen release candidate or an image review.

The production build, packaged CLI recovery and all 12 Chromium tests also passed locally. The production license inventory still matches all 67 documented package/version rows. Publication policy and redacted Gitleaks scans passed for the 234-file candidate and existing full Git history; installation-address and personal-path scans passed. Linux/browser/container results for the final source belong to PR CI. The separately dispatched one-hour fixture soak identifies its earlier source explicitly and cannot establish acceptance for a different commit.
