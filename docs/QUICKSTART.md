# Try KekBot locally

This walkthrough gives you an isolated dashboard with synthetic configurations, local accounts and simulated provider effects. You need no Kick, Discord or Google account. For a real channel, follow [installation](INSTALLATION.md) instead. Return to the [documentation index](README.md).

<!-- contents:start -->
**On this page**

- [Prerequisites](#prerequisites)
- [1. Get the source](#1-get-the-source)
- [2. Select fixtures explicitly](#2-select-fixtures-explicitly)
- [3. Initialize and seed](#3-initialize-and-seed)
- [4. Exercise a workflow](#4-exercise-a-workflow)
- [5. Stop and resume](#5-stop-and-resume)
- [Build or contribute](#build-or-contribute)
<!-- contents:end -->

## Prerequisites

The local source path uses Node/pnpm. A Linux host can instead use the [guided terminal wizard](INSTALLER.md) in fixture mode with Python 3, Git and Docker; Windows/macOS container evaluation follows [Docker Desktop](DOCKER_DESKTOP.md). Contributor `pnpm check` also needs Python 3.10+ for offline installer contracts, with no pip dependencies.

- Git and a terminal: Bash on Linux/macOS or PowerShell on Windows.
- [Node.js](https://nodejs.org/en/download) **24.21.0** and [pnpm](https://pnpm.io/installation) **10.26.0**. With Node installed, `npm install --global pnpm@10.26.0` installs the pinned package manager.
- A native build toolchain if a prebuilt SQLite binary is unavailable: Python and C++ build tools (`python3 make g++` on Ubuntu; Visual Studio Build Tools with Desktop development with C++ on Windows; Xcode Command Line Tools on macOS).

Check `node --version` and `pnpm --version`. Docker is unnecessary for this walkthrough. Local development supports the source workflow; the distribution target is Linux x86-64.

## 1. Get the source

```sh
git clone https://github.com/DangerMouseUK/kekbot.git
cd kekbot
pnpm install --frozen-lockfile
cp .env.example .env.local
```

In PowerShell replace the copy command with:

```powershell
Copy-Item .env.example .env.local
```

## 2. Select fixtures explicitly

Edit `.env.local` in a text editor. Change these entries:

```dotenv
KEKBOT_MODE=fixture
KEKBOT_RUN_JOBS=1
KEKBOT_ENABLE_PROOF=0
KEKBOT_PUBLIC_URL=http://127.0.0.1:3000
KICK_BROADCASTER_USER_ID=123
```

Leave `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET` empty. Keep the public URL exactly `http://127.0.0.1:3000` and open that same address; a different hostname/origin can cause login's same-origin check to reject the request. If you change the local port, change the public URL and browser address together. The template defaults to live mode, so edit it before initializing. Never copy a live credential file into a fixture installation. Fixture mode rejects live integration credentials.

## 3. Initialize and seed

```sh
pnpm kekbot init
pnpm kekbot fixture-seed
pnpm dev
```

`init` creates the database and separate encryption/setup/signing files in `data/fixture`. Seeding adds examples for every module and all 18 source types, with simulated media and points enabled. It creates a `fixture-owner` account with a random password and reports the protected `fixture-account.json` file's location. Open that file locally and sign in at **http://127.0.0.1:3000**. Never attach it to an issue or PR.

For manual setup, omit `fixture-seed`. Read `data/fixture/secrets/setup.token`, enter it on the claim screen, and choose an owner username and a password of at least 12 characters. The setup token expires after one hour. If still unclaimed, stop the server and rerun `init` to renew it.

## 4. Exercise a workflow

In another terminal in the same checkout:

```sh
pnpm kekbot fixture-event
pnpm kekbot doctor
```

The first command sends a locally signed synthetic `!kekbot` event. Look for its audit/job outcome in **Control room** and **Maintenance**. It records a fixture reply; it sends nothing to Kick. Doctor should report database integrity `ok`.

Open **Commands**, add or edit a command and select **Preview responses**. Preview changes no counters or cooldowns and sends no chat. Explore **Media**, **Moderation**, **Points & rewards** and **Widgets** using the seeded examples. Source URLs are private even for fixtures. Fixture playback is simulated and never loads YouTube. The [user guide](USER_GUIDE.md) explains each module.

Continue with [your first session](FIRST_SESSION.md) for concrete command/timer/alert settings. The [account guide](ACCOUNTS.md) explains local permissions; [field examples](examples/README.md) can be copied into editors or API callers. Seeded records are examples, not live integration configuration. `fixture-event` sends only its built-in proof message; it is not a general arbitrary-chat CLI.

## 5. Stop and resume

Use Ctrl+C to stop `pnpm dev`. Your state remains under `data/fixture`; restart with `pnpm dev`. Jobs run in the server process and do not need an open dashboard. Run only one server against a data directory.

For a fresh demonstration, stop the server, set `KEKBOT_DATA_DIR` in `.env.local` to a **new empty local directory**, and repeat initialization/seeding. Keep the original directory until you are sure you no longer need its data. Do not switch an existing database between live and fixture modes.

## Build or contribute

```sh
pnpm check
pnpm build
pnpm test:standalone
pnpm exec playwright install chromium
pnpm test:e2e
```

`pnpm build` forces jobs and telemetry off during compilation. After stopping dev, `pnpm start` runs the standalone production build against your configured fixture directory. See [contributing](../CONTRIBUTING.md) and [testing](TESTING.md) before changing code. For installation or native-build failures, use [troubleshooting](TROUBLESHOOTING.md).
