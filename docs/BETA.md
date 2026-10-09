# Try the KekBot beta

This guide is for people evaluating `v0.1.0-beta.2`, including operators who have never used KekBot. Read the [release notes](releases/v0.1.0-beta.2.md) before choosing an installation. Return to the [documentation index](README.md).

**Beta 2 is in preparation.** Its tag/downloads become installable only after publication; [beta 1](releases/v0.1.0-beta.1.md) remains available meanwhile. Use **Specific release** explicitly once beta 2 is published. There is no registry image or supported stable release; `main` is not a frozen release.

**Beta 2 includes the bundled HTTPS installer correction.** New installs use its matching tool and application from one tag. The [beta 1 workaround](INSTALLER.md#beta-1-bundled-https-installer-fix) remains for the older immutable release.

**On this page**

- [What the beta means](#what-the-beta-means)
- [Choose an installation](#choose-an-installation)
- [Install the published beta](#install-the-published-beta)
- [Evaluate another reviewed candidate](#evaluate-another-reviewed-candidate)
- [Finish setup and test a workflow](#finish-setup-and-test-a-workflow)
- [Update, recover or remove](#update-recover-or-remove)
- [Send useful, safe feedback](#send-useful-safe-feedback)

## What the beta means

The beta includes the implemented Kick commands/timers, local accounts, Discord controls, alerts/OBS sources, YouTube request queue, moderation, community features and host lifecycle tools. It is intended to find installation and real-world workflow problems. [The notes](releases/v0.1.0-beta.2.md#included-in-this-beta) describe scope; the [user guide](USER_GUIDE.md) explains daily use.

Automated fixtures exercise these workflows without contacting live providers. Current full-product Kick → Discord → OBS delivery, public certificate renewal, independent installations and recovery onto another host still need live evidence. Each frozen source/image needs its own [image and binary-license review](RELEASE_READINESS.md#beta-2-review); beta 2 review is pending. Raw tooling/proxy findings remain visible alongside any exact verified remediation or not-affected basis. The historical Kick foundation proof applies to its original source only. Start on a disposable evaluation installation and keep a working recovery copy before using real data. Beta feedback does not automatically pass the [stable acceptance gates](RELEASE_READINESS.md).

## Choose an installation

| Goal | Path | Requirements and expected result |
| --- | --- | --- |
| Explore without provider accounts | [Fixture quickstart](QUICKSTART.md), then [first session](FIRST_SESSION.md) | Git, pinned Node/pnpm; generated local account and simulated delivery/playback |
| Evaluate on Windows or macOS | [Docker Desktop guide](DOCKER_DESKTOP.md) | Linux containers and a separate fixture volume; this is not native host installation |
| Evaluate the distributed Linux image | [Guided installer](INSTALLER.md) with **Specific release**, or **Local audited release bundle** for a trusted retained download | Linux x86-64, Python 3.10+, Git, Docker Engine/Compose; exact prebuilt image and private installation outside source |
| Build the beta yourself | Guided installer **Exact commit**, or [manual source/Compose installation](INSTALLATION.md) | Full reviewed candidate SHA, Docker and build resources; a rebuild has its own image identity |

The only prebuilt application format is a **Linux amd64 Docker image archive**. The audited source archive is a second option and builds with Docker. Native Windows/macOS executables, `.deb`/`.rpm`, ARM64 and a mutable registry `latest` image are not offered. No supported stable release exists; the wizard's **Latest stable** default deliberately fails instead of silently installing a beta.

<a id="after-publication"></a>
### Install the published beta

After beta 2 publication, from Bash on a Linux evaluation host, clone and pin its **tool** source:

```sh
git clone https://github.com/DangerMouseUK/kekbot.git kekbot-beta-tools
cd kekbot-beta-tools
git fetch origin tag v0.1.0-beta.2
git switch --detach v0.1.0-beta.2
git rev-parse HEAD
python3 -B installer/kekbot.py --help
```

Compare `git rev-parse HEAD` with the frozen source in the [verification record](releases/v0.1.0-beta.2.md#verification-record) and downloaded `release.json`. Review the tool and checks before granting host authority. Then:

```sh
sudo python3 -B installer/kekbot.py --action install
```

Choose **Isolated fixture evaluation**, a new root outside the checkout, **Specific release** → `v0.1.0-beta.2` → **Prebuilt Linux amd64 image**. Follow the [installer walkthrough](INSTALLER.md#installation-choices-explained) for remaining prompts. The wizard verifies source/image/notices checksums, version, platform, non-root user and the recorded image ID before applying. A published tag without the required audited assets is not installable through this path. Checksums detect corruption; they are not a publisher signature.

The wizard displays the version, full source SHA and selected format. Because a beta is unaccepted evaluation code, it requires `TRUST` followed by the first 12 characters of the reviewed source SHA, then a final `APPLY`. Cancel if its identities differ from the [published asset record](releases/v0.1.0-beta.2.md#candidate-assets). The tool checkout and application selection are independent; pin both deliberately.

For a source build, select **Build the release source** for the same release; the resulting image has its own identity. For manual source setup, pin the same tag and follow [installation](INSTALLATION.md) in full. GitHub's automatic zip/tar is not an audited installer bundle. Do not pipe a downloaded script into a root shell.

<a id="before-publication"></a>
### Evaluate another reviewed candidate

To test a later fix, pin its full reviewed 40-character SHA in the tool checkout:

```sh
git fetch origin FROZEN_FULL_SHA
git switch --detach FROZEN_FULL_SHA
git rev-parse HEAD
```

Review that source and its checks, then run the installer with **Exact commit** and the same full SHA; this builds source. A CI candidate bundle is a separate path: extract only the audited workflow artifact into its own directory and choose **Local audited release bundle** with the absolute directory containing `release.json` and `SHA256SUMS`. Select the desired source/image format and verify its own identities. Do not reuse the published beta's review for a later build. Only audited public bundles belong in workflow artifacts; installed data and generated credentials remain private.

## Finish setup and test a workflow

Fixture installations generate their own random account; the wizard reports its private account-file location. Live installations use a one-time owner setup token. There is no shared default password. Follow [first session](FIRST_SESSION.md) to sign in, configure a command, preview a timer and create a private OBS source.

For live evaluation, use a separate installation and owner-controlled provider applications. Follow [provider setup](PROVIDERS.md) for exact callbacks, scopes and identities, then [OBS/media](OBS.md). The installer does not create provider applications or complete consent. Fixtures cannot be switched into live mode by an update. Never reuse fixture signing material as a provider key.

Useful beta reports cover one repeatable journey:

- Fresh install, owner claim, sign-in, restricted account, restart and sign-in again.
- A command/timer edit, safe preview, real delivery when explicitly enabled, and an offline/paused case.
- A real media request, approval, visible playback, skip/end and restart with explicit moderator resume.
- A stopped-host database/asset backup, separate-root restore and inspection of preserved state.
- Update/rollback and retained-data uninstall/start using the [host lifecycle guides](UPDATING.md).

Record what actually ran. A successful preview does not mean a provider received anything. Keep unknown provider deliveries unresolved until inspected; do not resend them just to obtain a passing result. Never run the synthetic load harness against live providers.

## Update, recover or remove

Read [updating](UPDATING.md) before an update. From Bash on a wizard-managed host:

```sh
sudo python3 -B /srv/kekbot/tool/kekbot.py --root /srv/kekbot --action update
```

Use your actual root if different. For beta 1 → beta 2, first fetch/review the beta 2 tool tag using the installation steps above, then run `sudo python3 -B installer/kekbot.py --root /srv/kekbot --action update` from that pinned checkout and choose **Specific release** → `v0.1.0-beta.2`. Keep that reviewed checkout for subsequent management; the application update does not overwrite the copied beta 1 tool. Explicitly select the intended beta release, full commit or audited bundle; accepting **Latest stable** does not select the beta. Keep the previous image, original encryption key and an independent database/asset backup. Schemas 1/2 migrate to 3; backup and configuration format remain 1. There is no downgrade SQL or promise that arbitrary older builds understand schema 3.

After restart, verify readiness, sign-in, accounts, connections, assets and queue state before resuming media. If an update fails, use status and [separate-root rollback](UPDATING.md#roll-back-after-failure-or-a-bad-update); do not force Start or Update around the recovery guard. Manual deployments use [manual recovery](BACKUP_RECOVERY.md#upgrade-and-rollback).

[Uninstall](UNINSTALLING.md) retains data by default. Purge is a separate destructive choice. Keep a recovery copy outside the installation before purging; external provider applications and consent are managed separately.

## Send useful, safe feedback

Use the repository's [bug report](https://github.com/DangerMouseUK/kekbot/issues/new?template=bug_report.md) or [documentation report](https://github.com/DangerMouseUK/kekbot/issues/new?template=documentation.md). Include:

1. `0.1.0-beta.2`, full source SHA and, for an image install, the recorded image ID. Say source build, prebuilt bundle or release selection.
2. OS/architecture, browser or OBS version, fixture/live mode and which guide/step you followed.
3. Small reproduction steps, expected result, actual result and whether restart changes it.
4. A minimal synthetic example or manually reviewed diagnostic summary, plus checks that did and did not run.

Inspect everything before posting. Do not attach environment/setup files, installation records, databases/backups, proof/source/player tokens, provider credentials, raw history, browser traces, screenshots with private URLs, host addresses or personal paths. Installer diagnostics are opt-in/private; even redacted output needs review. See [safe diagnostics](TROUBLESHOOTING.md) and [security reporting](../SECURITY.md). Report suspected vulnerabilities privately rather than publishing exploit details in a beta issue.
