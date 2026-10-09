# KekBot documentation

These guides describe the published `0.1.0-beta.1` evaluation beta, SQLite schema 3, backup format 1 and configuration format 1. The retained beta has passed [image and binary-license review](RELEASE_READINESS.md#beta-remediation-review) and is [published as a prerelease](https://github.com/DangerMouseUK/kekbot/releases/tag/v0.1.0-beta.1). Full-product live and stable acceptance remain pending. Commands and screen labels follow the current implementation; provider portals can change.

## Start here

| Your goal | Read in this order |
| --- | --- |
| Explore without provider accounts | [Quickstart](QUICKSTART.md) → [first session](FIRST_SESSION.md) → [user guide](USER_GUIDE.md) |
| Evaluate or report a beta problem | [Beta guide](BETA.md) → [beta release notes](releases/v0.1.0-beta.1.md) |
| Host a live installation | [Guided installer](INSTALLER.md) (or [manual installation](INSTALLATION.md)) → [provider setup](PROVIDERS.md) → [first session](FIRST_SESSION.md) → [OBS](OBS.md) → [operations](OPERATIONS.md) |
| Update, roll back or remove | [Updating](UPDATING.md) → [uninstalling](UNINSTALLING.md); manual deployments use [recovery](BACKUP_RECOVERY.md) |
| Join a moderator team | [Accounts and permissions](ACCOUNTS.md) → the relevant [daily workflow](USER_GUIDE.md) |
| Move, back up or recover a host | [Backup and recovery](BACKUP_RECOVERY.md) → [troubleshooting](TROUBLESHOOTING.md) |
| Develop or integrate | [Contributing](../CONTRIBUTING.md) → [architecture](ARCHITECTURE.md) → [API](API.md) → [testing](TESTING.md) |

## Operator and user guides

- [Beta guide](BETA.md): publication status, source/bundle choices, supported evaluation platforms, testing, updates and safe feedback.
- [Quickstart](QUICKSTART.md): pinned tools, isolated fixtures, generated login, first command and shutdown.
- [Docker Desktop evaluation](DOCKER_DESKTOP.md): Windows/macOS Linux containers, private runtime files, named-volume fixtures and stop/resume.
- [Installation](INSTALLATION.md): source-built Linux container, external runtime files, domain/IP HTTPS and owner claim.
- [Guided installer](INSTALLER.md): explained Linux terminal walkthrough, every host/source/format choice, private layout and failure recovery.
- [Updating](UPDATING.md) and [uninstalling](UNINSTALLING.md): explicit version changes, pre-update checkpoints, separate-root rollback, retained-data removal and typed purge.
- [First session](FIRST_SESSION.md): a command, cautious timer, manual alert/source, delegation and recovery checkpoint.
- [Accounts](ACCOUNTS.md): role/capability matrix, claim, invitations, sessions and access removal.
- [Configuration reference](CONFIGURATION.md): all supported environment variables, storage/secret paths and module defaults.
- [Dashboard field reference](CONFIGURATION_FIELDS.md) and [JSON examples](examples/README.md): every schema field, default, bound, unit and matching behavior.
- [Provider setup](PROVIDERS.md): owner-controlled Kick app/identity, Discord installation/routing/permissions and YouTube metadata key.
- [User guide](USER_GUIDE.md): commands, timers, moderation, goals, points/rewards, polls/raffles and analytics.
- [OBS and media](OBS.md): private sources, widget types, visible playback, audio, approval and recovery behavior.
- [Operations](OPERATIONS.md): daily health, delivery reconciliation, privacy, exports and the CLI reference.
- [CLI reference](CLI.md): source/container invocation, arguments, application-state requirements, expected outputs and failures.
- [Backup and recovery](BACKUP_RECOVERY.md): stopped-host snapshots, keys, empty-target restore, owner recovery and upgrades/rollback.
- [Troubleshooting](TROUBLESHOOTING.md): symptoms, safe diagnostics and redacted support reports.

## Contributor and maintainer references

- [Contributing](../CONTRIBUTING.md) and [coding-agent instructions](../AGENTS.md).
- [Architecture decisions](ARCHITECTURE.md) and [HTTP/domain API](API.md).
- [Runtime image](RUNTIME_IMAGE.md): minimal container contents, musl compatibility, shell-free maintenance, proxy binary review and redistribution notices.
- [Host lifecycle implementation](../installer/README.md): standard-library Python boundary, state protocol and offline/real-Docker tests.
- [Action reference](API_ACTIONS.md): payloads, capabilities and availability by control surface.
- [Documentation maintenance](DOCUMENTATION.md): editorial rules, coverage and verification procedure.
- [Automated testing](TESTING.md) and [live acceptance campaign](LIVE_ACCEPTANCE.md).
- [Release readiness crosswalk](RELEASE_READINESS.md), [release evidence index](release-evidence.json) and [release procedure](RELEASING.md).
- [First beta release notes](releases/v0.1.0-beta.1.md): scope, compatibility, limitations and the frozen candidate verification record.
- [Dependency maintenance](DEPENDENCY_MAINTENANCE.md): exact pins, candidate audits, security patches and release sign-off.
- [Quality follow-up](QUALITY_HARDENING.md): the eight repository improvements and verification record.
- [Dependency inventory](DEPENDENCIES.md), [supplemental licenses](../licenses/README.md) and [MIT license](../LICENSE).
- [Security reporting](../SECURITY.md) and [changelog](../CHANGELOG.md).

## Product plans and historical evidence

- [Milestones](MILESTONES.md): project sequence, dated evidence and remaining acceptance.
- [Roadmap](ROADMAP.md): requirements grouped by release capability and dependency.
- [PRD](PRD.md) and [identical self-hosted PRD](PRD-self-hosted.md): declared product scope. Update both together when requirements change.
- [Foundation proof](FOUNDATION.md): historical Milestone 1 results and opt-in diagnostic controls. Normal installation uses local accounts and the guides above.

All examples use placeholders or synthetic data. Keep actual addresses, credentials, source URLs, provider payloads and private operator records outside Git. Documentation changes must preserve the distinction between implemented, fixture-tested and live-tested behavior.

## Which record answers which question?

| Question | Record |
| --- | --- |
| What should the product eventually do? | The identical PRDs |
| In what dependency order was it built? | Roadmap and milestone sequence |
| What evidence actually exists? | Dated milestone entries with exact source/run identities |
| What still blocks stable release? | Release readiness, machine-readable evidence and live runbook |
| How do I install/use today's code? | Task guides above; historical foundation instructions are not the normal setup path |

Provider-console details may change. Guides link official contracts; verify them again for a new live campaign. A documentation check proves local navigation and example/schema consistency, not external availability or usability acceptance by an independent installer.
