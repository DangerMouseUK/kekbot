# Installing and operating KekBot

This guide describes the `0.1.0-dev.0` development candidate, schema 2 and backup format 1. The build covers Milestones 2–16; this is not an accepted stable release. Follow [milestone evidence](MILESTONES.md) and [automated testing](TESTING.md) for current verification. [Live acceptance](LIVE_ACCEPTANCE.md) is prepared, with new deployment deferred and independent-owner/performance gates pending. The original foundation test host no longer exists. No current server or reusable provider grant is assumed.

## Supported installation

Use one long-running application container on Linux x86-64, local persistent SSD storage and an operator-controlled HTTPS reverse proxy. SQLite on a network filesystem, multiple replicas and ARM64 images are not supported yet. Windows/macOS can develop from source or run the Linux image through Docker Desktop. Keep the host awake for intake and background jobs; opening the dashboard is unnecessary.

The PRD benchmark host is 2 vCPUs / 2 GiB RAM; production benchmarks remain pending. Image compilation can require more memory. Node 24.21.0 and pnpm 10.26.0 are pinned. No provider application, relay or credential owned by the KekBot project is needed.

### Source development with isolated fixtures

```sh
pnpm install --frozen-lockfile
cp .env.example .env.local
```

On PowerShell use `Copy-Item .env.example .env.local`. Edit the private file:

```dotenv
KEKBOT_MODE=fixture
KEKBOT_RUN_JOBS=1
KEKBOT_ENABLE_PROOF=0
KICK_BROADCASTER_USER_ID=123
NEXT_TELEMETRY_DISABLED=1
```

Leave live Kick credentials empty. `init` creates isolated `data/fixture` storage, encryption/setup material and local RSA/Ed25519 fixture signing pairs. Then choose either manual setup or a seeded demonstration:

```sh
pnpm kekbot init
# Optional, before starting the application:
pnpm kekbot fixture-seed
pnpm dev
```

Open `http://127.0.0.1:3000`. For manual setup, read the host setup-token file reported by `init`, then choose your owner username and password. The token expires after one hour; rerun `init` while stopped to renew an unclaimed installation. There are no default live credentials.

`fixture-seed` creates sample configurations for every module and all 18 widget kinds. It creates `fixture-owner` with a randomly generated password in the protected `fixture-account.json` file; it prints only that file's location. Seeding existing storage preserves existing configurations. Read the credentials locally and never publish that file. Fixtures reject live integration settings and simulate replies, Discord sends and metadata; the fixture player never loads YouTube.

Use `pnpm kekbot fixture-event` in another terminal to deliver a locally signed `!kekbot` request. `doctor` reports persisted state. Native SQLite compilation may require Python and a C++ build toolchain. Production source execution is `pnpm build`, then `pnpm start`; builds force jobs off and disable telemetry.

### Container with external configuration and storage

Create a private runtime environment file based on [.env.example](../.env.example), set live mode, jobs on, proof tools off, and the final public HTTPS origin. Provider settings can be entered by the owner later. Keep this file, data and backups outside the source checkout.

Example Linux layout: source under `/srv/kekbot/source`, private environment file `/srv/kekbot/runtime.env`, data `/srv/kekbot/data`, backups `/srv/kekbot/backups`. These are illustrative paths. Create the data directory writable by UID/GID 1000; restrict the environment file and secret files to the operator/application. Docker Desktop users can set `KEKBOT_HOST_DATA_DIR` to a host directory or use a named volume in their own override; do not edit paths inside the image.

From the source checkout (set host variable `KEKBOT_SOURCE_REF` to the committed source SHA for image provenance; otherwise it is explicitly labelled unknown):

```sh
export KEKBOT_ENV_FILE=/srv/kekbot/runtime.env
export KEKBOT_HOST_DATA_DIR=/srv/kekbot/data
docker compose build
docker compose run --rm kekbot node src/cli.ts init
docker compose up -d
```

PowerShell uses `$env:KEKBOT_ENV_FILE` and `$env:KEKBOT_HOST_DATA_DIR`. The image runs as user `node` (UID/GID 1000); Compose mounts data at `/data` and binds application port 3000 to host loopback. The data root contains a separate `live` or `fixture` directory. Prepare both the mode directory and its `secrets` directory with the right ownership when restoring manually.

Encryption keys are separate files, never database records or backup contents. A production operator can mount the encryption key separately and set `KEKBOT_ENCRYPTION_KEY_FILE` to the container-visible path. Keep its original value for recovery. Losing the key loses encrypted grants and integration configuration. `init` preserves existing keys.

### HTTPS and callbacks

