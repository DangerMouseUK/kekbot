# Testing and candidate verification

KekBot is a development candidate, not an accepted stable release. This guide covers Milestone 17's assembled-product checks. [Live acceptance](LIVE_ACCEPTANCE.md) covers Milestone 18. The [milestones](MILESTONES.md) record results and outstanding gates. Use [quickstart](QUICKSTART.md) for local setup, [installation](INSTALLATION.md) for hosting and [backup/recovery](BACKUP_RECOVERY.md) for maintenance procedures. Return to the [documentation index](README.md).

<!-- contents:start -->
**On this page**

- [Safety and isolation](#safety-and-isolation)
- [Downloadable host launcher](#downloadable-host-launcher)
- [Run the campaign](#run-the-campaign)
- [GitHub Actions](#github-actions)
- [Coverage and limits](#coverage-and-limits)
- [Workload and recovery harness](#workload-and-recovery-harness)
- [Security and release evidence](#security-and-release-evidence)
- [Long-lived state and lifecycle regressions](#long-lived-state-and-lifecycle-regressions)
<!-- contents:end -->

## Safety and isolation

Launcher/host setup is separate from application fixtures. Never run the optional Ubuntu package installer in ordinary tests or against a creator host. Its command/consent policy is tested with mocks; a fresh-host package trial requires explicit operator evidence. Downloaded/local manager execution requires separate trust, and application source trust/final review remain intact.

All automated tests use synthetic accounts, generated RSA/Ed25519 signing keys, private temporary directories and real SQLite. Fixture mode refuses live integration configuration and provider mutations. The fixture player does not contact YouTube. Never supply Kick, Discord or YouTube credentials to CI. Builds disable background jobs and framework telemetry; runtime tests enable jobs explicitly.

Screenshots, traces, databases, backups, workload reports and generated credentials are private debugging material. They stay in ignored output or temporary storage. CI does not upload these as public artifacts. Publish only reviewed, redacted outcomes with source identity. Do not paste raw logs or a source URL containing a token into issues.

## Downloadable host launcher

From the repository root, run `bash -n install.sh` and `pnpm test:installer` (also included in `pnpm check`). Python 3.10+ and Bash are required; Windows uses Git for Windows Bash. Missing Bash and POSIX terminals are reported as explicit local skips; Linux CI supplies them.

Offline launcher contracts cover argument conflicts/quoting, branch/tag/PR/commit resolution, bounded regular-file staging, failed transport, mismatched commits, missing/link/submodule inputs, prerequisite guards, and source-prefill confirmation. Linux real-terminal tests exercise exact source trust, cancellation, offline installed-tool dispatch and writable/link rejection. Transport/package commands are replaced with synthetic fixtures; no GitHub/provider mutation, host package install or live grant is needed.

The ordinary Linux container campaign now installs its audited application bundle through the actual root launcher and Python wizard, verifies the launcher is retained, then uses that retained file for status/stop/start. Existing failed-update/separate-root-rollback/source-build/retained-removal/purge checks continue through the shared engine. PTY output is bounded and discarded; no transcript or generated credential is uploaded. Actual public download after merge, optional package installation on a new Ubuntu host and independent operators remain separate evidence; the historical beta 2 image result is not transferred to new tools or images.

The installation response sequence includes application `TRUST <SHA>` only for unaccepted bundles; final `APPLY` remains required for both. A portable regression runs both candidate and synthetic acceptance-verified metadata through the real Python prompts with host effects isolated, checking installation is reached and no response is left over. This covers future accepted-release rehearsal compatibility without claiming that an accepted stable release exists.

## Run the campaign

`pnpm check` includes `pnpm test:installer`, which requires Python 3.10+ (`python` on Windows; `python3` on Linux/macOS), with no pip packages. Portable contracts cover menus, cancellation, source refs, release checksums, image identity and unsafe input/archive boundaries. Linux also exercises exclusive locks, backup/migration failures, checkpoint ordering, new-root rollback and uninstall boundaries.

Portable recovery regressions also exercise proxy build/inspection failure before root creation and successful retry, failed final/failure record writes with shutdown during install/update/rollback, and retained removal preserving recovery guards/checkpoints. These tests use real private record files and simulated Docker; Linux retains real management locks. Explicit fixture purge remains possible after an incomplete operation.

Domain/IP proxy regressions inspect the actual installer Docker build context against the Dockerfile's `COPY` inputs, verify all resources in the retained tool, and reject missing inputs before creating installation state. Launcher contracts additionally cover the downloadable entry point and terminal trust boundaries. The reserved example IP is classified as public only inside the isolated IP test; production address validation remains unchanged.

Use the pinned Node/pnpm versions from the root README. An agent or CI can run these commands; operators do not need to execute them on a production installation.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec drizzle-kit check
pnpm dependencies:audit
pnpm build
pnpm test:standalone
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:workload
```

`pnpm check` runs publication policy, local documentation links/heading fragments and matching PRDs, release-evidence validity, TypeScript, ESLint, and the complete Vitest suite. Documentation checks validate relative files, heading/explicit-anchor destinations and repository boundaries; fenced examples are ignored. External links require editorial review and are not fetched by CI. The browser suite starts the production standalone build on loopback with fresh isolated data. Run a build after changing application code; otherwise browser tests exercise the previous build.

### Select checks by change

| Change | Run | Additional review |
| --- | --- | --- |
| Prose/navigation | `pnpm check`, `git diff --check` | Actual labels, commands, external official references and publication privacy |
| Configuration docs/examples | Same; `docs:check` validates all fields and 12 strict-schema examples | Defaults versus editor starting values, units and domain semantics |
| Setup/recovery procedure | Same plus fresh external-fixture rehearsal | File permissions, host/container paths, stopped maintenance and original key |
| Runtime/UI/packaging | Same plus build, standalone and E2E | Linux container/proxy/storage CI; affected failure/permission boundaries |
| Provider integration | Relevant signed/provider tests plus ordinary runtime checks | Explicit authorized live campaign separately; no live CI credentials |

For a focused Vitest run use `pnpm exec vitest run tests/docs.test.ts` (replace the path with the affected suite). For a focused browser case use `pnpm test:e2e --grep "test name"` after building. Full ordinary CI still runs on the PR. Documentation-only changes do not need repeated workload/soak runs unless they alter the measurement procedure.

`docs:check` also checks complete field rows against `catalog.ts` and validates every file in [examples](examples/README.md) with its strict schema. The pure [documentation contract checker](../scripts/documentation-contracts.mjs) imports no runtime or provider client. Unit tests prove it fails on missing/stale fields and invalid/unknown examples without printing their values. Linux CI additionally runs `node scripts/check-doc-compose.mjs`: Docker Compose parses the handbook's Desktop/key-mount YAML against the real base service, checking amd64/named-volume/read-only-key properties without starting services or printing expanded values. See [documentation maintenance](DOCUMENTATION.md) for checks that automation cannot establish.

Linux container checks additionally require Docker Engine/Compose:

```sh
python3 -B installer/smoke.py --proxy-context
docker build --build-arg VCS_REF=<CANDIDATE_COMMIT> --tag kekbot:ci .
pnpm test:container
```

The proxy command builds from copied, retained installer resources using the real staging helper, then adapts domain/IP configurations. Building directly from the whole checkout alone cannot detect missing staged files. Run the Compose validation from [.github/workflows/ci.yml](../.github/workflows/ci.yml) as well. Container tests create uniquely named disposable volumes/networks and remove only their own resources. They do not modify an operator installation or request public certificates.

## GitHub Actions

For a withheld proxy-context build failure, a maintainer can run `gh workflow run ci.yml --ref REVIEWED_BRANCH --field proxy_diagnostics=true`. This opt-in step stages only the six checked-in public Caddy files and prints their Docker build output before the normal retained-context and domain/IP checks. It supplies no build secrets, runtime environment, installed data or provider credentials; it does not request certificates. The host installer's private diagnostics and lifecycle transcripts remain bounded and withheld. Do not extend this public build context to installation files or arbitrary operator input.

After candidate archive audit/checksums, the container job runs `sudo python3 -B installer/smoke.py` against a uniquely named fixture installation. It loads the actual audited image bundle, initializes/seeds, sends a signed fixture event through the container's internal port, preserves a local asset/key, deliberately fails an update with a broken maintenance image, removes containers while verifying that recovery guards/checkpoints remain, restores into a new root with the old image, builds the verified source-bundle format, succeeds with a new image, removes/resumes containers while retaining data, then explicitly purges only that fixture root. No public TLS, live integrations or independent installer are implied; raw files/credentials remain on the ephemeral runner.

Pushes to `main`, pull requests and manual workflow runs execute the read-only CI workflow on Ubuntu 24.04. Feature-branch pushes use their pull request's campaign; before opening a PR, maintainers can invoke it manually. This avoids duplicate push/PR runs cancelling each other's checks. A new commit cancels only the superseded campaign for that branch.

| Job | Evidence |
| --- | --- |
| `secrets` | Checksum-pinned Gitleaks scans candidate files and complete fetched Git history with redacted output |
| `verify` | Publication/docs/types/lint, real SQLite/provider/fault/concurrency tests, migration metadata, production/full-tooling audit with exact local-patch verification, build and packaged CLI recovery |
| `browser` matrix | Production browser flows, accessibility and responsive checks in Chromium, Firefox and WebKit; Chromium also runs the short workload profile |
| `container` | Compose/Caddy examples, source-labelled non-root/read-only image, TLS/SSE/restart/restore, every application-layer secret scan, versioned source/image/notices packages and checksums |
| Opt-in `soak` | One-hour 25/s sustained + 60-second 100/s burst with five Chromium sources, backlog drainage, restart and allowlisted public aggregate summary |

Actions and toolchain versions are pinned. Browser dependency installation uses Ubuntu's official HTTPS archive mirror with an eight-minute step limit; package signature verification remains enabled. This avoids the hosted runner's observed Azure HTTP mirror stalls. No image is published, server deployed, provider grant used or repository content modified by these jobs. A successful run identifies the candidate commit; a failure must be investigated and rerun after its fix. Do not change tests to conceal a required failure. Fixture browser coverage in Firefox/WebKit is useful compatibility evidence, not evidence that real YouTube playback works in those browsers or OBS.

GitHub CLI users can inspect a run with `gh run view <RUN_ID>` and failed job logs with `gh run view <RUN_ID> --log-failed`. Keep trace/debug exports private. The CI summary and milestone record must distinguish passing, failing and unrun scenarios.

Dispatch `gh workflow run ci.yml --ref <REVIEW_BRANCH> --field soak=true --field package=true` for the full hosted fixture soak and optional audited candidate archive upload; verify its captured `headSha` matches the intended source. The new `package` option uploads only versioned public source/image/notices/checksum bundles after audits and a fresh-volume installation from the exported image without network access; no databases, logs, credentials, raw workload reports or browser artifacts. All other runs keep artifacts on ephemeral runners. These unaccepted bundles neither publish a release nor establish a reference benchmark. See [RELEASING.md](RELEASING.md) for identities, privacy boundaries and stable sign-off.

## Coverage and limits

| Area | Automated evidence | Live or separate evidence still required |
| --- | --- | --- |
| Accounts | Setup/invite uniqueness, Argon2id, full role matrix, CSRF/origin, session/password revocation, recovery, server permission denials | Real HTTPS cookies and unaided operator setup |
| State | Optimistic edits, durable receipts/outbox, multiple SQLite connections, SSE reconnect/cursor recovery and revocation | Real proxy/network interruptions and host power loss |
| Kick | Original-body signature, trusted key, wrong creator/channel, malformed bodies, scopes, OAuth binding, refresh serialization, reconciliation and delivery outcomes | Current real grant, chat identity, stream/follow/subscription delivery and repair |
| Discord | Ed25519/app/guild/channel trust, deferred deduplication, ordinary-member denial, routing revocation, expired interaction and rate-limit result reuse | Real three-second acknowledgement, allowed guilds and bot permissions |
| Media | Metadata errors, approval contention, one active lease, stale acknowledgements, skip/completion race, preserved paused item and signed end-to-end fixture | Official visible embedding, autoplay restrictions, real OBS playback/audio |
| Economy/activities | Concurrent redemptions/refunds, idempotent accrual/votes, eligibility/deadlines and audited distinct draws | Full creator session and actual participant behaviour |
| Storage | Actual SQLite page-capacity failure, query-only writes, subprocess termination/rollback, expired leases, failed migration rollback, backup checksums/assets/module state | Device failure, real power loss and restore onto another host |
| Presentation | All widget families, bounded alert queue, literal text, scoped tokens, keyboard/responsive checks and axe WCAG scans | OBS sizing, audio, complete visual review, assistive-technology review |
| Privacy | Export/support redaction, retention, erasure guards, API scopes and publication/history scanning | Operator review of real retained data and final release image |
| Independence | Isolated fixture storage, no live provider mutation, credential-free build/tests, local source/package operation | Installation with project-operated domains blocked; independent owners |

The SQLite page-limit test produces a genuine SQLite full error without filling the host disk. Query-only mode exercises write failure without changing host permissions. Subprocess termination is a crash test, not a claim of physical power-loss durability. The proxy test trusts a generated local test CA and verifies hostname/chain; it does not prove public trust or Let's Encrypt renewal.

## Workload and recovery harness

`pnpm test:workload` starts a fresh local production fixture instance, opens five real Chromium widget clients, delivers signed chat at 25 requests/second for eight seconds and 100/second for two seconds, then waits for the queue to drain and checks persisted results after restart. Every request is a custom command with a reply and counter increment. This intentionally exercises more work than passive chat. Output is `output/workload/report.json`, ignored by Git and Docker.

`pnpm benchmark` selects the opt-in one-hour sustained / 60-second burst / 120-second drain profile. It is not part of ordinary CI; a manual CI dispatch with `soak=true` runs it on an isolated hosted runner. Only the allowlisted aggregate summary is public, and it cannot establish reference-host acceptance. Do not run synthetic load against real provider chat or live mode. The driver checks the target's fixture mode before authenticating or submitting traffic.

For reference-host work, run the driver and its five browsers on a separate machine against a dedicated fixture installation using the candidate image. Enable proof tools only for that isolated campaign, configure synthetic broadcaster ID `123`, run `init`/`fixture-seed`, and transfer the generated fixture signing key, proof token and account file over a protected channel. Never use live signing material or provider credentials. Restrict test ingress to the driver and destroy/revoke fixture credentials afterwards.

The driver accepts a protected, external `workload-driver.json` file:

```json
{
  "origin": "https://kekbot.example",
  "privateKeyFile": "/private/fixture-private.pem",
  "proofTokenFile": "/private/proof.token",
  "accountFile": "/private/fixture-account.json"
}
```

```sh
pnpm benchmark --remote-config /private/workload-driver.json
```

Remote runs require trusted HTTPS and refuse live mode. They create synthetic command/widget configurations and an exact-scope source token; use disposable fixture data, never an existing creator installation. The read-only `/api/foundation/workload` aggregate endpoint requires proof enablement and the proof token, refuses live mode, and exposes no event bodies, credentials or addresses. Disable proof tooling when the campaign ends. Remote restart and backup/restore timing are measured separately on the server using the live checklist.

The report contains request/outcome counts, intake p95, receipt-to-decision/reply p95, maximum sampled application RSS/backlog, visible update probes and local restart readiness. Decision timing includes queue waiting; fixture replies omit provider/network delays. The driver checkout SHA is recorded; independently record the actual remote image digest/source label. Timings depend on host, filesystem, workload and driver. No run automatically sets `referenceAcceptance` true: verify host shape, image identity, separate driver resources, all measurement definitions and the [PRD targets](LIVE_ACCEPTANCE.md) first. A smoke pass establishes functional delivery, not a performance pass.

## Security and release evidence

Beta 3 packaging contracts compare the standalone launcher with committed Git bytes and the archived file, require LF bytes independent of checkout conversion, check the complete source-only asset/checksum set, and reject a missing/non-regular launcher before packaging. Linux archive verification repeats the launcher comparison before loading the exported image; it never executes the download. The [beta 3 verification record](releases/v0.1.0-beta.3.md#verification-record) distinguishes fresh candidate checks from historical beta 1/2 results.

The [first beta verification record](releases/v0.1.0-beta.1.md#verification-record) binds automated results to its frozen candidate. Its manual campaign selects `soak=true`, `package=true` and `dependencies=true`; ordinary PR checks still run independently. Explicit beta installer tests preserve stable rejection and inspect both source/image bundle paths. Version checks keep package, Docker and Compose defaults aligned. Image-review regressions verify opt-in finding metadata omits raw/private fields, bounds output and keeps all severity counts/failure outcomes. Actual published source/image discovery, checksums and latest-stable rejection now have dated evidence in the beta notes. The separate published-asset Linux lifecycle rehearsal passed and is recorded there against its exact helper and release identities. Real provider/OBS and unaided operator sessions remain pending.

Use checksum-verified Gitleaks 8.30.1 for a redacted scan of a clean publication export (`gitleaks dir --redact --no-banner <EXPORT>`) and history (`gitleaks git --redact --no-banner --log-opts="--all" .`). Do not scan private runtime storage into public logs or add broad exclusions to silence findings. Review ignored/untracked artifacts and image contexts before pushing. Dependency audits and secret scans complement code/permission review; they do not prove the absence of vulnerabilities.

Record source commit, application/schema/backup versions, exact commands, platform/browser/image and outcomes in [MILESTONES.md](MILESTONES.md). Publish only sanitised summaries. Keep addresses, provider apps, account names, credentials, payloads and private paths in the operator's private setup/evidence storage. Re-run affected checks after code changes. Stable release acceptance also requires Milestones 18–19; CI alone cannot complete them.

## Long-lived state and lifecycle regressions

[Review regressions](../tests/review-regressions.test.ts) cover replacement-version monotonicity and trigger swaps, generated long job-ID reconciliation, 125-item waiting queues behind 150 newer terminal records, cursor validation, one-time refunds, gift-recipient erasure/legacy associations and throttled invalid/forbidden utility replies. [Kick tests](../tests/kick.test.ts) hold old refresh requests open across reauthorization and verify both success/failure and shared-flight ownership. Production browser tests navigate all waiting pages, reconcile/fulfill older items, and check read-only/API scope boundaries. These are synthetic provider/real SQLite scenarios, not live-delivery acceptance.

[Long-lived tests](../tests/long-lived.test.ts) use real SQLite for a 1,200-item history, a 500-item active queue, cursor boundaries, payload expiry/erasure, uncertain-send encryption, temporary-state expiry after reopen and schema-2 upgrades. Browser tests cover separate history navigation and existing media/player/permission workflows. Installer tests cover Start readiness/final-save failures, bounded diagnostics, privacy and logging failures; Linux additionally checks actual stopped services in the audited-bundle rehearsal.

`pnpm check` now includes `pnpm format:check` for the adopted panels/core files and `pnpm dependencies:check` for exact pins/review-record structure. These offline checks do not audit vulnerabilities. Ordinary CI runs `pnpm dependencies:audit` for production/full-tooling advisories and verifies the exact local braces remediation without hiding its raw registry count. [Dependency security regressions](../tests/dependency-security.test.ts) exercise deep/mixed nesting, ordinary glob/root discovery, the real Next link rule, esbuild cross-origin headers and Drizzle's TypeScript transforms. Audit-policy tests reject tampered/missing patches, new paths and new findings. The optional `dependencies=true` workflow profile adds the same tested image with checksum-verified Trivy 0.75.0. See [dependency maintenance](DEPENDENCY_MAINTENANCE.md) for commands, failure handling and source/image-bound sign-off. Raw private artifacts are not uploaded. None of these checks passes a live release gate.
