# Get your first KekBot running

This beginner walkthrough takes you from a Linux server to your first dashboard login. Connect Kick next, then add Discord, video requests and other features at your own pace. [Documentation hub](README.md) · [Unfamiliar words](GLOSSARY.md).

The simpler setup is on `main`; published beta 3 tools keep their original prompts. You can install the published beta application using the current launcher without changing its release files. No supported stable release exists yet. [What beta means](BETA.md).

**In this walkthrough:** [what you need](#1-check-what-you-need) → [open the installer](#2-open-the-installer) → [choose settings](#3-follow-the-explained-choices) → [first login](#4-create-your-dashboard-account) → [connect Kick](#5-connect-one-thing-at-a-time). You can also [try a demo](#try-a-demo-first) or [manage an existing installation](#come-back-later).

## 1. Check what you need

- **A server that stays on:** Linux with an x86-64 processor. Ubuntu 24.04 LTS has optional guided prerequisite setup. The installer does not create or pay for a server.
- **Administrator access:** a login that can use `sudo`, or a root login. This allows the installer to manage Docker and protect private files.
- **A terminal connection:** SSH or your server provider's console. Windows Terminal/PowerShell, macOS Terminal and Linux terminals can all connect to a Linux server.
- **An address for your bot:** a domain such as `bot.example.com`, or the server's public IPv4 address. A domain is optional; the public-IP HTTPS alternative still needs its own provider/renewal checks.
- **For live use, a Kick account:** use the creator account whose chat you want the bot to serve. It does not have to be streaming during setup.

A container is the package Docker uses to run KekBot. You do not need to install Node.js or learn Docker commands for recommended setup. The guided prerequisite option can install Python, Git and Docker on Ubuntu 24.04 after explaining and confirming the changes.

Allow space for the application image, database, uploads and backups. Building source needs more resources. The 2 vCPU / 2 GiB runtime target has not passed reference-host acceptance; see [detailed requirements](INSTALLER.md#before-you-start).

### Prepare your public address

If you have a domain, add a DNS **A record** pointing its hostname to the server's public IPv4. Your domain provider supplies this control. Avoid an IPv6 record unless IPv6 routing works too.

For bundled HTTPS, allow inbound **TCP ports 80 and 443** in the server's firewall and any cloud firewall. These are the public web/certificate ports. Keep SSH access working. The installer does not change SSH, firewall rules or DNS.

KekBot's private application port stays local to the server. Do not expose port 3000 publicly. If another web server already owns ports 80/443, use [Advanced setup and an existing proxy](INSTALLER.md#domain-ipv4-and-external-proxy).

## 2. Open the installer

Connect to your Linux server first. You can use its provider console, or enter `ssh YOUR_SERVER_USER@YOUR_SERVER_ADDRESS` in a terminal on your own computer. Replace the placeholders with the login and address your server provider gave you. If SSH asks you to trust a host fingerprint, compare it with the fingerprint in your provider console. Commands entered after connecting run on the server.

Run this in **Bash on your Linux server**, from your home directory or another directory outside `/srv/kekbot`:

```sh
curl --proto '=https' -fsSLo install.sh https://raw.githubusercontent.com/DangerMouseUK/kekbot/main/install.sh &&
sudo bash install.sh
```

Copy both lines together. The second command only runs if the download succeeds. `sudo` may ask for your server login password; typed characters are normally hidden. This is your server password, not a new KekBot password. If you are already logged in as root and `sudo` is unavailable, use `bash install.sh` for the second line instead.

The command runs code supplied by this project with administrator access. Use it only if you trust the project. For manual inspection, checksums or a fixed launcher version, use [advanced verification](LAUNCHER.md#verify-a-versioned-launcher-download).

If the server says `curl: command not found`, on Ubuntu run `sudo apt-get update && sudo apt-get install curl ca-certificates`, then retry. Investigate download/certificate failures rather than bypassing them. Do not run an old leftover file after a failed download.

## 3. Follow the explained choices

Press **Enter** to use a displayed default. Type **q** to cancel. Opening a menu or downloading the application does not install the application.

1. If prerequisites are missing on Ubuntu 24.04, read the package summary. Type `INSTALL PREREQUISITES` only if you want those packages installed. They remain on the server if you later remove KekBot.
2. Choose **Install a new instance**.
3. At **Open the guided setup?**, enter `y` to run the installation tools from the official project. Source details remain available, but you do not need to type a commit hash.
4. Choose **Recommended setup**.
5. Choose **Live creator installation** for a real bot, or see [Try a demo first](#try-a-demo-first).
6. For live installation, choose your HTTPS option. For bundled domain/IP hosting, enter your hostname or public IPv4; the wizard adds `https://`.
7. The installer checks published versions. When a stable release exists, recommended setup selects it. Currently it explains the beta and offers **Try v0.1.0-beta.3**. Select that option deliberately; pressing Enter chooses **Stop for now**.
8. Read **Review installation**. If the location, address and version are correct, type `APPLY`.

Recommended settings use `/srv/kekbot`, the Docker project name `kekbot`, local port `3000` and replies from the account that authorizes Kick. To change those, cancel and select **Advanced setup**. A second installation needs a different directory, project and port; only one bundled proxy can use public ports 80/443.

Downloads, image loading and the proxy build can take several minutes. The wizard checks the application's checksums and recorded image identity. It never asks for Kick/Discord/YouTube secrets in the terminal.

**Success looks like:** **KekBot is ready for browser setup**, your web address, and a private setup-token path. If it fails, keep private installation files and follow [installer troubleshooting](TROUBLESHOOTING.md#installer-and-first-login); do not blindly delete the directory and start over.

## 4. Create your dashboard account

Open the web address printed by the installer. Your browser must accept its HTTPS certificate normally; do not click through a certificate warning.

The first screen asks you to claim the installation. Read the setup-token file **privately on the server**. With the recommended live location:

```sh
sudo cat /srv/kekbot/data/live/secrets/setup.token
```

Copy that value into the setup screen and choose your local owner username/password. A password needs at least 12 characters. Keep the token out of screenshots, messages and issues. It expires after one hour; [owner setup](ACCOUNTS.md#claim-the-installation) explains renewal.

Your KekBot login is separate from your Kick login. Once claimed, the installation cannot be claimed again using that token.

Keep an independent protected copy of `/srv/kekbot/data/live/secrets/encryption.key`. It is needed to recover encrypted settings; database/asset backups exclude it. [Backup and recovery](BACKUP_RECOVERY.md).

## 5. Connect one thing at a time

Start with [Kick setup](PROVIDERS.md#kick). It explains creating your application, finding the required account ID, callback URLs and authorizing the correct creator. These steps happen in your browser; the installer cannot complete provider consent for you.

Check one reply in **your creator channel's chat**, then follow [your first session](FIRST_SESSION.md). Discord is optional. YouTube is needed only for real video requests. Leave moderation and extra modules disabled until you understand and test them.

## Try a demo first

Choose **Recommended setup → Isolated fixture evaluation** instead of Live. A fixture is a separate demo with made-up data: it sends no messages to Kick/Discord and does not load real YouTube.

The wizard prints a protected `fixture-account.json` path containing the generated login. With the default location, read it privately:

```sh
sudo cat /srv/kekbot/data/fixture/secrets/fixture-account.json
```

The demo address is `http://127.0.0.1:3000`. On a remote server that address refers to the server, not your laptop. Open a second terminal **on your own computer** and create an SSH tunnel:

```sh
ssh -L 3000:127.0.0.1:3000 YOUR_SERVER_USER@YOUR_SERVER_ADDRESS
```

Replace both placeholders with your existing server login details. Leave that terminal connected, then open **http://127.0.0.1:3000** in your computer's browser. If local port 3000 is busy, stop the other local app before using this exact walkthrough.

A demo database cannot be converted into a live database. Create a separate live installation with Advanced setup when ready. For a demo directly on Windows/macOS, use [Docker Desktop](DOCKER_DESKTOP.md).

## Come back later

For a newly managed default installation, run this **on the Linux server**:

```sh
sudo bash /srv/kekbot/tool/install.sh --root /srv/kekbot
```

Choose **Inspect status**, **Update an installation**, **Start or resume**, **Stop**, **Roll back the last update**, or **Uninstall**. It uses protected installed tools; routine management does not download new installer code. A custom installation uses its actual root. Older installations without a retained launcher can use the [Python manager](UPDATING.md#before-updating).

Updates create a recovery snapshot before migration. Uninstall keeps data by default; permanent deletion needs a separate explicit phrase. Keep an independent backup and the original encryption key before maintenance. [Updating](UPDATING.md) · [Uninstalling](UNINSTALLING.md) · [Recovery](BACKUP_RECOVERY.md).

## Need a different option?

Every previous source and hosting option remains available. Open **Advanced setup**, or use `sudo bash install.sh --advanced`. [The launcher reference](LAUNCHER.md#every-launcher-option) covers releases, branches, PRs, exact commits, local bundles, image/source builds, custom paths, existing proxies and private diagnostics.

[Next: your first session →](FIRST_SESSION.md) · [Help with a problem](TROUBLESHOOTING.md) · [Documentation hub](README.md).
