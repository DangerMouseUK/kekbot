# Foundation harness and acceptance

This document preserves Milestone 1's historical provider/durability proof and its reusable diagnostic workflow. That live gate passed on 2026-10-02; the original droplet was destroyed before the local product build. Historical evidence below applies to the identified foundation snapshot, not to untested later features.

**New operators:** start with [Getting started](GETTING_STARTED.md), [provider setup](PROVIDERS.md), [OBS](OBS.md) and [backup/recovery](BACKUP_RECOVERY.md). Normal operation uses local accounts with proof tools disabled. This page is for explicitly enabled diagnostics. The current [API](API.md), [milestones](MILESTONES.md) and [documentation index](README.md) cover the assembled product.

Current command syntax is in [CLI](CLI.md); delegated access is in [accounts](ACCOUNTS.md). Run a new diagnostic against new authorized infrastructure and current provider settings. Do not infer a running host, reusable capture or surviving key from dated evidence in this document.

<!-- contents:start -->
**On this page**

- [Local fixture proof](#local-fixture-proof)
- [Live Kick proof](#live-kick-proof)
- [Container and public HTTPS](#container-and-public-https)
- [Backup and restore](#backup-and-restore)
- [Historical foundation acceptance evidence](#historical-foundation-acceptance-evidence)
<!-- contents:end -->

## Local fixture proof

Copy `.env.example` to `.env.local`, select `KEKBOT_MODE=fixture`, set `KICK_BROADCASTER_USER_ID=123` and `KEKBOT_PUBLIC_URL=http://127.0.0.1:3000`, keep `KEKBOT_RUN_JOBS=1`, explicitly enable `KEKBOT_ENABLE_PROOF=1` for this diagnostic workflow, and leave all live Kick credentials unset. Open that exact local origin.

```sh
pnpm install --frozen-lockfile
pnpm kekbot init
pnpm dev
# In another terminal:
pnpm kekbot fixture-event
pnpm kekbot doctor
```

Initialization preserves existing secrets and prints paths, never token/key contents. It generates the fixture signing pair under `data/fixture/secrets`. The fixture sender signs a synthetic event and the runtime records an explicitly labelled fixture reply; it cannot send a real Kick request.

The private file `data/fixture/secrets/proof.token` authorizes explicitly enabled fixture foundation controls at `/foundation`. Read it locally and enter it in the password field. The page keeps it only in memory. Status contains confirmed stored state, no decrypted provider credentials. The persistence probe becomes a durable job and is processed without an open browser.

```sh
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm start
```

The browser suite starts the production standalone output, initializes a separate temporary fixture database, verifies protected controls, exercises the UI, and proves signed intake/replay plus job processing without a browser. Build-time jobs are disabled by the build wrapper. E2E fixtures do not inherit live secrets. Stop dev before testing another server against its storage; each installation allows one runtime.

## Live Kick proof

### Identify the creator account and channel

Sign in to the Kick account whose channel this installation will serve. Click your avatar in the top-right corner and select **Channel**. Copy your own channel URL, such as `https://kick.com/your-channel`; its final path segment is the channel username (slug). The developer application's name identifies the app and can differ from this username. You can do this while the channel is offline. [Kick account menu](https://help.kick.com/en/articles/14994615-understanding-kick-com-s-homepage-and-finding-content)

`KICK_BROADCASTER_USER_ID` requires a numeric account ID, not that username or the developer application's client ID. Kick's official `GET /public/v1/channels?slug=<channel-slug>` API accepts an app access token and returns `broadcaster_user_id`. Resolve it using protected credentials, keep the result in private runtime configuration, and authorize in the browser as that same creator account. The foundation rejects a grant from a different account. [Kick channel API](https://docs.kick.com/apis/channels)

### Connect and verify

1. Use your own Kick account and developer application. Configure your own public HTTPS origin and enable webhooks in the provider application. Keep account/app setup and scopes under your control.
2. In `.env.local`, select live mode and supply `KEKBOT_PUBLIC_URL`, `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET` (or its secret-file alternative), and your `KICK_BROADCASTER_USER_ID`. Select `KICK_CHAT_TYPE=bot` or `user`. This controls official API delivery type; it does not promise an arbitrary custom bot identity.
3. Register the exact redirect URL `https://YOUR-HOST/api/providers/kick/callback` and webhook URL `https://YOUR-HOST/api/providers/kick/events`. URLs derive from the configured origin, not forwarded headers.
4. Explicitly enable proof tools, run `pnpm kekbot init`, start the runtime and claim/sign into the owner account using the setup token. Supply the private live proof token at `/foundation` using that same public origin. Click **Authorize Kick**. The HttpOnly OAuth binding cookie must be in the browser making the callback.
5. Confirm the grant belongs to the configured creator and contains the required scopes. Click **Subscribe to Kick events**. This reconciles chat/follow/stream-state subscriptions with Kick and sends a subscription mutation for missing events.
6. Send `!kekbot` in actual channel chat. Confirm the reply in Kick, its actual visible identity, the signed receipt, and the protected status's confirmed provider message ID. Cause a real follow and verify its receipt. Observe stream-state events when available.
7. Wait beyond the ten-second command cooldown, click **Capture next proof event**, then send a new `!kekbot` message within five minutes. Capture is off by default, consumes one verified and committed proof command, and stores exact bytes and original signature headers encrypted under the mode's `secrets/proof-captures` directory. Status shows its delivery ID and expiry, never its body. Altering or redacting a signed body makes its original signature unusable.
8. Wait beyond the ten-second command cooldown, then run `pnpm kekbot proof-replay <delivery-id> --live`. It requires an existing committed receipt, a valid encrypted capture, live mode, the explicit flag, and the configured HTTPS origin. A confirmed duplicate must not create another job or response. Repeat after restart. The CLI does not accept arbitrary replay targets, print payloads, bypass TLS, follow redirects, or retry sends.
9. Click **Refresh Kick grant** to exercise real refresh without waiting for token expiry. It shares token rotation with background work and returns only sanitized status. Exercise missing-subscription repair and reauthorization after revoking the dedicated test grant. Record pending, failed, or uncertain results honestly.
10. Exercise backup/restore. Repeat with a second independent owner/app/channel and another host as part of the v0.1 release-candidate gate. Keep identifying test details outside the repository.

Required scopes: `user:read channel:read chat:write events:subscribe`. Signed intake uses the official Kick key endpoint, a 64 KiB payload bound, the original body, a provisional 48-hour retry window, and five-minute future tolerance. Confirm retry behavior against live evidence before release. Only configured-channel effects are accepted.

Choose delivery identity explicitly: `KICK_CHAT_TYPE=user` sends as the authorized Kick account; `bot` selects Kick's bot delivery mode. Creating a developer application with a name does not select an arbitrary chat sender name. During live verification on 2026-10-02, bot-mode sends returned HTTP 404 while account-mode sends returned HTTP 200 with `is_sent=true` and a message ID. The operator's private configuration was set to account mode; no automatic identity fallback was added. [Kick chat contract](https://docs.kick.com/apis/chat)

Failed refresh remains actionable until reauthorization. Uncertain sends are stored without automatic retry; a moderator must inspect Kick before deliberately attempting another action. Missing credentials disable the live proof rather than selecting fixtures. Provider status is not considered end-to-end connected merely because OAuth succeeds.

The Kick developer application's required scope selections are **Read user information**, **Read channel information**, **Write to Chat feed**, and **Subscribe to events**. The foundation does not need stream-key, channel-update, rewards, moderation, KICKs, or ads access. Enable webhooks explicitly. [Kick app setup](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/getting-started/kick-apps-setup.md)

Capture arming expires after five minutes and resets on restart. Duplicate deliveries and ordinary chat do not consume it. Captures expire with the signed event's 48-hour replay window; hourly cleanup removes expired captures in bounded batches. Captures are excluded from backup and restore. A capture write failure appears in protected status while the already committed receipt and job remain accepted. Existing durable receipts remain authoritative after a capture expires or is removed.

## Container and public HTTPS

Docker is not required for local source tests. Linux x86-64/local disk is the initial production topology; Windows/macOS use Docker Desktop. No Docker installation is attempted by this project.

The image runs as UID/GID 1000. Prepare a writable data directory on Linux:

```sh
mkdir -p data
sudo chown 1000:1000 data
docker compose build
docker compose run --rm kekbot node src/cli.ts init
docker compose up -d
```

Keep `.env.local` private. Compose overrides the container data directory to `/data` and binds its direct HTTP port to host loopback. Initialization must precede server startup. The current candidate source build is `kekbot:0.1.0-beta.4`; use the [beta guide](BETA.md) for current distribution status. Published packages are selected explicitly. Historical foundation evidence below retains its original source identity.

For an existing reverse proxy, forward your public hostname to `127.0.0.1:3000`, limit provider requests to 64 KiB, permit up to 12 MiB for authenticated assets/configuration, and disable streaming buffering. Alternatively use the optional Caddy example:

```sh
KEKBOT_DOMAIN=your-host.example docker compose -f compose.yaml -f compose.proxy.yaml up -d --build
```

In PowerShell, set `$env:KEKBOT_DOMAIN` before invoking Compose. Public DNS must reach your host; allow inbound 80/443 for the proxy and certificate issuance. An operator-controlled tunnel is another ingress choice. Neither proxy nor tunnel is a KekBot-operated dependency. A LAN-only address cannot receive internet callbacks. Keep the host on for event intake.

### Trusted HTTPS using a public IPv4 address

For a test host without a domain, the separate IP example uses Caddy **2.11.6**, explicitly selects Let's Encrypt's **shortlived** ACME profile, and persists certificate storage. IP certificates are publicly trusted and valid for approximately six days, so automatic renewal and continuous reachability matter. The ordinary domain example remains available. [Let's Encrypt IP certificates](https://letsencrypt.org/2026/01/15/6day-and-ip-general-availability), [Caddy ACME configuration](https://caddyserver.com/docs/caddyfile/directives/tls)

The current optional proxy image builds standard Caddy 2.11.6 from locked Go modules with patched Go/networking dependencies and immutable base images; see [runtime image](RUNTIME_IMAGE.md). The historical foundation deployment below used the checksum-pinned official release binary. Both proxy examples use this image. The build rejects other architectures; ARM64 remains later scope. [Caddy release](https://github.com/caddyserver/caddy/releases/tag/v2.11.6)

Set `KEKBOT_PUBLIC_URL=https://<your-public-ip>` in the private runtime configuration and use that exact origin for both Kick URLs. Confirm that Kick accepts the numeric-host registration and actual callbacks before calling this path live-tested. A trusted certificate alone cannot prove provider compatibility. Certificate transparency logs make the certified address publicly discoverable.

Compose can read configuration and persist data outside the source checkout:

```sh
export KEKBOT_ENV_FILE=/srv/kekbot/runtime.env
export KEKBOT_HOST_DATA_DIR=/srv/kekbot/data
export KEKBOT_PUBLIC_IP=<your-public-ip>
docker compose -f compose.yaml -f compose.ip.yaml build
docker compose -f compose.yaml -f compose.ip.yaml run --rm kekbot node src/cli.ts init
docker compose -f compose.yaml -f compose.ip.yaml up -d
```

Create the private environment file and writable data directory before running these commands. They are operator inputs, excluded from source snapshots and CI. `KEKBOT_ENV_FILE` and `KEKBOT_HOST_DATA_DIR` are host-side Compose settings; `KEKBOT_DATA_DIR` remains `/data` inside the container. A secret-file path in runtime configuration must name the container-visible path, for example `/data/live/secrets/kick-client-secret`.

Use **either** `compose.ip.yaml` **or** `compose.proxy.yaml` alongside the base file. Ports 80/443 must reach Caddy; port 3000 remains loopback-only. The IP configuration sets `default_sni` so ordinary clients that omit SNI receive the public-IP certificate through Docker's address translation. Verify HTTPS with normal certificate checks, inspect the IP subject and expiry, retain Caddy volumes across restarts, and verify renewal scheduling. Do not remove certificate storage to force repeated issuance. Example validation uses `caddy adapt` without contacting an ACME service.

Foundation image smoke check, when Docker is available:

```sh
docker build -t kekbot:ci .
pnpm test:container
```

The smoke script creates and cleans up only its own named test container/volume. CI does not push images. Core operation does not contact project infrastructure; live Kick mode contacts `id.kick.com` and `api.kick.com`. Enabled Discord uses `discord.com` API endpoints; YouTube metadata uses `www.googleapis.com` and its visible player uses official YouTube embed resources. Current module setup is in the [provider](PROVIDERS.md) and [user](USER_GUIDE.md) guides. Framework telemetry is disabled in build/start/container paths; set the included flag during development.

## Backup and restore

Stop the application first. A runtime/maintenance lease rejects a concurrent backup. After an unclean stop, allow up to 30 seconds for the lease to expire.

```sh
pnpm kekbot backup ./backups/foundation-2026-10-01
```

Backups contain a consistent SQLite snapshot, local assets, and a versioned checksum manifest written last. The new snapshot uses a rollback journal so restoration can read it from a read-only mount without creating WAL sidecars; the application database remains in WAL mode. They exclude the encryption key, proof token, environment configuration, fixture private key, and encrypted proof captures. A failed backup remains visibly incomplete and never replaces an earlier backup. Keep the original encryption key securely with separate recovery material; the database fingerprint cannot recover it.

Restore to a **new** data root. Copy the original encryption key separately to the target mode's `secrets/encryption.key`, and provide a new random proof token at `secrets/proof.token` (or mount the corresponding original secret files). Fixture restoration also needs its RSA and Ed25519 signing pairs. Do not run `init` before restoring: it would create an empty database that restoration intentionally refuses to overwrite.

Set `KEKBOT_DATA_DIR` to the new root, keep the same mode, and run:

```sh
pnpm kekbot restore ./backups/foundation-2026-10-01
pnpm kekbot doctor
pnpm start
```

Restore validates mode/schema/key/integrity/checksums, removes stale runtime leases, and publishes the restored database only after validation. Current code supports schema 1–3 backups and backup format 1. Restored schema 1 storage upgrades on the next writable open; run stopped-host `init` after restore before `doctor` if an upgrade/setup is required. Reconfigure provider applications and reauthorize when moving callback addresses.

For containers, stop Compose and use a one-off `node src/cli.ts backup` or `restore` command with an additional host-mounted backup directory. The backup destination must be outside `/data/live` or `/data/fixture`. Prepare the new data root **and its mode directory** as writable by UID/GID 1000; manually creating only a nested `secrets` directory can leave its parent root-owned. Keep secret files readable only by the application user. No restore overwrites existing data. Follow the [current backup/recovery guide](BACKUP_RECOVERY.md) for container commands and audited owner recovery.

## Historical foundation acceptance evidence

| Evidence | Current result |
| --- | --- |
| Type checking and lint | Passed locally with `pnpm check` |
| Unit/provider/real SQLite/runtime tests | Foundation publication: 23 passed. Proof capture/replay and provider acceptance additions: 33 passed. Including publication-policy regressions: 37 passed locally with `pnpm check` |
| Publication boundary | Passed 2026-10-02: publication-policy checks, redacted source/history secret scans, private-runtime-value comparison, generated-artifact secret checks and Git ignore probes. Private installation files are excluded from Git and Docker; CI publishes no application artifacts or images |
| Standalone build and browser proof | Production build passed without warnings; three Playwright tests passed against built standalone output |
| Packaged host CLI | Initialization, diagnostics, and backup passed outside the checkout without development dependencies |
| Dependency advisory check | `pnpm audit --prod`: no known vulnerabilities reported |
| Linux image/non-root container smoke | Initial [GitHub CI](https://github.com/DangerMouseUK/kekbot/actions/runs/36932520021) on `4d04db5` passed. Current image build and expanded capture/read-only-restore/asset/replay smoke passed on a private Linux host 2026-10-02; Windows Docker unavailable |
| Public-IP HTTPS and runtime lifecycle | Passed 2026-10-02: Caddy 2.11.6, trusted IP certificate with normal Node/curl/OpenSSL checks, persistent certificate bytes after proxy restart, renewal scheduling, protected controls, live-mode probe processing without a dashboard and persistence after application restart |
| Linux process termination and recovery | Passed 2026-10-02 in isolated fixtures with external networking disabled: pending work recovers, duplicate signed delivery remains a duplicate after restart and separate-directory restore; asset preserved and captures excluded |
| Live Kick OAuth/events/reply and identity | Passed 2026-10-02 for owner OAuth over IP HTTPS, four required scopes, real signed chat intake, confirmed account-mode reply and its verified sender identity; operator observed the reply in chat |
| Live follow | Passed 2026-10-02: signed follow from another account matched the configured channel, committed and processed successfully |
| Live reconciliation and refresh | Passed 2026-10-02: two repeated reconciliation requests kept the same three subscription IDs; real shared refresh succeeded with required scopes intact; removal of one follow subscription was repaired without changing chat/stream subscriptions |
| Revoked-grant recovery | Passed 2026-10-02: both dedicated test tokens revoked, introspection rejected the access token, shared refresh failed safely and status required reauthorization while the worker stayed healthy. New browser consent restored the matching creator grant, cleared the error and retained all three subscriptions; a new reply succeeded on its first attempt with verified sender identity and operator confirmation |
| Real chat without an open dashboard | Passed 2026-10-02: operator closed the foundation page, sent a real command from another account, observed the reply, and the durable reply job succeeded on its first attempt |
| Live signed replay and restart | Passed 2026-10-02: the captured real command produced one confirmed reply on its first attempt; CLI replays after cooldown and after restart returned duplicate without changing receipt/job/reply counts. Grant, delivery configuration and encrypted capture survived restart |
| Live-record backup and same-host restore | Passed 2026-10-02: stopped database/asset backup, restore from a read-only mount into separate storage, encrypted grant validation, original-signature duplicate protection through shared intake, unchanged durable counts and excluded captures. No restored provider worker was started |
| Separate independent owner/app/channel | Not run: independent operators required |
| Live restore to another host | Not run: second host/operator required; local real-database restoration tested |

The single-owner foundation gate passed on 2026-10-02. Accounts and subsequent local modules have since been implemented; their separate evidence is tracked in MILESTONES.md. Controlled stream-state delivery was not tested because no test stream was available; independent-owner trials and another-host restoration remain release-candidate requirements. Certificate renewal is configured and scheduled, but an actual renewal has not yet been observed.

The initial public commit's CI also passed documentation/migration checks, the production dependency audit, and the redacted full-history secret scan on 2026-10-01. Container evidence includes initialization as the non-root user, readiness, rejection of unauthorized mutations, signed fixture processing without a dashboard, clean shutdown, and diagnostics against persisted storage. The latest foundation additions have local and Linux-host verification; their GitHub CI run is still pending.

The 2026-10-02 application evidence uses source base `9bab2fe` plus the foundation implementation snapshot, manifest SHA256 `b366b437e63fc591c9958d0643444bd8b32dac7eb6f3203e1224c76d8a955644` (85 files, uncommitted at deployment). Versions: KekBot 0.0.1, Node 24.21.0, Next.js 16.3.8, schema 1 and backup format 1. The optional proxy uses the checksum-pinned official Caddy 2.11.6 binary. Documentation evidence was updated after that snapshot; actual addresses, credentials and detailed operating records remain private.

Record future live evidence with date, source commit, app/runtime/schema versions, event types and redacted outcomes. Keep actual operator identities, delivery/message IDs, host details and recovery locations in private operating records. Each later gate requires its own live and container evidence.

Primary contracts: [Kick OAuth](https://docs.kick.com/getting-started/generating-tokens-oauth2-flow), [webhook setup](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/events/introduction.md), [signature security](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/events/webhook-security.md), [API schema](https://api.kick.com/swagger/doc.yaml), [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).
