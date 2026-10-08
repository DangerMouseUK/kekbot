# Operating KekBot

Use [installation](INSTALLATION.md) for initial deployment, [provider setup](PROVIDERS.md) for connections, [the user guide](USER_GUIDE.md) for dashboard workflows, and [OBS setup](OBS.md) for stream sources/media. This guide covers routine host operations and data handling for the unreleased candidate. Return to the [documentation index](README.md).

<!-- contents:start -->
**On this page**

- [Before a stream](#before-a-stream)
- [Host commands](#host-commands)
- [Delivery outcomes](#delivery-outcomes)
- [Privacy and retention](#privacy-and-retention)
- [Exports and configuration portability](#exports-and-configuration-portability)
- [Support and security](#support-and-security)
- [Diagnostic proof tools](#diagnostic-proof-tools)
- [Maintenance schedule](#maintenance-schedule)
- [Monitoring and ownership checklist](#monitoring-and-ownership-checklist)
<!-- contents:end -->

<a id="stream-checklist"></a>

## Before a stream

1. Check **Control room**: worker running, intended Kick creator authorized, expected player state.
2. In **Connections**, inspect scopes/connection state. Repair subscriptions if needed; configuration alone does not prove delivery.
3. Check **Maintenance → Delivery outcomes** for failed/uncertain work.
4. Review enabled timers/rules and any emergency pause. Preview changed commands/rules/alerts before relying on them.
5. Verify OBS sources, actual audio output, the single player and an approved queue. Resume media explicitly when appropriate.
6. Confirm recent verified backups and independent recovery keys exist.

KekBot processes jobs without the dashboard open. One runtime owns each installation's lease. Keep the server, local storage and proxy available; do not start a second replica on the same SQLite file.

### During and after a stream

During the session, watch failed/uncertain delivery and the player error state. Use timer pause or emergency moderation pause deliberately when necessary. Review target IDs/versions before moderation or queue decisions; other operators may be acting concurrently. An unavailable viewer sample is not a measured zero.

After the session, check the observed end state and analytics coverage. Review unresolved requests/redemptions, reconcile uncertain effects from actual provider evidence and leave playback paused if nobody is supervising it. Make a new stopped-host backup after significant configuration/state changes. Review expiring grants and retained viewer data before the next session.

## Host commands

The [installation guide](INSTALLATION.md#3-build-and-initialize) defines the `dc` helper, project name, proxy and private host variables. Use the same values in every shell; these examples assume that helper is set:

```sh
dc ps
dc exec kekbot node src/cli.ts doctor
dc logs --tail=100 kekbot proxy
dc stop kekbot
dc up -d kekbot
```

Logs/doctor output may include private host paths and operational details; review them locally. Validate Compose with `dc config --quiet` rather than printing expanded secrets. Environment changes need `dc up -d --force-recreate kekbot`; a restart does not reload environment configuration. Keep Caddy certificate volumes; routine maintenance must not delete persistent volumes.

### CLI reference

| Command | Use |
| --- | --- |
| `pnpm kekbot help` | Current command synopsis |
| `pnpm kekbot init` | Initialize/migrate storage, preserve keys, create/renew unclaimed owner setup material |
| `pnpm kekbot doctor` | Read-only integrity/schema, lease, account/job counts and configuration diagnostics |
| `pnpm kekbot backup <new-directory>` | Consistent SQLite snapshot, assets and final checksum manifest |
| `pnpm kekbot restore <backup-directory>` | Validate and restore into empty storage with the original encryption key |
| `pnpm kekbot recover-owner <username> <password-file>` | Stopped-host owner password recovery and authority revocation |
| `pnpm kekbot fixture-seed` | Populate synthetic modules/account while a fixture installation is stopped |
| `pnpm kekbot fixture-event` | Deliver a locally signed synthetic proof command to a running fixture server |
| `pnpm kekbot proof-replay <delivery-id> --live` | Replay an already committed encrypted proof capture to the configured HTTPS endpoint |

Source commands load the private `.env.local`. Containers use `node src/cli.ts` instead of `pnpm kekbot`; one-off maintenance uses `dc run --rm --no-deps kekbot node src/cli.ts ...`. Standalone CLI users can load an external private file with `node --env-file=/private/runtime.env src/cli.ts ...`. Never pass a password/secret as a command argument.

Stop the app for init/migrations, seeding, backup, restore and owner recovery. After an unclean stop allow up to 30 seconds for lease expiry. Doctor can inspect a running database. See the complete [backup/recovery and upgrade procedures](BACKUP_RECOVERY.md); in particular, **do not initialize a restore target first**.

The dedicated [CLI reference](CLI.md) gives all arguments, expected outputs and failure boundaries. Use it for command syntax; use this guide for when and why to run maintenance.

## Delivery outcomes

**Maintenance → Delivery outcomes** distinguishes:

| State | Meaning / operator response |
| --- | --- |
| Pending/running | Queued or leased work; check worker/backlog if it persists |
| Succeeded | Confirmed effect or completed local work; inspect the actual provider where necessary |
| Failed | Known failure; inspect the sanitized error and fix configuration/permissions/input |
| Uncertain | Provider delivery may have happened; inspect the provider before another action |

Only explicit rate limits receive safe bounded automatic retries. A network interruption during a mutation can leave delivery uncertain. Owners can select **Provider confirms success** or **Provider confirms failure** after inspection. This records the observed result and **does not resend** the job. Repeating a manual action can cause a second real effect; do not equate a missing response with a failed send.

Current account permissions, guild routes and timer eligibility are rechecked when deferred work runs. Removing authority can invalidate pending work. Preview/test tools are separate from real delivery: command/timer previews, alert previews and safe moderation tests create no provider mutations.

### Reconcile an uncertain action

1. Identify the job, intended effect and time from the local delivery list. Preserve the sanitized error privately.
2. Inspect Kick/Discord for the actual message or moderation outcome. A missing browser response alone is insufficient.
3. If the provider confirms the result, the owner records **Provider confirms success** or **Provider confirms failure**. If it remains unknowable, leave it uncertain and document that limit privately.
4. Only after a known failure, decide whether a new deliberate action is still appropriate. Reconciliation itself never resends.

Local receipt deduplication lasts for the configured retention window; it is not permanent external exactly-once delivery. Avoid manually replaying old requests as ordinary operations. Never modify SQLite job rows to force retries.

## Privacy and retention

Owners edit retention in **Maintenance → Edit settings**. Defaults and current bounds:

| Data | Default | Allowed retention |
| --- | --- | --- |
| Chat text | 7 days | 0–30 days |
| Receipts | 30 days | 2–90 days; pending work retained until processing finishes |
| Summaries | 90 days | 1–3650 days |
| Security audits | 365 days | 30–3650 days |

`Chat days = 0` removes chat bodies after processing and purges completed history; a bounded ten-minute moderation window can still retain text needed for spam decisions. The chat overlay becomes empty. Permanent configuration, ledger balances, participation decisions and queue state remain. Retention is not a full privacy-erasure operation.

Owner viewer export includes retained profile, ledger, redemptions, queue decisions, participation and chat. Handle it as private. Erasure removes profile text, chat and moderator notes, while integrity/audit identifiers and economic/participation/queue decisions remain. If matching events are still processing, retry after they finish. New chat can create a fresh observed profile; erasure does not promise removal of every personal identifier.

## Exports and configuration portability

Analytics filters observed events by date or observed stream ID and exports JSON/CSV. Stream history retains up to 1000 observed sessions; a query returns up to 100 overlapping summaries. Viewer samples are averages/count/min/max, not a total formed by adding concurrent viewers. Worker gaps do not prove provider coverage.

In **Maintenance → Configuration portability**, export the native configuration bundle. It contains portable commands/timers/alerts/widgets/rules/goals/rewards/settings and referenced local assets. It excludes credentials, accounts, sessions, invitations, source/API tokens, guild mappings, paths and private history. Asset names/configured response text may still contain information you entered; review before sharing.

Paste a bundle into the import form, select **merge** or **replace**, and leave **Apply after reviewing the preview** unchecked first. Review create/conflict/remove/asset decisions, then deliberately enable Apply and submit. Merge skips existing document IDs; replace removes the portable set before saving replacements. Imports validate/remap assets and apply database changes atomically. A crash during file creation can leave an unreferenced asset for host inspection.

The application envelope is limited to 12 MiB. Use a full backup for account/history migration or larger asset sets. Configuration exports are not disaster recovery and do not claim compatibility with other bot products. See [API formats](API.md#configurations-and-actions).

## Support and security

Owner-only **Generate redacted support data** includes versions, counts, job outcomes, scopes, timestamps, free space and player connection state. It omits host addresses, credentials, raw event bodies and viewer history. Review exports/screenshots before sharing; [troubleshooting](TROUBLESHOOTING.md#reporting-a-problem) lists useful report details.

Provider settings are encrypted with a separate host key. Sessions and individually revocable source/API tokens are stored hashed. Widget read authority never grants moderator/player authority. Invitations and Discord mappings should go only to trusted operators with the permissions they need. Rotate credentials through their provider and revoke leaked source/API tokens in Maintenance.

## Diagnostic proof tools

Normal operation keeps `KEKBOT_ENABLE_PROOF=0`. The historical `/foundation` page requires explicit proof enablement and the host proof token; live mode also requires an owner session and CSRF authority. Capture/replay tools retain original signed payloads in encrypted private storage, exclude captures from backups and expire captures.

Use [FOUNDATION.md](FOUNDATION.md) only for the historical diagnostic workflow and [LIVE_ACCEPTANCE.md](LIVE_ACCEPTANCE.md) for a controlled campaign. Keep raw evidence outside Git; do not reopen the historical destroyed test host or infer a current deployment from old results.

## Maintenance schedule

Monitor health/backlog/free disk and certificate validity; verify automatic renewal, especially for short-lived IP certificates. Review operator access, expiring/revoked provider grants, API quota and retained data. Back up before upgrades and periodically rehearse restoration into separate storage with assets and the original key. Keep host/base-image security updates deliberate and retest affected behavior.

For planned downtime pause timers/media and notify your own team through your normal process. Stop cleanly before storage work. After startup inspect diagnostics, reconnect providers/sources as needed, and resume media explicitly. The [release procedure](RELEASING.md) separates tested candidates from accepted published versions.

## Monitoring and ownership checklist

| Signal | Inspect | Response |
| --- | --- | --- |
| Public availability | HTTPS liveness and readiness using normal certificate validation | Distinguish proxy/ingress from application/storage faults |
| Worker/backlog | Control room, diagnostics, oldest pending jobs and last errors | Investigate rising backlog before sending more work |
| Disk | Host free space/inodes, database/assets/backup growth | Preserve recovery copies; apply deliberate retention; never delete an active SQLite sidecar |
| Provider authority | Kick scopes/refresh/subscription check times, Discord outcomes, Google quotas | Repair/reauthorize the specific integration; avoid retry loops |
| Certificates | Trusted certificate expiry and actual renewal | Preserve Caddy volumes; keep validation ingress available |
| Access | Enabled accounts, Discord mappings, named source/API tokens | Remove unused access; rotate leaked authority at its own boundary |
| Recovery | Last verified backup, independent key copy, retained compatible source/image | Rehearse separate-target restore and upgrade rollback |

KekBot does not install a host monitoring daemon, scheduled backup service or email pager. Arrange these through your own operating environment. Schedule downtime for stopped-host snapshots; do not run automated maintenance against an active database without the CLI's lease protection.
