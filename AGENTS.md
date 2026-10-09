# Repository instructions

## Working style and authorization

Work as a single agent. Do not delegate or spawn subagents without the user's explicit approval for the current task. Inspect relevant implementation, tests and documentation before editing. Prefer focused changes, existing patterns and the pinned pnpm toolchain.

Carry authorized work through implementation, verification and review. Do not commit, push, deploy, provision paid infrastructure or publish a release unless the user has authorized that action. A documentation/packaging change alone never authorizes live deployment or publication. Do not perform unrelated cleanup.

## Current project and entry points

KekBot is an MIT self-hosted Kick/Discord control room: one creator per installation, local accounts, SQLite/local assets, one Next.js application container and optional owner-supplied integrations. The application is a development candidate; inspect [milestones](docs/MILESTONES.md), [release readiness](docs/RELEASE_READINESS.md) and `package.json` for current versions/evidence. Never infer stable acceptance from implementation or CI.

Use these task-specific starting points:

- Public entry/navigation: [README](README.md), [documentation index](docs/README.md).
- Local setup: [quickstart](docs/QUICKSTART.md), [contributing](CONTRIBUTING.md).
- Initial configuration/delegation: [first session](docs/FIRST_SESSION.md), [accounts](docs/ACCOUNTS.md); Windows/macOS containers: [Docker Desktop](docs/DOCKER_DESKTOP.md).
- Hosting/configuration: [installation](docs/INSTALLATION.md), [configuration](docs/CONFIGURATION.md).
- Guided host lifecycle: [installer](docs/INSTALLER.md), [updates](docs/UPDATING.md), [uninstall](docs/UNINSTALLING.md), [implementation](installer/README.md).
- Provider/presentation behavior: [providers](docs/PROVIDERS.md), [user guide](docs/USER_GUIDE.md), [OBS](docs/OBS.md).
- Host/privacy/recovery: [operations](docs/OPERATIONS.md), [backup/recovery](docs/BACKUP_RECOVERY.md).
- Runtime/contracts: [architecture](docs/ARCHITECTURE.md), [API](docs/API.md).
- Exhaustive references: [dashboard fields/examples](docs/CONFIGURATION_FIELDS.md), [control actions](docs/API_ACTIONS.md), [CLI](docs/CLI.md).
- Verification/release: [testing](docs/TESTING.md), [live acceptance](docs/LIVE_ACCEPTANCE.md), [releasing](docs/RELEASING.md).
- Beta evaluation: [tester guide](docs/BETA.md), [first beta notes and verification](docs/releases/v0.1.0-beta.1.md). Keep prerelease publication separate from preparation and stable acceptance; never change latest-stable discovery to select a beta.
- Dependency maintenance: [release-controlled reviews](docs/DEPENDENCY_MAINTENANCE.md); no automated update PRs, merges or installations. Exact pin checks are offline policy checks, not vulnerability sign-off.

Read only the material needed for the requested scope. The [foundation guide](docs/FOUNDATION.md) is historical diagnostic evidence; it is not the normal installation path.

## Architecture and safety

- Keep routes/React separate from domain services, providers, storage and jobs. All control surfaces use the same decisions; `catalog.ts` defines bounded configuration and `State` enforces current permissions/versions.
- Use real SQLite transactions, constraints and optimistic versions for durable state. Commit decisions/outbox atomically. Keep provider calls outside transactions; uncertain delivery requires reconciliation, never blind retry.
- Replacement imports must advance retained document versions. Keep unresolved delivery and redemption queues accessible through bounded pagination independently of recent history. Associate gift recipients as well as event actors for privacy guards and erasure, including retained legacy receipts.
- Enforce current permissions at every server entry and again at deferred execution. Widget reads and player acknowledgements use separate exact credentials. Owner-only account/integration/token powers stay owner-only.
- Default to isolated synthetic fixtures. Development/CI never use live grants, send real provider mutations or load live YouTube. Generate fixture keys/accounts at runtime outside the publication set; never introduce default live passwords.
- Use checked-in SQL migrations and metadata. Do not rewrite released migrations or generate migrations at startup. Preserve backup compatibility or document an explicit upgrade boundary.
- Keep one runtime per local SQLite installation. Builds/tests must not start live jobs. Preserve bounded processing, durable leases, snapshot recovery and explicit media resume after restart.
- Avoid new production dependencies unless justified. Pin exact additions and review licenses/notices.
- Dependency remediations must preserve tooling behavior. Keep local patches scoped and checked in, with exploit/compatibility tests and a removal condition. `pnpm dependencies:audit` retains raw counts and verifies the exact local braces patch; never replace this with a global advisory ignore or call a patched registry finding a clean raw scan.
- Preserve the shell-free image's real apk inventory and separate runtime notices. The disabled optimizer must not ship Sharp/libvips. Caddy's locked Go graph and unstripped exact-image binary proof are separate from application audits; only the verified absent OpenPGP packages may receive the narrow not-affected classification, with raw counts retained. See [runtime image](docs/RUNTIME_IMAGE.md).

