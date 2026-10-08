# Contributing to KekBot

Thanks for helping improve KekBot. Focused fixes, clearer guides, reproducible bug reports and meaningful tests are welcome. The project is an unreleased development candidate; [milestones](docs/MILESTONES.md) distinguish the completed build/automated campaign from pending live acceptance.

## Start with an isolated development setup

Follow the [fixture quickstart](docs/QUICKSTART.md). Use Node.js **24.21.0**, pnpm **10.26.0** and the frozen lockfile. No provider account, private dependency or maintainer credential is needed. Never use live grants for development/CI.

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
| `docs/` | Operator guides, references, requirements and evidence |

Read [architecture](docs/ARCHITECTURE.md) before changing boundaries and [API](docs/API.md) before changing contracts. Coding agents also follow [AGENTS.md](AGENTS.md).

## Implementation expectations

Keep routes/React separate from shared domain decisions. Dashboard, Kick, Discord and API controls must use the same services. Keep network calls outside SQLite transactions, persist decisions/outbox atomically, and use constraints/versions for concurrency. Never blindly resend an uncertain provider mutation. Recheck current authority when deferred effects execute.

Use bounded declarative configuration rather than executable templates. Avoid new production dependencies unless necessary; pin exact versions, review license/use and update [dependency notices](docs/DEPENDENCIES.md). Asset/theme contributions require distributable rights and attribution.

Generate schema changes with `pnpm db:generate`, review SQL/metadata and commit both. Do not edit released migrations, generate migrations at startup or assume backup compatibility without evidence. Document any explicit upgrade boundary.

## Verification

Run the checks appropriate to the change:

```sh
pnpm check
```

This includes publication/docs/release-evidence validity, types, lint and all unit/SQLite tests. For runtime/UI/package changes also run:

```sh
pnpm build
pnpm test:standalone
pnpm exec playwright install chromium
pnpm test:e2e
```

Linux container/proxy/storage checks run in GitHub Actions; local Docker is optional for contribution review. The [testing guide](docs/TESTING.md) explains commands, the three-browser matrix, workload profiles and limits. Do not use a passing build to claim provider/OBS acceptance.

Use real SQLite for persistence, meaningful contention/revocation/restart/failure checks for state changes, and generated request clients/signatures for provider changes. Do not write tests that merely mirror trivial implementation. Avoid filling a real disk; use bounded disposable storage. Fixture browser tests never load live YouTube or send provider mutations.

## Documentation contributions

Start at [docs/README.md](docs/README.md). Write task-based steps with prerequisites, shell/platform, paths, expected results and a next step. Check examples against actual CLI/schema/UI labels. Distinguish source development, installation and historical proof tools; do not imply a published installer/image exists before release.

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
