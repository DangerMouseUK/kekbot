# Update or roll back a managed installation

Use this guide for installations created by the [terminal wizard](INSTALLER.md). Manual deployments follow [manual upgrade/rollback](BACKUP_RECOVERY.md#upgrade-and-rollback). Updates are explicit; there is no scheduled upgrade, mutable `latest` image, or automatic branch pull.

The [downloadable launcher](LAUNCHER.md#updates-recovery-and-removal) also opens updates: run `sudo bash install.sh update --root /srv/kekbot` from its reviewed download directory. It reuses the protected installed manager without new tool downloads. Current managers also support `--branch`, `--release`, `--pr`, `--commit` and `--bundle` shortcuts; older managers keep interactive source selection. Explicit `--tool-commit`/`--tool-branch` selection reviews new management code separately and does not overwrite the copied manager. Never update tools implicitly as part of an application change.

For published [beta 3](releases/v0.1.0-beta.3.md), follow the [beta selection and compatibility guidance](BETA.md#update-recover-or-remove), including older beta 1/2 installations. Choose the exact published beta, reviewed commit or audited bundle explicitly. The default latest-stable choice does not install a beta; published outcomes and current limitations are recorded in the beta notes.

[Documentation index](README.md) · [Installer options/formats](INSTALLER.md#sources-and-distribution-formats) · [Uninstall](UNINSTALLING.md)

Beta 2 introduced the bundled HTTPS installer correction; beta 3 retains it and adds the downloadable launcher, with the same schema/formats. For beta 1/2 → beta 3, use the [reviewed beta 3 launcher/tool selection](BETA.md#update-recover-or-remove) and select beta 3 explicitly. Application updates do not replace copied host tools. The original beta 1 installer issue and its separate workaround remain [documented](INSTALLER.md#beta-1-bundled-https-installer-fix) for that older immutable release.

## Before updating

- Choose a quiet maintenance window. Download/build happens first, but backup/migration/recreation interrupts processing; providers may retry callbacks. Stop relying on the bot during downtime.
- Keep an independent verified database/asset backup and **original encryption key**. Disk-local snapshots are useful but do not survive disk loss or purge.
- Retain the current image. Do not run Docker image/system prune: the rollback checkpoint references its immutable image ID.
- Read the selected version's release/upgrade notes and CI. An arbitrary older branch may not understand your current schema; unsupported boundaries must fail, not be forced.
- Check local disk space for the new image, another snapshot and separate recovery roots. Never run two instances on the same database.

From **Bash on the Linux host**, open the copied tool:

```sh
sudo python3 -B /srv/kekbot/tool/kekbot.py --root /srv/kekbot --action update
```

Replace the root if needed. If a newer release changes the management protocol, review its matching tool from a separate checkout before running it against your instance. Application updates do not silently replace the host tool. Current management format is 1; release metadata 1 / schemas 2 and 3 / backup format 1 are supported.

## Select and review

The default is **Latest stable release**, even if you originally installed a development branch. Until stable publication exists, explicitly choose a specific candidate, branch, PR, full commit or local bundle. Source choices are resolved once to a full SHA; release images are pinned to their recorded Docker image ID. No moving ref is consulted again while applying.

The [source/format table](INSTALLER.md#sources-and-distribution-formats) explains every choice. Branches/PRs can run arbitrary source with root/Docker authority; verify the exact commit before entering its trust phrase. A source rebuild of an accepted release is still a new image needing verification. Checksums alone do not authenticate a publisher.

Review directory, selected version/SHA/format, backup/recovery effect and unchanged origin/mode. Type `APPLY` to execute; `q` cancels. If the exact image ID is already installed, the updater reports that without downtime or migration.

## Apply order and expected result

1. Build/load and inspect the new image while the current application runs. Failure here leaves current state unchanged.
2. Record the pending operation and old image/configuration; take the exclusive management lock.
3. Stop KekBot. Wait only for any remaining durable instance lease (normally graceful shutdown clears it; at most approximately 30 seconds).
4. Use the **old image's backup command** to create a new database/asset snapshot. A completed manifest is required before migration. Keys stay separate.
5. Record migration intent durably; switch generated Compose to the new immutable image; run stopped-host `init` for checked-in migrations.
6. Recreate/start the app and managed proxy; require healthy readiness and doctor integrity `ok`. Persist the new active image and one rollback checkpoint.

The success message establishes startup/local integrity. Verify sign-in, a restricted account, provider connections/subscriptions, a known command, assets and queue state before resuming the stream. Media remains paused after restart until an authorized moderator resumes it. Verify real delivery separately; no automated update can complete provider consent.

Snapshots are stored below `<root>/backups`; one latest checkpoint is referenced by the record, while older snapshot directories and Docker images are retained for deliberate inspection. No automatic retention deletes your recovery material. Inspect disk usage and apply your [backup retention policy](BACKUP_RECOVERY.md). Failed/recovered data roots also stay private until you deliberately retire them.

## Roll back after failure or a bad update

```sh
sudo python3 -B /srv/kekbot/tool/kekbot.py --root /srv/kekbot --action status
sudo python3 -B /srv/kekbot/tool/kekbot.py --root /srv/kekbot --action rollback
```

Read the review and type `APPLY`. Rollback stops the current app. If no migration was attempted, it can resume the old image against original storage. If migration was attempted, it copies the original separate secret files, restores the pre-update snapshot into a **new** root under `<root>/recovery`, and starts the old image there. Original/failed storage is left untouched. The installation record then identifies the recovered root; future management commands follow it.

Rollback returns to the snapshot time: later chat/history/configuration/queue changes are absent. Provider tokens refreshed after the snapshot may no longer work and need reauthorization. Never start the old data root beside the recovered one. A consumed rollback checkpoint is cleared; future updates create a new one.

External effects after that snapshot may already have occurred even though their local records are absent. Reconcile actual chat/moderation/Discord outcomes before resending or replaying anything; restoration is not permission to repeat uncertain effects.

On interruption, check status before restarting. `updating`, `update-failed`, `rolling-back` and `rollback-failed` require recovery; ordinary Start cannot bypass them. Retained-data uninstall preserves those statuses and their checkpoint, so removing containers cannot enable Start or another Update prematurely. If storage prevents saving a failure record, cleanup still attempts to stop the app and the last durable pending status remains authoritative. A hard host/process kill or Docker failure may prevent immediate cleanup, so verify the actual container state too. If rollback cannot complete, keep the record, backup, keys and failed roots intact and use [manual empty-target restore](BACKUP_RECOVERY.md#restore-into-a-separate-data-root). There is no downgrade SQL or blind retry of external effects.

## Schema 3 and release maintenance

This candidate adds schema 3. Use the current reviewed host tool for schema-3 bundles; a copied older tool may reject them and is never replaced implicitly. Schemas 1 and 2 upgrade through checked-in SQL during stopped-host initialization. Back up first and retain a compatible prior image. Recovery restores the pre-upgrade checkpoint into a new root; never start schema-2 code against upgraded storage.

Dependencies are maintained through [deliberate release reviews](DEPENDENCY_MAINTENANCE.md), with exact candidate source/image sign-off. No dependency automation installs upgrades on your host. Latest stable remains the default selection and fails closed until an actual accepted stable release exists.
