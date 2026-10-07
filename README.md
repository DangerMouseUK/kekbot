# KekBot

An MIT-licensed, self-hosted Kick and Discord bot and stream control room.

**Current stage: automated candidate verified, `0.1.0-dev.0`.** Accounts, dashboard, commands/timers, Discord controls, alerts/OBS sources, media approval/playback, moderation, goals, engagement, analytics and configuration/API services are implemented. Milestone 17's fixture, SQLite, failure, concurrency, browser and Linux container campaign passed; this is not an accepted stable release. Follow the [milestones](docs/MILESTONES.md) for exact evidence and outstanding gates. The [live acceptance campaign](docs/LIVE_ACCEPTANCE.md) is prepared; new deployment is deferred. The original test droplet has been destroyed; no running deployment is assumed.

## Start locally

Requirements: Node.js 24.21.0 and pnpm 10.26.0. Native SQLite compilation may require a C++ build toolchain and Python. The production target is Linux x86-64; Docker Desktop is the container path for Windows/macOS.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Edit .env.local. Select fixture mode explicitly for offline development.
pnpm kekbot init
# Optional: populate every module and create protected fixture credentials while stopped.
# pnpm kekbot fixture-seed
pnpm dev
```

On PowerShell, use `Copy-Item .env.example .env.local`. For fixture development, set `KEKBOT_MODE=fixture`, `KICK_BROADCASTER_USER_ID=123`, and leave live Kick credentials empty. Keep `KEKBOT_RUN_JOBS=1` to exercise the background runtime.

Open `http://127.0.0.1:3000`. Initialization reports the private setup-token file path, never its contents. Read it locally to claim the owner account; the token expires after one hour. A seeded fixture installation instead uses the random credentials stored in the reported protected `fixture-account.json` file. There are no default live passwords.

The dashboard uses local sessions, role permissions and CSRF checks. Owners configure their own optional integrations and issue separate revocable widget/player/API tokens. The [operator guide](docs/OPERATIONS.md) covers installation, provider setup, OBS, daily workflows, backups, upgrades and owner recovery. Historical foundation controls now live at `/foundation`, require explicit proof enablement, and additionally require owner authority in live mode.

```sh
pnpm kekbot fixture-event
pnpm kekbot doctor
pnpm check
pnpm build
pnpm test:standalone
pnpm exec playwright install chromium
pnpm test:e2e
pnpm test:workload
pnpm start
```

`pnpm build` disables jobs and telemetry even when live runtime configuration exists. `pnpm start` runs the built standalone server. The browser is not required for job processing.

## Project guides

- [Project milestones and final testing plan](docs/MILESTONES.md)
- [Installation and operator guide](docs/OPERATIONS.md)
- [HTTP API and configuration interfaces](docs/API.md)
- [Automated testing and GitHub CI](docs/TESTING.md)
- [Live acceptance and reference benchmarks](docs/LIVE_ACCEPTANCE.md)
- [Foundation setup, live proof, backup and restore](docs/FOUNDATION.md)
- [Ordered build roadmap and evidence](docs/ROADMAP.md)
- [Architecture decisions](docs/ARCHITECTURE.md)
- [Product specification](docs/PRD.md)
- [Contributing](CONTRIBUTING.md)
- [Repository instructions for coding agents](AGENTS.md)
- [Security reporting](SECURITY.md)
- [Changelog](CHANGELOG.md)
- [Production dependency licenses](docs/DEPENDENCIES.md)

GitHub Actions runs publication/docs/types/lint checks, real SQLite/provider/concurrency/storage-fault tests, migrations, production dependency audit, packaged recovery, Chromium/Firefox/WebKit browser checks, accessibility, a short synthetic workload, and Linux image/proxy/recovery checks. Checksum-pinned Gitleaks scans candidate files and complete Git history. Workflows run on pushes to `main`, pull requests and manual invocation with read-only repository permissions and no provider credentials. Private traces, screenshots and generated data are not uploaded. See the [testing guide](docs/TESTING.md) for commands, coverage and limits.

One installation serves one creator. The runtime requires no KekBot account, central relay, billing service, or default telemetry. Enabled provider integrations still depend on their official services. MIT covers newly authored KekBot code; dependencies retain their own licenses.
