# KekBot documentation

These guides describe the unreleased `0.1.0-dev.0` candidate, SQLite schema 2, backup format 1 and configuration format 1. Full-product live acceptance remains pending. Commands and screen labels follow the current implementation; provider portals can change.

## Start here

| Your goal | Read in this order |
| --- | --- |
| Explore without provider accounts | [Quickstart](QUICKSTART.md) → [user guide](USER_GUIDE.md) |
| Host a live installation | [Installation](INSTALLATION.md) → [provider setup](PROVIDERS.md) → [OBS](OBS.md) → [operations](OPERATIONS.md) |
| Join a moderator team | [Accounts and permissions](USER_GUIDE.md#accounts-and-permissions) → the relevant daily workflow |
| Move, back up or recover a host | [Backup and recovery](BACKUP_RECOVERY.md) → [troubleshooting](TROUBLESHOOTING.md) |
| Develop or integrate | [Contributing](../CONTRIBUTING.md) → [architecture](ARCHITECTURE.md) → [API](API.md) → [testing](TESTING.md) |

## Operator and user guides

- [Quickstart](QUICKSTART.md): pinned tools, isolated fixtures, generated login, first command and shutdown.
- [Installation](INSTALLATION.md): source-built Linux container, external runtime files, domain/IP HTTPS and owner claim.
- [Configuration reference](CONFIGURATION.md): all supported environment variables, storage/secret paths and module defaults.
- [Provider setup](PROVIDERS.md): owner-controlled Kick app/identity, Discord installation/routing/permissions and YouTube metadata key.
- [User guide](USER_GUIDE.md): commands, timers, moderation, goals, points/rewards, polls/raffles and analytics.
- [OBS and media](OBS.md): private sources, widget types, visible playback, audio, approval and recovery behavior.
- [Operations](OPERATIONS.md): daily health, delivery reconciliation, privacy, exports and the CLI reference.
- [Backup and recovery](BACKUP_RECOVERY.md): stopped-host snapshots, keys, empty-target restore, owner recovery and upgrades/rollback.
- [Troubleshooting](TROUBLESHOOTING.md): symptoms, safe diagnostics and redacted support reports.

## Contributor and maintainer references

- [Contributing](../CONTRIBUTING.md) and [coding-agent instructions](../AGENTS.md).
- [Architecture decisions](ARCHITECTURE.md) and [HTTP/domain API](API.md).
- [Automated testing](TESTING.md) and [live acceptance campaign](LIVE_ACCEPTANCE.md).
- [Release readiness crosswalk](RELEASE_READINESS.md), [release evidence index](release-evidence.json) and [release procedure](RELEASING.md).
- [Dependency inventory](DEPENDENCIES.md), [supplemental licenses](../licenses/README.md) and [MIT license](../LICENSE).
- [Security reporting](../SECURITY.md) and [changelog](../CHANGELOG.md).

## Product plans and historical evidence

- [Milestones](MILESTONES.md): project sequence, dated evidence and remaining acceptance.
- [Roadmap](ROADMAP.md): requirements grouped by release capability and dependency.
- [PRD](PRD.md) and [identical self-hosted PRD](PRD-self-hosted.md): declared product scope. Update both together when requirements change.
- [Foundation proof](FOUNDATION.md): historical Milestone 1 results and opt-in diagnostic controls. Normal installation uses local accounts and the guides above.

All examples use placeholders or synthetic data. Keep actual addresses, credentials, source URLs, provider payloads and private operator records outside Git. Documentation changes must preserve the distinction between implemented, fixture-tested and live-tested behavior.
