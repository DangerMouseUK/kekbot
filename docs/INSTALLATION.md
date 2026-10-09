# Manual installation with Docker Compose

**For the usual installation, follow [Getting started](GETTING_STARTED.md).** Use this page only when you want to manage Docker Compose and the proxy yourself. [Glossary](GLOSSARY.md).

This is the **manual source/Compose installation** of the published `0.1.0-beta.3` evaluation release on Linux x86-64. Pin its tag or reviewed full source as explained in the [beta guide](BETA.md). Building development `main` is a separate source/image from the published artifact. For explained terminal menus covering installation, versions, updates and removal, use the [downloadable launcher](LAUNCHER.md) and [guided installer](INSTALLER.md). Stable publication, unaided installer trials and full-product live acceptance remain pending. For a safe local demonstration use [quickstart](QUICKSTART.md). Return to the [documentation index](README.md).

Choose one management path. Manual instructions below keep public source in `/srv/kekbot/source` and use a `dc` shell helper. The wizard instead owns a new root with private `installation.json`, generated `compose.json`, immutable images and a copied tool. Do not mix paths or overwrite either installation with the other. A wizard-managed host uses [updating](UPDATING.md) and [uninstalling](UNINSTALLING.md).

For the shortest guided start use [the downloadable launcher](LAUNCHER.md). It can assist with fresh Ubuntu prerequisites after explicit review, then open the same wizard. It never adopts a manual installation or changes SSH/firewall/DNS. These manual instructions remain the alternative for operators managing their own Compose files.

<!-- contents:start -->
**On this page**

