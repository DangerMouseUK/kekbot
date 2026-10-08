# Troubleshooting KekBot

Start with the symptom below. Work on your own authorized installation and keep diagnostics private until reviewed. Return to the [documentation index](README.md).

## Collect safe diagnostics

1. Record the commit/application version, install method, mode and time of failure. For containers, record image ID/source label locally.
2. Use **Maintenance → Diagnostics** and **Delivery outcomes**, or run `pnpm kekbot doctor` from source. Containers use `docker compose exec kekbot node src/cli.ts doctor` with the same project/files/exports as installation (or `dc exec ...` using its helper).
3. Check the public `/api/health/live` and `/api/health/ready` endpoints with normal TLS verification. They expose no private diagnostics.
4. Inspect a bounded local log excerpt, such as `dc logs --tail=100 kekbot proxy`. Review/redact it before sharing. Avoid expanded Compose configuration output; use `config --quiet`.

Doctor's `integrity` should be `ok`. It reports persisted configuration/counts, not a complete provider health test. Owner-only **Generate redacted support data** is safer to share than raw runtime files, but review even that export first.

## Installation and accounts

| Symptom | Action |
| --- | --- |
| pnpm/Node version error | Match `.node-version` and `package.json`; use `pnpm install --frozen-lockfile`, not another package manager |
| SQLite native install failure | Use the pinned Node architecture/version; install Python and the C++ toolchain listed in [quickstart](QUICKSTART.md#prerequisites), then retry installation |
| Permission denied / missing key | Check UID/GID 1000 ownership, container-visible secret paths and active mode/data root. Run `init` only for an intended new/upgrade installation; never replace an existing encryption key. |
| Runtime not ready | Check free disk, jobs enabled, init/migrations, encryption/proof files and another active runtime/maintenance lease |
| TLS issuance fails | Check public DNS/IP, reachability of 80/443, correct override/host variables, clock and persisted Caddy state; do not bypass TLS |
| Setup token denied | Confirm active mode/path and one-hour expiry. If unclaimed, stop and rerun init; if claimed, use [owner recovery](BACKUP_RECOVERY.md#recover-the-owner). |
| Login/invitation denied | Check normalized username, disabled account, token expiry/use and creator's current invite authority. Wait for abuse-rate-limit cooldown rather than repeated attempts. |
| Write denied / CSRF failure | Check current role/grants and use the same exact configured public origin. For the local demo set `KEKBOT_PUBLIC_URL=http://127.0.0.1:3000`, restart and open that exact address. Sign in again after session/password revocation. Do not disable CSRF. |
| Version conflict (`409`) | Refresh current state and review the other operator's change before resubmitting |

## Kick and Discord

| Symptom | Action |
| --- | --- |
| OAuth callback rejected | Match exact public origin/redirect path, same owner browser and intended Kick creator. Browser-bound state/cookies are one-use; start a fresh authorization. |
| Creator ID missing/wrong | Follow [numeric ID lookup](PROVIDERS.md#3-resolve-the-numeric-broadcaster-id); an app name/client ID/channel slug is not the broadcaster ID |
| No Kick reply | Send in the configured creator's channel, check subscriptions/scopes/intake and job outcome, cooldown/restrictions, jobs enabled and `KICK_CHAT_TYPE` |
| Authorized but no events | Enable webhooks on the app, match the events URL, run subscription reconciliation and check publicly trusted ingress and system time |
| Refresh needs consent | Reauthorize the intended creator after revocation/invalid grant; do not loop on the same invalid refresh |
| Discord endpoint rejected | Save matching application ID/public key first, verify exact HTTPS path and signed PING; check proxy preserves request bytes |
| Discord command missing | Install to the intended guild, save enabled guild routing, then register commands; repeat registration after enabling media |
| Discord command denied | Check exact guild/channel and current role/user mapping; local account roles do not transfer |
| Discord notification missing | Check selected event route, bot membership/channel permissions and delivery result |

`pending` means queued; `failed` means a known failure; `uncertain` needs provider inspection before owner reconciliation. Reconciliation records an observed result and never resends. See [delivery outcomes](OPERATIONS.md#delivery-outcomes).

## OBS and media

| Symptom | Action |
| --- | --- |
| Blank widget | Check enabled state, private URL, token revocation, dimensions, connectivity and whether its target/event exists. Chat is empty when history is disabled. |
| No audio | Check asset/player volume, OS/OBS mute, Browser Source audio control/monitoring and actual recorded output |
| Request rejected | Inspect the recorded metadata/rule error: key/API/quota, missing/private video, duration, blocked uploader/title, duplicates, cooldown or capacity |
| Autoplay/embed error | Keep the player visible; use OBS Interact to address playback restrictions where possible, then resume or deliberately skip an unavailable item |
| Player cannot claim lease | Preserve the full player URL fragment and close competing player sources; allow the 15-second old lease to expire |
| Queue paused after restart | Expected recovery behavior: moderator resume restarts the preserved current item from the beginning |
| Source reload interrupts playback | Check OBS shutdown/refresh-on-scene settings; reuse one active player source across scenes |

Follow [OBS setup](OBS.md) rather than modifying required YouTube controls or trying to extract audio. A fixture player never loads real videos.

## Storage and recovery

Stop before backup/restore/owner recovery. A backup destination must be new; a restore target must have no database or populated assets. Key/checksum/mode/schema failures must be resolved with the correct original material, not bypassed. Follow [backup and recovery](BACKUP_RECOVERY.md) for exact ordering and schema-1 migration steps.

For full/read-only storage, stop writes, preserve existing data, restore capacity/permissions on the intended mount and inspect doctor before resuming. Do not fill a live disk to reproduce tests. Do not delete SQLite sidecars or leases while a process is active. If the database/key is damaged, preserve it and restore a verified backup into a separate root.

## Reporting a problem

Search [existing issues](https://github.com/DangerMouseUK/kekbot/issues) first. Include expected/actual behavior, minimal reproduction, commit/version, OS/architecture, source/container method, mode, browser/OBS version where relevant, sanitized error codes and checks already tried. State whether the problem occurs with fixtures or only a real provider.

Do not attach `.env` files, keys, databases, backups, raw chat/provider payloads, browser traces, source URLs, private host/account details or unreviewed screenshots. Share only reviewed redacted support excerpts. For exploitable security problems use [private security reporting](../SECURITY.md), not a public reproduction. Documentation problems can be reported with the guide heading, failing step and expected instruction, using placeholders.
