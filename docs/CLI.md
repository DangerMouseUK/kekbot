# Command-line reference

These commands maintain one installation's local files. They do not provision a host or install Docker. See [installation](INSTALLATION.md) for a runnable Compose setup and [backup/recovery](BACKUP_RECOVERY.md) for complete procedures. [All documentation](README.md).

<!-- contents:start -->
**On this page**

- [Invocation and configuration](#invocation-and-configuration)
- [Command summary](#command-summary)
- [init](#init)
- [doctor](#doctor)
- [backup](#backup)
- [restore](#restore)
- [recover-owner](#recover-owner)
- [Fixture and foundation commands](#fixture-and-foundation-commands)
- [Common failures](#common-failures)
<!-- contents:end -->

## Invocation and configuration

Run source commands from the repository root with the pinned dependencies installed:

```sh
pnpm kekbot help
pnpm kekbot doctor
```

The source wrapper loads `.env.local` if it exists. For external configuration, invoke Node directly from the root:

```sh
node --env-file=/private/runtime.env src/cli.ts doctor
```

`/private/runtime.env` represents your protected absolute path. Standalone packages use the same `node … src/cli.ts` entry from the package root. In the installed container, use the installation guide's `dc` helper:

```sh
dc exec kekbot node src/cli.ts doctor
dc run --rm --no-deps kekbot node src/cli.ts init
```

`exec` needs a running container. `run --rm --no-deps` starts an ephemeral CLI container with the service's configured environment/volume; it does not start the application worker. Use identical Compose files, project and mounts on every invocation. Container arguments refer to **container paths**, not host paths.

The CLI uses JSON results/errors and nonzero exit codes on failure. Output can contain private paths and fixture login-file locations; review it before sharing. `help` (or no command) prints usage. `--help` is not a supported substitute. Secrets belong in protected files, never command arguments.

## Command summary

| Command | Application state | Result |
| --- | --- | --- |
| `init` | Stopped | Create missing storage/key material, apply checked-in migrations, renew unclaimed setup expiry |
| `doctor` | Running or stopped | Read-only integrity, schema, lease, account/job counts and configuration-presence checks |
| `backup <new-directory>` | Stopped | Consistent database, copied assets and final integrity manifest |
| `restore <backup-directory>` | Stopped; empty target | Validate key/mode/schema/checksums and publish restored database/assets |
| `recover-owner <username> <password-file>` | Stopped | Reset existing owner and revoke owner sessions/access tokens |
| `fixture-seed` | Stopped fixture installation | Example configurations and generated fixture owner login |
| `fixture-event` | Running fixture server | Send one locally signed synthetic `!kekbot` request |
| `proof-replay <delivery-id> --live` | Running live server; proof enabled | Replay an encrypted, already committed capture to the configured HTTPS intake |

## init

Run before the first server start. It creates the mode directory, SQLite database, assets directory, encryption key and diagnostic token. Fixture mode additionally creates local signing material. Existing keys are preserved. While unclaimed it creates/preserves the setup token and renews its one-hour expiry; a claimed owner is unaffected.

Expected output reports mode and file paths, not token/key values. Protect an independent encryption-key copy. Do not run `init` against an empty restore target before `restore`: it would create a database and make the target nonempty. Restore needs separately provisioned key/token files instead.

## doctor

Checks SQLite `quick_check`, schema, instance-lease expiry, account roles/job status counts and whether callbacks/Kick credentials are configured. Expect `integrity: "ok"` and schema value `"2"` on this candidate.

Doctor does not migrate, refresh OAuth, repair subscriptions, send messages or establish provider acceptance. A configured credential flag does not prove a valid grant. Compare results with dashboard diagnostics, HTTP readiness and actual delivery. If the database is absent, run `init` for a new installation or follow recovery for an existing one.

## backup

The destination must not exist and must be outside the active mode directory. Stop the application first; the maintenance lease rejects a running instance. For the installation guide's Bash/Compose setup:

```sh
dc stop kekbot
dc run --rm --no-deps \
  -v /srv/kekbot/backups:/backups \
  kekbot node src/cli.ts backup /backups/checkpoint-01
```

Check the backup result before starting again. The destination contains a SQLite snapshot, assets and `manifest.json` written last. A failed partial directory is not a valid backup. Choose a new destination for a retry; inspect failed artifacts privately.

Backups exclude environment files, encryption/setup/proof keys, proof captures and Caddy volumes. The backup is **not encrypted**: some provider fields inside SQLite are encrypted, but viewer/account/history records and assets still need protected storage. [Full backup procedure](BACKUP_RECOVERY.md).

After a confirmed successful snapshot, start the original app with `dc up -d kekbot`. On failure inspect storage/lease errors before restarting or retrying maintenance.

## restore

Use a different empty data root. Supply the original encryption key and matching mode, plus required diagnostic token material before invoking the CLI. Restore rejects an existing database/nonempty assets, wrong key, unsupported format/schema and damaged hashes. Do not overwrite a working database or run two copies of a live installation against providers.

Restore removes stale process leases. It preserves accounts, sessions, API/source tokens and provider records from the snapshot; review/revoke stale access before exposing a restored host. Apply any supported schema upgrade only after restore. See the [empty-target restore walkthrough](BACKUP_RECOVERY.md) for mounts, permissions and safe verification.

## recover-owner

Requires the existing owner's normalized username and a file containing the new password (12–256 characters after trimming). Prepare the file privately with restrictive permissions. Mount it read-only for the CLI container and stop the app first:

```sh
dc stop kekbot
dc run --rm --no-deps \
  -v /private/new-owner-password.txt:/run/secrets/owner-password:ro \
  kekbot node src/cli.ts recover-owner OWNER_USERNAME /run/secrets/owner-password
dc up -d kekbot
```

Replace `OWNER_USERNAME` and the host file path before running. Recovery resets/enables that owner, removes their sessions and access tokens (including source/player/API credentials), clears OAuth states and audits the action. It does not create a new owner, revoke other operators' sessions or rotate provider secrets. Reissue affected OBS/API credentials and remove the temporary password file through your normal private-file procedure. [Recovery details](BACKUP_RECOVERY.md#recover-the-owner).

## Fixture and foundation commands

`fixture-seed` requires stopped fixture mode and creates a random `fixture-owner` login in a protected file. It is for disposable demonstrations. Follow [quickstart](QUICKSTART.md).

`fixture-event` requires fixture mode, local signing material, a positive synthetic broadcaster ID and a running server. It posts to `KEKBOT_PUBLIC_URL` (or the loopback default), prints a sanitized HTTP result and sends nothing to Kick. Wait for background processing and inspect outcomes separately.

`proof-replay` requires explicit `--live`, enabled proof controls, the original encrypted committed capture and the installation key. It preserves original signature inputs and prints outcomes without bodies/credentials. It is a diagnostic tool, not a general webhook injector. Capture is opt-in, lasts five minutes and stores at most one matching event outside backups. Follow [foundation proof](FOUNDATION.md); keep proof disabled during normal use.

## Common failures

| Failure boundary | Next step |
| --- | --- |
| Running installation/maintenance lease | Stop the app; allow graceful shutdown/lease expiry; never delete lease rows to force access |
| Missing key or configuration | Check the environment file and container-visible secret mounts |
| Permission denied | Verify active data and backup directories are writable by container UID/GID 1000 |
| Restore target nonempty | Select a new empty root; preserve the existing installation |
| Key fingerprint/mode/hash mismatch | Locate the matching original key/backup; do not edit the manifest to bypass validation |
| Provider or replay error | Inspect sanitized status and current receipts/jobs before any retry |

See [troubleshooting](TROUBLESHOOTING.md) for health, storage and origin failures. Maintenance commands do not bypass encryption or recover data without the original key.
