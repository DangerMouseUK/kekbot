# Connect Kick, Discord and YouTube

**Connect Kick first.** Discord and YouTube are optional, and each can wait until you want its features. Install and create your local owner account with [Getting started](GETTING_STARTED.md), then follow just the Kick section below. [Glossary](GLOSSARY.md).

Complete [installation and owner setup](GETTING_STARTED.md) first. Use your final trusted HTTPS origin throughout. These steps configure live integrations; [fixtures](QUICKSTART.md) need none of these credentials. Keep actual IDs, addresses and secrets in your private operator record/runtime files. Return to the [documentation index](README.md).

Replace `https://kekbot.example` with your own origin (or your configured trusted public-IP origin). Register these exact URLs:

| Provider setting | Example |
| --- | --- |
| Kick redirect URL | `https://kekbot.example/api/providers/kick/callback` |
| Kick enabled webhook URL | `https://kekbot.example/api/providers/kick/events` |
| Discord Interactions Endpoint URL | `https://kekbot.example/api/providers/discord/interactions` |

Credential fields in **Connections** are write-only and encrypted on the host. Blank fields after saving do not mean a saved secret disappeared. Check setup/connection state and a real permitted action. Provider scope selection never grants local dashboard permissions.

<!-- contents:start -->
**On this page**

