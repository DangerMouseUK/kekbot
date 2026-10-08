# KekBot

[![CI](https://github.com/DangerMouseUK/kekbot/actions/workflows/ci.yml/badge.svg)](https://github.com/DangerMouseUK/kekbot/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

**Your Kick bot, your stream control room, your infrastructure.**

KekBot brings Kick chat automation, Discord moderator controls, OBS sources and YouTube requests into a self-hosted dashboard. One installation serves one creator and their moderator team. You own the provider applications, configuration, local accounts and data.

**Status: development candidate (`0.1.0-dev.0`).** The feature build and automated candidate campaign are complete. Full-product live testing and stable release acceptance are pending. Install from source for evaluation; a supported stable release and published image are still to come. See the [milestones](docs/MILESTONES.md) and [release readiness](docs/RELEASE_READINESS.md) for evidence and limits.

## What you can do

| Area | Capabilities |
| --- | --- |
| Kick chat | Custom commands, aliases, response pools, counters, restrictions, cooldowns and timers |
| Discord | Explicit guild/channel notification routing and permission-controlled operator commands |
| Stream presentation | Follow/subscription alerts, local image/sound assets, goals, three themes and 18 OBS source types |
| Media | Kick `!sr` requests → dashboard or Discord approval → visible YouTube playback in OBS → durable queue advancement |
| Moderation | Link/phrase/repetition/caps/burst rules, safe rule tests, notes, escalation and temporary incident presets |
| Community | Points, estimated watchtime, rewards, polls, raffles and leaderboards |
| Ownership | Local accounts/roles, scoped API/source tokens, analytics, retention, configuration portability and backup/recovery tools |

Discord and YouTube are optional to enable. KekBot runs without a project-operated account, relay or billing service. Enabled integrations contact their official services; OBS YouTube playback contacts YouTube. The [configuration reference](docs/CONFIGURATION.md) explains storage and secrets.

## Get started

- **Try the dashboard safely:** [local fixture quickstart](docs/QUICKSTART.md). Synthetic data, generated credentials and simulated provider effects; no provider account required.
- **Run your own bot:** [installation guide](docs/INSTALLATION.md), then [Kick/Discord/YouTube setup](docs/PROVIDERS.md) and [OBS setup](docs/OBS.md).
- **Use an existing installation:** [user guide](docs/USER_GUIDE.md).
- **Maintain or recover a host:** [operations](docs/OPERATIONS.md), [backup and recovery](docs/BACKUP_RECOVERY.md), and [troubleshooting](docs/TROUBLESHOOTING.md).
- **Contribute:** [CONTRIBUTING.md](CONTRIBUTING.md), [architecture](docs/ARCHITECTURE.md) and [testing](docs/TESTING.md).

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

## Hosting requirements

The deployment target is **Linux x86-64**, one long-running application container, local persistent disk and publicly trusted HTTPS for provider callbacks. The included Compose examples build KekBot and an optional Caddy proxy from source. A domain is the usual path; a separate public-IPv4 HTTPS example is available. Windows/macOS can evaluate the Linux container with Docker Desktop or develop from source.

SQLite storage is local to the installation. Multiple replicas sharing a database, network-filesystem storage and ARM64 distribution are outside the current supported topology. The 2 vCPU / 2 GiB runtime reference target still needs live benchmark acceptance; allow more memory for image builds. See [installation requirements](docs/INSTALLATION.md#requirements).

## Documentation

The [documentation index](docs/README.md) lists every guide, reference and project record. Start with the task-based guides above; the PRDs describe product requirements rather than installation steps.

| Reference | Purpose |
| --- | --- |
| [Configuration](docs/CONFIGURATION.md) | Environment variables, file layout, secrets and module defaults |
| [HTTP API](docs/API.md) | Authentication, scopes, actions, schemas, SSE and error handling |
| [Architecture](docs/ARCHITECTURE.md) | Runtime, persistence and provider design decisions |
| [Testing](docs/TESTING.md) | Local checks, fixture isolation, browser and Linux CI coverage |
| [Live acceptance](docs/LIVE_ACCEPTANCE.md) | Remaining provider, OBS, host and independent-operator trials |
| [Release procedure](docs/RELEASING.md) | Candidate packages, checksums, acceptance and publication |
| [Milestones](docs/MILESTONES.md) | Completed work, exact evidence and remaining milestones |

## Contributing and support

Bug reports, documentation fixes and focused contributions are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) for the development workflow and [troubleshooting](docs/TROUBLESHOOTING.md#reporting-a-problem) before opening an [issue](https://github.com/DangerMouseUK/kekbot/issues). Use [SECURITY.md](SECURITY.md) for private vulnerability reporting.

GitHub Actions checks documentation/publication policy, secrets, types/lint, real SQLite behavior, production builds, three browser engines and Linux container/proxy/recovery flows. Opt-in synthetic soak and candidate packaging are also available. Passing CI establishes automated evidence; live release gates remain separate.

## License

KekBot code and built-in themes are [MIT licensed](LICENSE). Dependencies retain their own licenses; see the [dependency inventory](docs/DEPENDENCIES.md) and [supplemental notices](licenses/README.md). Operators are responsible for the rights to uploaded assets and requested media.
