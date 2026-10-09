# Download, install and manage KekBot

Use this guide on an always-on **Linux x86-64 host**. The root [`install.sh`](../install.sh) launcher opens the explained Python lifecycle wizard without requiring a repository clone. It also checks prerequisites, offers optional Ubuntu 24.04 setup, and opens updates, rollback, status, start/stop and removal. For Windows/macOS evaluation use [Docker Desktop](DOCKER_DESKTOP.md). [All documentation](README.md).

The launcher is available as a [published beta 3 download](https://github.com/DangerMouseUK/kekbot/releases/tag/v0.1.0-beta.3), covered by `SHA256SUMS`, and in development source on `main`. Older beta tags do not contain it. Bootstrap, management tools and application have separate identities and trust checks. Pin both release selections deliberately; downloading tools does not pass live/stable acceptance.

**On this page**

- [Quick start](#quick-start)
- [Verify a versioned launcher download](#verify-a-versioned-launcher-download)
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
  https://github.com/DangerMouseUK/kekbot/releases/download/v0.1.0-beta.3/install.sh \
  --output install.sh &&
  curl --fail --location --proto '=https' --proto-redir '=https' \
    --max-time 60 --retry 2 \
    https://github.com/DangerMouseUK/kekbot/releases/download/v0.1.0-beta.3/SHA256SUMS \
    --output SHA256SUMS &&
  grep -E '^[a-f0-9]{64}  install[.]sh$' SHA256SUMS | sha256sum --check - &&
  less install.sh &&
  sudo bash install.sh --tool-release v0.1.0-beta.3
```

Use `q` to leave `less` after review. Run the final `sudo` command only when you trust the file; Ctrl+C interrupts instead. The `&&` chain stops on a failed download, launcher-checksum or review command. This quick check verifies `install.sh`; the wizard separately verifies the application bundle. [Full bundle verification](#verify-a-versioned-launcher-download) remains available. If `curl` is missing on Ubuntu 24.04, install it first with `sudo apt-get update` and `sudo apt-get install curl ca-certificates`. Resolve a download failure before execution; do not run an older or partial file accidentally. The URL pins the published beta 3 bootstrap; review that file and [verify its checksum](#verify-a-versioned-launcher-download) before granting administrator authority. The final command pins its management tools to the same release. It is not an independently signed installer. **Download to a file; do not pipe it to Bash.**

Choose **Install a new instance**. If prerequisites are missing, the launcher explains optional Ubuntu setup and requires `INSTALL PREREQUISITES`. Other Linux distributions require their own package setup. Existing working Docker installations are reused.

The launcher downloads only the required management scripts and proxy resources into a private temporary directory. It prints their full resolved commit, review link and local inspection directory. Review that exact code/CI, then enter the displayed `TRUST <first 12 SHA characters>` phrase. You can inspect the files in another SSH session or cancel and use [prepare-only mode](#review-and-pin-management-tools).

For a safe first evaluation, choose **Isolated fixture evaluation** in the Python wizard and **Specific release → v0.1.0-beta.3 → Prebuilt Linux amd64 image**. For a live creator, choose a separate live installation, HTTPS topology and owner-controlled integrations. There is no accepted stable release yet: **Latest stable** deliberately reports unavailable rather than selecting a beta.

## Verify a versioned launcher download

Published beta 3 bundles include `install.sh`, `release.json` and `SHA256SUMS` alongside the source/image/notices archives. Obtain the **complete audited bundle** from its [release page](https://github.com/DangerMouseUK/kekbot/releases/tag/v0.1.0-beta.3); GitHub automatic source downloads are separate. Beta 1/2 bundles remain supported and have no standalone launcher asset. Development `main`, branches/PRs and later candidates require their own reviewed full SHA and source/image evidence.

From Bash in the directory containing all downloaded assets, without sudo:

```sh
sha256sum --check SHA256SUMS && less install.sh
python3 -c 'import json; print(json.load(open("release.json"))["sourceRef"])'
```

Require every checksum to pass, including `install.sh`, and compare the full source SHA/image identity with the exact candidate or published verification record. Then inspect the script and the matching management code. Checksums detect corruption, not a compromised publisher; obtain the checksum file and notes from trusted project sources. Keep the download outside the installation root.

The launcher does not infer management or application selection from its filename. To pin both to that reviewed bundle, replace the placeholder with `release.json`'s full SHA and use the absolute bundle path:

```sh
sudo bash install.sh install --tool-commit REVIEWED_FULL_SHA \
  --bundle /srv/public-release-bundle --format image
```

Choose `--format source` to build the archived source instead. Management downloads still require their displayed `TRUST` phrase; the unaccepted beta application needs its own source trust and final `APPLY`. No downloaded manager runs just because its checksum passes. For a fully reviewed local source checkout, use `--local-tools /srv/kekbot-reviewed-source` instead of `--tool-commit`; local trust remains explicit. Keep the immutable SHA in private operator records. [Candidate evaluation](BETA.md#evaluate-another-reviewed-candidate) and [updates](UPDATING.md) explain older installations.

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
sudo bash install.sh install --tool-release v0.1.0-beta.3 --release v0.1.0-beta.3 --format image

# A reviewed development branch (resolved once to a full SHA)
sudo bash install.sh install --branch main

# PR head; replace 123 with the PR you actually reviewed
sudo bash install.sh install --pr 123

# Build the published release source instead of loading its image
sudo bash install.sh install --tool-release v0.1.0-beta.3 --release v0.1.0-beta.3 --format source

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
sudo bash install.sh update --root /srv/kekbot --tool-release v0.1.0-beta.3 --release v0.1.0-beta.3 --format image
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

The [dated launcher verification record](MILESTONES.md#downloadable-lifecycle-launcher--development-follow-up) identifies the tested source, CI campaign and local checks. It establishes automated behaviour, with the remaining boundaries below.

Mocked package setup tests do not establish a successful fresh-host Docker installation. The [beta 3 notes](releases/v0.1.0-beta.3.md#verification-record) distinguish frozen candidate checks, actual anonymous published downloads and Linux published-release lifecycle outcomes. A fresh Ubuntu prerequisite trial, public certificates, real providers, OBS and unaided installation need their own dated evidence. Published beta 1/2 results remain tied to their original source/image; no stable acceptance gate is inferred from launcher tests.