- [Requirements](#requirements)
- [1. Choose an HTTPS origin](#1-choose-an-https-origin)
- [2. Prepare source and private storage](#2-prepare-source-and-private-storage)
- [3. Build and initialize](#3-build-and-initialize)
- [4. Start and verify HTTPS](#4-start-and-verify-https)
- [5. Claim the owner account](#5-claim-the-owner-account)
- [6. Connect and run your first session](#6-connect-and-run-your-first-session)
- [Returning to the installation](#returning-to-the-installation)
- [Public-IP HTTPS variant](#public-ip-https-variant)
- [Existing reverse proxy](#existing-reverse-proxy)
<!-- contents:end -->

## Requirements

| Requirement | What you need |
| --- | --- |
| Host | Linux x86-64; Ubuntu 24.04 LTS is the CI/example platform |
| Resources | Local persistent disk; 2 vCPU / 2 GiB is the unaccepted reference runtime target. Allow additional memory for builds; 4 GiB is an evaluation starting point, not a proven minimum. |
| Software | Git, Docker Engine and the Docker Compose plugin |
| Reachability | Publicly trusted HTTPS, an operator-controlled hostname or public IPv4, inbound TCP 80/443 for the bundled proxy |
| Authority | Trusted host access, a Kick creator account and an application you own; Discord/YouTube are optional |
| Storage | A writable data root plus separately protected recovery keys and backups outside the checkout |

Install Docker from its [official Ubuntu guide](https://docs.docker.com/engine/install/ubuntu/); other distributions should use their official Docker instructions. Confirm `docker version` and `docker compose version` work for your deployment user. Docker access grants extensive host authority. Host access, OS updates, SSH identity verification, firewall rules and provider-console access remain the operator's responsibility; KekBot does not change them.

Run one application replica. SQLite on NFS/SMB, shared volumes across replicas and ARM64 distribution are unsupported. Keep the host running for callbacks/jobs. A sleeping desktop cannot operate a live bot reliably. Windows/macOS can evaluate containers with Docker Desktop; the source [quickstart](QUICKSTART.md) is the simpler offline path.

For step-by-step Windows/macOS container evaluation use [Docker Desktop fixtures](DOCKER_DESKTOP.md). The rest of this guide runs in **Bash on the Linux host**, from `/srv/kekbot/source` after cloning. Commands using `sudo` need host administrator authority; Docker commands need access to the daemon. Replace example domains/paths deliberately before execution.

## 1. Choose an HTTPS origin

The standard example uses `https://kekbot.example`. **Replace this reserved example hostname with your own** and point its public DNS record at your server. Route TCP 80/443 to that host and avoid publishing a broken AAAA record. Do not expose application port 3000 publicly.

A domain is optional: the [public-IP variant](#public-ip-https-variant) uses trusted short-lived IP certificates. Provider acceptance must still be checked for your installation. A private LAN origin cannot receive provider callbacks from the internet.

## 2. Prepare source and private storage

These commands are for Bash on the Linux host. The paths are illustrative; use a dedicated runtime location outside the Git checkout.

```sh
sudo install -d -m 0755 /srv/kekbot
sudo install -d -m 0755 -o "$(id -u)" -g "$(id -g)" /srv/kekbot/source
sudo install -d -m 0700 -o 1000 -g 1000 /srv/kekbot/data /srv/kekbot/backups
git clone https://github.com/DangerMouseUK/kekbot.git /srv/kekbot/source
cd /srv/kekbot/source
git rev-parse HEAD
sudo install -m 0600 -o "$(id -u)" -g "$(id -g)" .env.example /srv/kekbot/runtime.env
```

Record the full checked-out SHA privately; select an exact reviewed commit before building. `main` changes over time and is not a release version.

To select a specific reviewed revision before building, use `git switch --detach REVIEWED_FULL_SHA`, replacing that label with its full commit. `git status --short` should be empty. Record any private overrides outside the checkout so an upgrade does not mix public source edits with runtime configuration.

Edit `/srv/kekbot/runtime.env` with your editor. Keep the template's other entries and set:

```dotenv
KEKBOT_MODE=live
KEKBOT_RUN_JOBS=1
KEKBOT_ENABLE_PROOF=0
KEKBOT_PUBLIC_URL=https://kekbot.example
KICK_CHAT_TYPE=user
```

Leave provider ID/secret/broadcaster fields empty for now; enter them in **Connections** after owner setup. `user` explicitly sends as the authorized creator account. The template's `bot` setting instead selects Kick's official bot delivery mode, whose channel/account availability must be verified. The developer app's name does not determine the sender identity.

## 3. Build and initialize

Compose's environment-file and host-data variables are **host shell variables**, separate from the runtime file. Re-enter them in each maintenance shell. The helper below consistently selects the same Compose project and domain proxy:

```sh
export KEKBOT_ENV_FILE=/srv/kekbot/runtime.env
export KEKBOT_HOST_DATA_DIR=/srv/kekbot/data
export KEKBOT_SOURCE_REF="$(git rev-parse HEAD)"
export KEKBOT_DOMAIN=kekbot.example
dc() { docker compose -p kekbot -f compose.yaml -f compose.proxy.yaml "$@"; }
dc config --quiet
dc build
dc run --rm --no-deps kekbot node src/cli.ts init
```

The image pins Node/pnpm and runs as UID/GID **1000**. Source builds need no host Node installation. `init` creates/migrates the database and creates keys/tokens without replacing existing keys. It prints paths, never their contents. The standard database is `/data/live/kekbot.sqlite` inside the container and `/srv/kekbot/data/live/kekbot.sqlite` on this host.

The initial encryption key is `/srv/kekbot/data/live/secrets/encryption.key`. Protect an independent copy before relying on backups. The key is a separate file and is excluded from database/asset backups. [Configuration](CONFIGURATION.md#secrets-and-storage) explains separate key mounts; [recovery](BACKUP_RECOVERY.md) explains their use.

## 4. Start and verify HTTPS

```sh
dc up -d
dc ps
curl --fail --silent --show-error https://kekbot.example/api/health/live
curl --fail --silent --show-error https://kekbot.example/api/health/ready
dc exec kekbot node src/cli.ts doctor
```

Allow initial certificate issuance/startup time before treating a readiness failure as a fault. Expect HTTP 200 from both health endpoints, container status healthy and database integrity `ok`. Check `dc logs --tail=100 kekbot proxy` locally if needed. **Do not use `curl -k` or bypass certificate validation.** These checks establish startup, not live provider acceptance.

Caddy certificate/configuration state persists in Compose volumes. Keep those volumes across rebuilds and restarts; do not use `down -v` during routine maintenance. The app binds only to host loopback `127.0.0.1:3000`; Caddy connects over the private Compose network. The examples do not enable access logging because OBS URLs contain read tokens.

## 5. Claim the owner account

On the trusted host, read the setup-token file at the path reported by `init` (host default `/srv/kekbot/data/live/secrets/setup.token`). Use a local protected terminal/editor; never paste the token into a public issue or record it in the checkout.

Open **your final HTTPS origin** in a browser. On **Claim this installation**, enter the token and choose a username (3–32 characters: letters/numbers, `_`, `-`, `.`; first character alphanumeric) and password (12–256 characters). Select **Create owner account**. Usernames are stored lowercase. There are no default live credentials or registration for a second owner.

The token expires after one hour. If the host is unclaimed, stop KekBot with `dc stop kekbot`, rerun the `init` command, then `dc up -d`. A claimed owner uses [host recovery](BACKUP_RECOVERY.md#recover-the-owner), not setup renewal.

## 6. Connect and run your first session

1. Follow [Kick setup](PROVIDERS.md#kick) to create your app, resolve the creator ID, authorize and subscribe.
2. Optionally connect [Discord](PROVIDERS.md#discord) and [YouTube](PROVIDERS.md#youtube).
3. Create a command and preview it, then send it in **the configured creator's Kick chat**. Verify the actual reply identity and delivery outcome.
4. Add [OBS sources](OBS.md) and test an alert/media request explicitly before relying on them on stream.
5. Invite trusted operators with the appropriate [roles](USER_GUIDE.md#accounts-and-permissions).
6. Create and restore a [backup](BACKUP_RECOVERY.md), and review [daily operations](OPERATIONS.md).

Keep proof controls disabled for normal use. The [live campaign](LIVE_ACCEPTANCE.md) defines the outstanding release checks; a successful install or OAuth screen alone does not complete them.

Follow the [first-session walkthrough](FIRST_SESSION.md) for concrete starting values and expected results. At the end you should have one verified command, a deliberately configured timer, an OBS manual alert and a tested recovery checkpoint. Optional modules can remain disabled while these work.

## Returning to the installation

Keep your private operator record with the source SHA, image ID, data root, runtime file, proxy choice, external mounts and independent-key location. In every new maintenance shell, `cd /srv/kekbot/source`, repeat the exports and define `dc` exactly as in step 3 (including any private overrides). The helper is a shell function, not a globally installed command.

Use `dc ps` and `dc exec kekbot node src/cli.ts doctor` for status. Use `dc stop kekbot` and `dc up -d kekbot` for a clean stop/start. Do not rerun setup, seeding or clone over a working installation. Environment edits require recreation; dashboard edits usually do not. [CLI reference](CLI.md) and [operations](OPERATIONS.md) cover maintenance.

### Installation checkpoint

| Check | Expected result | If it fails |
| --- | --- | --- |
| Public HTTPS health requests | HTTP 200 with trusted certificate | Check DNS/ports/proxy/clock; never disable validation |
| Container | Healthy, non-root user, persistent `/data` mount | Inspect bounded logs and UID/GID permissions |
| Owner claim | Your local owner can sign in; claim cannot repeat | Check token expiry/origin; use recovery once claimed |
| Background work | Processes with dashboard closed | Check jobs enabled and instance lease/readiness |
| Persistence | Settings survive container restart | Verify the same project/data root on both starts |
| Backup recovery | Separate target restores records/assets with original key | Follow empty-target ordering and inspect checksum errors |

Installation-specific checks belong in private operator evidence. A new host still needs actual provider permissions, OBS delivery and certificate-renewal verification.

## Public-IP HTTPS variant

Use this variant **instead of** the domain override. Source/data/configuration/owner steps remain the same. Set `KEKBOT_PUBLIC_URL` in the private runtime file to `https://<PUBLIC_IPV4>` and replace this placeholder with your actual public address:

```sh
export KEKBOT_PUBLIC_IP='<PUBLIC_IPV4>'
dc() { docker compose -p kekbot -f compose.yaml -f compose.ip.yaml "$@"; }
dc config --quiet
dc build
dc run --rm --no-deps kekbot node src/cli.ts init
dc up -d
```

Verify both HTTPS health endpoints using that numeric origin with normal certificate validation. Register that exact origin's provider callback paths. A historical Kick IP callback proof passed; the current full product and other providers still need their live checks.

The example pins Caddy 2.11.6 and Let's Encrypt's `shortlived` ACME profile. [IP certificates last approximately six days](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability); automated renewal, persistent certificate volumes and continuous certificate-validation reachability are essential. Actual renewal is a pending operational acceptance gate. Certificate transparency makes the certified address public. Never switch between domain/IP configurations without deliberately updating the public origin and provider callbacks.

## Existing reverse proxy

Use the base `compose.yaml` without either Caddy override and forward your HTTPS origin to loopback port 3000. Keep TLS verification enabled, preserve original provider request bodies, allow 64 KiB on `/api/providers/*` and 12 MiB on application routes, and disable caching/buffering for SSE. Preserve `Origin` and streaming behavior. Avoid URL/query logging for widget routes. The checked [Caddy file](../deploy/Caddyfile) is a reference; custom proxies require their own validation.

For restarts, backups, relocation, upgrades and rollback, continue with [operations](OPERATIONS.md) and [backup/recovery](BACKUP_RECOVERY.md). For errors, see [troubleshooting](TROUBLESHOOTING.md).
