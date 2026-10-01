# Contributing to KekBot

Use Node.js and pnpm versions pinned in the repository. Start with README.md and docs/FOUNDATION.md; fixture mode needs no provider account, private dependency, or maintainer credential.

Keep UI/HTTP code separate from domain decisions, provider clients, storage, and runtime jobs. Routes and Discord actions must eventually call the same services. Add schema changes through `pnpm db:generate`, review the generated SQL, and commit the migration and metadata. Do not generate migrations at application startup or modify an already released migration.

For a change, explain the behavior and relevant evidence. Run `pnpm check`; run `pnpm build` and relevant browser/container checks when their behavior changes. Use real SQLite for persistence evidence. Add meaningful tests for behavior and failure cases; do not write tests solely to mirror trivial implementation details.

`pnpm check` includes local Markdown-link and PRD consistency checks. CI also checks migration metadata, audits production dependencies, scans Git history for secrets, and builds/tests the Linux container. GitHub Actions are pinned to commit hashes; update those pins deliberately when changing tooling. All CI fixtures are generated locally and require no integration secrets.

Never commit provider tokens, `.env.local`, encryption keys, proof tokens, local data, or raw operator history. Fixtures must be synthetic or redacted, isolated from live mode, and unable to perform provider mutations. Theme and media contributions need distributable licenses and attribution.

Review the staged diff before committing. If you use a private email locally, select your public GitHub handle and GitHub no-reply commit email before publishing. Gitleaks 8.30.1 can scan a clean export of staged files with `gitleaks dir --redact --no-banner PATH`, and committed history with `gitleaks git --redact --no-banner --log-opts="--all" .`. Do not add broad scanner exclusions for generated test secrets: generate them at runtime outside the publication set.

The foundation's live integration gate precedes broader dashboard work. Update docs/ROADMAP.md accurately: fixture-tested, live-tested, and blocked are different states. Local passing checks do not authorize claiming a release gate complete.

Contributors retain copyright. No copyright assignment or contributor license agreement is required. Publication and provider acceptance details belong to the repository owner.
