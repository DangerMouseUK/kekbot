# Repository quality follow-up

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
