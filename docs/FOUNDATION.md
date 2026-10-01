# Foundation harness and acceptance

The foundation proves provider contracts, local durability, and the Next.js job lifecycle before a broad dashboard build. It is pre-release: the only chat utility is the fixed `!kekbot` proof response with a ten-second global cooldown. There are no local accounts, Discord controls, OBS widgets, or media features yet.

## Local fixture proof

Copy `.env.example` to `.env.local`, select `KEKBOT_MODE=fixture`, set `KICK_BROADCASTER_USER_ID=123`, keep `KEKBOT_RUN_JOBS=1`, and leave all live Kick credentials unset.

```sh
pnpm install --frozen-lockfile
pnpm kekbot init
pnpm dev
# In another terminal:
pnpm kekbot fixture-event
pnpm kekbot doctor
```

Initialization preserves existing secrets and prints paths, never token/key contents. It generates the fixture signing pair under `data/fixture/secrets`. The fixture sender signs a synthetic event and the runtime records an explicitly labelled fixture reply; it cannot send a real Kick request.

The private file `data/fixture/secrets/proof.token` authorizes foundation controls at `/`. Read it locally and enter it in the password field. The page keeps it only in memory. Status contains confirmed stored state, no decrypted provider credentials. The persistence probe becomes a durable job and is processed without an open browser.

```sh
pnpm check
pnpm build
pnpm exec playwright install chromium
pnpm test:e2e
pnpm start
```

The browser suite starts the production standalone output, initializes a separate temporary fixture database, verifies protected controls, exercises the UI, and proves signed intake/replay plus job processing without a browser. Build-time jobs are disabled by the build wrapper. E2E fixtures do not inherit live secrets. Stop dev before testing another server against its storage; each installation allows one runtime.

## Live Kick proof

1. Use your own Kick account and developer application. Configure your own public HTTPS origin and enable webhooks in the provider application. Keep account/app setup and scopes under your control.
2. In `.env.local`, select live mode and supply `KEKBOT_PUBLIC_URL`, `KICK_CLIENT_ID`, `KICK_CLIENT_SECRET` (or its secret-file alternative), and your `KICK_BROADCASTER_USER_ID`. Select `KICK_CHAT_TYPE=bot` or `user`. This controls official API delivery type; it does not promise an arbitrary custom bot identity.
3. Register the exact redirect URL `https://YOUR-HOST/api/providers/kick/callback` and webhook URL `https://YOUR-HOST/api/providers/kick/events`. URLs derive from the configured origin, not forwarded headers.
4. Run `pnpm kekbot init`, then start the runtime. Supply the private live proof token to the foundation page using that same public origin. Click **Authorize Kick**. The HttpOnly OAuth binding cookie must be in the browser making the callback.
5. Confirm the grant belongs to the configured creator and contains the required scopes. Click **Subscribe to Kick events**. This reconciles chat/follow/stream-state subscriptions with Kick and sends a subscription mutation for missing events.
6. Send `!kekbot` in actual channel chat. Confirm the reply in Kick, its actual visible identity, the signed receipt, and the protected status's confirmed provider message ID. Cause a real follow and verify its receipt. Observe stream-state events when available.
7. Securely retain a redacted test receipt/body plus its original signed headers during the acceptance session. Replay it within the accepted timestamp window; verify no additional response. Reject a valid signed event from another configured test channel. Do not put raw chat or credentials in Git.
8. Exercise duplicate/subscription repair, expired/failed refresh and reauthorization, a runtime restart, and backup/restore. Repeat with a second independent owner/app/channel and another host as part of the v0.1 release-candidate gate.

Required scopes: `user:read channel:read chat:write events:subscribe`. Signed intake uses the official Kick key endpoint, a 64 KiB payload bound, the original body, a provisional 48-hour retry window, and five-minute future tolerance. Confirm retry behavior against live evidence before release. Only configured-channel effects are accepted.

Failed refresh remains actionable until reauthorization. Uncertain sends are stored without automatic retry; a moderator must inspect Kick before deliberately attempting another action. Missing credentials disable the live proof rather than selecting fixtures. Provider status is not considered end-to-end connected merely because OAuth succeeds.

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

Keep `.env.local` private. Compose overrides the container data directory to `/data` and binds its direct HTTP port to host loopback. Initialization must precede server startup. The source build is currently `kekbot:0.0.1`, unreleased; published release images arrive after acceptance and are pinned explicitly.

