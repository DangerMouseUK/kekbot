# KekBot

[![CI](https://github.com/DangerMouseUK/kekbot/actions/workflows/ci.yml/badge.svg)](https://github.com/DangerMouseUK/kekbot/actions/workflows/ci.yml)

[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Release](https://img.shields.io/github/v/release/DangerMouseUK/kekbot?include_prereleases)](https://github.com/DangerMouseUK/kekbot/releases)

**Your Kick chat, Discord team and stream tools, together in a dashboard you control.**

KekBot is a free, open-source bot for one creator and their moderators. Automate chat, display alerts in OBS, manage video requests, and run community activities. You host it yourself and keep your accounts, settings and data on your own server.

**Currently in beta:** [v0.1.0-beta.4](https://github.com/DangerMouseUK/kekbot/releases/tag/v0.1.0-beta.4) is available for evaluation, including the easier Recommended setup and beginner handbook. Full live testing and stable acceptance are still pending. [Beta status and limitations →](docs/BETA.md)

## Start here

| What would you like to do? | Start with |
| --- | --- |
| Install a bot for your channel | [Step-by-step getting started](docs/GETTING_STARTED.md) |
| Try the dashboard without real accounts | [Windows/macOS demo](docs/DOCKER_DESKTOP.md), [Linux guided demo](docs/GETTING_STARTED.md#try-a-demo-first), or [developer demo](docs/QUICKSTART.md) |
| Use an existing installation | [First session](docs/FIRST_SESSION.md) and [user guide](docs/USER_GUIDE.md) |
| Update, stop or remove your bot | [Manage your installation](docs/GETTING_STARTED.md#come-back-later) |
| Contribute code or documentation | [Contributing](CONTRIBUTING.md) |

New to servers or Docker? Start with the walkthrough. You do not need to understand the internals or read the developer references to install.

## Install on Linux

You need an **always-on Linux x86-64 server**, administrator access, and an internet connection. Ubuntu 24.04 LTS has optional guided prerequisite setup. For a live bot, you also need a public HTTPS address; the walkthrough explains domains and the public-IP alternative.

In your server's terminal, paste:

```sh
curl --proto '=https' -fsSLo install.sh https://raw.githubusercontent.com/DangerMouseUK/kekbot/main/install.sh &&
sudo bash install.sh
```

This downloads the current official launcher to a file and runs it with administrator access. Only run it if you trust the KekBot project. It asks before running downloaded installation tools or installing missing host packages.

Choose **Install a new instance → Recommended setup**. The wizard explains the remaining choices, checks downloads automatically, and shows a final review before you type `APPLY`. Recommended setup:

- Uses a published application image, so you do not need Node.js or to compile the app.
- Sets up standard storage and ports for one installation.
- Offers a live bot or a separate demo.
- Chooses latest stable when one exists. Until then, **trying a beta requires an explicit choice**.
- Keeps every custom version, build and hosting option under **Advanced setup**.

After installation, open the address shown by the wizard, create your local owner account, then connect Kick in your browser. Discord and YouTube can wait until you want them.

**[Follow the complete walkthrough →](docs/GETTING_STARTED.md)** · [Advanced installer options](docs/LAUNCHER.md) · [Manual installation](docs/INSTALLATION.md)

## What KekBot does

| For your stream | What you can configure |
| --- | --- |
| Chat automation | Commands, aliases, response pools, counters, cooldowns and scheduled messages |
| Alerts and presentation | Follow/subscription alerts, local images/sounds, goals, themes and 18 OBS source types |
| Video requests | Kick requests, dashboard or Discord approval, a visible YouTube player, and a persistent queue |
| Moderator tools | Chat rules, notes, escalation, incident presets and permission-controlled actions |
| Community activities | Points, estimated watchtime, rewards, polls, raffles and leaderboards |
| Your team | Local accounts, invitations, roles, Discord notifications and operator controls |
| Your data | Retention settings, exports, configuration transfer, backups and recovery tools |

These features are implemented and have automated fixture coverage; complete live acceptance is pending. [What has been tested →](docs/RELEASE_READINESS.md)

## How it fits together

KekBot runs as one application container on your Linux server. Docker manages that container; the installer handles its normal setup. SQLite stores the database on local persistent disk. A bundled Caddy proxy can provide HTTPS for secure browser access and provider callbacks.

You configure the bot through its web dashboard. OBS opens private source URLs supplied by KekBot. Optional Discord and YouTube integrations use applications or keys that you create and own. There is no project-operated relay, account subscription or billing service.

One installation serves **one creator**. ARM64, native Windows/macOS hosting, shared network-disk databases and multiple application replicas are not supported. Windows/macOS can run a local evaluation with Docker Desktop. [Hosting details →](docs/INSTALLER.md#before-you-start)

## Make it yours, one step at a time

1. **Connect Kick** and check one real reply in your channel. [Provider setup](docs/PROVIDERS.md)
2. **Add a welcome command**, then a cautious timer. [First session](docs/FIRST_SESSION.md)
3. **Add an OBS alert source** and test it. [OBS guide](docs/OBS.md)
4. **Invite your moderators** with only the access they need. [Accounts](docs/ACCOUNTS.md)
5. **Enable optional features** when you are ready. [User guide](docs/USER_GUIDE.md)
6. **Keep a backup and a separate recovery key.** [Backup and recovery](docs/BACKUP_RECOVERY.md)

You do not need to configure every module before using the bot.

## Documentation and help

The [documentation hub](docs/README.md) separates beginner walkthroughs, everyday tasks and technical references. Use the [glossary](docs/GLOSSARY.md) whenever a term is unfamiliar.

- **Installing:** [Getting started](docs/GETTING_STARTED.md), [advanced launcher](docs/LAUNCHER.md), [manual hosting](docs/INSTALLATION.md)
- **Using:** [First session](docs/FIRST_SESSION.md), [user guide](docs/USER_GUIDE.md), [OBS](docs/OBS.md), [accounts](docs/ACCOUNTS.md)
- **Maintaining:** [Updating](docs/UPDATING.md), [uninstalling](docs/UNINSTALLING.md), [backups](docs/BACKUP_RECOVERY.md), [operations](docs/OPERATIONS.md)
- **Finding a problem:** [Troubleshooting](docs/TROUBLESHOOTING.md), then [report an issue](https://github.com/DangerMouseUK/kekbot/issues)
- **Developing:** [Contributing](CONTRIBUTING.md), [architecture](docs/ARCHITECTURE.md), [API](docs/API.md), [testing](docs/TESTING.md)

Never attach passwords, keys, private OBS URLs, databases or unreviewed logs to an issue. Report vulnerabilities through [SECURITY.md](SECURITY.md).

## Project status and contributing

The [milestones](docs/MILESTONES.md), [roadmap](docs/ROADMAP.md) and [release readiness](docs/RELEASE_READINESS.md) record progress and remaining work. Passing automated tests does not establish real provider/OBS delivery, certificate renewal or independent installation. Historical release results stay tied to their original source and image.

Focused fixes, better explanations and beginner feedback are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) before making changes. Operators decide when to update; dependencies are maintained through reviewed release work.

## Ownership and license

KekBot and its built-in themes are [MIT licensed](LICENSE). Dependencies retain their own licenses; distributed packages include [third-party notices](docs/DEPENDENCIES.md). You are responsible for the rights to uploaded assets and requested media.

Provider credentials are encrypted using a separate installation key. Keep that key independently protected: database/asset backups do not contain it. Private source URLs and account sessions can be revoked. [Privacy and retention →](docs/OPERATIONS.md#privacy-and-retention)
