# KekBot

An MIT-licensed, self-hosted Kick and Discord bot and stream control room.

**Current stage: foundation proof passed.** The single-owner live Kick foundation gate passed on 2026-10-02, including real replies, replay protection, restart, grant recovery and separate-storage restoration. Local tests and Linux/container checks provide the supporting evidence. Installation and accounts is the next increment; the remaining v0.1 capabilities are tracked in the [roadmap](docs/ROADMAP.md).

## Start locally

Requirements: Node.js 24.21.0 and pnpm 10.26.0. Native SQLite compilation may require a C++ build toolchain and Python. The production target is Linux x86-64; Docker Desktop is the container path for Windows/macOS.

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
# Edit .env.local. Select fixture mode explicitly for offline development.
pnpm kekbot init
pnpm dev
```

On PowerShell, use `Copy-Item .env.example .env.local`. For fixture development, set `KEKBOT_MODE=fixture`, `KICK_BROADCASTER_USER_ID=123`, and leave live Kick credentials empty. Keep `KEKBOT_RUN_JOBS=1` to exercise the background runtime.

Open `http://127.0.0.1:3000`. Initialization prints the path of the private foundation proof-token file, not its contents. Read it locally and enter it into the page when testing operator controls. The token is a temporary host-managed harness credential; local user accounts arrive in the next gated increment.

Foundation controls also provide shared token refresh and an opt-in, encrypted capture of one verified `!kekbot` event for replay acceptance. Live replay requires `pnpm kekbot proof-replay <delivery-id> --live`. The [foundation guide](docs/FOUNDATION.md) explains capture expiry, private storage, and trusted public-IP HTTPS deployment without a domain.

```sh
pnpm kekbot fixture-event
pnpm kekbot doctor
pnpm check
pnpm build
pnpm test:standalone
pnpm exec playwright install chromium
pnpm test:e2e
pnpm start
```

`pnpm build` disables jobs and telemetry even when live runtime configuration exists. `pnpm start` runs the built standalone server. The browser is not required for job processing.

## Project guides

- [Foundation setup, live proof, backup and restore](docs/FOUNDATION.md)
- [Ordered build roadmap and evidence](docs/ROADMAP.md)
- [Architecture decisions](docs/ARCHITECTURE.md)
- [Product specification](docs/PRD.md)
- [Contributing](CONTRIBUTING.md)
- [Security reporting](SECURITY.md)
- [Changelog](CHANGELOG.md)

CI runs publication-policy and documentation checks, type checking, lint, unit/SQLite tests, migration checks, production dependency audit, standalone/browser checks, and Linux container smoke tests. A separate job scans the complete Git history for secrets with checksum-pinned Gitleaks. Both jobs run on pushes and pull requests with read-only repository permissions. CI needs no provider credentials.

One installation serves one creator. The runtime requires no KekBot account, central relay, billing service, or default telemetry. Enabled provider integrations still depend on their official services. MIT covers newly authored KekBot code; dependencies retain their own licenses.
