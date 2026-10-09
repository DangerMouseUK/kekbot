# Download, install and manage KekBot

Use this guide on an always-on **Linux x86-64 host**. The root [`install.sh`](../install.sh) launcher opens the explained Python lifecycle wizard without requiring a repository clone. It also checks prerequisites, offers optional Ubuntu 24.04 setup, and opens updates, rollback, status, start/stop and removal. For Windows/macOS evaluation use [Docker Desktop](DOCKER_DESKTOP.md). [All documentation](README.md).

The launcher is a **development addition after beta 2**. After this change merges, download it from `main`; older beta tags do not contain it. The launcher can install the unchanged published beta 2 application using current reviewed management tools. It does not create a new release, replace beta assets, establish stable acceptance or deploy provider applications for you.

**On this page**

- [Quick start](#quick-start)
- [What happens next](#what-happens-next)
- [Host setup and readiness](#host-setup-and-readiness)
- [Every launcher option](#every-launcher-option)
- [Releases, development and source builds](#releases-development-and-source-builds)
- [Updates, recovery and removal](#updates-recovery-and-removal)
- [Review and pin management tools](#review-and-pin-management-tools)
- [Failures and cleanup](#failures-and-cleanup)
- [Verification limits](#verification-limits)

## Quick start

In **Bash on your Linux server**, from a directory outside the intended installation root, download and inspect the file:

```sh
curl --fail --location --proto '=https' --proto-redir '=https' \
  --max-time 60 --retry 2 \
  https://raw.githubusercontent.com/DangerMouseUK/kekbot/main/install.sh \
  --output install.sh
less install.sh
bash install.sh --help
bash install.sh --check
sudo bash install.sh
```

Use `q` to leave `less`. If `curl` is missing on Ubuntu 24.04, install it first with `sudo apt-get update` and `sudo apt-get install curl ca-certificates`. A download failure must be resolved before execution; do not execute an older or partial file accidentally. The URL tracks the bootstrap script on `main`; review that file before granting administrator authority. It is not an independently signed installer. **Download to a file; do not pipe it to Bash.**

Choose **Install a new instance**. If prerequisites are missing, the launcher explains optional Ubuntu setup and requires `INSTALL PREREQUISITES`. Other Linux distributions require their own package setup. Existing working Docker installations are reused.

The launcher downloads only the required management scripts and proxy resources into a private temporary directory. It prints their full resolved commit, review link and local inspection directory. Review that exact code/CI, then enter the displayed `TRUST <first 12 SHA characters>` phrase. You can inspect the files in another SSH session or cancel and use [prepare-only mode](#review-and-pin-management-tools).

For a safe first evaluation, choose **Isolated fixture evaluation** in the Python wizard and **Specific release → v0.1.0-beta.2 → Prebuilt Linux amd64 image**. For a live creator, choose a separate live installation, HTTPS topology and owner-controlled integrations. There is no accepted stable release yet: **Latest stable** deliberately reports unavailable rather than selecting a beta.

## What happens next

The wizard explains every installation choice: live/demo mode, new directory, Compose project, loopback port, domain/IP/external HTTPS, Kick sender identity, application source and distribution format. See [the complete prompt table](INSTALLER.md#installation-choices-explained). Enter accepts displayed defaults; `q`, `quit` or `cancel` cancels, and Ctrl+C interrupts.

There are separate trust boundaries: the downloaded Bash launcher; the selected management-tool code; and the selected application source/image. Application choices never silently replace the running management tool. Root/Docker authority permits host changes; the tool's final `APPLY` review describes the actual operation. Source branches/PRs can execute arbitrary build/application code: inspect the resolved SHA before trusting it.

After successful installation, read the generated private owner setup token (live) or random fixture account file at the reported path. Secrets are never printed by the launcher. Open the reported dashboard origin and follow [first session](FIRST_SESSION.md), [provider setup](PROVIDERS.md) and [OBS](OBS.md). Provider applications, consent, DNS and public connectivity remain deliberate owner tasks. Container health does not prove public TLS or real delivery.

New installations made with current management code retain `install.sh` beside the copied Python tool. After that, ordinary management works without fetching new tool code:

```sh
sudo bash /srv/kekbot/tool/install.sh --root /srv/kekbot
```

Replace `/srv/kekbot` with your actual root. Existing beta installations do not gain the launcher through an application update. Keep the downloaded file separately or use their copied Python tool until deliberately using current reviewed management code. Do not copy files into an existing tool directory during a running operation.

## Host setup and readiness

`bash install.sh --check` performs an offline report for Python 3.10+, Git, reachable Docker and Compose. It does not install packages, download tools, need a terminal or write diagnostics. Without sudo, a working root-only daemon may report unavailable; repeat `sudo bash install.sh --check` to distinguish permissions. The wizard additionally verifies local Linux amd64 Docker/context, protected paths and operational invariants.

`sudo bash install.sh --setup` offers package assistance **only on Ubuntu 24.04 x86-64**. The explained review lists missing Python/Git/curl/CA packages. If Docker is absent, it configures Docker's official HTTPS apt repository, installs Engine/CLI/containerd/Buildx/Compose and enables/starts Docker after explicit confirmation. Apt may update required dependencies; there is no `apt upgrade`. Existing Docker packages/services are left alone. Broken or partially configured Docker needs manual repair. [Docker's official instructions](https://docs.docker.com/engine/install/ubuntu/) explain the host prerequisites and networking consequences.

Conflicting Docker/container packages and pre-existing generic Docker repository files require manual review. The launcher never removes them or replaces arbitrary apt configuration. Its own repository files are `/etc/apt/sources.list.d/kekbot-docker.sources` and `/etc/apt/keyrings/kekbot-docker.asc`; they persist with host Docker after uninstall. Setup may leave installed packages/repository configuration after a failed apt operation: inspect those privately and retry, rather than purging Docker state.

No SSH, firewall, DNS, account/group or cloud infrastructure edits occur. Live HTTPS needs reachable 80/443 for bundled Caddy or a correctly configured external proxy. Source builds require more memory/time than loading the prebuilt application. Allow disk space for images, assets, backups and recovery roots. One runtime owns each local SQLite installation.

## Every launcher option

All actions remain interactive and retain their final review. No `--yes`, unattended update, automatic destructive removal or automatic beta fallback exists.

| Argument | Meaning |
| --- | --- |
| No action | Explained Install / Manage / Exit menu |
| `install` | New installation walkthrough; `--root` supplies its suggested directory, still reviewed |
| `update` | Choose a new application target, prepare it, stop/back up/migrate/check; does not self-update tools |
| `status` | Recorded installation/container state without printing credentials |
| `start`, `stop` | Start/resume the recorded instance or stop services while retaining state |
| `rollback` | Restore the previous image/checkpoint into a separate data root |
| `uninstall` | Keep-data removal by default; permanent purge needs its own explicit phrase |
| `menu`, `--action ACTION` | Open the full wizard, or the equivalent named action |
| `--root PATH` | Existing managed root; defaults to `/srv/kekbot` for named management actions. Manual deployments are not adopted |
| `--check` | Read-only host readiness; nonzero if requirements are missing |
| `--setup` | Separately confirmed Ubuntu prerequisite setup, then exit |
| `--prepare-only` | Download pinned tools without executing them; retain the private stage for inspection |
| `--stable` | Prefill latest accepted stable application selection |
| `--release TAG`, `--branch NAME`, `--pr NUMBER`, `--commit FULL_SHA`, `--bundle PATH` | Prefill one application source; normal source trust and final review still apply |
| `--format image\|source` | Prefill release/bundle distribution; branch/PR/commit builds must use source |
| `--tool-branch NAME`, `--tool-release TAG`, `--tool-pr NUMBER`, `--tool-commit FULL_SHA` | Explicitly choose new management code independently of the app; default is `main` for fresh installs |
| `--local-tools DIRECTORY` | Explicit reviewed checkout or copied Python tool directory; requires `TRUST LOCAL` before running |
| `--diagnostics-dir PATH` | Forward opt-in private bounded lifecycle metadata logging; no arguments, subprocess output or secret values |
| `--help`, `-h` | Print help without root, network, Docker or an interactive terminal |

Supply one application selector and one tool selector at most. Readiness/setup/prepare modes cannot also perform a lifecycle action. Quote paths containing spaces. Source shortcuts require the current Python manager; older copied tools still support interactive choices. To use shortcuts on older installations, explicitly select reviewed current tools, for example `--tool-branch main`.

## Releases, development and source builds

From the directory containing your reviewed downloaded launcher:

```sh
# Published beta application using current reviewed management tools
sudo bash install.sh install --release v0.1.0-beta.2 --format image

# A reviewed development branch (resolved once to a full SHA)
sudo bash install.sh install --branch main

# PR head; replace 123 with the PR you actually reviewed
sudo bash install.sh install --pr 123

# Build the published release source instead of loading its image
sudo bash install.sh install --release v0.1.0-beta.2 --format source

# Transferred audited bundle containing release.json and SHA256SUMS
sudo bash install.sh install --bundle /srv/public-release-bundle --format image
```

For exact source builds use `--commit REVIEWED_FULL_SHA`, replacing the placeholder with a full lowercase 40-character commit. Prebuilt image selection verifies checksums, source/version/platform/non-root labels and image ID. Source rebuilds create their own image identity. Automatic GitHub zip/tar downloads are not audited installer bundles. [Source and format details](INSTALLER.md#sources-and-distribution-formats).

## Updates, recovery and removal

From the directory holding your reviewed launcher, replace `/srv/kekbot` as needed:

```sh
sudo bash install.sh update --root /srv/kekbot
sudo bash install.sh status --root /srv/kekbot
sudo bash install.sh stop --root /srv/kekbot
sudo bash install.sh start --root /srv/kekbot
sudo bash install.sh rollback --root /srv/kekbot
sudo bash install.sh uninstall --root /srv/kekbot
```

These commands reuse protected installed tools without new tool downloads. If current management tools were used for installation, application shortcuts are available too:

```sh
sudo bash install.sh update --root /srv/kekbot --branch main
sudo bash install.sh update --root /srv/kekbot --release v0.1.0-beta.2 --format image
```

For an older manager, choose the application in its interactive menu, or explicitly review fresh tools:

```sh
sudo bash install.sh update --root /srv/kekbot --tool-branch main --branch main
```

Keep the pinned tool SHA you actually reviewed; `--tool-commit REVIEWED_FULL_SHA` makes future tool selection immutable. No application update overwrites the copied manager. Recovery uses current protected configuration, original encryption keys and the pre-update database/asset snapshot. Keep an independent recovery copy outside the installation; media stays paused after restart until moderator resume. [Update and rollback details](UPDATING.md).

Uninstall defaults to retaining database, assets, credentials, keys, backups, images, management code and certificate volumes. Purge is an additional deliberate choice that removes the managed root and named certificate volumes. It does not remove Docker or host packages, revoke provider grants, delete provider apps or change DNS. [Removal details](UNINSTALLING.md).

## Review and pin management tools

You can download management code without root or an interactive terminal:

```sh
bash install.sh --prepare-only --tool-branch main
```

The output gives a **full commit SHA**, private inspection directory and GitHub review link. No downloaded Python, application or management script executes. Inspect the staged `tools/installer/` and `tools/deploy/` files plus their commit/CI. Then pin that exact revision:

```sh
sudo bash install.sh install --tool-commit REVIEWED_FULL_SHA
```

Replace the placeholder. The separate application selection remains available in the wizard. Tool branch/tag/PR sources resolve once; commits must match exactly. Only allowlisted ordinary Git blobs are exported, with size bounds; links/submodules and missing resources fail before execution. New temporary tool stages are removed on ordinary exit or failure; prepare-only stages are retained for deliberate inspection and manual cleanup.

For a reviewed local checkout, run `sudo bash install.sh --local-tools /srv/kekbot-reviewed-source`. Local mode runs exactly that checkout after `TRUST LOCAL`; it does not fetch, authenticate or silently repair local edits. Treat it as operator-supplied executable code. The installed-tool path instead requires protected root-owned files/parents and refuses symlinks or writable tool paths.

## Failures and cleanup

| Symptom | Next step |
| --- | --- |
| Unsupported OS/CPU | Use Linux x86-64 hosting or the Windows/macOS container evaluation guide |
| No terminal / pipe-to-shell | Download the file, open an interactive SSH terminal, then run `sudo bash install.sh` |
| Missing prerequisites | Run `--check`; use confirmed `--setup` on Ubuntu 24.04 or follow your distribution's guides |
| Docker present but unavailable | Check administrator access, daemon/service and local context; setup does not replace/repair existing Docker |
| Tool fetch or TLS failure | Check Git/network/CA trust and the exact ref; do not disable certificate verification |
| Tool/source trust cancelled | No downloaded management code runs; ordinary private staging is removed |
| Old manager rejects shortcut flags | Choose interactively or explicitly use reviewed current tool code |
| Linked/writable installed tool | Stop and inspect ownership/paths privately; do not bypass the trust check or adopt a manual deployment |
| Update/start interrupted | Inspect recorded status and use [separate-root recovery](UPDATING.md#roll-back-after-failure-or-a-bad-update); never force Start past a failed-update guard |

The launcher saves no transcript or subprocess output. Lifecycle diagnostics remain opt-in, private and bounded. Prepare-only retains its reported private stage; remove that exact verified directory when no longer needed. Killing the process forcibly may leave an orphan `/tmp/kekbot-launcher.*` stage. Never remove the installation, keys or backups as temporary-download cleanup, and never run global Docker prune.

## Verification limits

Offline contracts cover selectors, quoting, invalid inputs, pinned/bounded staging, failed transport, links/missing files, trust/cancellation and wizard source prefill. Linux CI additionally exercises actual terminal dispatch and launches an audited fixture image through the real installer, then uses the retained launcher for status/stop/start alongside the existing update-failure/rollback/uninstall rehearsal. Raw credentials/transcripts stay private. See [testing](TESTING.md) and [readiness](RELEASE_READINESS.md).

Mocked package setup tests do not establish a successful fresh-host Docker installation. Full public download/discovery after merge, a fresh Ubuntu prerequisite trial, public certificates, real providers, OBS and unaided installation need their own dated outcomes. Published beta 2 evidence remains tied to its original source/image; this launcher does not pass any stable acceptance gate.
