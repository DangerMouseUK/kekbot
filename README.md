# KekBot

[![CI](https://github.com/DangerMouseUK/kekbot/actions/workflows/ci.yml/badge.svg)](https://github.com/DangerMouseUK/kekbot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**A self-hosted Kick bot and stream control room for your creator team.**

KekBot brings Kick chat automation, Discord moderator controls, OBS sources and YouTube requests into a self-hosted dashboard. One installation serves one creator and their moderator team. You own the provider applications, configuration, local accounts and data.

**Status: [v0.1.0-beta.2 is available for evaluation](https://github.com/DangerMouseUK/kekbot/releases/tag/v0.1.0-beta.2).** Beta 2 includes the bundled domain/IP HTTPS installer correction and matching tool/application versions. Read its [release notes](docs/releases/v0.1.0-beta.2.md) and [security/binary-license review](docs/RELEASE_READINESS.md#beta-2-review). Full-product live testing and all 33 stable acceptance gates remain pending. Start with the [beta guide](docs/BETA.md); select **Specific release** because latest-stable discovery excludes betas.

**Using beta 1?** Its original bundled HTTPS installer needs the [fixed-tool workaround](docs/INSTALLER.md#beta-1-bundled-https-installer-fix). Beta 2 includes that correction; beta 1 downloads stay unchanged.

## What you can do

| Area | Capabilities |
| --- | --- |
| Kick chat | Custom commands, aliases, response pools, counters, restrictions, cooldowns and timers |
| Discord | Explicit guild/channel notification routing and permission-controlled operator commands |
| Stream presentation | Follow/subscription alerts, local image/sound assets, goals, three themes and 18 OBS source types |
| Media | Kick `!sr` requests → dashboard or Discord approval → visible YouTube playback in OBS → durable queue advancement |
| Moderation | Link/phrase/repetition/caps/burst rules, safe rule tests, notes, escalation and temporary incident presets |
| Community | Points, estimated watchtime, reward fulfillment queues, polls, raffles and leaderboards |
| Ownership | Local accounts/roles, scoped API/source tokens, analytics, retention, configuration portability and backup/recovery tools |

Discord and YouTube are optional to enable. KekBot runs without a project-operated account, relay or billing service. Enabled integrations contact their official services; OBS YouTube playback contacts YouTube. The [configuration reference](docs/CONFIGURATION.md) explains storage and secrets.

Daily operation includes dedicated queues for pending rewards and uncertain provider deliveries, independent of recent history. The [user guide](docs/USER_GUIDE.md#points-and-rewards) explains fulfillment; the [operations guide](docs/OPERATIONS.md#reconcile-an-uncertain-action) explains inspecting and reconciling delivery without resending it.

The [runtime image](docs/RUNTIME_IMAGE.md) contains Node and the required native libraries without a shell or package manager. Use the documented Node maintenance commands. The guide covers Alpine/musl beta compatibility, the separate proxy build, binary scanning and bundled legal notices; the [release review](docs/RELEASE_READINESS.md#beta-2-review) binds checks to the published artifacts.

## Choose your starting point

| You want to… | Start here | What you need |
| --- | --- | --- |
| Explore safely | [Local quickstart](docs/QUICKSTART.md) | Git, pinned Node/pnpm; no provider accounts or Docker |
| Evaluate the beta | [Beta guide](docs/BETA.md) | A disposable installation, reviewed source or the exact published beta assets |
| Host a real bot | [Downloadable launcher](docs/LAUNCHER.md) → [guided terminal installer](docs/INSTALLER.md), or [manual installation](docs/INSTALLATION.md) | Linux x86-64, local persistent disk and public HTTPS; optional Ubuntu prerequisite assistance |
| Configure a fresh dashboard | [First session](docs/FIRST_SESSION.md) | Owner login and optional provider connections |
| Join an existing team | [Accounts](docs/ACCOUNTS.md) → [user guide](docs/USER_GUIDE.md) | A private invitation from your installation's operator |
| Put sources on stream | [OBS and playback](docs/OBS.md) | Owner-created source URLs; OBS Browser Source support |
| Update or remove a managed host | [Updating](docs/UPDATING.md) · [uninstalling](docs/UNINSTALLING.md) | Trusted host access; wizard-created installation |
| Back up or diagnose | [Operations](docs/OPERATIONS.md) → [recovery](docs/BACKUP_RECOVERY.md) | Trusted host access for maintenance commands |
| Contribute or integrate | [Contributing](CONTRIBUTING.md) → [API](docs/API.md) | An isolated fixture installation |

### Guided Linux installation

Download the launcher to a file on your **Linux x86-64 server**, review it, then open its explained install/manage menu:

```sh
curl --fail --location --proto '=https' --proto-redir '=https' \
  --max-time 60 --retry 2 \
  https://raw.githubusercontent.com/DangerMouseUK/kekbot/main/install.sh \
  --output install.sh &&
  less install.sh &&
  sudo bash install.sh
```

The [complete launcher guide](docs/LAUNCHER.md) explains prerequisite checks, optional Ubuntu 24.04 setup, source review and every option. Choose **Specific release → v0.1.0-beta.2** for the published beta. Releases, branches, PRs, exact commits and audited source/image bundles remain available, with typed trust and final review. The launcher also opens update, rollback, start/stop, status and uninstall; removal keeps data by default.

This launcher is a development addition after beta 2, available from `main` after its PR merges. Existing beta tags/assets remain unchanged. Management tools and the selected application have separate identities; review both. Do not pipe a downloaded script into a shell.

### Local fixture setup

Install Git, **Node.js 24.21.0** and **pnpm 10.26.0** first. See [quickstart prerequisites](docs/QUICKSTART.md#prerequisites), including native SQLite build requirements.

```sh
git clone https://github.com/DangerMouseUK/kekbot.git
cd kekbot
pnpm install --frozen-lockfile
cp .env.example .env.local
```

PowerShell uses `Copy-Item .env.example .env.local` for the last command. Edit `.env.local` before continuing:

```dotenv
KEKBOT_MODE=fixture
KEKBOT_RUN_JOBS=1
KEKBOT_ENABLE_PROOF=0
KEKBOT_PUBLIC_URL=http://127.0.0.1:3000
KICK_BROADCASTER_USER_ID=123
```

Leave the provider client ID/secret empty and keep the local public URL exactly as above. Then:

```sh
pnpm kekbot init
pnpm kekbot fixture-seed
pnpm dev
```

Open **http://127.0.0.1:3000**. Read the protected `fixture-account.json` file at the path reported by seeding to sign in. The password is randomly generated. For manual owner setup instead, omit seeding and use the setup-token file reported by `init`.

The [complete quickstart](docs/QUICKSTART.md) explains the first command, simulated playback, shutdown and storage. Fixture mode cannot send live provider mutations or play real YouTube videos.

Prefer containers? The [Docker Desktop evaluation guide](docs/DOCKER_DESKTOP.md) covers Windows/macOS with Linux containers and a separate fixture volume, without host Node/pnpm.

## Hosting requirements

The [launcher](docs/LAUNCHER.md) opens the [guided installer](docs/INSTALLER.md), with explained terminal menus, final review, pinned branch/PR/commit/release selection, backup-before-update, recovery checkpoints and data-preserving default uninstall. Its application default is **latest stable**, which reports unavailable until stable releases exist; choose **Specific release** → `v0.1.0-beta.2` to evaluate the beta. Release formats are audited source builds or prebuilt Linux amd64 image archives. Bash launches host tooling; the wizard uses Python's standard library outside the application container and leaves provider consent/settings to the owner dashboard.

The deployment target is **Linux x86-64**, one long-running application container, local persistent disk and publicly trusted HTTPS for provider callbacks. The included Compose examples build KekBot and an optional Caddy proxy from source. A domain is the usual path; a separate public-IPv4 HTTPS example is available. Windows/macOS can evaluate the Linux container with Docker Desktop or develop from source.

SQLite storage is local to the installation. Multiple replicas sharing a database, network-filesystem storage and ARM64 distribution are outside the current supported topology. The 2 vCPU / 2 GiB runtime reference target still needs live benchmark acceptance; allow more memory for image builds. See [installation requirements](docs/INSTALLATION.md#requirements).

## Documentation

The [documentation index](docs/README.md) lists every guide, reference and project record. Start with the task-based guides above; the PRDs describe product requirements rather than installation steps.

| Reference | Purpose |
| --- | --- |
| [Configuration](docs/CONFIGURATION.md) | Environment variables, file layout, secrets and module defaults |
| [Dashboard fields](docs/CONFIGURATION_FIELDS.md) | Every editable field, default, unit and bound, with schema-checked examples |
| [CLI](docs/CLI.md) | Complete command syntax, prerequisites, results and failure handling |
| [Accounts](docs/ACCOUNTS.md) | Capability matrix, invitations, sessions and access removal |
| [Dependency maintenance](docs/DEPENDENCY_MAINTENANCE.md) | Reviewed release upgrades, audits and candidate sign-off |
| [HTTP API](docs/API.md) | Authentication, scopes, actions, schemas, SSE and error handling |
| [Architecture](docs/ARCHITECTURE.md) | Runtime, persistence and provider design decisions |
| [Testing](docs/TESTING.md) | Local checks, fixture isolation, browser and Linux CI coverage |
| [Live acceptance](docs/LIVE_ACCEPTANCE.md) | Remaining provider, OBS, host and independent-operator trials |
| [Release procedure](docs/RELEASING.md) | Candidate packages, checksums, acceptance and publication |
| [Milestones](docs/MILESTONES.md) | Completed work, exact evidence and remaining milestones |

## Contributing and support

Bug reports, documentation fixes and focused contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and [troubleshooting](docs/TROUBLESHOOTING.md#reporting-a-problem) before opening an [issue](https://github.com/DangerMouseUK/kekbot/issues). Use [SECURITY.md](SECURITY.md) for private vulnerability reporting.

GitHub Actions checks documentation/publication policy, secrets, types/lint, real SQLite behavior, production builds, three browser engines and Linux container/proxy/recovery flows. Opt-in synthetic soak and candidate packaging are also available. Passing CI establishes automated evidence; live release gates remain separate.

Active media requests stay separate from paginated history, so older requests cannot hide the queue. See the [media workflow](docs/USER_GUIDE.md) and [quality follow-up](docs/QUALITY_HARDENING.md) for the current changes and verification limits. Updates are explicit operator actions; dependencies are maintained through reviewed release work.

## Ownership and privacy

Your host retains local accounts and observed viewer activity. Provider grants are encrypted with a separate installation key; keep an independent protected copy because database/asset backups exclude it. Source URLs are private credentials and can be revoked individually. Read [data handling](docs/OPERATIONS.md#privacy-and-retention) before inviting operators or exporting history.

Public examples use synthetic identities and reserved addresses. Keep environment files, databases, source URLs, raw provider payloads and screenshots containing credentials out of issues. KekBot stores what it observes; unavailable viewer counts and estimated watchtime are labeled honestly.

## License

KekBot code and built-in themes are [MIT licensed](LICENSE). Dependencies retain their own licenses; see the [dependency inventory](docs/DEPENDENCIES.md) and [supplemental notices](licenses/README.md). Operators are responsible for the rights to uploaded assets and requested media.