## Documentation quality and evidence

The root README serves new public users. Keep it and the documentation index linked to working task-based guides. Explain prerequisites, shell/platform, command location, host versus container paths, required permissions, expected results and recovery/next steps. Match actual screen labels, schemas and CLI behavior. Do not invent an installer, published image, default account or verified provider capability.

Update relevant guides, CONTRIBUTING, CHANGELOG and architecture/API references with changed behavior. Keep roadmap/milestone/requirement records aligned. Update both identical PRDs together only when requirements change; preserve historical evidence identities.

Separate planned, implemented, fixture-tested and live-tested outcomes. Record exact commands, source/image and dates. Hosted CI timings do not establish reference-host benchmarks. Real OBS/provider delivery, public certificate renewal, independent operators and another-host restoration require actual evidence. Never mark an unavailable scenario passed.

Maintain [RELEASE_READINESS.md](docs/RELEASE_READINESS.md), [RELEASING.md](docs/RELEASING.md) and [release-evidence.json](docs/release-evidence.json) for release-affecting work. Read the current evidence file instead of assuming a fixed gate count/status. `pnpm release:check` validates evidence structure; stable mode must fail closed on missing acceptance or source/image mismatch.

Follow [documentation maintenance](docs/DOCUMENTATION.md) for repository-wide guide work. `pnpm docs:check` validates local navigation, identical PRDs, every catalog field row and strict-schema JSON examples. Keep UI starting values distinct from schema defaults, exact-role matching distinct from hierarchy, and fixture walkthroughs distinct from real delivery. A guide improvement does not pass an independent-installer gate.

## Verification

Host lifecycle code uses Python 3.10+ standard library, separate from the TypeScript app. `pnpm check` includes offline installer contracts; Linux CI additionally tests locks/transactions and the audited-bundle install/update-failure/rollback/uninstall rehearsal. Keep final typed review, latest-stable fail-closed behavior, immutable source/image selection, private state and retained-data defaults. Do not adopt arbitrary manual deployments, execute downloaded management code, prune global Docker resources or claim fixture coverage as an independent installer trial.

Run `pnpm check` and targeted checks appropriate to the change. Documentation-only work requires link/publication checks and validation of changed procedures; avoid unnecessary application rewrites or repeated performance tests.

Schema 3 adds job payload/viewer retention and temporary-state expiry. Preserve pending work and encrypted uncertain effects until reconciliation. Active media and paginated history are separate contracts. Keep the adopted dashboard/core files formatted with `pnpm format:check`; avoid unrelated formatting. Installer diagnostics must remain opt-in, private and bounded, with allowlisted metadata only and no subprocess output or arguments.

For runtime/UI/package changes run `pnpm build`, `pnpm test:standalone` and `pnpm test:e2e`. Linux container/proxy/storage-fault checks run in GitHub Actions. Do not ask the user to run checks that the agent or CI can run. Use real SQLite and meaningful failure/concurrency tests where needed; do not write implementation-mirroring tests for trivial changes.

## Publication and privacy

Before publishing, inspect the full candidate and scan publication files/Git history with redacted output. No runtime environment files, private keys, tokens, databases, backups, raw live history, browser screenshots/traces, operator setup records, personal filesystem paths or installation addresses belong in Git or image contexts. The empty `.env.example` is the only environment-file exception. Examples use reserved domains and synthetic identities.

Keep private evidence/runtime configuration outside source. Never echo a secret into a tool result, public issue, PR or log. Only audited public release bundles may be uploaded; raw test/runtime artifacts stay private. Follow [SECURITY.md](SECURITY.md) for reporting.

Report what changed, which checks passed and what remains unverified. A working screen, route or build alone does not establish release acceptance.
