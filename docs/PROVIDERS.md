# Connect Kick, Discord and YouTube

Complete [installation and owner setup](INSTALLATION.md) first. Use your final trusted HTTPS origin throughout. These steps configure live integrations; [fixtures](QUICKSTART.md) need none of these credentials. Keep actual IDs, addresses and secrets in your private operator record/runtime files. Return to the [documentation index](README.md).

Replace `https://kekbot.example` with your own origin (or your configured trusted public-IP origin). Register these exact URLs:

| Provider setting | Example |
| --- | --- |
| Kick redirect URL | `https://kekbot.example/api/providers/kick/callback` |
| Kick enabled webhook URL | `https://kekbot.example/api/providers/kick/events` |
| Discord Interactions Endpoint URL | `https://kekbot.example/api/providers/discord/interactions` |

Credential fields in **Connections** are write-only and encrypted on the host. Blank fields after saving do not mean a saved secret disappeared. Check setup/connection state and a real permitted action. Provider scope selection never grants local dashboard permissions.

## Kick

### 1. Identify the creator

The creator is the account whose chat this installation serves. Sign into that account on Kick and open its channel page. In `https://kick.com/<channel-slug>`, the final segment is the channel slug. The channel can be offline. A separate account named after your bot is its own channel; it does not automatically operate your streaming account's channel.

The developer app's display name, client ID, channel slug and numeric **broadcaster user ID** are different values. KekBot authorizes the configured creator and rejects a different account. Decide which channel you intend to serve before continuing.

### 2. Create your application