For an existing reverse proxy, forward your public hostname to `127.0.0.1:3000`, limit request bodies to 64 KiB for this harness, and disable streaming buffering. Alternatively use the optional Caddy example:

```sh
KEKBOT_DOMAIN=your-host.example docker compose -f compose.yaml -f compose.proxy.yaml up -d
```

In PowerShell, set `$env:KEKBOT_DOMAIN` before invoking Compose. Public DNS must reach your host; allow inbound 80/443 for the proxy and certificate issuance. An operator-controlled tunnel is another ingress choice. Neither proxy nor tunnel is a KekBot-operated dependency. A LAN-only address cannot receive internet callbacks. Keep the host on for event intake.

Foundation image smoke check, when Docker is available:

```sh
docker build -t kekbot:ci .
pnpm test:container
```

The smoke script creates and cleans up only its own named test container/volume. CI does not push images. Core operation does not contact project infrastructure; live Kick mode contacts `id.kick.com` and `api.kick.com`. Discord/YouTube provider contacts will be documented when those modules are enabled. Framework telemetry is disabled in build/start/container paths; set the included flag during development.

## Backup and restore

Stop the application first. A runtime/maintenance lease rejects a concurrent backup. After an unclean stop, allow up to 30 seconds for the lease to expire.

```sh
pnpm kekbot backup ./backups/foundation-2026-10-01
```

Backups contain a consistent SQLite snapshot, local assets, and a versioned checksum manifest written last. They exclude the encryption key, proof token, environment configuration, and fixture private key. A failed backup remains visibly incomplete and never replaces an earlier backup. Keep the original encryption key securely with separate recovery material; the database fingerprint cannot recover it.

Restore to a **new** data root. Copy the original encryption key separately to the target mode's `secrets/encryption.key`, and provide a new random proof token at `secrets/proof.token` (or mount the corresponding original secret files). Fixture restoration also needs its signing pair. Do not run `init` before restoring: it would create an empty database that restoration intentionally refuses to overwrite.

Set `KEKBOT_DATA_DIR` to the new root, keep the same mode, and run:

```sh
pnpm kekbot restore ./backups/foundation-2026-10-01
pnpm kekbot doctor
pnpm start
```

Restore validates mode/schema/key/integrity/checksums, removes stale runtime leases, and publishes the restored database only after validation. Supported schema is currently 1 and backup format 1. Future migration/upgrade gates must preserve earlier backups. Reconfigure provider applications and reauthorize when moving callback addresses.

For containers, stop Compose and use a one-off `node src/cli.ts backup` or `restore` command with an additional host-mounted backup directory. The backup destination must be outside `/data/live` or `/data/fixture`. No restore overwrites existing data. `recover-owner` is deliberately absent until the accounts increment provides audited session revocation and recovery.

## Acceptance evidence

| Evidence | Current result |
| --- | --- |
| Type checking and lint | Passed locally with `pnpm check` |
| Unit/provider/real SQLite/runtime tests | 23 tests passed with `pnpm test` |
| Standalone build and browser proof | Production build passed without warnings; three Playwright tests passed against built standalone output |
| Packaged host CLI | Initialization, diagnostics, and backup passed outside the checkout without development dependencies |
| Dependency advisory check | `pnpm audit --prod`: no known vulnerabilities reported |
| Linux image/non-root container smoke | Not run locally: Docker unavailable; CI path supplied |
| Live Kick OAuth/events/reply and identity | Not run: owner credentials and public HTTPS ingress not supplied |
| Separate independent owner/app/channel | Not run: independent operators required |
| Live restore to another host | Not run: second host/operator required; local real-database restoration tested |

Record future live evidence with date, source commit, app/runtime/schema versions, independent operator, redacted scopes/identity, event type/delivery ID, actual reply/message ID, replay outcome, failure/recovery result, and backup/restore host details. Do not mark the foundation gate complete until live and container evidence exists.

Primary contracts: [Kick OAuth](https://docs.kick.com/getting-started/generating-tokens-oauth2-flow), [webhook setup](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/events/introduction.md), [signature security](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/events/webhook-security.md), [API schema](https://api.kick.com/swagger/doc.yaml), [Next.js standalone output](https://nextjs.org/docs/app/api-reference/config/next-config-js/output).
