# Stop, remove or permanently purge KekBot

This guide covers a [managed installation](INSTALLER.md). It requires trusted Linux host access and the copied management tool. Manual installations use their original Compose project/files; do not point this tool at an unrecorded directory.

[Documentation index](README.md) · [Update/rollback](UPDATING.md) · [Backup/recovery](BACKUP_RECOVERY.md)

## Choose the smallest action you need

| Goal | Wizard action | Retained |
| --- | --- | --- |
| Pause the host | Stop | All containers/configuration/data/keys/certificates/images; restart later |
| Remove running services, preserve recovery | Uninstall → Containers only (default) | All files, backups, keys, images and certificate volumes; completed installations can resume; incomplete updates still require recovery |
| Permanently retire local state | Uninstall → Purge | Only unrelated resources, Docker images and independently stored recovery material remain |

From **Bash on the Linux host**, replacing the path when necessary:

```sh
sudo python3 -B /srv/kekbot/tool/kekbot.py --root /srv/kekbot --action uninstall
```

Review the recorded project, image and data root before choosing anything. The wizard never runs global Docker prune or uninstalls Docker/Git/Python.

## Default: remove containers and keep data

Choose **Containers only; keep all data**, then normally choose a stopped-host snapshot first. Backup failure aborts removal; inspect storage rather than ignoring it. The review requires `REMOVE CONTAINERS` before stopping/removing the managed Compose services/network.

The database, uploaded assets, original encryption key, private environment, management/checkpoint records, backups, Docker images and certificate volumes survive. Removing containers does not remove your owner account or revoke provider grants. Resume later with:

```sh
sudo python3 -B /srv/kekbot/tool/kekbot.py --root /srv/kekbot --action start
```

Start checks the existing database and recreates the recorded version; it does not reseed fixtures, create a new owner or migrate a failed update. Keep the original images available and resolve incomplete update state through rollback first.

Removing containers from an interrupted or failed update/rollback preserves its incomplete status and original checkpoint. Status still reports that recovery is required; Start and Update remain blocked until recovery completes. If you deliberately retire that installation instead, explicitly confirmed purge remains available. When a pre-removal snapshot cannot run, removal aborts; skip it only under the walkthrough's stated independent-backup or deliberate-retirement conditions.

## Permanent purge

Cancel first if you have not copied a verified backup **and the original encryption key** to independent protected storage. A pre-uninstall snapshot inside the installation root will be deleted by purge too; it is not an independent recovery copy.

Choose **Permanently purge**, deliberately choose whether to take the local snapshot, then type the exact phrase `DELETE <project>` displayed by the review (for the default project, `DELETE kekbot`). This removes:

- Managed application/proxy containers and Compose network.
- The entire recorded root, including database, assets, keys, environment, copied tool, checkpoints, all local backups and recovery roots.
- That project's managed Caddy certificate/configuration volumes, if used.

Docker images and unrelated containers, volumes, networks and files are retained. Purge refuses symlink paths, symlinks within the root and nested mounts rather than following them. A refusal or volume failure may leave containers removed and files retained; inspect privately before retrying. There is no undo without independently stored recovery material.

## Retire external access separately

Host removal cannot complete provider-console cleanup. When retiring the bot, use the official provider dashboards to revoke OAuth grants and delete/disable unused apps/webhooks, Discord installation/commands and YouTube API keys as appropriate. Remove obsolete DNS/proxy/firewall forwarding yourself. Remove OBS browser sources and saved private URLs from your broadcasting setup. Never delete an application still used by another installation.

For moving hosts, restore with the original key, update exact callback addresses and verify delivery on the replacement before retiring the old installation. Run only one active instance; follow [recovery](BACKUP_RECOVERY.md) and [live acceptance](LIVE_ACCEPTANCE.md). Uninstalling is not a provider-data deletion request and does not erase independent backups you keep elsewhere.