- [Kick](#kick)
- [Discord](#discord)
- [YouTube](#youtube)
- [Change or revoke credentials](#change-or-revoke-credentials)
- [Connection acceptance checklist](#connection-acceptance-checklist)
<!-- contents:end -->

## Kick

### 1. Identify the creator

The creator is the account whose chat this installation serves. Sign into that account on Kick and open its channel page. In `https://kick.com/<channel-slug>`, the final segment is the channel slug. The channel can be offline. A separate account named after your bot is its own channel; it does not automatically operate your streaming account's channel.

The developer app's display name, client ID, channel slug and numeric **broadcaster user ID** are different values. KekBot authorizes the configured creator and rejects a different account. Decide which channel you intend to serve before continuing.

### 2. Create your application

Enable two-factor authentication on the app-owning Kick account, then open **Account settings → Developer** at [Kick's developer settings](https://kick.com/settings/developer). Create an application with a name/description, the exact redirect URL above, **webhooks enabled**, and the exact webhook URL. Kick's [official app setup](https://raw.githubusercontent.com/KickEngineering/KickDevDocs/main/getting-started/kick-apps-setup.md) documents the 2FA prerequisite. If the portal rejects a callback origin, resolve that before entering credentials into KekBot.

Select the scopes the current dashboard authorization requests:

| Scope | Purpose |
| --- | --- |
| `user:read` | Verify the authorized account |
| `channel:read` | Read channel state |
| `chat:write` | Send replies |
| `events:subscribe` | Subscribe to chat, follow, stream-status and new/renewal/gift subscription events (needed by goals, event feeds and analytics as well as alerts) |
| `moderation:ban` | Permitted timeout/ban actions |
| `moderation:chat_message:manage` | Permitted chat deletion |

The dashboard button currently requests moderation along with core scopes. Stream-key, ads and channel-update permissions are unnecessary. Keep rules disabled until actual moderation permissions are verified. Copy your client ID/secret privately; do not send them in an issue, chat report or PR.

### 3. Resolve the numeric broadcaster ID

Kick's official [channels API](https://docs.kick.com/apis/channels) returns `broadcaster_user_id` for a slug using an app access token obtained through the [client-credentials flow](https://docs.kick.com/getting-started/generating-tokens-oauth2-flow). Use a trusted local API client, or this container-based lookup. It performs a token request and public channel read; it does not authorize the bot or print the token.

This lookup is currently the one server-side step in Kick connection setup. You are finding a public numeric account ID; the client secret stays in a private file and is never printed.

For a **wizard-managed host**, run `sudoedit /srv/kekbot/runtime.env` in your server terminal. Add `KICK_CLIENT_ID=`, `KICK_CLIENT_SECRET=` and `KICK_CHANNEL_SLUG=` on separate lines, filling each with your own value after the equals sign. The slug is the last part of your Kick channel URL. Keep existing entries intact, save and close the editor. Use your actual installation directory if customized. The slug is used only by this lookup. Do not restart the app for this temporary edit.

Next, define the helper below in Bash on that server. It uses the generated configuration and the active recorded data root, including after rollback. Replace the directory and project if you chose custom values; inspect the private `installation.json` when unsure:

```sh
dc() { sudo docker compose --project-name kekbot --file /srv/kekbot/compose.json "$@"; }
```

Keep that runtime file private, and do not edit `installation.json` or `compose.json`. For a **manual installation**, enter the same three temporary fields in its protected runtime file and instead use [its own `dc` helper and exports](INSTALLATION.md#3-build-and-initialize), with its protected runtime file. These are alternative helper definitions: use only the one matching your installation. Then run:

```sh
dc run --rm --no-deps -T kekbot node --input-type=module <<'JS'
try {
  const { KICK_CLIENT_ID: client_id, KICK_CLIENT_SECRET: client_secret, KICK_CHANNEL_SLUG: slug } = process.env;
  if (!client_id || !client_secret || !slug) throw new Error('lookup_configuration_missing');
  const request = (url, init) => fetch(url, { ...init, redirect: 'error', signal: AbortSignal.timeout(10000) });
  const tokenResponse = await request('https://id.kick.com/oauth/token', {
    method: 'POST',
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id, client_secret })
  });
  if (!tokenResponse.ok) throw new Error(`token_http_${tokenResponse.status}`);
  const { access_token } = await tokenResponse.json();
  if (!access_token) throw new Error('token_missing');
  const response = await request(`https://api.kick.com/public/v1/channels?slug=${encodeURIComponent(slug)}`, {
    headers: { Authorization: `Bearer ${access_token}` }
  });
  if (!response.ok) throw new Error(`channels_http_${response.status}`);
  const result = await response.json();
  const id = result.data?.[0]?.broadcaster_user_id;
  if (!Number.isSafeInteger(id) || id <= 0) throw new Error('channel_not_found');
  console.log(JSON.stringify({ broadcasterUserId: id }));
} catch (error) {
  const code = error instanceof Error && /^(lookup_configuration_missing|token_http_\d+|token_missing|channels_http_\d+|channel_not_found)$/.test(error.message)
    ? error.message : 'lookup_request_failed';
  console.error(code);
  process.exitCode = 1;
}
JS
```

Success prints one result such as `{"broadcasterUserId":123456789}`; the example number is made up. Copy your actual number for the next step. If you see `channel_not_found`, check the slug; other errors are explained in [troubleshooting](TROUBLESHOOTING.md#kick-and-discord).

Use `sudoedit` again to remove the three temporary lookup entries if you will use dashboard-managed settings. Keep your client ID/secret privately for entering in Connections. If using environment bootstrap instead, retain the protected client fields and set `KICK_BROADCASTER_USER_ID` to the result; recreate the app container to load them. Never put the app token directly on a command line. A lookup failure should be resolved before OAuth.

### 4. Authorize and subscribe

1. Sign into KekBot as owner at the final HTTPS origin. Open **Connections**.
2. In **Connections → Kick application settings**, enter **Client ID**, **Client secret** and your numeric **Channel user ID**, then select **Save Kick settings**. (API callers send these as `clientId`, `clientSecret` and `broadcasterId`.) **Authorize Kick with moderation** stays unavailable until these are saved; **Subscribe to events** and **Refresh connection** stay unavailable until Kick is authorized.
3. In the same browser, make sure Kick is signed into that creator. Select **Authorize Kick with moderation** and approve consent.
4. Return to Connections; inspect the saved authorization/creator/scopes, then select **Subscribe to events**. Repeated reconciliation repairs missing subscriptions rather than intentionally creating duplicates.
5. In **that creator's Kick channel chat**, send `!kekbot`. Confirm the real reply and its visible sender. Check **Maintenance → Delivery outcomes** if it is missing. Repeat a configured custom command.

Two optional chat announcements are owner switches under **Maintenance → Edit settings → Chat announcements**: telling a viewer when a moderator approves or rejects their waiting request (`mediaDecisionReplies`), and announcing raffle winners (`raffleChatAnnouncements`). Both are sent once per request or winner through the same Kick reply delivery as commands, recheck the switch and the deciding moderator's permission before sending, and are associated with the viewer for privacy erasure. Fixture mode records them without contacting Kick. See the [field reference](CONFIGURATION_FIELDS.md#settings).

For account-mode delivery, set `KICK_CHAT_TYPE=user` in the runtime environment and recreate the app container. `bot` selects Kick's official bot delivery type; the app does not silently fall back. Historical foundation evidence confirmed account-mode replies, but a new installation still needs its own verification.

Refresh and subscription repair run in the background. **Refresh connection** exercises refresh explicitly. **Disconnect** (after a confirmation) clears local authority and attempts provider revocation; check its result and revoke in Kick as well if necessary. Reauthorize after an invalid/revoked grant. Changing app credentials invalidates the saved grant. Do not repeatedly retry uncertain outbound sends; [operations](OPERATIONS.md#delivery-outcomes) explains reconciliation.

A successful reauthorization supersedes any refresh already in flight for the old grant. An old refresh cannot overwrite the new tokens/scopes or mark the new grant broken. A concurrent superseded operation returns `kick_connection_changed_retry`; reload connection status before deciding whether another action is needed.

## Discord

Discord is optional. It uses signed HTTP interactions, with no Gateway connection or message-content intent. Real acknowledgement timing, bot permissions and multi-guild delivery remain live acceptance scenarios.

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create your own application. Under **General Information**, copy **Application ID** and **Public Key**. Under **Bot**, generate/reset a bot token and store it privately. See [Discord's setup guide](https://docs.discord.com/developers/quick-start/getting-started) for portal controls.
2. In KekBot **Connections → Discord application settings**, save **Application ID**, **Public key** and **Bot token** (API fields `applicationId`, `publicKey`, `botToken`) **before** setting the endpoint, so KekBot can verify Discord's test request.
3. In Discord's app settings, save the Interactions Endpoint URL from the table above. It must pass Discord's signed PING validation with trusted HTTPS.
4. Configure a **Guild Install** with the `bot` and `applications.commands` scopes. Give the bot **View Channel**, **Send Messages** and **Embed Links** in each intended normal text channel (permission integer `19456` if your install link asks for one). Embed Links lets notifications show request details; without it Discord hides the details and only the one-line headline remains. Install it using your app's install link. Administrator permission is unnecessary. Thread-only channels need additional provider permissions and their own testing.
5. In Discord user settings, enable **Advanced → Developer Mode**. Copy the server, text-channel and relevant role/user IDs via their context menus.
6. In KekBot **Connections → Discord servers**, select **Add Discord server**. Enter a **Name**, the **Server ID** and **Channel ID**, and tick what to post under **Post to this channel when** (**You go live**, **Your stream ends**, **An alert is shown**, **Media requests change**, **A goal completes**, **A moderation action is taken**, **Polls, raffles and rewards update**; API values `live`, `offline`, `alert`, `media`, `goal`, `moderation`, `engagement`). Select **Save Discord route**. Create additional routes deliberately; only selected events go to each configured channel.
7. Add role/user permission mappings under **Who can use /kekbot commands**: select **Add role grant** or **Add user grant**, paste the role/user ID and choose a permission. API callers send the same mappings as JSON. For example, with your moderator role ID in place of the synthetic one:

```json
[{"id":"123456789012345678","permission":"media"}]
```

Supported permissions are `operate`, `moderate`, `media`, `engage`; repeat a mapping with another permission when needed. Empty mappings grant no controls. Local dashboard roles do not grant Discord authority.

8. Select **Register Discord commands in your servers** after saving routes. Repeat after changing the guild set, enabling or disabling media, or enabling or disabling points, because the registered command list only includes enabled modules. Registering replaces the earlier single `/kekbot action:…` command. Until you register, members still see the old command; KekBot refuses it with `discord_commands_outdated` and acts only on old-format commands that were already queued when you upgraded.
9. In the configured channel run `/kekbot status`. Test with both a mapped moderator and an unmapped member; the latter must get a private "Not allowed" reply. Verify a deliberately triggered notification reaches only its configured route.

### Using Discord controls

Every command is a grouped subcommand of `/kekbot`, for example `/kekbot media approve`. Discord shows each option with a short explanation, marks required options and checks number ranges before sending. Replies are private to the person who ran the command. The [full command list](USER_GUIDE.md#discord-controls) explains each command and the grant it needs.

- **Pick from suggestions.** Options that name something — a request, goal, poll, raffle, redemption, viewer or chat message — offer suggestions as you type, such as `#12 · Song title · awaiting approval`. Suggestions only come from this installation's SQLite data, and a member without the command's grant sees none.
- **Request numbers.** A song request's public number is its queue position, shown as `#12`. You can type `#12` or `12` instead of picking. Moving a request renumbers the approved queue, so the reply always repeats the title that was acted on.
- **No versions to type.** KekBot captures the item you named and its current version (an optimistic version check) the moment you send the command, and the deferred job acts on exactly that version. If anything changed in between — another moderator approved or moved the request, the player changed, or a goal was adjusted — the reply says **This changed** and nothing is changed. The player version for skip/pause/resume/volume is captured the same way.
- **Confirmations.** Ban, message deletion, clearing the queue and incident mode need `confirm: True`.

Media controls appear only when media is enabled; `reward` and `points` appear only when points are enabled. Commands and buttons also refuse at the moment they run if that module has since been turned off (`media_disabled`, `points_disabled`), even before commands are registered again. Timer, alert, moderation, goal, reward and activity commands use the same domain permissions as the dashboard; see [API actions](API_ACTIONS.md).

### Notification buttons

Media approval notices have **Approve** and **Reject** buttons, reward redemption notices have **Complete** and **Refund**, and raffle-close notices have **Draw winner**. `/kekbot media queue` and `/kekbot reward pending` add the same buttons for the first five waiting items. Each button carries the item ID and the version it was rendered with. A click on an older version replies **This changed** with the current state and never acts on newer state. After a decision, the notice's buttons are replaced by a disabled label such as **Approved** so other moderators can see it was handled. Clicks need the same grant as the matching command (`media` or `engage`), and that grant is rechecked when the click runs.

Notifications are visible to everyone who can read the routed channel. Media and redemption notices show the requester's or redeemer's observed Kick name (already public on stream), the video link and reward details. Route `media`, `engagement` and `moderation` events to a moderator-only channel if you do not want regular members to see them; controls are private replies either way.

Discord requires the initial response within three seconds. For commands and button clicks KekBot verifies the signature, commits the interaction, answers with a private "thinking…" reply and runs the action in the worker, which then edits that reply. Suggestions (autocomplete) are answered immediately from bounded SQLite queries and never change anything. Repeated interaction IDs do not repeat actions, and a retried reply never reruns the action. Routing/mappings are rechecked before deferred work executes. Notifications and replies disable mentions. Every failure has a plain-English reply; the error code is kept only in the server-side interaction result (`discord_result:<interaction ID>`, retained for the receipt period) for troubleshooting and is never shown to members. A verified command or button click from a server or channel without an enabled route gets an immediate private explanation (*KekBot isn't set up for this channel…*) instead of Discord's generic "This interaction failed"; it reveals no configuration, records no receipt and queues no work. Forged, unsigned and wrong-application requests are still rejected with an HTTP error. See the [interaction contract](https://docs.discord.com/developers/interactions/receiving-and-responding).

### Discord grant examples

For a media team, add a **Discord roles** row with its role ID and **Media**. **Deliberate permission change:** `engage` (Discord engage grants, moderator accounts and `engage`-scoped API tokens) can now create polls and raffles, not only close and draw them. Creation uses the same strict validation, ID rules, limits and audit as `config.save`, and stops at 10 open polls and raffles in total (`open_activity_limit`). Withhold `engage` to prevent this. For a user who can pause timers/send alerts but cannot moderate, add only an **Operate** row under **Individual Discord users**. Add another row with the same ID and a different permission to grant additional capabilities. API callers keep IDs quoted as strings. A member with no mappings must be denied even if Discord itself permits slash-command use. Discord Administrator permission does not bypass KekBot's grant checks. Everyone in the channel can see `/kekbot` unless a server admin also restricts it under **Server Settings → Integrations**; that Discord setting only hides commands and is not a substitute for KekBot grants.

Use one deliberate route for each intended guild/channel combination. Routing determines both notifications and the channel where controls are allowed; a command in another channel is denied. Avoid overlapping contradictory routes. Selecting Events does not grant control permissions. After editing routes, register commands and test both allowed and denied identities again. The [action table](API_ACTIONS.md) lists precisely which operations are available through slash commands.

## YouTube

YouTube is optional and needed for real media metadata validation/playback.

1. Create/select a project you control in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **YouTube Data API v3** in **APIs & Services → Library**.
3. Create an API key in **Credentials**. Restrict its API access to YouTube Data API v3 and its application usage to the intended server, for example the server's outbound IP where appropriate. A browser-referrer restriction does not fit KekBot's server-side metadata requests. Follow [Google's setup guidance](https://developers.google.com/youtube/v3/getting-started) and [key restriction guidance](https://docs.cloud.google.com/docs/authentication/api-keys-best-practices).
4. In KekBot **Connections**, save the key in the YouTube form. A user OAuth grant is unnecessary for public video metadata.
5. In **Maintenance → Edit settings**, turn on **Allow media requests**. Review **Approve viewer requests automatically**, **Longest video allowed**, **Queue size**, **Requests per viewer**, **Wait between a viewer's requests**, **Blocked channels** and **Blocked title words**. Keep automatic approval off for the first trial.
6. Complete the [request → approval → OBS playback walkthrough](OBS.md#youtube-request-and-approval-walkthrough). If using Discord, register commands again after enabling media.

Metadata uses the official [videos.list API](https://developers.google.com/youtube/v3/docs/videos/list). Missing/private/unavailable videos, quota/key errors and rule failures have explicit outcomes. Validation cannot guarantee browser autoplay or playback availability. The player must remain visible and comply with [YouTube's player requirements](https://developers.google.com/youtube/terms/required-minimum-functionality); downloading and audio extraction are not provided.

## Change or revoke credentials

Rotate compromised credentials in the provider portal and replace the encrypted settings in Connections. Confirm the new configuration with an actual permitted action. For Kick, reauthorize and subscribe again. For Discord, verify endpoint signatures and bot sends; update the public key if the app changes. For YouTube, revalidate a request and review quotas. Treat leaked OBS/API tokens separately: revoke them in **Maintenance**. See [troubleshooting](TROUBLESHOOTING.md) and [recovery](BACKUP_RECOVERY.md).

## Connection acceptance checklist

| Boundary | Configuration alone proves | Verify before relying on it |
| --- | --- | --- |
| Kick app | IDs/secret and callbacks were entered | Correct creator/scopes, signed event receipt, actual reply identity, refresh and subscription repair |
| Discord app | Application/key/token were stored | Signed endpoint PING, registered guild commands and suggestions, mapped/denied users, a notification button click, bot channel send and correct routing |
| YouTube key | Metadata credential was stored | Valid/invalid request outcomes, quota handling, actual visible OBS video/audio and advancement |
| Disabled integration | Optional module is not configured | Unrelated commands/accounts/storage still operate; no fabricated connected status |

Do not share provider request/response URLs or authorization redirects: they can contain credentials, codes or state. Keep diagnostics bounded and redact before reporting. Provider portal labels/requirements can change; the official references above were reviewed for this documentation update on 2026-10-08. Current full-product live acceptance remains pending.
