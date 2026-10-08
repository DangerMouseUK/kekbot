# Testing and candidate verification

KekBot is a development candidate, not an accepted stable release. This guide covers Milestone 17's assembled-product checks. [Live acceptance](LIVE_ACCEPTANCE.md) covers Milestone 18. The [milestones](MILESTONES.md) record results and outstanding gates. Use [quickstart](QUICKSTART.md) for local setup, [installation](INSTALLATION.md) for hosting and [backup/recovery](BACKUP_RECOVERY.md) for maintenance procedures. Return to the [documentation index](README.md).

## Safety and isolation

All automated tests use synthetic accounts, generated RSA/Ed25519 signing keys, private temporary directories and real SQLite. Fixture mode refuses live integration configuration and provider mutations. The fixture player does not contact YouTube. Never supply Kick, Discord or YouTube credentials to CI. Builds disable background jobs and framework telemetry; runtime tests enable jobs explicitly.

Screenshots, traces, databases, backups, workload reports and generated credentials are private debugging material. They stay in ignored output or temporary storage. CI does not upload these as public artifacts. Publish only reviewed, redacted outcomes with source identity. Do not paste raw logs or a source URL containing a token into issues.

## Run the campaign

Use the pinned Node/pnpm versions from the root README. An agent or CI can run these commands; operators do not need to execute them on a production installation.

```sh
pnpm install --frozen-lockfile
pnpm check
pnpm exec drizzle-kit check
pnpm audit --prod
pnpm build
pnpm test:standalone
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:workload
```

`pnpm check` runs publication policy, local documentation links/heading fragments and matching PRDs, release-evidence validity, TypeScript, ESLint, and the complete Vitest suite. Documentation checks validate relative files, heading/explicit-anchor destinations and repository boundaries; fenced examples are ignored. External links require editorial review and are not fetched by CI. The browser suite starts the production standalone build on loopback with fresh isolated data. Run a build after changing application code; otherwise browser tests exercise the previous build.

Linux container checks additionally require Docker Engine/Compose:

```sh
docker build --file deploy/Caddy.Dockerfile --tag kekbot-caddy:2.11.6 .
docker build --build-arg VCS_REF=<CANDIDATE_COMMIT> --tag kekbot:ci .
pnpm test:container
```

Run the Compose validation and Caddy adaptation commands from [.github/workflows/ci.yml](../.github/workflows/ci.yml) as well. Container tests create uniquely named disposable volumes/networks and remove only their own resources. They do not modify an operator installation or request public certificates.

## GitHub Actions

Pushes to `main`, pull requests and manual workflow runs execute the read-only CI workflow on Ubuntu 24.04. Feature-branch pushes use their pull request's campaign; before opening a PR, maintainers can invoke it manually. This avoids duplicate push/PR runs cancelling each other's checks. A new commit cancels only the superseded campaign for that branch.

| Job | Evidence |
| --- | --- |
| `secrets` | Checksum-pinned Gitleaks scans candidate files and complete fetched Git history with redacted output |
| `verify` | Publication/docs/types/lint, real SQLite/provider/fault/concurrency tests, migration metadata, production audit, build and packaged CLI recovery |
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

Use checksum-verified Gitleaks 8.30.1 for a redacted scan of a clean publication export (`gitleaks dir --redact --no-banner <EXPORT>`) and history (`gitleaks git --redact --no-banner --log-opts="--all" .`). Do not scan private runtime storage into public logs or add broad exclusions to silence findings. Review ignored/untracked artifacts and image contexts before pushing. Dependency audits and secret scans complement code/permission review; they do not prove the absence of vulnerabilities.

Record source commit, application/schema/backup versions, exact commands, platform/browser/image and outcomes in [MILESTONES.md](MILESTONES.md). Publish only sanitised summaries. Keep addresses, provider apps, account names, credentials, payloads and private paths in the operator's private setup/evidence storage. Re-run affected checks after code changes. Stable release acceptance also requires Milestones 18–19; CI alone cannot complete them.
