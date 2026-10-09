# KekBot documentation

**New here? Start with [Get your first KekBot running](GETTING_STARTED.md).** It explains the server, the short install command, each normal choice and your first login. You can add features gradually. [Plain-English glossary](GLOSSARY.md).

The latest published application is [v0.1.0-beta.3](https://github.com/DangerMouseUK/kekbot/releases/tag/v0.1.0-beta.3). The simplified launcher on `main` is newer than that release's original tools. Guides identify those differences; historical releases and their verification records remain unchanged. Full live/stable acceptance is pending.

## Start here

| I want to… | Read next |
| --- | --- |
| Install my first bot | [Getting started](GETTING_STARTED.md) → [Connect Kick](PROVIDERS.md#kick) → [First session](FIRST_SESSION.md) |
| Try a demo first | [Guided Linux demo](GETTING_STARTED.md#try-a-demo-first), [Windows/macOS demo](DOCKER_DESKTOP.md), or [developer demo](QUICKSTART.md) |
| Set up a command or timer | [First session](FIRST_SESSION.md) → [User guide](USER_GUIDE.md) |
| Add alerts or video to OBS | [OBS and media](OBS.md) |
| Invite a moderator | [Accounts and permissions](ACCOUNTS.md) |
| Update, stop or remove the bot | [Return to the management menu](GETTING_STARTED.md#come-back-later) → [Updating](UPDATING.md) or [Uninstalling](UNINSTALLING.md) |
| Back up, move or recover | [Backup and recovery](BACKUP_RECOVERY.md) |
| Solve a problem | [Troubleshooting](TROUBLESHOOTING.md) |
| Use a custom version or hosting layout | [Advanced launcher options](LAUNCHER.md) and [installer reference](INSTALLER.md) |
| Contribute | [Contributing](../CONTRIBUTING.md) |

## Operator and user guides

Read the page for the task you are doing. You do not need to read this whole list before installing.

- [Getting started](GETTING_STARTED.md): beginner server-to-dashboard walkthrough.
- [Glossary](GLOSSARY.md): everyday explanations of technical terms.
- [First session](FIRST_SESSION.md): one command, a cautious timer and an OBS alert before extra modules.
- [Provider setup](PROVIDERS.md): Kick application/identity, optional Discord and YouTube, and real-delivery checks.
- [User guide](USER_GUIDE.md): commands, timers, moderation, goals, community activities and analytics.
- [OBS and media](OBS.md): private sources, themes, video requests, approval, audio and playback recovery.
- [Accounts](ACCOUNTS.md): owner setup, invitations, permissions, login and access removal.
- [Updating](UPDATING.md), [uninstalling](UNINSTALLING.md) and [operations](OPERATIONS.md): everyday host maintenance and safe failure handling.
- [Backup and recovery](BACKUP_RECOVERY.md): snapshots, separate keys, restoring and owner recovery.
- [Troubleshooting](TROUBLESHOOTING.md): symptoms, first checks and safe support reports.
- [Beta guide](BETA.md): evaluation limits, published version choices and feedback.

## Installation alternatives and references

These pages support advanced needs; recommended setup handles the usual defaults for you.

- [Launcher reference](LAUNCHER.md): every action/flag, custom sources, inspection and versioned downloads.
- [Installer reference](INSTALLER.md): every host choice, private file layout, HTTPS and recovery rules.
- [Manual installation](INSTALLATION.md): manage your own source, Docker Compose and proxy configuration.
- [Docker Desktop](DOCKER_DESKTOP.md): local Windows/macOS evaluation with Linux containers.
- [Source quickstart](QUICKSTART.md): contributor/local demo with pinned Node and pnpm.
- [Configuration](CONFIGURATION.md): environment variables, paths, secrets and precedence.
- [Dashboard fields](CONFIGURATION_FIELDS.md) and [JSON examples](examples/README.md): field names, defaults, units, limits and matching behavior.
- [CLI reference](CLI.md): application maintenance commands and host-tool selectors.

## Contributor and maintainer references

- [Contributing](../CONTRIBUTING.md), [agent instructions](../AGENTS.md) and [documentation maintenance](DOCUMENTATION.md).
- [Architecture](ARCHITECTURE.md), [HTTP API](API.md) and [control actions](API_ACTIONS.md).
- [Host lifecycle implementation](../installer/README.md) and [runtime image](RUNTIME_IMAGE.md).
- [Testing](TESTING.md), [live acceptance](LIVE_ACCEPTANCE.md), [release readiness](RELEASE_READINESS.md), [evidence index](release-evidence.json) and [releasing](RELEASING.md).
- [Dependency maintenance](DEPENDENCY_MAINTENANCE.md), [dependency inventory](DEPENDENCIES.md) and [supplemental licenses](../licenses/README.md).
- [Security reporting](../SECURITY.md), [changelog](../CHANGELOG.md) and [MIT license](../LICENSE).

## Product plans and historical evidence

These explain plans and recorded results; they are not the normal install instructions.

- [Milestones](MILESTONES.md), [roadmap](ROADMAP.md) and [quality follow-up](QUALITY_HARDENING.md).
- [PRD](PRD.md) and [identical self-hosted PRD](PRD-self-hosted.md): product requirements.
- [Foundation proof](FOUNDATION.md): historical Milestone 1 evidence and opt-in diagnostics.
- Published release records: [beta 3](releases/v0.1.0-beta.3.md), [beta 2](releases/v0.1.0-beta.2.md), [beta 1](releases/v0.1.0-beta.1.md). For beta 1's old HTTPS installer, use its [specific workaround](INSTALLER.md#beta-1-bundled-https-installer-fix).

## Which record answers which question?

| Question | Record |
| --- | --- |
| How do I install and use today's repository launcher? | Getting started and the task guides above |
| What is different in the published beta? | Its release notes and the beta guide |
| What does a field, command or permission mean? | The matching reference and glossary |
| What should the product eventually do? | The identical PRDs |
| What has actually passed? | Dated milestone/release evidence tied to exact source/image identities |
| What still blocks stable release? | Release readiness, evidence JSON and the live acceptance runbook |

The current database schema is 3; backup/configuration formats are 1. A passing documentation or CI check does not prove real provider/OBS delivery, public certificate renewal or independent installation. Examples use synthetic identities and reserved addresses. Keep actual credentials, private source URLs, databases and setup records out of Git and public reports.