Use either `compose.proxy.yaml` for your DNS hostname or `compose.ip.yaml` for trusted public-IP HTTPS, alongside the base Compose file. Set `KEKBOT_DOMAIN` or `KEKBOT_PUBLIC_IP` on the host respectively. Both examples pin Caddy 2.11.6, persist its certificate/configuration volumes and disable streaming buffering. The IP example selects Let's Encrypt's short-lived profile; actual renewal must be verified in live acceptance. See [foundation HTTPS instructions](FOUNDATION.md).

Allow the proxy's certificate-validation and HTTPS ports to reach the host. Choose SSH/firewall access rules explicitly; application deployment does not manage them. Do not expose port 3000 publicly. Configure `KEKBOT_PUBLIC_URL` as the exact HTTPS origin without a path. Register these exact paths on that origin:

| Integration | Path |
| --- | --- |
| Kick OAuth redirect | `/api/providers/kick/callback` |
| Kick webhook | `/api/providers/kick/events` |
| Discord interactions | `/api/providers/discord/interactions` |

Provider request bodies are limited to 64 KiB; authenticated configuration/assets use a 12 MiB envelope limit. Custom proxies must support these different limits and stream SSE without caching/buffering. [Caddy request body configuration](https://caddyserver.com/docs/caddyfile/directives/request_body).

Do not enable URL/query logging for OBS routes: their read tokens appear in source URLs. The included Caddy examples do not enable access logging. Never bypass TLS verification during acceptance.

## Accounts and permissions

Claim the installation using the expiring setup token. Usernames are normalized to lowercase; passwords require 12–256 characters and use Argon2id with a unique salt, 64 MiB memory and three passes. Sessions expire after 12 hours, are stored hashed in SQLite and use HttpOnly, SameSite=Lax cookies; HTTPS adds Secure. Loopback HTTP is for local development. Mutations require the matching Origin, JSON and a session CSRF token.

| Authority | Powers |
| --- | --- |
| Owner | All configuration and operations; accounts/invitations, integration secrets, source/API tokens, privacy and maintenance |
| Admin | Only owner-granted `configure`, `operate`, `moderate`, `media`, `engage` permissions |
| Moderator | Operations, moderator notes/actions, media and engagement; no general configuration or owner powers |
| Read-only | View operational state; change own password and sign out; no moderator notes or mutations |

Create one-day, single-use invitation tokens in Accounts and deliver them privately. Invitees select “I have an invitation” on the sign-in page. Owners can disable an account or revoke its sessions immediately. Password changes revoke that account's sessions. Owner host recovery additionally revokes its API/widget/player tokens. A live subscription rechecks sessions; queued operator effects recheck account/grants before execution.

Retained foundation controls require `KEKBOT_ENABLE_PROOF=1` and are served at `/foundation`. In live mode they additionally require an owner session and mutation CSRF token, plus the host proof token. Keep them disabled in normal operation. Historical proof instructions are in [FOUNDATION.md](FOUNDATION.md).

## Connect your own provider applications

### Kick

Create a developer application in your own Kick account, enable webhooks and configure the exact redirect/event URLs. In Connections enter its client ID, client secret and the creator's numeric broadcaster user ID. Values are encrypted on the host and are never returned. Environment-based Kick settings remain a bootstrap alternative; dashboard settings override them. Changing applications invalidates the saved grant.

The creator is the account whose channel KekBot serves; the app's display name is not its channel identity. Its channel URL is `https://kick.com/<channel-slug>`. Resolve the numeric `broadcaster_user_id` with Kick's official channels API and owner-controlled app credentials, as described in the [foundation identity guide](FOUNDATION.md). Authorize in the same browser while signed into that creator. The callback rejects another account.

Core scopes: `user:read channel:read chat:write events:subscribe`. Moderation additionally requests `moderation:ban` and `moderation:chat_message:manage`. The current connection button requests moderation too; do not enable moderation rules unless those scopes and provider/channel permissions work. No stream-key or ads permission is required.

Authorize, verify the creator/scopes, then reconcile subscriptions. Background refresh and reconciliation share the same token rotation; repair runs at bounded intervals. Enabled subscription alert variants add their corresponding event subscriptions. Real channel permissions and delivery identity still need a live check. `KICK_CHAT_TYPE=user` uses the authorized account; `bot` uses Kick's official bot delivery mode. The historical test accepted account-mode replies and rejected bot-mode replies; the application does not silently switch identities.

Disconnect clears local authority and attempts revocation of the saved access/refresh tokens. A failed revocation is visible; revoke the app grant in Kick as well when necessary. Reauthorization is required after an invalid/revoked refresh grant. [Kick OAuth](https://docs.kick.com/getting-started/generating-tokens-oauth2-flow), [channels](https://docs.kick.com/apis/channels), [API contract](https://api.kick.com/swagger/doc.yaml).

### Discord (optional)

Create your own Discord application and bot. Enter application ID, interaction public key and bot token in Connections. Configure its interactions endpoint using the path above. Install the bot in each intended guild with bot/application-command scopes and permission to view/send in selected channels; no gateway connection or message-content intent is used.

Enable Developer Mode in Discord to copy guild/channel/role/user IDs. Create a guild routing configuration in Connections with one explicit channel and selected notification events. Multiple configurations can route different events to different channels/guilds. Add role or user mappings as `id`/`permission` JSON objects; permissions are `operate`, `moderate`, `media`, `engage`. Empty mappings grant no controls. Local account roles do not automatically grant Discord authority.

Register commands after enabling media or changing the allowed guild set. `/kekbot action:status` reports queue IDs/versions for media moderators. An approval notification includes the item ID/version; use `action:media.approve target:<id> version:<n>`. Pause/resume/skip/volume use the current player version. Other actions cover timers, manual alerts, moderation, goals, reward decisions and poll/raffle closure/draws. Repeated interaction IDs cannot repeat an action. Changes in mappings are rechecked before deferred execution. Normal guild members can see commands but are denied operation without a mapping; Discord's own command/channel restrictions can narrow visibility further.

Interactions are verified over the original body, committed, and immediately deferred; provider work happens in the runner. Long-running or uncertain sends are visible in Maintenance. Channel sends disable mentions. Real Discord registration, routing and the three-second acknowledgement contract remain live acceptance checks. [Discord interactions](https://docs.discord.com/developers/interactions/receiving-and-responding).

### YouTube (optional)

Enable the YouTube Data API v3 in an owner-controlled project and enter its key in Connections. Restrict the key to that API and your intended server usage. Enable media in Maintenance, then set approval policy, duration, capacity, user limits, cooldowns and blocked titles/uploaders. Metadata comes from the official videos API; quota/key rejection, missing videos and embedding restrictions have explicit failed outcomes. No video downloading or audio extraction is provided.

Viewers send `!sr <YouTube URL or video ID>` in the configured creator's Kick chat. Moderators can add requests in Media, which auto-approves after validation; viewer requests follow the configured approval policy. Dashboard/Discord decisions check item versions. Reordering applies to the exact waiting approved set; clearing leaves the current item intact.

Use the player widget in OBS with the visible embedded player and controls. Autoplay/embedding errors pause the current item; enable playback in the browser/OBS settings or choose a playable item, then resume. One player holds a short lease. After restart or disconnection the queue/current item remain, playback pauses, and a moderator must resume from the beginning. A stale completion cannot advance a newer item. Do not crop/hide the embedded player's required interface. [Metadata API](https://developers.google.com/youtube/v3/docs/videos/list), [player requirements](https://developers.google.com/youtube/terms/required-minimum-functionality).

## Configure daily workflows

- **Commands:** add a `!trigger`, aliases, response pool, group, roles, cooldowns and stream conditions. Templates support `{user}`, `{args}`, `{channel}`, `{counter}`, `{points}`. Preview returns rendered samples without changing counters/cooldowns or sending chat. Templates are plain text, never executable code.
- **Timers:** configure rotating messages, interval (at least 60 seconds), minimum intervening messages, timezone and quiet-hour range. Pause/resume in the dashboard or Discord. Offline/paused/restarted schedules do not catch up missed sends. Preview sends nothing.
- **Alerts:** configure supported follow/subscription events, manual/goal/media alerts, text, priority, duration, animation, volume and asset IDs. Upload PNG/JPEG/GIF/WebP or WAV/OGG/MP3 files up to 8 MiB; SVG/HTML are rejected. Preview has separate state and optional audio controls; it creates no provider history. Remove references before deleting assets.
- **Moderation:** start with disabled rules and safe sample tests. Link/phrase/repetition/caps/burst rules support trusted roles, domains, escalation and optional start/end times. Safe tests do not send effects. Emergency pause stops automatic actions; permitted manual actions remain explicit. Ban/delete and reviewed bulk actions require acknowledgement. Inspect incident delivery outcomes, not only match decisions. Viewer search covers the latest 100 observed viewers; notes require moderation authority.
- **Goals/themes:** configure event or manual goals; adjust/reset with the displayed version. Completion can trigger alerts/notifications. Mint, midnight and paper themes use safe built-in tokens, transparent sources and reduced-motion support.
- **Points/rewards:** enable activity accrual, cadence, recent-chat window and award amount. Silent viewers cannot be measured. Watchtime is explicitly estimated from observed chat activity. Adjustments require a reason; redemptions debit atomically, rejection refunds once and completion records fulfilment.
- **Polls/raffles:** configure options/eligibility and a deadline. `!vote <number>` and `!enter` use verified Kick identities. One effective vote/entry per identity; optional poll vote changes are supported. Close before drawing; rerolls exclude previous winners and remain audited. Deadlines persist across restart.

Built-ins: `!kekbot`, `!commands`, `!uptime`, `!rules`, `!discord`, `!socials`, moderator `!so`, `!goal`, `!points`, `!watchtime`, `!top`, `!redeem`, `!vote`, `!enter`, and enabled-media `!sr`, `!queue`, `!nowplaying`, moderator `!skip`. Missing configuration/data produces an explicit explanation. Custom command triggers cannot replace these names.

### OBS sources

Create a widget in Widgets, select its type/theme/dimensions/target, then create its private OBS source URL. Paste it into an OBS Browser Source with matching dimensions. The read token is shown once. A player source also receives a separate acknowledgement credential in the URL fragment. It is not sent as part of read requests. Keep source URLs and screenshots of them private; revoke individual tokens in Maintenance and recreate the source if leaked.

All 18 kinds are available: alerts, chat, player, now-playing, queue, event feed, supporter, goal, multi-goal, status/viewer samples, counter, leaderboard, poll, raffle, countdown, shoutout, rotating socials and rotating activity. Set `target` to a command/goal/activity ID where relevant; blank selects the current set/latest activity. Countdown/rule/activity timestamps use Unix milliseconds. Disabled sources render empty. Unknown/stale provider counts show unavailable; a widget never grants moderator authority.

## History, exports and support

Analytics filters observed events by date or observed stream ID and exports JSON/CSV. Stream history is bounded to the latest 1000 observed sessions; a query returns up to 100 overlapping summaries. Viewer samples are averages with count/minimum/maximum, not a sum of concurrent viewers. Worker gaps do not prove provider coverage, and unobserved data remains unknown.

Defaults: chat text 7 days, receipts 30 days, summaries 90 days, separate security audits 365 days. Maintenance settings control retention. `chatDays=0` removes chat bodies after processing and purges completed history; a bounded ten-minute moderation window can still hold text needed for spam decisions. A disabled chat history leaves the chat overlay empty. Pending receipts are retained until processing finishes. Permanent configuration, economic ledger, participation decisions and queue state are preserved. Long-term size/load behaviour is part of Milestone 17–18 testing.

Owner viewer export includes the retained profile, ledger, redemptions, queue decisions, participation and chat; handle it as private. Erasure removes profile text, chat and moderator notes, but retains integrity/audit identifiers and economic/participation/queue decisions. If matching events are still processing, retry after they finish. New chat can create a fresh observed profile. Erasure is not a claim that all personal identifiers have been deleted.

Configuration exports transfer only native declarative configuration and referenced local assets, with a 12 MiB envelope bound. They exclude credentials, accounts, sessions, invitations, source/API tokens, guild mappings, paths and private history. Preview merge/replace first; merge skips existing IDs, replace removes the portable configuration set. Imports validate schemas, conflicts and asset bytes, remap newly uploaded asset IDs, and apply database changes atomically. For larger installations use a full backup; a configuration export is not disaster recovery. External product importers are not claimed.

Redacted support data includes versions, counts, job outcomes, scopes, timestamps, storage free space and player connection state. It omits host addresses, credentials, raw event bodies and viewer history. Review any export before sharing. Delivery states distinguish pending, confirmed, failed and uncertain. Only explicit rate limits are retried automatically; inspect the provider before reconciling an uncertain job. Reconciliation records success/failure and never resends it.

## Maintenance and recovery

| Command | Purpose |
| --- | --- |
| `kekbot init` | Migrate/initialize storage, preserve keys, create/renew unclaimed setup material |
| `kekbot doctor` | Read-only integrity/schema, lease, account/job counts and configuration diagnostics |
| `kekbot backup <new-directory>` | Consistent SQLite snapshot, assets and final checksum manifest |
| `kekbot restore <backup-directory>` | Validate and restore into empty storage with the original encryption key |
| `kekbot recover-owner <username> <password-file>` | Stopped-host owner password recovery and authority revocation |

Source usage prefixes commands with `pnpm`; packaged containers use `node src/cli.ts`. Standalone Node execution can load the private runtime file using `node --env-file=/path/to/runtime.env src/cli.ts ...`. Never put a password/secret directly in a command argument or issue report. Stop the application for initialization/migration, seeding, backup, restore and recovery; after an unclean stop wait up to 30 seconds for lease expiry. Doctor can inspect running storage.

### Back up and restore

Stop the application, then run backup to a new directory outside the active mode's storage. Backups contain accounts, settings, receipt/job state, module history and assets, including encrypted integration records. They exclude keys, environment files, setup/proof/fixture signing secrets and proof captures. Protect backups as private because the database contains user history. Protect a separate copy of the original encryption key; backup checksums provide integrity checks, not encryption or protection against an attacker replacing a whole backup.

For Compose, use a one-off container with an additional backup mount:

```sh
docker compose stop kekbot
docker compose run --rm -v /srv/kekbot/backups:/backups kekbot node src/cli.ts backup /backups/snapshot
```

Prepare the mount writable by UID/GID 1000. A failed backup lacks its final manifest and must not replace an earlier known-good backup.

Restore to a new, empty data root. **Do not run `init` first:** it would create a database that restore intentionally refuses to overwrite. Prepare the mode's secrets directory with the original encryption key and a separately generated valid proof token (32 random bytes encoded base64url). Fixture restoration also needs the RSA and Ed25519 fixture pairs. Set the new data-root/secret paths, keep the same mode, and run `restore`, then `doctor`, then start. A container's backup source can be mounted read-only.

Restore checks mode, schema, original key fingerprint, SQLite integrity and every asset checksum; it clears old runtime leases. Current code restores schema 1 or 2 backups using format 1; schema 1 upgrades on the next writable open. Run stopped-host `init` after a schema 1 restore, before `doctor`/startup, to migrate and create owner setup material. It rejects newer schemas. If validation fails, keep the original backup unchanged and inspect a fresh target before retrying.

After moving hosts, update the public origin and exact provider callback URLs, revoke old grants if needed and reauthorize. Securely replace copied credentials/tokens if the old host is untrusted. Session/source tokens are part of database state; normal restore preserves them, while host owner recovery revokes the owner's sessions/source/API tokens.

### Recover the owner

Create a protected UTF-8 file outside source containing the replacement password. Stop the application and run `recover-owner` with the existing lowercase owner username and the file's path. It resets the owner password, revokes owner sessions and access tokens, clears outstanding OAuth states and writes an audit record. It does not change provider application secrets. Remove the temporary password file securely after successful sign-in; keep recovered source URLs private. Recovery requires trusted host access and cannot bypass a lost encryption key.

### Upgrade and rollback

Record the running source/image and schema, stop, and create a verified backup with assets plus separately protected recovery keys. Build/select the exact new source/image version, then run its init/start against the existing volume. Migrations are checked-in SQL, never generated at startup. The schema 1→2 migration preserves foundation receipts/jobs/settings; upgrade while another runtime holds the lease is rejected.

If migration/startup fails, keep the logs redacted, stop, and preserve the failed storage for investigation. Restore the pre-upgrade backup into a new root with its original key and restart the compatible older image. Do not run an older binary against newer schema storage or assume downgrade SQL exists. Reconfigure callbacks when the origin changes. Migration-failure, full-storage, power-loss and upgrade campaigns remain release gates.

## Troubleshooting

| Symptom | Check |
| --- | --- |
| Runtime not ready | `doctor`, volume ownership/free space, encryption key, jobs enabled, another runtime/maintenance lease |
| Setup denied | Correct mode/token file, one-hour expiry, already-claimed status; renew init only while stopped |
| Login blocked | Correct account, disabling/session expiry, rate-limit cooldown; trusted-host recovery if necessary |
| No Kick reply | Creator/scopes, signed intake timestamp/channel, subscription check, job outcome, configured delivery type |
| Refresh requires consent | Reauthorize the intended creator; do not repeatedly retry an invalid grant |
| Discord command denied | Enabled guild/channel, exact role/user mapping, current module enablement and version |
| Media request failed | Recorded metadata error, key/quota, duration/title/uploader policy, embedding eligibility |
| Player paused/conflicting | One active source, separate player credential, lease/autoplay error; explicit moderator resume |
| Source stopped | Token revoked, widget disabled, source URL/dimensions, connectivity; do not share the URL |
| Import rejected | Format/version, conflicts, missing/mismatched assets, envelope size; preview before apply |

Health endpoints expose only liveness/readiness. Dashboard diagnostics require a local session; support exports require owner authority. Follow [SECURITY.md](../SECURITY.md) for private reporting, [API.md](API.md) for automation and [CONTRIBUTING.md](../CONTRIBUTING.md) for fixture checks.