Open Kick's developer application settings while signed into the app-owning account. Create an application with a name/description, the exact redirect URL above, **webhooks enabled**, and the exact webhook URL. Follow [Kick's app setup](https://docs.kick.com/getting-started/kick-apps-setup) if the portal layout changes.

Select the scopes the current dashboard authorization requests:

| Scope | Purpose |
| --- | --- |
| `user:read` | Verify the authorized account |
| `channel:read` | Read channel state |
| `chat:write` | Send replies |
| `events:subscribe` | Subscribe to chat/follow/stream and configured subscription events |
| `moderation:ban` | Permitted timeout/ban actions |
| `moderation:chat_message:manage` | Permitted chat deletion |

The dashboard button currently requests moderation along with core scopes. Stream-key, ads and channel-update permissions are unnecessary. Keep rules disabled until actual moderation permissions are verified. Copy your client ID/secret privately; do not send them in an issue, chat report or PR.

### 3. Resolve the numeric broadcaster ID

Kick's official [channels API](https://docs.kick.com/apis/channels) returns `broadcaster_user_id` for a slug using an app access token obtained through the [client-credentials flow](https://docs.kick.com/getting-started/generating-tokens-oauth2-flow). Use a trusted local API client, or this container-based lookup. It performs a token request and public channel read; it does not authorize the bot or print the token.

Temporarily enter your `KICK_CLIENT_ID` and `KICK_CLIENT_SECRET` in the protected runtime file, plus `KICK_CHANNEL_SLUG` with the channel slug. The latter is used only by this snippet, not by KekBot configuration. Keep the running server unchanged. In the Bash shell with the installation guide's `dc` helper and exports:

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

Record the number privately. Remove the temporary client ID/secret/slug entries from the runtime file if you will use dashboard-managed settings. If using environment bootstrap instead, retain the protected client fields and set `KICK_BROADCASTER_USER_ID` to the result; recreate the app container to load them. Never put the app token directly on a command line. A lookup failure should be resolved before OAuth.

### 4. Authorize and subscribe

1. Sign into KekBot as owner at the final HTTPS origin. Open **Connections**.
2. Save the Kick `clientId`, `clientSecret` and numeric `broadcasterId`.
3. In the same browser, make sure Kick is signed into that creator. Select **Authorize Kick with moderation** and approve consent.
4. Return to Connections; inspect the saved authorization/creator/scopes, then select **subscribe**. Repeated reconciliation repairs missing subscriptions rather than intentionally creating duplicates.
5. In **that creator's Kick channel chat**, send `!kekbot`. Confirm the real reply and its visible sender. Check **Maintenance → Delivery outcomes** if it is missing. Repeat a configured custom command.

For account-mode delivery, set `KICK_CHAT_TYPE=user` in the runtime environment and recreate the app container. `bot` selects Kick's official bot delivery type; the app does not silently fall back. Historical foundation evidence confirmed account-mode replies, but a new installation still needs its own verification.

Refresh and subscription repair run in the background. **refresh** exercises refresh explicitly. **disconnect** clears local authority and attempts provider revocation; check its result and revoke in Kick as well if necessary. Reauthorize after an invalid/revoked grant. Changing app credentials invalidates the saved grant. Do not repeatedly retry uncertain outbound sends; [operations](OPERATIONS.md#delivery-outcomes) explains reconciliation.

## Discord

Discord is optional. It uses signed HTTP interactions, with no Gateway connection or message-content intent. Real acknowledgement timing, bot permissions and multi-guild delivery remain live acceptance scenarios.

1. Open the [Discord Developer Portal](https://discord.com/developers/applications) and create your own application. Under **General Information**, copy **Application ID** and **Public Key**. Under **Bot**, generate/reset a bot token and store it privately. See [Discord's setup guide](https://docs.discord.com/developers/quick-start/getting-started) for portal controls.
2. In KekBot **Connections**, save `applicationId`, `publicKey` and `botToken` **before** setting the endpoint, so KekBot can verify Discord's test request.
3. In Discord's app settings, save the Interactions Endpoint URL from the table above. It must pass Discord's signed PING validation with trusted HTTPS.
4. Configure a **Guild Install** with `bot` and `applications.commands` scopes. Give the bot **View Channel** and **Send Messages** in each intended normal text channel. Install it using your app's install link. Administrator permission is unnecessary. Thread-only channels need additional provider permissions and their own testing.
5. In Discord user settings, enable **Advanced → Developer Mode**. Copy the server, text-channel and relevant role/user IDs via their context menus.
6. In KekBot **Connections**, select **Add guild**. Enter the guild/channel IDs and selected events (`live`, `offline`, `alert`, `media`, `goal`, `moderation`, `engagement`). Create additional routes deliberately; only selected events go to each configured channel.
7. Add role/user permission mappings. Lists are JSON in these two fields. For example, replacing the synthetic ID with your moderator role ID:

```json
[{"id":"123456789012345678","permission":"media"}]
```

Supported permissions are `operate`, `moderate`, `media`, `engage`; repeat a mapping with another permission when needed. Empty mappings grant no controls. Local dashboard roles do not grant Discord authority.

8. Select **Register Discord commands in allowed guilds** after saving routes. Repeat after changing the guild set or enabling media.
9. In the configured channel use `/kekbot action:status`. Test with both a mapped moderator and an unmapped member; the latter must be denied. Verify a deliberately triggered notification reaches only its configured route.

Media controls appear when media is enabled. An approval notification provides item ID/version; use `/kekbot action:media.approve target:<ITEM_ID> version:<VERSION>`. Player actions use the current player version from status. Stale decisions require refreshing status. Timer, alert, moderation, goal, reward and activity actions use the same domain permissions as the dashboard; see [API actions](API.md).

Discord requires the initial response within three seconds; KekBot verifies/commits the interaction, defers the response, and runs effects in the worker. Repeated interaction IDs do not repeat actions. Routing/mappings are rechecked before deferred work executes. Notification sends disable mentions. See the [interaction contract](https://docs.discord.com/developers/interactions/receiving-and-responding).

## YouTube

YouTube is optional and needed for real media metadata validation/playback.

1. Create/select a project you control in [Google Cloud Console](https://console.cloud.google.com/).
2. Enable **YouTube Data API v3** in **APIs & Services → Library**.
3. Create an API key in **Credentials**. Restrict its API access to YouTube Data API v3 and its application usage to the intended server, for example the server's outbound IP where appropriate. A browser-referrer restriction does not fit KekBot's server-side metadata requests. Follow [Google's setup guidance](https://developers.google.com/youtube/v3/getting-started).
4. In KekBot **Connections**, save the key in the YouTube form. A user OAuth grant is unnecessary for public video metadata.
5. In **Maintenance → Edit settings**, enable **Media enabled**. Review approval policy, maximum duration, queue capacity, per-user limit, cooldown and blocked uploaders/titles. Keep auto approval off for the first trial.
6. Complete the [request → approval → OBS playback walkthrough](OBS.md#youtube-request-and-approval-walkthrough). If using Discord, register commands again after enabling media.

Metadata uses the official [videos.list API](https://developers.google.com/youtube/v3/docs/videos/list). Missing/private/unavailable videos, quota/key errors and rule failures have explicit outcomes. Validation cannot guarantee browser autoplay or playback availability. The player must remain visible and comply with [YouTube's player requirements](https://developers.google.com/youtube/terms/required-minimum-functionality); downloading and audio extraction are not provided.

## Change or revoke credentials

Rotate compromised credentials in the provider portal and replace the encrypted settings in Connections. Confirm the new configuration with an actual permitted action. For Kick, reauthorize and subscribe again. For Discord, verify endpoint signatures and bot sends; update the public key if the app changes. For YouTube, revalidate a request and review quotas. Treat leaked OBS/API tokens separately: revoke them in **Maintenance**. See [troubleshooting](TROUBLESHOOTING.md) and [recovery](BACKUP_RECOVERY.md).
