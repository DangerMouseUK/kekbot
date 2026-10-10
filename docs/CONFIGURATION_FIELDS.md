# Dashboard field reference

**Look up the field you are editing.** You do not need to fill every field or read this reference before using the bot. The [first-session examples](FIRST_SESSION.md) provide sensible starting values; this page explains exact limits, units and defaults.

Every editable configuration kind is listed here. Runtime/environment settings are in [configuration](CONFIGURATION.md); task instructions are in the [user guide](USER_GUIDE.md). [All documentation](README.md).

The field names below are the JSON names used by [the API](API.md). The dashboard inserts spaces and capitalizes the first word: `userCooldown` becomes **User cooldown**. Defaults apply when a field is omitted; required fields have no default. The editor may supply a starting value instead, notably disabled new moderation rules and an activity deadline one hour ahead. CI validates the [example files](examples/README.md) against [catalog.ts](../src/server/domain/catalog.ts) and checks every field has a reference row.

<!-- contents:start -->
**On this page**

- [Conventions](#conventions)
- [command](#command)
- [timer](#timer)
- [alert](#alert)
- [widget](#widget)
- [rule](#rule)
- [goal](#goal)
- [reward](#reward)
- [poll](#poll)
- [raffle](#raffle)
- [note](#note)
- [guild](#guild)
- [settings](#settings)
- [Retention interpretation](#retention-interpretation)
<!-- contents:end -->

## Conventions

- All numeric fields are integers unless marked decimal. Bounds are inclusive.
- Names are trimmed, 1–80 characters. Responses/templates are literal text, not executable code.
- Ordinary lists use one value per line in the dashboard; JSON callers use arrays. Guild permission mappings use JSON even in the dashboard.
- IDs are strings unless specifically described otherwise. Numeric Kick/Discord identity strings are 1–24 digits; never round Discord IDs through a JavaScript number.
- Chat roles are `viewer`, `subscriber`, `vip`, `moderator`, `broadcaster`. Matching uses the single observed role, prioritizing broadcaster → moderator → VIP → subscriber → viewer. Selecting `subscriber` alone does not automatically include moderators or the broadcaster.
- Seconds, minutes, hours and days are stated explicitly. `startsAt`/`endsAt` use **Unix milliseconds**, not seconds. Blank optional timestamps mean `null`.
- Edits/deletes require the current document version. Reload after a conflict rather than replacing another operator's changes blindly. There are at most 500 saved records per kind.

To calculate a future activity deadline in a source setup with Node installed:

```sh
node -p "Date.now() + 60 * 60 * 1000"
```

On a container installation, use its normal maintenance shell and `dc` helper instead; host Node is unnecessary:

```sh
dc run --rm --no-deps kekbot node -p "Date.now() + 60 * 60 * 1000"
```

Paste the resulting number into **Ends at**. The examples use a fixed illustrative 2030 deadline; replace it before opening an activity.

## command

Requires `configure`. [Workflow](USER_GUIDE.md#commands) · [JSON example](examples/command.json).

| Field | Default | Bounds and meaning |
| --- | --- | --- |
| `name` | Required | Internal display name, 1–80 characters |
| `enabled` | `true` | Boolean; disabled commands do not respond |
| `trigger` | Required | `!` followed by 1–32 lowercase letters, digits or underscores |
| `aliases` | `[]` | Up to 10 triggers with the same syntax; all must be unique and unreserved |
| `group` | `General` | Display grouping, 1–80 characters |
| `responses` | Required | 1–20 nonempty lines, each ≤500 characters; one selected randomly per allowed invocation |
| `roles` | `[]` | Up to 5 chat roles; empty allows all observed roles |
| `cooldown` | `10` | Channel-wide seconds, 0–3600 |
| `userCooldown` | `30` | Per-viewer seconds, 0–86400 |
| `streamOnly` | `false` | Requires observed live state |
| `condition` | `always` | `always`, `live`, `offline`; combines with Stream only |
| `counter` | `false` | Increment a persistent counter on an allowed invocation |

Variables: `{user}`, `{args}` (up to 200 argument characters), `{channel}` (instance name), `{counter}`, `{points}`. An unknown/unavailable variable renders as `[variable unavailable]`. Rendered output is capped at 500 characters. Aliases share the command's counter/cooldowns. [Reserved built-ins](USER_GUIDE.md#commands) cannot be overwritten.

## timer

Requires `configure`; global pause/resume requires `operate`. [Workflow](USER_GUIDE.md#timers) · [JSON example](examples/timer.json).

| Field | Default | Bounds and meaning |
| --- | --- | --- |
| `name` | Required | Display name, 1–80 characters |
| `enabled` | `true` | Boolean |
| `messages` | Required | 1–20 rotating lines, each 1–500 characters; `{channel}` is available |
| `interval` | Required | Seconds, 60–86400; no immediate or catch-up send |
| `minMessages` | `5` | Intervening observed chat messages, 0–10000 |
| `streamOnly` | `true` | Send only while observed live |
| `timezone` | `UTC` | Valid IANA timezone, at most 80 characters |
| `quietStart` | `null` | Local hour 0–23, inclusive quiet start |
| `quietEnd` | `null` | Local hour 0–23, exclusive quiet end |

Both quiet hours must be set for a quiet window. `22` → `7` crosses midnight. Equal start/end suppresses all hours; use blank fields to disable the window. If activity is insufficient at the due time, the timer checks again after another interval. Pause/offline/restart resets scheduling without catch-up.

## alert

Requires `configure`; manual delivery requires `operate`; the dashboard exposes asset management to the owner. [OBS workflow](OBS.md#follow-alert-walkthrough) · [JSON example](examples/alert.json).

| Field | Default | Bounds and meaning |
| --- | --- | --- |
| `name` | Required | Display name, 1–80 characters |
| `enabled` | `true` | Boolean |
| `event` | Required | `channel.followed`, `channel.subscription.new`, `channel.subscription.renewal`, `channel.subscription.gifts`, `manual`, `goal`, `media` |
| `template` | Required | Literal template, 1–500 characters |
| `duration` | `5` | Display seconds, 1–30 |
| `priority` | `0` | 0–10; higher queued priority displays first |
| `image` | `null` | Uploaded image asset ID, at most 100 characters |
| `sound` | `null` | Uploaded sound asset ID, at most 100 characters |
| `volume` | `0.5` | Decimal 0–1, separate from player volume |
| `animation` | `fade` | `fade`, `slide`, `none` |

Use `{user}`/`{name}` for supporters, `{count}` for available subscription/gift data, `{text}` for manual text and `{title}` for media titles. Values depend on the event; preview that event before delivery. An asset ID must already exist and match image/audio type. Provider event availability remains subject to live verification.

## widget

Requires `configure`; generating access URLs is owner-only. [All 18 types and targets](OBS.md#source-types) · [JSON example](examples/widget.json).

| Field | Default | Bounds and meaning |
| --- | --- | --- |
| `name` | Required | Display name, 1–80 characters |
| `enabled` | `true` | Disabled widget renders empty |
| `type` | Required | `alerts`, `chat`, `player`, `nowplaying`, `queue`, `eventfeed`, `supporter`, `goal`, `multigoal`, `status`, `counter`, `leaderboard`, `poll`, `raffle`, `countdown`, `shoutout`, `socials`, `activity` |
| `theme` | `mint` | `mint`, `midnight`, `paper` |
| `width` | `800` | Pixels, 200–3840; match OBS source width |
| `height` | `400` | Pixels, 100–2160; match OBS source height |
| `limit` | `10` | Result count where supported, 1–50 |
| `target` | Empty | Target document ID, ≤100 characters; meaning depends on Type |
| `text` | Empty | Countdown label, ≤500 characters |
| `endsAt` | `null` | Countdown deadline, nonnegative Unix milliseconds |
| `reducedMotion` | `false` | Boolean; reduce presentation motion |

## rule

Requires `configure`; tests/manual operations require `moderate`. [Workflow and matching semantics](USER_GUIDE.md#moderation) · [JSON example](examples/rule.json).

| Field | Default | Bounds and meaning |
| --- | --- | --- |
| `name` | Required | Display name and incident reason, 1–80 characters |
| `enabled` | `true` in schema | Dashboard starts a new rule disabled; explicitly choose eligibility |
| `type` | Required | `link`, `phrase`, `repetition`, `caps`, `burst` |
| `patterns` | `[]` | Up to 100 case-insensitive literal substrings, 1–120 characters each; phrase rules only |
| `allowedDomains` | `[]` | Up to 100 lowercase domain names, 1–253 characters; exact domain/subdomains allowed; no protocol/path |
| `threshold` | `5` | 1–100; repeat/burst message count or caps percentage; unused by link/phrase |
| `windowSeconds` | `30` | Recent-message window, 1–600 seconds; repeat/burst rules |
| `trustedRoles` | Moderator, broadcaster | Up to 5 exempt chat roles |
| `action` | `warn` | `warn`, `delete`, `timeout`, `ban` |
| `duration` | `10` | Timeout minutes, 1–10080 |
| `startsAt` | `null` | Inclusive start, nonnegative Unix milliseconds |
| `endsAt` | `null` | Exclusive end, nonnegative Unix milliseconds |
| `escalation` | `false` | Enable matching-rule incident escalation |
| `escalationAfter` | `2` | Number of previous incidents before escalating, 1–100 |
| `escalationWindowSeconds` | `3600` | Previous-incident window, 1–86400 seconds |
| `escalationAction` | `timeout` | `warn`, `delete`, `timeout`, `ban` |

## goal

Requires `configure`; adjust/reset requires `operate`. [Workflow](USER_GUIDE.md#alerts-goals-and-presentation) · [JSON example](examples/goal.json).

| Field | Default | Bounds and meaning |
| --- | --- | --- |
| `name` | Required | Display name, 1–80 characters |
| `enabled` | `true` | Boolean |
| `metric` | Required | `manual`, `follow`, `subscription`, `points`, `media` |
| `target` | Required | Target amount, 1–1000000000 |
| `value` | `0` | Current amount, 0–1000000000 |
| `completed` | `false` | Completion marker; use goal controls rather than inventing event history |

## reward

Requires `configure`; fulfillment/refunds require `engage`. [Workflow](USER_GUIDE.md#points-and-rewards) · [JSON example](examples/reward.json).

| Field | Default | Bounds and meaning |
| --- | --- | --- |
| `name` | Required | Display name and chat lookup, 1–80 characters |
| `enabled` | `true` | Boolean |
| `cost` | Required | Points, 1–100000000 |
| `description` | Empty | Literal text, ≤500 characters |
| `fulfillment` | `manual` | `manual` or `alert`; both require moderator completion; alert emits on completion |

## poll

Requires `configure`; close requires `engage`. [Workflow](USER_GUIDE.md#polls-and-raffles) · [JSON example](examples/poll.json).

| Field | Default | Bounds and meaning |
| --- | --- | --- |
| `name` | Required | Activity name, 1–80 characters |
| `enabled` | `true` | Boolean |
| `options` | Required | 2–10 options, each 1–80 trimmed characters; chat numbers start at 1 |
| `status` | `open` | `open` or `closed` |
| `endsAt` | Required | Positive Unix milliseconds; choose a future deadline |
| `allowChange` | `false` | Permit replacing a previous vote before close |

## raffle

Requires `configure`; close/draw/reroll require `engage`. [Workflow](USER_GUIDE.md#polls-and-raffles) · [JSON example](examples/raffle.json).

| Field | Default | Bounds and meaning |
| --- | --- | --- |
| `name` | Required | Activity name, 1–80 characters |
| `enabled` | `true` | Boolean |
| `status` | `open` | `open`, `closed`, `drawn`; use draw controls to record a result |
| `endsAt` | Required | Positive Unix milliseconds; choose a future deadline |
| `roles` | `[]` | Up to 5 eligible exact chat roles; empty allows all |
| `minPoints` | `0` | Nonnegative points balance required when entering |
| `winners` | `[]` | Up to 100 stored identity strings, ≤100 characters each; managed by audited draw/reroll |

## note

Requires `moderate` to read/edit. [Workflow](USER_GUIDE.md#moderation) · [JSON example](examples/note.json).

| Field | Default | Bounds and meaning |
| --- | --- | --- |
| `name` | Required | Internal label, 1–80 characters |
| `enabled` | `true` | Stored flag; not an access-control boundary |
| `viewer` | Required | Numeric Kick viewer ID as a 1–24 digit string |
| `text` | Required | Private moderator note, 1–2000 characters |

## guild

Owner-only. [Discord setup](PROVIDERS.md#discord) · [JSON example](examples/guild.json).

| Field | Default | Bounds and meaning |
| --- | --- | --- |
| `name` | Required | Route label, 1–80 characters |
| `enabled` | `true` | Boolean; disabled routes deny commands and pending sends |
| `guildId` | Required | Discord server ID as a 1–24 digit string |
| `channelId` | Required | Allowed Discord channel ID as a 1–24 digit string |
| `events` | `[]` | Up to 7 selected categories: `live`, `offline`, `alert`, `media`, `goal`, `moderation`, `engagement` |
| `roles` | `[]` | Up to 30 `{ "id": "ROLE_ID", "permission": "media" }` mappings |
| `users` | `[]` | Up to 30 `{ "id": "USER_ID", "permission": "media" }` mappings |

Mapping permissions are `operate`, `moderate`, `media`, `engage`. Repeat an ID with a different permission to grant several capabilities. Empty mappings allow notifications but grant no command authority. Use a deliberate route per intended channel and keep mappings consistent; the command actor uses the matching route. A Discord Administrator role does not bypass KekBot's mappings.

## settings

Owner-only singleton, ID `instance`. Open **Maintenance → Edit settings**. [JSON example](examples/settings.json).

| Field | Default | Bounds and meaning |
| --- | --- | --- |
| `name` | `KekBot` | Instance display/template name, 1–80 characters |
| `rules` | Empty | `!rules` response, ≤500 characters |
| `discord` | Empty | `!discord` response, ≤500 characters |
| `socials` | Empty | `!socials` response and source text, ≤500 characters |
| `mediaEnabled` | `false` | Enable request module; still needs YouTube/provider/player setup |
| `autoApprove` | `false` | Approve viewer requests after successful metadata/rule validation |
| `maxDuration` | `600` | Maximum video seconds, 1–43200 |
| `capacity` | `50` | Active validating/pending/approved/playing items, 1–500 |
| `perUser` | `3` | Active requests per viewer, 1–50 |
| `requestCooldown` | `30` | Viewer request seconds, 0–3600 |
| `allowDuplicates` | `false` | Permit the same video in the active queue |
| `blockedUploaders` | `[]` | Up to 100 names, 1–80 characters; exact case-insensitive uploader-title match |
| `blockedTitles` | `[]` | Up to 100 terms, 1–80 characters; case-insensitive video-title substring match |
| `moderationPaused` | `false` | Emergency pause for automatic rules/presets; manual controls remain |
| `timersPaused` | `false` | Pause all timers; prefer pause/resume controls for schedule reset |
| `pointsEnabled` | `false` | Enable activity accrual and redemptions |
| `pointsAmount` | `10` | Award per eligible cadence bucket, 1–1000 |
| `pointsInterval` | `300` | Accrual cadence seconds, 60–3600 |
| `activeWindow` | `300` | Recent-chat eligibility seconds, 60–3600 |
| `chatDays` | `7` | Chat-body retention days, 0–30; 0 removes bodies after processing |
| `receiptDays` | `30` | Receipt/deduplication retention days, 2–90; unfinished work preserved |
| `summaryDays` | `90` | Observation retention days, 1–3650 |
| `auditDays` | `365` | Audit/incident retention days, 30–3650 |

Moderator-added media bypasses the per-user limit/cooldown and auto-approves after validation; capacity, duplicate, metadata and content rules still apply. Points/watchtime need observed live state and recent chat, not silent viewing. Review [retention limits](OPERATIONS.md#privacy-and-retention) before changing data policies.

## Retention interpretation

Existing instance retention bounds are unchanged. `chatDays` also limits resolved job payload text; outcome metadata is retained for the longer of audit and receipt retention. Pending/running work and encrypted unresolved uncertainty are protected. `receiptDays` also bounds sent markers and completed Discord interaction results. These are internal semantics, not additional editable fields. See [operations](OPERATIONS.md#privacy-and-retention) before choosing values or erasing a viewer.
