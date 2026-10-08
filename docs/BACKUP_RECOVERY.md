# Backup, recovery and upgrades

This guide covers the development candidate, SQLite schema 2 and backup format 1. It assumes the Linux paths and Compose project from [installation](INSTALLATION.md). Keep backups, keys, credentials and private evidence outside Git. Return to the [documentation index](README.md).

<!-- contents:start -->
**On this page**

- [What a backup contains](#what-a-backup-contains)
- [Open a maintenance shell](#open-a-maintenance-shell)
- [Create a snapshot](#create-a-snapshot)
- [Restore into a separate data root](#restore-into-a-separate-data-root)
- [Recover the owner](#recover-the-owner)
- [Upgrade and rollback](#upgrade-and-rollback)
<!-- contents:end -->

## What a backup contains

`backup` creates a consistent SQLite snapshot, uploaded assets and a final checksum manifest. It includes accounts, configuration, encrypted integration records, receipts/jobs, queue, ledgers and history. It excludes environment files, encryption/setup/proof/fixture signing secrets and proof captures.

Backups contain private history and are **not encrypted by the backup command**. Protect them and keep an independent, securely stored copy. Checksums detect corruption; they do not authenticate a backup against an attacker replacing its contents. Preserve the **original encryption key separately**. Losing it loses access to encrypted grants/settings and prevents the supported restore path.

### Choose the right export

| Need | Use | It does not replace |
| --- | --- | --- |
| Disaster recovery, accounts/history/queue/assets | Stopped-host CLI backup + separately protected original key/runtime record | Off-host protected copies and a restore rehearsal |
| Reusable commands/themes/rules/goals | Native configuration export/import | Account/history backup; provider setup |
| A viewer's retained information | Owner viewer export | Complete backup or automatic erasure of all identifiers |
| A support report | Redacted support export, reviewed before sharing | Raw logs/database or proof of complete provider delivery |

Retain several dated recovery points according to your own storage/privacy needs, including a pre-upgrade copy. Keep at least one backup/key copy off the application host. No scheduled backup or automatic cloud upload is configured by KekBot.

## Open a maintenance shell

Use the same source/image, private configuration, project name and proxy override as the installation. For the standard domain example:

```sh
cd /srv/kekbot/source
export KEKBOT_ENV_FILE=/srv/kekbot/runtime.env
export KEKBOT_HOST_DATA_DIR=/srv/kekbot/data
export KEKBOT_SOURCE_REF="$(git rev-parse HEAD)"
export KEKBOT_DOMAIN=kekbot.example
dc() { docker compose -p kekbot -f compose.yaml -f compose.proxy.yaml "$@"; }
```

Replace the hostname. IP installations use `KEKBOT_PUBLIC_IP` and `compose.ip.yaml` instead. Include any private secret-mount override too. Source installations use `pnpm kekbot` in place of `dc run ... node src/cli.ts`, with the correct `.env.local` and stopped server.

## Create a snapshot

Stop the app before initialization/migration, seeding, backup, restore or owner recovery. Doctor may inspect running storage. After an unclean stop, allow up to 30 seconds for the runtime lease to expire; never delete a lease to bypass an active process.

```sh
dc stop kekbot
dc run --rm --no-deps -v /srv/kekbot/backups:/backups kekbot node src/cli.ts backup /backups/before-upgrade
```

The destination must be **new** and outside the active mode directory. Change `before-upgrade` for each snapshot. Prepare the host backup mount writable by UID/GID 1000 (installation already creates it). Confirm success and the presence of `manifest.json` before treating it as a backup. That file is written last; a missing manifest means incomplete. Keep earlier known-good backups.

After confirming success, `dc up -d kekbot` starts the original installation again. If you are continuing immediately into restore/upgrade, leave it stopped and follow that procedure instead.

Copy the snapshot and separately protected original key to independent storage. Record application source/image, schema, mode and date. A backup becomes useful evidence when you actually restore it into a separate target and inspect the result.

### Backup failure handling

If the command fails, leave the previous known-good backup untouched. Check the sanitized error, free space/inodes, destination permissions and instance lease. An incomplete destination can contain a database or assets without a final manifest; do not label it valid or edit hashes to make it pass. Retry into a different new directory after fixing the cause. Start the original application only when storage is healthy and no maintenance process remains active.

## Restore into a separate data root

**Do not run `init` before restore.** Restore intentionally refuses to overwrite an existing database or populated asset directory. Start with a new target; preserve the old storage and backup unchanged.

These Bash commands illustrate a live-mode restore of `/srv/kekbot/backups/before-upgrade` to `/srv/kekbot/restore-data`. Ensure that target is new, and keep the original app stopped:

```sh
dc stop kekbot
sudo install -d -m 0700 -o 1000 -g 1000 /srv/kekbot/restore-data /srv/kekbot/restore-data/live /srv/kekbot/restore-data/live/secrets
sudo install -m 0600 -o 1000 -g 1000 /srv/kekbot/data/live/secrets/encryption.key /srv/kekbot/restore-data/live/secrets/encryption.key
export KEKBOT_HOST_DATA_DIR=/srv/kekbot/restore-data
```

On a replacement host, the encryption key source is your independent protected copy. If using a custom key mount, mount that original key at the configured container path instead of copying to the default directory. Keep the same `KEKBOT_MODE` as the backup.

Restore also requires a valid proof-token file even with proof controls disabled. Generate one in the new target **without creating a database** (or supply an existing protected proof token at its configured mount):

```sh
dc run --rm --no-deps kekbot node --input-type=module -e "import {randomBytes} from 'node:crypto'; import {writeFileSync} from 'node:fs'; writeFileSync('/data/live/secrets/proof.token', randomBytes(32).toString('base64url')+'\n', {flag:'wx', mode:0o600});"
dc run --rm --no-deps -v /srv/kekbot/backups:/backups:ro kekbot node src/cli.ts restore /backups/before-upgrade
dc run --rm --no-deps kekbot node src/cli.ts doctor
```

For fixtures, use `fixture` paths and preserve/recreate both RSA and Ed25519 fixture signing pairs before restore, because runtime configuration requires their public keys. Keep fixture credentials separate from live storage.

Restore validates mode/schema, key fingerprint, SQLite integrity and database/asset checksums, then clears runtime leases. Current code accepts schema 1 or 2 and rejects newer schemas. **For a schema 1 backup**, run stopped-host `init` **after** restore and **before** doctor/startup to migrate it and create owner setup material. A schema 2 backup already contains account state.

If a validation/copy fails, keep the original backup and old data untouched; inspect the failed target privately and retry into another new directory. Do not work around a key/checksum mismatch.

Before starting on a new host, update the public origin and exact provider callbacks. Reauthorize/revoke old grants where appropriate. Start only the intended restored instance:

```sh
dc up -d --force-recreate kekbot
dc exec kekbot node src/cli.ts doctor
```

Check integrity, accounts/configuration/assets, persisted balances/queue and receipt replay protection. Media should be paused pending moderator resume. Remember the new data-root variable in future shells; otherwise you can accidentally select the old installation. Normal restore preserves database sessions/source tokens. If the old host was untrusted, deliberately revoke/replace copied authority and provider credentials.

### Recovery inspection checklist

- Doctor reports integrity `ok` and the expected schema; readiness becomes healthy.
- Sign in with a restored account and verify a non-owner's restricted access.
- Confirm a known command/configuration, uploaded image/sound and expected queue/ledger record.
- Confirm the current media item is preserved and paused; do not resume until the intended single player connects.
- Verify receipt/job state through a controlled retained-event test, not arbitrary live mutation replay.
- Confirm the public origin, provider callback addresses, subscriptions and credentials are intended for this host.
- Record the restored source/image/data root privately; stop the old instance before exposing the replacement.

A separate directory on the same machine is a useful rehearsal. It does not satisfy the release requirement to restore onto another host.

## Recover the owner

Recovery needs trusted host access, the original key and the existing lowercase owner username. It cannot decrypt data with a lost key. Create a private UTF-8 file outside source containing a replacement password of 12–256 characters, using a trusted editor such as `sudoedit /srv/kekbot/recovery-password.txt`. Do not put the password in shell arguments/history. Restrict the new file to the application UID before mounting it:

```sh
dc stop kekbot
sudo chown 1000:1000 /srv/kekbot/recovery-password.txt
sudo chmod 0600 /srv/kekbot/recovery-password.txt
dc run --rm --no-deps -v /srv/kekbot/recovery-password.txt:/run/recovery-password:ro kekbot node src/cli.ts recover-owner '<OWNER_USERNAME>' /run/recovery-password
dc up -d kekbot
```

Replace the username placeholder. Recovery resets/enables the owner, revokes the owner's sessions and access tokens (including widget/player/API tokens), clears outstanding OAuth states and records an audit entry. It does not rotate provider app secrets. Sign in, remove the temporary password file using your host's secure-file handling procedure, and recreate affected OBS/API credentials. Existing invitations are not a substitute for owner recovery.

## Upgrade and rollback

1. Record the current source/image, mode, schema and paths. Retain the compatible old image/source and original key.
2. Stop the app and create/verify a new pre-upgrade snapshot with assets. Preserve it independently.
3. Select the exact reviewed new source/image. Build before changing stored state; confirm its CI and documented upgrade boundary.
4. Run its stopped-host `init` against the existing data volume, then recreate/start the application. Migrations are checked-in SQL; never generate them on the host or run two versions against one database.
5. Verify doctor/health, permissions, connections, queue recovery and assets. Resume media deliberately.

If migration or startup fails, stop and preserve failed storage/logs privately. Select the old compatible image and restore the **pre-upgrade backup into a new root** with its original key, then start that root. Do not run an older binary against a newer schema or assume downgrade SQL exists. Keep callbacks/configuration aligned if the origin changes.

Automated schema-1 restore/upgrade, migration rollback and container recovery have evidence. An old-image rollback trial, device failure, real power loss and another-host recovery still need [live acceptance](LIVE_ACCEPTANCE.md). After recovery, follow [operations](OPERATIONS.md) and [troubleshooting](TROUBLESHOOTING.md).
