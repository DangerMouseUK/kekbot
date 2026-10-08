# Guided installation and host management

Use the **interactive terminal wizard** to install one KekBot instance on Linux x86-64. It also provides updates, rollback, status, start/stop and uninstall. Every change has an explained review and typed confirmation. Application/module settings and provider consent continue in the browser after owner setup.

KekBot is still a development candidate. **There is no stable release yet.** Latest stable is the wizard's default, and fails with an explanation until an accepted stable release is published. Choose a reviewed branch/PR/commit or candidate bundle explicitly for evaluation. Automated fixture testing does not establish an independent installer or real-provider acceptance.

[All documentation](README.md) · [Manual installation](INSTALLATION.md) · [Updating](UPDATING.md) · [Uninstalling](UNINSTALLING.md)

**On this page**

- [Before you start](#before-you-start)
- [Start the wizard](#start-the-wizard)
- [Installation choices](#installation-choices-explained)
- [Sources and formats](#sources-and-distribution-formats)
- [Created files](#what-gets-created)
- [Finish setup](#recognize-success-and-finish-setup)
- [Failure recovery](#failure-and-interruption-recovery)

## Before you start

| Requirement | Why / how to check |
| --- | --- |
| Always-on Linux x86-64 host | Ubuntu 24.04 LTS is the CI platform; `uname -m` should be `x86_64`. Native ARM64 and Windows/macOS host management are unsupported. |
| Python 3.10 or newer | `python3 --version`; standard library only, no pip packages or host Node/pnpm required. Ubuntu 24.04 includes a suitable Python. |
| Git | `git --version`; used to resolve branches/PRs/commits and download public source. |
| Local Docker Engine and Compose v2 | `docker version` and `docker compose version`; install using [Docker's official Ubuntu instructions](https://docs.docker.com/engine/install/ubuntu/). Remote daemon contexts are rejected because bind paths would refer to another host. |
| Trusted administrator | The reviewed tool runs with `sudo` to protect runtime files and give the non-root application UID/GID 1000 its data directory. Docker/root access grants host authority. |
| Local persistent disk and free resources | SQLite needs local storage, one application runtime and space for images, assets, snapshots and recovery roots. Source builds need extra RAM/network/time; 2 vCPU / 2 GiB remains an unaccepted runtime target. |
| HTTPS for live operation | Your domain or public IPv4, reachable provider callbacks, and TCP 80/443 for bundled Caddy. DNS, SSH, firewall and OS/Docker installation remain your responsibility. |

For Windows/macOS evaluation use [Docker Desktop](DOCKER_DESKTOP.md), or [source quickstart](QUICKSTART.md). For an existing manually installed instance, keep the [manual maintenance path](BACKUP_RECOVERY.md#upgrade-and-rollback); the wizard does not adopt or overwrite it.

## Start the wizard

Run these in **Bash on the Linux host**, from a directory for public source checkouts. Keep that checkout outside the installation directory:

```sh
git clone https://github.com/DangerMouseUK/kekbot.git kekbot-tools
cd kekbot-tools
git rev-parse HEAD
python3 -B installer/kekbot.py --help
```

Review the checked-out tool and its CI before granting root/Docker access. To pin the tool itself, use `git switch --detach REVIEWED_FULL_SHA` with a reviewed full commit. The wizard's **application version selection is separate** from this tool checkout; selecting a PR does not replace the running management code.

```sh
sudo python3 -B installer/kekbot.py
```

The scrolling, numbered text interface works over SSH without a desktop, terminal mouse or third-party UI library. Press Enter to accept the displayed choice. Type `q`, `quit` or `cancel` at any prompt to abandon that walkthrough and return to the main menu. `Ctrl+C` exits; interrupted changes require status/recovery inspection. There is no unattended `--yes` mode or pipe-to-shell bootstrap.

The menu offers **Install**, **Update**, **Inspect status**, **Start or resume**, **Stop**, **Roll back**, **Uninstall** and **Exit**. `--action` opens a particular walkthrough; `--root` supplies an existing managed root. Both still require an interactive terminal and confirmation for changes:

```sh
sudo python3 -B installer/kekbot.py --action install
sudo python3 -B /srv/kekbot/tool/kekbot.py --root /srv/kekbot --action status
```

`--help` prints syntax without root, Docker or an interactive terminal. The main menu checks the host prerequisites before continuing. Failed explicitly selected actions exit unsuccessfully; cancellation returns without applying further work.

## Installation choices, explained

| Prompt | Default / options | What the choice means |
| --- | --- | --- |
| Use | Live; fixture | Live uses owner-controlled real integrations. Fixture generates a random demo login and synthetic data, binds loopback HTTP and prevents live provider mutations/media. Mode is not changed by an update. |
| Directory | `/srv/kekbot` | New, dedicated absolute directory outside the tool checkout. Existing paths, source overlap and symlink paths are refused. Avoid network/cloud-synced storage. Everything below this root belongs to this managed installation. |
| Project | `kekbot` | Docker Compose namespace. Alternatives start `kekbot-`, then lowercase letters/numbers/hyphens. Existing project resources/certificate volumes are refused. |
| Application port | `3000` | Unused host loopback port, 1024–65535. Container still listens internally on 3000. This is never published on all interfaces. |
| HTTPS | Domain Caddy; IPv4 Caddy; external proxy | Domain/IP modes own public ports 80/443 and persistent certificate volumes. External mode leaves the proxy to you and uses only the chosen loopback mapping. |
| Origin | Required for live | Exact HTTPS origin, no trailing slash/path/query/credentials. Domain/IP bundled modes use standard HTTPS port. External proxy may use an explicit HTTPS port. |
| Chat identity | Authorized account; official bot | `user` sends as the account granting Kick access. `bot` selects provider-supported official bot delivery. Developer app name does not establish sender identity. Verify a real reply. |
| Version | Latest stable; release; branch; PR; commit; local bundle | See the format/source table below. All choices become fixed identities before review. |
| Apply | No automatic acceptance | Review directory, project, mode, origin, port, version, SHA and format, then type `APPLY`. Development/unaccepted code first requires `TRUST <first 12 SHA characters>`. |

For multiple instances, use separate directories, project names, application ports, applications and data. Only one bundled proxy can occupy public 80/443; use a shared external HTTPS proxy for additional origins. The wizard does not edit an existing proxy or host ports/firewall.

### Domain, IPv4 and external proxy

**Domain:** point your hostname's DNS at the host and route 80/443 before starting. Caddy obtains/renews trusted certificates and keeps storage in `<project>-certificates` and `<project>-certificate-config` volumes. Avoid broken IPv6 DNS records.

**IPv4:** enter an actual public IPv4 HTTPS origin. The pinned Caddy 2.11.6 build uses Let's Encrypt's short-lived profile, with certificates lasting approximately six days; renewal and continuous certificate-validation reachability are essential. Provider acceptance and actual renewal remain live checks. See [IP hosting](INSTALLATION.md#public-ip-https-variant).

**External:** configure trusted HTTPS forwarding to `127.0.0.1:<chosen port>`, uncached/unbuffered SSE, original signed request bodies and suitable request limits. See [proxy requirements](INSTALLATION.md#existing-reverse-proxy). Local container readiness does not prove this proxy works.

## Sources and distribution formats

| Selection | Input | Supported format / resolution |
| --- | --- | --- |
| Latest stable (default) | None | GitHub's latest published non-prerelease, plus this project's accepted stable metadata. Default is the prebuilt Linux amd64 image. No automatic fallback to `main`. |
| Specific release | Exact published tag | Explicit prereleases/candidates allowed with trust acknowledgement. Choose prebuilt image or source build. |
| Branch | Existing name, e.g. `main` | Fetch the official repository ref, pin full commit, archive public source, build with Docker. |
| Pull request | Positive number, without `#` | Fetch official `refs/pull/NUMBER/head`, including fork contributions. Builds the PR head, not GitHub's synthetic merge result. Pin and review exact SHA. |
| Commit | Full lowercase 40-character SHA | Fetch that exact commit; require matching identity; build source. |
| Local bundle | Absolute directory | Read `release.json`, `SHA256SUMS` and selected source/image/notices archives from trusted storage. Choose image or source explicitly. |

**Prebuilt image:** verify the project source archive and image/notices checksums, load the Docker image archive, then require the recorded immutable image ID, source/version labels, Linux amd64 platform, MIT/source labels and non-root user. It runs the distributed image rather than rebuilding it.

**Source build:** verify release source checksums (or pin a Git commit), extract only bounded ordinary files/directories, then build the checked-in Dockerfile with locked dependencies and provenance labels. Source builds execute selected code with Docker access and require network/resources. Resulting image bytes are not guaranteed to match a distributed accepted image. A source rebuild has its own verification responsibility.

Release bundles use the existing [packaging contract](RELEASING.md): `*-source.tar.gz`, optional `*-linux-amd64-image.tar.gz`, `*-notices.tar.gz`, `release.json`, `SHA256SUMS`. The installer supports release metadata v1, database schema 2 and backup format 1. Incompatible formats fail before applying. Automatic GitHub zip/tar source downloads alone lack this contract; raw registry tags, native `.deb`/`.rpm`/Windows packages and ARM64 are not supported installer formats.

Checksums detect missing/corrupted assets; they are **not a cryptographic publisher signature**. Obtain bundles from trusted project releases/operators. Latest stable additionally requires stable v1-or-later version and accepted-package metadata; its historical status field is named `acceptance-verified-unpublished` because packaging precedes publication. A published release must retain those exact audited assets. [GitHub's release API](https://docs.github.com/en/rest/releases/releases) resolves discovery; no GitHub token is requested or stored. Anonymous API rate limits fail with an explanation rather than weakening verification.

## What gets created

With the defaults, all private installation files stay outside source:

```text
/srv/kekbot/
  installation.json       Private version/image/data/checkpoint record
  compose.json            Generated Compose configuration; no embedded credentials
  runtime.env             Private runtime environment
  data/live/              SQLite, assets, separately generated secret files
  backups/                Database/asset snapshots; never encryption keys
  recovery/               New data roots created during rollback
  proxy/                  Reviewed pinned Caddy build/configuration
  tool/                   Copied management tool, independent of app version selection
```

Fixture mode uses `data/fixture`. The root/environment/record are protected for the host administrator. App data is owned by UID/GID 1000; the container runs non-root. Images are selected by immutable image ID and Compose never pulls a mutable tag automatically. Certificate volumes are separate Docker storage. No system service, cron job, firewall rule, SSH change or provider application is created; Docker's restart policy starts containers after daemon/host restart.

For a signed synthetic chat event on a managed **fixture** host, use the container's internal loopback port for this one CLI invocation. The browser origin keeps its chosen host port. Replace root/project if needed:

```sh
sudo docker compose -p kekbot -f /srv/kekbot/compose.json exec --env KEKBOT_PUBLIC_URL=http://127.0.0.1:3000 kekbot node src/cli.ts fixture-event
```

Expect HTTP status `200` with `accepted: true` from verified intake and a succeeded simulated reply in local diagnostics. The event sender does not contact Kick. Do not change a live runtime into fixture mode or use this invocation as proof of live delivery.

The wizard fixes normal safe runtime choices: jobs enabled, proof controls off, framework telemetry off, local data and default separate key/proof files. Provider bootstrap secrets stay empty; owners enter integration credentials through encrypted **Connections** settings. [Configuration](CONFIGURATION.md), [dashboard fields](CONFIGURATION_FIELDS.md) and [accounts](ACCOUNTS.md) explain every remaining runtime/module/permission option.

Do not hand-edit `installation.json` or generated `compose.json`. Changing mode, data/key paths, project or proxy topology underneath the tool invalidates its recovery assumptions. Custom secret mounts/topologies use the manual deployment procedure; do not mix its `dc` helper with managed Compose. Ordinary environment edits require deliberate recreation and provider validation; keep the public origin aligned with the recorded topology. There is no automatic adoption/migration of a manual installation.

## Recognize success and finish setup

The wizard reports healthy container readiness and database integrity, then shows **file paths only** for the setup token or fixture login. It never prints credentials. For live mode:

1. Verify public TLS normally: `curl --fail https://YOUR_ORIGIN/api/health/ready`, substituting the actual origin. Never use `-k`.
2. Privately read the reported `setup.token`; open the final origin, **Claim this installation**, choose your local owner login. The token expires in one hour. If it expires, use [stopped-host initialization](CLI.md#init) to renew only an unclaimed installation.
3. Follow [provider setup](PROVIDERS.md), which explains account creation, finding IDs, exact callbacks, scopes and actual-delivery checks. Consent remains in official provider/browser flows; the terminal does not ask for app secrets.
4. Follow [first session](FIRST_SESSION.md) and [OBS](OBS.md), then invite operators using [accounts](ACCOUNTS.md). All editable choices have a [field reference](CONFIGURATION_FIELDS.md).
5. Keep an independent protected copy of the original encryption key and rehearse [backup/recovery](BACKUP_RECOVERY.md). Protect provider grants and source URLs; no raw setup records belong in Git/issues.

Container startup alone does not prove public certificates, callbacks, actual chat identity, Discord, OBS, autoplay or renewal. Record those separately through [live acceptance](LIVE_ACCEPTANCE.md).

## Failure and interruption recovery

| Situation | Safe next action |
| --- | --- |
| No stable release / unknown tag / API limit | Nothing was installed. Retry later or explicitly choose reviewed development/candidate input. Never substitute an unofficial image. |
| Checksum/unsafe archive/identity mismatch | Stop; obtain a trusted intact bundle. Do not bypass checks. |
| Image build/load fails before update stop | Current app/data are untouched. Check disk/network/resources and selected source/CI. |
| Fresh install fails | Private root is retained; do not delete keys blindly. Inspect status and prerequisite/port/permission conditions. `Start` can resume only when initialization/doctor already succeeds; otherwise recover manually or choose a new directory. |
| Update backup fails | No migration was attempted. Roll back resumes the old version against original storage; inspect backup/storage before retrying. |
| Migration/startup fails or Ctrl+C interrupts update | App remains stopped when cleanup can run. Inspect status; choose **Roll back**. It restores a completed pre-update snapshot into a new root with the original keys, and leaves failed storage intact. |
| Rollback fails | Preserve checkpoint/data/key files; inspect disk, old-image availability, manifest and permissions. Retry rollback or use manual empty-target recovery. Do not start older code against newer storage. |
| Second lifecycle command | Exclusive lock rejects concurrent management. Wait for the first command; do not delete its lock while it is running. |
| Purge refuses a symlink/mount or volume removal | Containers are removed, files remain. Inspect boundaries privately; never redirect deletion into another directory. |

Use the copied tool with `--root` for returning maintenance. `status` shows only recorded version/source/image/data/origin and container health, not environment values. The wizard suppresses subprocess bodies because builds/runtime diagnostics can contain private material. Inspect bounded application/proxy logs privately with the generated Compose file when needed; never post them without redaction. [Troubleshooting](TROUBLESHOOTING.md) covers provider/application boundaries.

For update order, checkpoint retention and recovery effects read [updating](UPDATING.md). For retained-data removal, purge and provider cleanup read [uninstalling](UNINSTALLING.md).
