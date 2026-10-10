# Evaluate with Docker Desktop

**Use this to try the bot on your own computer**, without a Linux server or live provider accounts. Docker Desktop supplies the Linux environment. This is an evaluation walkthrough, not a live hosted bot; [Getting started](GETTING_STARTED.md) explains live hosting. A [fixture](GLOSSARY.md) means a safe simulated demo.

This is an isolated **fixture** evaluation on Windows or macOS using Linux containers. It does not expose public callbacks, load real YouTube or send provider actions. Live hosting follows [installation](INSTALLATION.md) on Linux. Native source development follows [quickstart](QUICKSTART.md). [All documentation](README.md).

<!-- contents:start -->
**On this page**

- [Prerequisites and storage](#prerequisites-and-storage)
- [1. Create runtime files](#1-create-runtime-files)
- [2. Build and initialize](#2-build-and-initialize)
- [3. Sign in and explore](#3-sign-in-and-explore)
- [4. Stop and return later](#4-stop-and-return-later)
<!-- contents:end -->

## Prerequisites and storage

The [guided host wizard](INSTALLER.md) is Linux x86-64 only; it must not run through WSL against Docker Desktop's remote VM paths. Use this separate named-volume procedure on Windows/macOS. Managed host updates/uninstall do not adopt this evaluation's manual Compose project.

Install Git and [Docker Desktop](https://docs.docker.com/desktop/). Select Linux containers; Windows uses the WSL 2 backend. Confirm `docker version` and `docker compose version` in your terminal. Host Node/pnpm is unnecessary because the image builds the application. Allow enough Docker VM memory for compilation; the unaccepted 2 GiB runtime reference target is not a build-memory guarantee.

Use a Docker named volume for SQLite/assets inside the Linux VM, rather than a synced/cloud/network folder. This guide uses a separate Compose project named `kekbot-eval`. Do not reuse a live project's volume or runtime file.

Clone the source, then create a private configuration directory **outside** it. The commands below use a relative sibling named `kekbot-eval-private`; choose another new location if it already exists. Keep this directory private to your OS user.

## 1. Create runtime files

From the directory in which you keep checkouts:

```sh
git clone https://github.com/DangerMouseUK/kekbot.git
cd kekbot
```

PowerShell:

```powershell
New-Item -ItemType Directory -Path ../kekbot-eval-private
Copy-Item .env.example ../kekbot-eval-private/runtime.env
$env:KEKBOT_ENV_FILE = (Resolve-Path ../kekbot-eval-private/runtime.env).Path
$env:KEKBOT_SOURCE_REF = (git rev-parse HEAD).Trim()
```

Bash on macOS:

```sh
umask 077
mkdir ../kekbot-eval-private
cp .env.example ../kekbot-eval-private/runtime.env
export KEKBOT_ENV_FILE="$(cd ../kekbot-eval-private && pwd)/runtime.env"
export KEKBOT_SOURCE_REF="$(git rev-parse HEAD)"
```

Edit that runtime file and set:

```dotenv
KEKBOT_MODE=fixture
KEKBOT_RUN_JOBS=1
KEKBOT_ENABLE_PROOF=0
KEKBOT_PUBLIC_URL=http://127.0.0.1:3000
KICK_BROADCASTER_USER_ID=123
```

Leave live client credentials empty. Compose sets the container's data root/listen address. Create `../kekbot-eval-private/compose.yaml` with:

```yaml
services:
  kekbot:
    platform: linux/amd64
    volumes:
      - kekbot_eval_data:/data
volumes:
  kekbot_eval_data:
```

The override replaces the base service's `/data` mount with a named volume and selects the project's [Linux amd64 platform](https://docs.docker.com/reference/compose-file/services/#platform). Apple Silicon requires x86 emulation for this example and can build/run more slowly; native ARM64 distribution remains later scope. Keep using both files and the same project name.

## 2. Build and initialize

From the checkout root, in either shell:

```sh
docker compose -p kekbot-eval -f compose.yaml -f ../kekbot-eval-private/compose.yaml config --quiet
docker compose -p kekbot-eval -f compose.yaml -f ../kekbot-eval-private/compose.yaml build kekbot
docker compose -p kekbot-eval -f compose.yaml -f ../kekbot-eval-private/compose.yaml run --rm --no-deps kekbot node src/cli.ts init
docker compose -p kekbot-eval -f compose.yaml -f ../kekbot-eval-private/compose.yaml run --rm --no-deps kekbot node src/cli.ts fixture-seed
docker compose -p kekbot-eval -f compose.yaml -f ../kekbot-eval-private/compose.yaml up -d kekbot
```

Wait for healthy status with the same Compose prefix and `ps`. The application port is published only on `127.0.0.1:3000`. Do not add a public proxy to this fixture evaluation.

## 3. Sign in and explore

Copy the generated login file from the running container to private storage:

```sh
docker compose -p kekbot-eval -f compose.yaml -f ../kekbot-eval-private/compose.yaml cp kekbot:/data/fixture/secrets/fixture-account.json ../kekbot-eval-private/fixture-account.json
```

Open that file privately and use its generated login at **http://127.0.0.1:3000**. If the file path changes, use the seed command's reported location. Follow [first session](FIRST_SESSION.md); source URLs remain private even in fixtures. The fixture sender needs the container's own loopback address rather than the host mapping:

```sh
docker compose -p kekbot-eval -f compose.yaml -f ../kekbot-eval-private/compose.yaml exec kekbot node src/cli.ts fixture-event
docker compose -p kekbot-eval -f compose.yaml -f ../kekbot-eval-private/compose.yaml exec kekbot node src/cli.ts doctor
```

Both resolve the configured loopback port inside the container. Look for a succeeded fixture reply and `integrity: "ok"`; no live chat is sent.

## 4. Stop and return later

Use the same Compose prefix with `stop kekbot` to stop or `up -d kekbot` to resume. The named volume survives container replacement. Re-enter the host variables in a new shell. Never use `down -v` unless you intend to delete this evaluation's stored state and keys.

Docker Desktop needs to remain running for the bot to work. Sleeping the computer interrupts processing. Linux CI checks container behavior; an independent Windows/macOS Docker Desktop installation remains an operator acceptance scenario, not a result claimed by this guide. If the build or startup fails, check Docker VM resources and [troubleshooting](TROUBLESHOOTING.md).
