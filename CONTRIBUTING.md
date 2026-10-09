# Contributing to KekBot

Thanks for helping improve KekBot. Focused fixes, clearer guides, reproducible bug reports and meaningful tests are welcome. Evaluation betas have separate frozen source/image reviews; the [beta guide](docs/BETA.md) explains evaluation and safe feedback. [Milestones](docs/MILESTONES.md) distinguish automated verification from pending live acceptance. A beta version does not authorize release publication or pass stable gates.

For image changes, read [runtime packaging](docs/RUNTIME_IMAGE.md). The application runtime has no shell/package manager and retains its real OS inventory. Caddy uses separately locked Go modules; Go is needed only by the proxy builder/security-review tooling, not ordinary TypeScript development. Preserve symbols and the exact binary review rather than excluding module findings globally.

<!-- contents:start -->
**On this page**

- [Start with an isolated development setup](#start-with-an-isolated-development-setup)
- [Find the relevant code](#find-the-relevant-code)
- [Implementation expectations](#implementation-expectations)
- [Verification](#verification)
- [Documentation contributions](#documentation-contributions)
- [Submit a pull request](#submit-a-pull-request)
- [Issues, security and releases](#issues-security-and-releases)
- [Review checklist by change type](#review-checklist-by-change-type)
<!-- contents:end -->

## Start with an isolated development setup

Follow the [fixture quickstart](docs/QUICKSTART.md). Use Node.js **24.21.0**, pnpm **10.26.0** and the frozen lockfile. No provider account, private dependency or maintainer credential is needed. Never use live grants for development/CI.

Install Python 3.10+ as well for `pnpm check`'s offline host-lifecycle tests (`python` on Windows, `python3` elsewhere). No pip dependencies are needed. Real root/daemon installation flows run only against isolated Linux CI fixtures, not your creator data.

```sh
git clone https://github.com/DangerMouseUK/kekbot.git
cd kekbot
pnpm install --frozen-lockfile
git switch -c fix/describe-the-change
```

External contributors can fork the repository and clone their fork instead. Copy/edit `.env.local`, select fixtures and initialize/seed as described in the quickstart. Generated credentials are private files; there are no fixed demonstration passwords.

## Find the relevant code

| Path | Responsibility |
| --- | --- |
| `src/app/` | Next.js pages, route adapters, dashboard and widgets |
| `src/server/domain/` | Shared configuration/state and module decisions |
| `src/server/providers/` | Provider clients, signature/identity boundaries and Discord interactions |
| `src/server/storage/` | SQLite, repositories and schema handling |
| `src/server/runtime.ts`, `src/server/bootstrap.ts` | Long-running runtime and durable work |
| `src/cli.ts`, `src/server/maintenance.ts` | Host maintenance/recovery |
| `drizzle/` | Checked-in SQL migrations and metadata |
| `tests/`, `tests/e2e/` | Vitest/real SQLite and production browser workflows |
| `scripts/`, `.github/workflows/` | Verification, standalone/container checks and candidate packaging |
| `installer/` | Explained host wizard, source/bundle validation, lifecycle state/locks and offline/Linux tests |
| `docs/` | Operator guides, references, requirements and evidence |

Read [architecture](docs/ARCHITECTURE.md) before changing boundaries and [API](docs/API.md) before changing contracts. Coding agents also follow [AGENTS.md](AGENTS.md).

## Implementation expectations

Keep routes/React separate from shared domain decisions. Dashboard, Kick, Discord and API controls must use the same services. Keep network calls outside SQLite transactions, persist decisions/outbox atomically, and use constraints/versions for concurrency. Never blindly resend an uncertain provider mutation. Recheck current authority when deferred effects execute.

Include stale/in-flight cases when changing provider grants or imported configuration. A new OAuth grant must supersede an old refresh without inheriting its error state; replacement imports must advance retained versions. Keep actionable queues separate from recent history and test more than one page, tied timestamps and permissions. Privacy coverage must include anonymous gifts and their recipients, including retained older records. The [review regressions](tests/review-regressions.test.ts) and [Kick tests](tests/kick.test.ts) provide examples.

Use bounded declarative configuration rather than executable templates. Avoid new production dependencies unless necessary; pin exact versions, review license/use and update [dependency notices](docs/DEPENDENCIES.md). Asset/theme contributions require distributable rights and attribution.

Generate schema changes with `pnpm db:generate`, review SQL/metadata and commit both. Do not edit released migrations, generate migrations at startup or assume backup compatibility without evidence. Document any explicit upgrade boundary.

Dependency upgrades follow [release-controlled maintenance](docs/DEPENDENCY_MAINTENANCE.md): deliberate reviewed PRs, exact pins, full tooling/runtime/image review and sign-off bound to the frozen source/image. Do not introduce automatic dependency PRs or installs. `pnpm dependencies:check` is offline; `pnpm dependencies:audit` checks production/tooling online, retaining raw counts and verifying the exact local remediation. `pnpm dependencies:review` also needs a trusted image scanner for a complete report. Unresolved findings and unavailable checks remain blockers. Local patches require exploit/compatibility tests and explicit removal conditions; do not add global advisory ignores.

`pnpm format:check` checks the adopted dashboard panels and core services listed in `package.json`. Use the pinned Prettier to format changed files in that scope. This is incremental adoption; do not reformat unrelated files as part of a feature fix.

## Verification

Run the checks appropriate to the change:

```sh
pnpm check
```

This includes publication/docs/release-evidence validity, types, lint, all unit/SQLite tests and offline Python installer contracts. For runtime/UI/package changes also run:

```sh
pnpm build
pnpm test:standalone
pnpm exec playwright install chromium
pnpm test:e2e
```

Linux container/proxy/storage checks run in GitHub Actions; local Docker is optional for contribution review. The [testing guide](docs/TESTING.md) explains commands, the three-browser matrix, workload profiles and limits. Do not use a passing build to claim provider/OBS acceptance.

Lifecycle changes also require `pnpm test:installer` and the Linux managed-install/update/rollback/removal rehearsal. See [installer implementation](installer/README.md). Review every irreversible boundary, failed-operation checkpoint and default; do not exercise purge against non-fixture roots.

Use real SQLite for persistence, meaningful contention/revocation/restart/failure checks for state changes, and generated request clients/signatures for provider changes. Do not write tests that merely mirror trivial implementation. Avoid filling a real disk; use bounded disposable storage. Fixture browser tests never load live YouTube or send provider mutations.

## Documentation contributions

Start at [docs/README.md](docs/README.md). Write task-based steps with prerequisites, shell/platform, paths, expected results and a next step. Check examples against actual CLI/schema/UI labels. Distinguish source development, installation and historical proof tools; do not imply a published installer/image exists before release.

The [documentation maintenance guide](docs/DOCUMENTATION.md) maps each source boundary to its guides and defines walkthrough review. Update [every affected field row/example](docs/CONFIGURATION_FIELDS.md) for schema changes and [action payloads](docs/API_ACTIONS.md) for control changes. `pnpm docs:check` validates all strict-schema examples and field coverage as well as navigation. Keep examples synthetic and previews separate from live mutations.

Keep README and the documentation index navigable. Update the relevant installation/configuration/provider/user/OBS/operations/recovery/API guides when behavior changes. Update CHANGELOG for user-facing changes. Keep requirement/evidence records consistent; update both identical PRDs together only when requirements change. Never rewrite historical source/run identities to make old evidence appear current.

Use reserved domains, synthetic identities and empty provider credential examples. Do not put actual host addresses, operator paths, account names or setup records in public documentation. Verify local links with `pnpm docs:check`; run `pnpm check` before submitting. Documentation-only work does not need a new performance campaign.

## Submit a pull request

1. Keep the branch focused and explain the concrete problem/result.
2. Run relevant checks and review the complete diff for accidental changes, debug code, secrets and personal information.
3. Commit using an identity you intend to publish. A public GitHub handle/no-reply email is suitable; review local Git configuration before the first commit.
4. Push your branch to your fork or authorized repository and open a PR using the template.
5. Report checks/results and unverified scenarios honestly. Address review feedback without weakening security/acceptance gates.

Never commit runtime files, keys, databases, backups, raw provider history, source URLs, browser traces or generated fixture credentials. Git/Docker exclusions and publication checks enforce these boundaries. Maintainers additionally scan candidate exports and full history with checksum-verified Gitleaks 8.30.1 and redacted output; see [testing/security evidence](docs/TESTING.md#security-and-release-evidence). Do not add broad exclusions to silence generated secrets.

## Issues, security and releases

Use the [bug/feature templates](https://github.com/DangerMouseUK/kekbot/issues/new/choose); include synthetic/redacted reproductions. See [troubleshooting](docs/TROUBLESHOOTING.md#reporting-a-problem) for useful diagnostic details. Follow [SECURITY.md](SECURITY.md) for private vulnerability reports.

Release-affecting work must keep the [requirement crosswalk](docs/RELEASE_READINESS.md), [evidence index](docs/release-evidence.json) and [release procedure](docs/RELEASING.md) consistent. Candidate preparation does not authorize deployment, tags, registry writes or release publication. Live results, independent operators and reference-host benchmarks remain separate acceptance work.

Contributors retain copyright. No copyright assignment or contributor license agreement is required.

## Review checklist by change type

| Change | Expected review evidence |
| --- | --- |
| Documentation | Working local links, schema examples, procedure rehearsal where changed, no private details or invented acceptance |
| UI/route | Server authority, bounded input, empty/error/stale states, keyboard/responsive behavior and production browser checks |
| Domain/storage | Real SQLite constraints/transactions, meaningful contention/replay/revocation/failure cases and migration/recovery compatibility |
| Provider | Current official contract, original signed bytes, wrong-channel/guild denials, rate limits and uncertain-delivery handling |
| Distribution | Standalone CLI and Linux non-root container/proxy/recovery, provenance/notices and source/history/image publication audit |

Discuss substantial scope changes in an issue before building them. Keep a focused PR reviewable; use its description to explain resulting behavior, validation and remaining limitations. Maintainers may request a synthetic reproduction or affected guide update before merging.
