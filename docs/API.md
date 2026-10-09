# HTTP and domain interfaces

Development API version: `v1`; implementation: `0.1.0-beta.2`, schema 3. Routes are dynamic/no-store. This is a pre-release interface; compatibility beyond the declared configuration/backup versions is not yet promised. See the [beta compatibility notes](releases/v0.1.0-beta.2.md#compatibility-and-upgrades).

Host installation/update/uninstall is deliberately outside HTTP/dashboard authority. The [terminal wizard](INSTALLER.md) needs trusted host/root access and its private management record; API tokens cannot invoke it. Application maintenance CLI and all domain/role contracts remain unchanged.

Start with [installation](INSTALLATION.md) and [provider setup](PROVIDERS.md) for a working host, [the user guide](USER_GUIDE.md) for dashboard actions, and [configuration](CONFIGURATION.md) for environment/storage defaults. Return to the [documentation index](README.md).

For every supported action, payload, capability and Discord/API availability, use the [action reference](API_ACTIONS.md). For every configuration property, use the [field reference](CONFIGURATION_FIELDS.md) and [schema-checked JSON examples](examples/README.md). The source currently has no generated OpenAPI contract; those references describe the development interface.

<!-- contents:start -->
**On this page**

- [Authentication boundaries](#authentication-boundaries)
- [Examples](#examples)
- [Route inventory](#route-inventory)
- [Configurations and actions](#configurations-and-actions)
- [Live state and playback](#live-state-and-playback)
- [Failures and durability](#failures-and-durability)
- [Fixture workload metrics](#fixture-workload-metrics)
- [Media history reads](#media-history-reads)
- [Waiting-work reads](#waiting-work-reads)
<!-- contents:end -->

## Authentication boundaries

Dashboard operations use the HttpOnly `kekbot_session` cookie. `GET /api/auth` returns the current actor and CSRF token; mutation requests require matching Origin, `Content-Type: application/json` and `X-CSRF-Token`. No route accepts roles or actors supplied in request JSON. Domain services recheck permissions for mutations; deferred actions recheck current authority at execution.

Owner API tokens are separate, individually named, shown once and stored hashed. Create them in Maintenance with only the required scopes; pass `Authorization: Bearer <TOKEN>` to `/api/v1/control`. Revocation takes immediate effect. The current limit is 60 requests/minute/token; it resets on process restart. Tokens never authorize login, secret management, accounts, host maintenance or widget/player operations.

| Scope | Operations |
| --- | --- |
| `read` | `GET /api/v1/control` operational snapshot; protected moderator notes are excluded without `moderate` |
| `configure` | `config.save/delete` for allowed domain documents; settings/guild mappings still require owner-only integration authority |
| `operate` | `status`, `timers.pause/resume`, `alert.manual`, `goal.adjust` |
| `moderate` | `moderation.warn/delete/timeout/ban/pause/resume/bulk/test/incident.start/incident.stop`; moderator notes additionally use `configure` for API editing |
| `media` | Request/approve/reject/remove/reorder/clear; player pause/resume/skip/volume |
| `engage` | Points adjustments, reward complete/reject, activity close, raffle draw/reroll |

The API adapter permits a bounded action allowlist and dispatches into the same control/domain services as the dashboard. It does not accept arbitrary provider URLs or executable templates. Authorization also runs inside domain services: an API action mapped to one scope may need another scope for its target document (for example notes). Use the narrow combined scopes required by your integration.

## Examples

Use your own origin and a token loaded privately by your caller. Example placeholders contain no credentials:

```http
GET /api/v1/control HTTP/1.1
Authorization: Bearer <TOKEN>
```

```json
{
  "action": "config.save",
  "input": {
    "kind": "command",
    "data": {
      "name": "Welcome",
      "trigger": "!welcome",
      "responses": ["Welcome, {user}!"]
    }
  }
}
```

POST this JSON to `/api/v1/control` with the appropriate bearer token. Updates include the existing `id` and `version`; stale edits fail with HTTP 409 and require a fresh snapshot. Creates return the saved document, stable ID and version. Provider actions return pending work; inspect job outcomes before declaring delivery successful.

```json
{"action":"media.approve","input":{"target":"<ITEM_ID>","version":2}}
```

```json
{"action":"player.resume","input":{"version":3}}
```

```json
{"action":"moderation.ban","input":{"target":"<VIEWER_ID>","reason":"Reviewed incident","acknowledge":true}}
```

IDs in these examples must be replaced with actual values obtained privately. Ban/delete/bulk require explicit acknowledgement; a bulk input uses numeric `targets` (up to 20 unique viewers), `operation`, `reason` and `acknowledge:true`. The API does not automatically retry arbitrary caller POSTs with a new ID; query current state before retrying a response whose outcome is unknown.

### Read state without putting a token in shell history

Create a named API token with `read` in **Maintenance**, then save its one-time value in a protected file outside source. This Bash example runs with Node 24 from any working directory. Replace the origin and file path in the script; it reads the credential from disk, rejects redirects and prints only aggregate state counts:

```sh
node --input-type=module <<'JS'
import { readFileSync } from 'node:fs';
const origin = 'https://kekbot.example';
try {
  const token = readFileSync('/private/kekbot-api.token', 'utf8').trim();
  const response = await fetch(`${origin}/api/v1/control`, {
    headers: { Authorization: `Bearer ${token}` },
    redirect: 'error', signal: AbortSignal.timeout(10000)
  });
  if (!response.ok) throw new Error(`http_${response.status}`);
  const { version, state } = await response.json();
  console.log(JSON.stringify({ version, documents: state.documents.length, jobs: state.jobs.length }));
} catch {
  console.error('API read failed; inspect authorization, origin and connectivity privately.');
  process.exitCode = 1;
}
JS
```

For a mutation, add the needed scope and JSON action body; do not log the authorization header or full operational snapshot. Owner API credentials cannot authenticate SSE/dashboard routes. Session-based integrations instead need the cookie/CSRF/Origin contract and must handle expiry; prefer API tokens for external automation.

Temporary incident mode uses `moderation.incident.start` with `preset` (`links`, `burst`, `combined`), integer `minutes` (1–120) and `acknowledge:true`; stop with `moderation.incident.stop`. Presets warn, exempt moderators/broadcaster, expire durably, preserve normal rules and respect emergency pause. Rule configuration supports `escalationAfter` previous matching-rule incidents, `escalationWindowSeconds` and `escalationAction`, with existing defaults of 2 / 3600 / timeout. Media validation queues one final chat outcome for viewer requests; source snapshots include only a requester display name. Dashboard-only `invite` grants cannot be issued through integration API tokens.

## Route inventory

| Route | Access and behaviour |
| --- | --- |
| `GET/POST /api/auth` | Setup/login/invite acceptance; session logout/password change. Bounded request/rate limits. |
| `GET/POST /api/control` | Local session snapshot / action dispatch; owner additions for account/token/asset administration. |
| `GET /api/control?view=analytics` | Local session; `from`/`to` Unix milliseconds and optional observed `stream` ID; `format=csv` for download, otherwise JSON. |
| `POST /api/connections/kick` | Owner + CSRF; creates browser-bound OAuth authorization URL; optional `moderation=1`. |
| `GET /api/providers/kick/callback` | Owner session, one-use state and binding cookie; encrypted matching-creator grant. |
| `POST /api/providers/kick/events` | Original-byte RSA verification with trusted provider key, configured creator, bounded timestamp/body, transactional receipt/job intake. |
| `POST /api/providers/discord/interactions` | Original-byte Ed25519 signature, timestamp/application/guild/channel checks; PING or durable deferred interaction. |
| `GET /api/events` | Local session SSE; session rechecked continuously. |
| `GET /api/widgets/:id?token=…` | Exact widget read token; minimal snapshot. `stream=1` selects SSE. |
| `GET /widgets/:id?token=…` | Browser Source HTML entry; player pages also use their separate credential fragment. |
| `POST /api/player/:id` | Separate exact player bearer token; `lease` and bound completion/error acknowledgements. |
| `GET /api/assets/:id` | Local session or alerts-widget read token; recognized safe file types, nosniff. |
| `GET /api/health/live`, `/api/health/ready` | Public liveness / worker readiness, no private diagnostics. |
| `/api/foundation/*` | Disabled by default. Explicit proof mode; live additionally owner session and CSRF on mutations. |

## Configurations and actions

`src/server/domain/catalog.ts` is the authoritative bounded schema inventory. Documents have stable IDs, kinds, JSON data, optimistic versions and update timestamps. Native configuration schemas reject unknown keys; HTTP mutations ignore no unknown document properties silently.

Kinds: command, timer, alert, widget, rule, goal, reward, poll, raffle, note, guild and singleton settings (`instance`). `config.save` takes `kind`, optional `id`, `data`, and the current `version` for updates. `config.delete` takes `id`/`version`; settings cannot be deleted.

Dashboard-only owner operations additionally manage accounts/invitations, encrypted integration settings, assets, read/player/API tokens, privacy exports/erasure, redacted support data and native configuration import/export. Pure `command.preview`, `timer.preview`, `alert.preview` and `moderation.test` do not enqueue live effects. See [accounts/permissions](USER_GUIDE.md#accounts-and-permissions), [daily workflows](USER_GUIDE.md), [OBS credentials](OBS.md) and [privacy/export operations](OPERATIONS.md).

Configuration envelope: `{"format":"kekbot-config","version":1,"documents":[…],"assets":[…]}`. Portable kinds are commands/timers/alerts/widgets/rules/goals/rewards/settings. Each asset carries its original ID/name and base64 bytes. Document IDs are retained; newly uploaded asset IDs are generated locally and alert references are remapped. Import never writes a caller-supplied path. Merge skips existing document IDs; replace removes the portable set before saving the validated replacement. A preview enumerates create/conflict/remove/asset decisions. Unsupported formats fail explicitly. Use full backups for account/history migration and larger asset sets.

## Live state and playback

SSE events have durable numeric IDs stored in SQLite. A caller may reconnect with `Last-Event-ID`; IDs outside retained history cause a snapshot recovery event. Dashboard events instruct the client to refetch authorized state; widget events carry only that source's minimal snapshot. Streams send heartbeats, use no-store/no-transform, disable proxy buffering and close on revocation. History is bounded to 1000 events and each pump to 100 IDs.

Player requests use a separate bearer credential; read-only widget tokens cannot claim leases or acknowledge. Lease renewal runs every five seconds with a 15-second expiry. Completion/error input binds `lease`, `item`, `version`, and `action`. The visible player reports errors/autoplay restrictions and pauses; a disconnected lease never implies completion. Recovery preserves current item/queue, pauses, and requires moderator resume from the beginning.

## Failures and durability

Responses use sanitized error codes (and validation field names), never raw provider responses, passwords, bearer tokens or URLs containing secrets. Common statuses: 400 invalid input, 401 missing/expired authority, 403 insufficient permission/origin/CSRF, 409 stale state/invalid transition, 413 body too large, 429 rate limit, and 503 unavailable runtime/storage/configuration.

Durable jobs distinguish pending/running/succeeded/failed/uncertain. Domain changes and their outbox entries commit atomically. Only explicit provider rate limits have safe bounded automatic retries. A terminated outbound action becomes uncertain rather than being blindly resent; operator reconciliation records the observed result. Local queue/points/vote transitions have durable IDs and short transactions. HTTP alone cannot guarantee exactly-once external delivery.

Fixtures create signing keys and credentials at runtime in isolated ignored storage. CI exercises signed Kick/Discord intake and simulated playback without real credentials or provider mutations. See [architecture](ARCHITECTURE.md), [milestones](MILESTONES.md), and [contribution guidance](../CONTRIBUTING.md).

## Fixture workload metrics

`GET /api/foundation/workload?run=<16_UPPERCASE_HEX_CHARACTERS>&final=1` is a read-only development endpoint. It requires `KEKBOT_MODE=fixture`, explicit `KEKBOT_ENABLE_PROOF=1`, and the foundation proof bearer token. Live mode refuses it. The run selects synthetic delivery IDs by a validated prefix; results contain counts, optional receipt-to-decision/reply p95 and application RSS, without payloads, credentials or host details. Final latency queries are bounded to 200,000 completed pairs. Use only disposable fixture storage. See [testing](TESTING.md) and [live acceptance](LIVE_ACCEPTANCE.md) for measurement limits.

## Media history reads

`GET /api/control?view=media-history` requires a current dashboard session. `GET /api/v1/control?view=media-history` requires an owner API token with `read` scope. Both are uncached. Optional `limit` is an integer 1-100 (default 50); optional `cursor` is the opaque `nextCursor` from the preceding response. Invalid limits/cursors return 400.

The response is `{ "items": [...], "nextCursor": "..." }`, with null at the end; the versioned endpoint also returns `version: 1`. Items are terminal requests, newest first, ordered by creation time then ID. Use the cursor unchanged to fetch older items, or omit it to refresh the newest page. New arrivals do not shift an existing cursor boundary. This is pagination, not a frozen historical export.

`snapshot.media` now contains only active validating/pending/approved/playing requests, without a history limit. Pre-release clients using it for completed requests must use the history endpoint. Media history reads grant no mutation authority; action permissions/version checks are unchanged.

## Waiting-work reads

Use `GET /api/control?view=uncertain-jobs` or `?view=pending-redemptions` with a current dashboard session. The same views on `/api/v1/control` require an owner-issued API token with `read` scope. Responses are uncached. Optional `limit` is an integer 1–100 (default 50); optional `cursor` is the preceding `nextCursor`, unchanged. Invalid limits, malformed cursors and cursors from the other view return 400.

Both return `{ "items": [...], "nextCursor": "..." }` with null at the end; the versioned endpoint adds `version: 1`. Items are ordered by creation time then ID, newest first. Job items contain `id`, `kind`, `status`, `attempts`, `error`, `createdAt`; redemption items contain `id`, `viewer`, `reward`, `cost`, `status`, `createdAt`. Job payloads/credentials are excluded. Cursors are page boundaries, not frozen exports: newly resolved work disappears and new arrivals appear on a fresh first page.

Dashboard snapshots expose first pages as `uncertainJobs` and `pendingRedemptions`, each with the same response shape. Existing `jobs` and `redemptions` remain recent lists limited to 100 and must not be used as exhaustive actionable queues. Browse subsequent pages to discover all outstanding work. Reads grant no reconciliation or fulfillment authority: `job.resolve` remains owner-only, while reward decisions require `engage`.
