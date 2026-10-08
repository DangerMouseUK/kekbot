# Control action reference

Use with [HTTP authentication and routes](API.md), [configuration fields](CONFIGURATION_FIELDS.md) and [accounts](ACCOUNTS.md). This describes the current development interface; it is not a stable compatibility promise. [All documentation](README.md).

<!-- contents:start -->
**On this page**

- [Request shape and availability](#request-shape-and-availability)
- [Configuration and previews](#configuration-and-previews)
- [Stream operation and moderation](#stream-operation-and-moderation)
- [Media and engagement](#media-and-engagement)
- [Local administration](#local-administration)
- [Errors and response handling](#errors-and-response-handling)
- [History and reconciliation boundaries](#history-and-reconciliation-boundaries)
<!-- contents:end -->

## Request shape and availability

Dashboard mutations use `POST /api/control` with a local session, Origin and CSRF header. Owner integration callers use `POST /api/v1/control` with a scoped bearer token. Both accept:

```json
{"action":"timers.pause","input":{}}
```

Dashboard results are returned directly; integration API results are wrapped as `{"version":1,"result":…}`. GET `/api/v1/control` similarly wraps the snapshot in `state`. A successful queueing response is not a confirmed provider effect. Inspect current state and jobs before repeating a mutation after a lost response; caller POSTs do not have a general idempotency-key contract.

The tables list **capability**, not a role name. Owner has all capabilities; admins need explicit grants. “API” means the integration endpoint allows the operation subject to scopes and domain authorization. “Discord” means it is offered by registered `/kekbot action:…` choices in the configured channel. Local configuration and owner powers are unavailable through Discord.

## Configuration and previews

| Action | `input` | Capability | API / Discord |
| --- | --- | --- | --- |
| `config.save` | `kind`, `data`; optional create `id`; update requires `id`, `version` | `configure`; notes use `moderate`; settings/guild use owner `integrations` | API except settings/guild; notes need both API `configure` and domain `moderate` / No |
| `config.delete` | `id`, `version` | Same kind-specific rules; settings cannot be deleted | API for permitted kinds / No |
| `command.preview` | `id` or unsaved `data` | `configure` | No / No |
| `timer.preview` | `id` or unsaved `data` | `configure` | No / No |
| `alert.preview` | `event` | `operate` | No / No |
| `moderation.test` | `rule` data, `content` (≤10000 characters), `role` | `moderate` | Yes / No |

Previews/tests do not enqueue effects or change cooldowns/counters. Configuration create/update data is strict: unknown fields fail validation. See the [schema-checked examples](examples/README.md).

## Stream operation and moderation

| Action | `input` | Capability | API / Discord |
| --- | --- | --- | --- |
| `status` | None | API `operate`; Discord requires at least one mapped grant | Yes / Yes |
| `timers.pause`, `timers.resume` | None | `operate` | Yes / Yes |
| `alert.manual` | `reason`: nonempty text ≤500 characters | `operate` | Yes / Yes |
| `goal.adjust` | `target`: goal ID, `version`, `value`: absolute amount 0–1000000000 | `operate` | Yes / Yes |
| `moderation.pause`, `moderation.resume` | None | `moderate` | Yes / Yes |
| `moderation.warn`, `moderation.timeout`, `moderation.ban` | `target`: numeric viewer ID string, `reason`: 1–100 characters; timeout `value`: minutes 1–10080 (default 10); ban `acknowledge:true` | `moderate` | Yes / Yes |
| `moderation.delete` | Same viewer/reason plus `message`: exact message ID ≤128 characters, `acknowledge:true` | `moderate` | Yes / Yes |
| `moderation.bulk` | `targets`: 1–20 unique positive numeric viewer IDs, `operation`: warn/timeout/ban, `reason`, optional `duration` in minutes, `acknowledge:true` | `moderate` | Yes / No |
| `moderation.incident.start` | `preset`: links/burst/combined, `minutes`: 1–120, `acknowledge:true` | `moderate` | Yes / No |
| `moderation.incident.stop` | None | `moderate` | Yes / No |

Emergency pause stops automated rules/presets, not explicit manual actions. A goal adjustment sets the value; it does not add a delta. Reset with `value:0` and the current version. Temporary presets warn and expire without changing saved rules.

## Media and engagement

| Action | `input` | Capability | API / Discord |
| --- | --- | --- | --- |
| `media.request` | `url`: supported YouTube URL or video ID | `media` | Yes / No |
| `media.approve`, `media.reject`, `media.remove` | `target`: item ID, `version`: current positive item version | `media` | Yes / Yes when media enabled |
| `media.reorder` | `ids`: exact ordered set of all approved waiting item IDs, at most 500 | `media` | Yes / No |
| `media.clear` | None | `media` | Yes / No |
| `player.pause`, `player.resume`, `player.skip` | `version`: current nonnegative player version | `media` | Yes / Yes when media enabled |
| `player.volume` | `version`, `value`: 0–100 | `media` | Yes / Yes when media enabled |
| `points.adjust` | `viewer`: numeric ID string, `amount`: integer -1000000–1000000, `reason`: 1–200 characters | `engage` | Yes / No |
| `reward.complete`, `reward.reject` | `target`: pending redemption ID | `engage` | Yes / Yes |
| `activity.close` | `target`: open poll/raffle ID | `engage` | Yes / Yes |
| `raffle.draw`, `raffle.reroll` | `target`: closed/drawn raffle ID | `engage` | Yes / Yes |

Item and player versions are different values. Obtain them from a fresh snapshot/status. Approval only accepts pending items; playing items use player controls. Clearing removes validating/pending/approved items and preserves the current item. Moderator/API-added requests auto-approve only after validation. Raffle rerolls exclude previous winners. Repeated redemption decisions fail rather than debit/refund twice.

Discord's command exposes only scalar `action`, `target`, `version`, `value`, `reason`, `message`, `acknowledge` options. It does not expose every HTTP action or arbitrary JSON input. For example:

```text
/kekbot action:status
/kekbot action:timers.pause
/kekbot action:alert.manual reason:Presentation check
```

Use actual private IDs/versions for approval or moderation. Register commands again after changing allowed guilds/media enablement. See [Discord setup](PROVIDERS.md#discord).

## Local administration

These actions use the local-session endpoint only; no integration API or Discord authority can perform them. Most require owner authority; invitation and asset rows state their narrower capability rules.

| Action | `input` | Authority |
| --- | --- | --- |
| `account.invite` | `role`: admin/moderator/readonly; admin `permissions`: selected grants | `invite`; delegation limits apply |
| `account.disable` | `id`, `disabled`: boolean | Owner `accounts` |
| `account.revoke` | `id` | Owner `accounts` |
| `integration.save` | `provider`: kick/discord/youtube, complete provider `data` | Owner `integrations` |
| `kick.refresh`, `kick.subscribe`, `kick.disconnect` | None | Owner `integrations` |
| `discord.register` | None | Owner `integrations` |
| `asset.upload` | `name`: ≤100 characters, canonical `base64` bytes; file ≤8 MiB | `configure`; dashboard controls owner-visible |
| `asset.delete` | `id` | `configure`; dashboard controls owner-visible |
| `token.create` | `kind`: widget/player/api, `name`, `scopes` | Owner `tokens` |
| `token.revoke` | `id` | Owner `tokens` |
| `configuration.export` | None | Owner `maintenance` |
| `configuration.import` | `bundle`, `mode`: merge/replace, `apply`: boolean (default false) | Owner `maintenance` |
| `privacy.export`, `privacy.erase` | `viewer`: numeric ID string | Owner `maintenance` |
| `diagnostics.export` | None | Owner `maintenance` |
| `job.resolve` | `id`: uncertain job, `result`: confirmed/failed | Owner `maintenance`; records outcome without resending |

Provider data shapes are Kick `{clientId,clientSecret,broadcasterId}` (broadcaster numeric), Discord `{applicationId,publicKey,botToken}`, YouTube `{key}`. All fields are required when replacing settings. Credentials are write-only; use the dashboard for normal setup and never log the request body. Token scopes and source creation are described in [API authentication](API.md#authentication-boundaries) and [OBS](OBS.md).

Authentication itself uses `POST /api/auth`: `setup`/`invite` with `token`, `username`, `password`; `login` with username/password; `logout`; `password` with `currentPassword` and new `password`. Every POST checks Origin. Existing-session mutations additionally require CSRF. Prefer the normal login UI rather than building a second account-management client.

## Errors and response handling

An error JSON contains `error` with a sanitized code. HTTP 409 can mean a stale version, invalid state transition, already decided redemption or unavailable capability. Reload the relevant state and ask whether the intended operation is still needed. A 429 needs bounded backoff; provider job retry is separate from caller retry. A timeout with no response is an unknown outcome, not evidence of failure.

Domain/source/provider payloads and outcome codes are defined by the current source, not a frozen OpenAPI specification. If you add/change an action, update this table, the corresponding task guide and meaningful permission/concurrency tests together.

## History and reconciliation boundaries

Media history is an authenticated [GET view](API.md#media-history-reads), not a control action. `media.reorder` supplies the complete approved queue, available in the active snapshot regardless of terminal history size. `job.resolve` records reconciliation and clears the encrypted uncertain payload atomically; it never resends the effect. Viewer erasure also checks derived pending work before removing associated resolved payloads. See [privacy](OPERATIONS.md#privacy-and-retention) for retained integrity records and uncertainty exceptions.
