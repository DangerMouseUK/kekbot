# Maintaining the documentation

This is the contributor/maintainer guide to the documentation set. Readers should start at [the index](README.md). Runtime changes follow [CONTRIBUTING.md](../CONTRIBUTING.md); release evidence follows [RELEASING.md](RELEASING.md).

<!-- contents:start -->
**On this page**

- [Structure and ownership](#structure-and-ownership)
- [Writing a task guide](#writing-a-task-guide)
- [Source-of-truth map](#source-of-truth-map)
- [Verification checklist](#verification-checklist)
- [Reviewing quality](#reviewing-quality)
- [Handbook verification record](#handbook-verification-record)
- [Beginner handbook refresh](#beginner-handbook-refresh)
- [Runtime quality follow-up](#runtime-quality-follow-up)
- [Beta 4 documentation maintenance](#beta-4-documentation-maintenance)
<!-- contents:end -->

## Structure and ownership

| Layer | Documents | Editing rule |
| --- | --- | --- |
| Public entry | Root README, docs index | Route a new reader to the right task; state current distribution/status honestly |
| Tutorials | Quickstart, Docker Desktop, installation, first session | A runnable sequence with prerequisites, exact shell/location, expected results and next steps |
| Task guides | Accounts, providers, user guide, OBS, operations, backup/recovery, troubleshooting | Explain permission, inputs, real effects, failure recovery and private-data handling |
| References | Configuration, dashboard fields/examples, CLI, API/actions, architecture, dependencies | Exhaustive for the declared interface; derive facts from code/locked dependencies |
| Project records | PRDs, roadmap, milestones, readiness, live acceptance, releasing, evidence JSON | Separate requirements, implementation and actual acceptance; preserve dated identities |
| Repository policy | AGENTS, CONTRIBUTING, SECURITY, CHANGELOG, GitHub templates | Keep contributor workflow, reporting and publication rules aligned |
| Legal/historical | LICENSE, upstream notices, foundation evidence | Preserve upstream legal text and historical results; add context rather than rewriting history |

The PRDs are intentionally identical. Edit both only when requirements change. The 2026-10-02 foundation result belongs to its recorded source and destroyed test installation. New instructions do not make that source current or pass later live gates.

## Writing a task guide

Begin with who the guide is for, the state it assumes and a link to the preceding/next task. Put one successful beginner path before alternatives. The root README links [Getting started](GETTING_STARTED.md); manual source review, every CLI flag and custom Compose belong in advanced references. Keep the short launch command consistent across README, Getting started and the launcher guide. Explain server versus personal computer, live versus demo, and application versus host tools in everyday language. Link [the glossary](GLOSSARY.md) when a technical term is unavoidable. Do not make readers audit scripts or type source hashes on the recommended published-image path; exact-source trust remains available for advanced/development choices. For each consequential action explain:

1. **Where:** host versus container, checkout root versus external directory, Bash versus PowerShell.
2. **Authority:** owner, delegated capability, trusted host access or provider permissions.
3. **Input:** exact screen labels/arguments, units, bounds and how to obtain an ID.
4. **Effect:** pure preview, local durable change or real provider mutation.
5. **Evidence:** expected response/state and where to inspect delivery.
6. **Recovery:** what to do after a stale version, rejected permission or unknown delivery.

Prefer a small worked example over a capability list. Link a reference for every field instead of maintaining several competing default tables. Use reserved domains, documentation IP ranges and clearly synthetic identities. Never include actual setup records, account names, filesystem usernames, host addresses or usable tokens. Credentials must be read from private files, not placed in arguments/history.

Do not imply an installer, published image, default account, email-reset flow or stable API exists before implementation/publication. Explain observed/estimated/missing data without fabricated totals. A visible screen and a successful OAuth callback are intermediate results, not proof of end-to-end delivery.

## Source-of-truth map

| Changed behavior | Inspect | Update |
| --- | --- | --- |
| Runtime paths/environment/Compose | `config.ts`, wrappers, Compose/Docker/Caddy files | Installation, configuration, Desktop, CLI, recovery |
| Host lifecycle / version source / bundle format | `install.sh`, `installer/`, release packager, lifecycle/terminal CI | Launcher, guided installer, updating, uninstalling, manual/managed boundaries, README and evidence |
| Editor field/default/validation | `catalog.ts`, `config-editor.tsx`, domain service | Field reference, matching JSON example, task guide, API |
| Roles/session/invitations | `auth.ts`, `http.ts`, `state.ts` | Accounts, API/actions, security, recovery |
| Provider setup/scope/action | Provider clients and official contract | Providers, API/actions, troubleshooting, live runbook |
| Source/player behavior | Presentation/media services and widget pages | OBS, fields, API, recovery |
| Backup/schema/import | Maintenance, migrations, operations service | Recovery, CLI, configuration, API and release compatibility |
| Script/check/release gate | `package.json`, scripts, workflow, release policy | Contributing, testing, releasing, evidence/readiness |

## Verification checklist

Run from the checkout root with pinned tools:

```sh
pnpm docs:check
pnpm check
git diff --check
```

`docs:check` validates local files/fragments (including explicit evidence anchors), matching PRDs, complete field rows and every strict-schema JSON example. It does not fetch external links, execute shell snippets or prove screenshot labels. Review those separately. Code fences are excluded from Markdown-link parsing so example syntax is not treated as navigation.

Linux CI also validates the Desktop and separate-key YAML examples using Docker Compose itself, with temporary empty-credential configuration and no running services. This checks the documented override merge, platform and mounts; it does not establish a native desktop operator trial.

For changed setup/recovery instructions, rehearse with a **new external fixture data root** and generated credentials. Check initialization, login, the relevant action and stopped-host backup/restore ordering. Keep original data untouched. Container/Compose/TLS/storage checks can run in Linux GitHub Actions; operators need not run local Docker tests for a documentation PR. Do not claim real provider/OBS or another-host acceptance from fixtures.

Review the full public candidate and Git history with redacted secret/personal-information output before pushing. Verify source/image/archive publication boundaries if packaging guidance changes. Keep temporary reports and walkthrough credentials outside Git. Update CHANGELOG and the index; retain existing anchors where possible or update every referring link.

## Reviewing quality

A guide is ready for review when a reader can identify what they need, follow the sequence, recognize success, diagnose common failure and find the next task. Check both a blank installation and a returning operator's maintenance shell. Long references need a contents list; tables should compare parallel facts rather than hide critical warnings in footnotes.

Independent-installer acceptance remains a live release gate. Record actual assistance and confusion during that trial, then fix the guide and retest the affected journey. Never describe editorial review or a link check as an unaided installation result.

## Handbook verification record

Reviewed 2026-10-08 against runtime baseline `2219e36eea59a9ceebb10bfb8870954d5754bec4`; this documentation change does not change application behavior, dependencies or migrations. The PR's commit/CI run identifies the final handbook revision.

Verification included `pnpm check` (114 tests in 19 files, types/lint, publication/docs/release guards), `pnpm build`, and a fresh external fixture walkthrough. That walkthrough preserved keys across repeated initialization, seeded all 18 widget families, signed in, saved all 12 configuration example kinds, previewed commands/timers/alerts, safe-tested a rule, set an absolute goal value, uploaded an asset, accepted a read-only invitation and verified mutation denial, sent a signed fixture event, exercised/revoked a read API token, exported configuration, and performed stopped-host backup, separate-empty-target restore and owner recovery.

Private generated accounts, keys, databases, assets and logs stayed outside the checkout. Linux container/proxy and browser verification belongs to the PR's ordinary CI. Docker Desktop operator trials, real provider/OBS delivery, certificate renewal, independent installers and another-host recovery are not established by this editorial/fixture review. PRDs, upstream license text, historical run identities and pending acceptance gates are preserved.

## Beginner handbook refresh

The current repository handbook puts the short guided launcher and [Getting started](GETTING_STARTED.md) before advanced setup. The review covers public entry points, operator tasks, references, contributor/security policy and release records. The [glossary](GLOSSARY.md) defines unfamiliar terms without becoming a prerequisite reading assignment. Managed provider lookup and snapshot instructions now distinguish generated Compose from manual deployment.

Local verification on 2026-10-09: `pnpm check` passed publication/docs/release/pin guards, types, formatting, lint and all 155 application tests. The final targeted `pnpm test:installer` passed 53 portable contracts, with 11 Linux-only cases skipped locally. [PR CI 38000770841](https://github.com/DangerMouseUK/kekbot/actions/runs/38000770841) subsequently passed all 64 installer/launcher contracts and all six required jobs, including three browsers and both recommended/advanced container lifecycle paths. [Milestones](MILESTONES.md#beginner-setup-and-handbook--development-follow-up) records the exact head/merge-checkout identities and fixture limits. `pnpm docs:check` covers 57 Markdown files, matching PRDs, every catalog field and 12 schema examples. The actual shared beginner command is tested with successful and failed downloads, including prevention of execution after failure.

Redacted Gitleaks 8.30.1 scans passed on all 259 publication files and full Git history. Additional personal-path/private-key pattern checks found zero matches in the current files and 880 historical blobs; no global IPv4-looking values were found in the publication set. Anonymous HTTPS release discovery returned published `v0.1.0-beta.3` as a separately offered beta. These are source/privacy/transport checks, not live installation evidence.

Beta 3 and older release notes, PRD requirements, upstream license text and historical source/image/run identities remain unchanged. The new launcher/tools are development work until included in a separately reviewed release; they can select the existing published application. Link/schema checks, installer contracts and Linux CI provide automated evidence. Fresh-host prerequisites, public certificates, live providers/OBS and unaided beginner trials remain pending.

## Runtime quality follow-up

The [quality follow-up](QUALITY_HARDENING.md) records the later runtime/installer changes and their current verification. Its docs update covers active/history media, retention/erasure, schema-3 recovery, diagnostics and release-controlled dependencies. Preserve the earlier handbook record above as historical editorial evidence; it is not a test record for the new runtime.

## Beta 4 documentation maintenance

Beta 4 publication updates README/index, beginner, beta/installation/launcher/update guides, contributor/agent references and release/evidence records together. The published version includes Recommended setup and the beginner handbook. Commands now select an existing tag; actual anonymous source/image downloads and all six asset hashes are verified independently of candidate checks. The [published lifecycle campaign](releases/v0.1.0-beta.4.md#published-distribution-checks) passed all six required CI jobs. Local `pnpm check` passed 155 application tests and 53 portable installer contracts, with 11 Linux-only tests skipped locally and passed in CI. Redacted publication/history scans and personal-path/private-key/global-IP checks found no secrets or identifying installation details. PRDs, historical beta 1/2/3 notes/assets, license text and the pending stable acceptance index stay unchanged. No application change or new fixture test is needed for this publication-only documentation update.
