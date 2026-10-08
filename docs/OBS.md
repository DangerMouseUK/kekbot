# OBS sources and media playback

Install/claim KekBot and connect the relevant [providers](PROVIDERS.md) first. Fixtures can exercise source layouts and simulated playback without real YouTube. Real OBS playback/audio and provider delivery remain live acceptance checks. Return to the [documentation index](README.md).

<!-- contents:start -->
**On this page**

- [Create a source](#create-a-source)
- [Source types](#source-types)
- [Follow alert walkthrough](#follow-alert-walkthrough)
- [YouTube request and approval walkthrough](#youtube-request-and-approval-walkthrough)
- [Restart, disconnect or playback error](#restart-disconnect-or-playback-error)
- [Scene and credential checklist](#scene-and-credential-checklist)
<!-- contents:end -->

## Create a source

1. Sign in as the owner and open **Widgets → Add widget**.
2. Choose a name, **Type**, **Theme** (`mint`, `midnight`, `paper`), **Width**, **Height** and **Limit**. Enable **Reduced motion** when desired. Save the widget.
3. Select **Create OBS source URL** on its card. Copy the private URL immediately; its token is shown once. Store it privately.
4. In OBS Studio, choose **Sources → + → Browser**, create a source and paste the URL. Keep **Local file** off. Set width/height to match the widget.
5. Confirm the source is visible, updates and recovers after a network interruption. A disabled widget renders empty; some types are empty until an event or target exists.

OBS documents its [Browser Source properties](https://obsproject.com/kb/browser-source). For a persistent player, leave **Shutdown source when not visible** and **Refresh browser source when scene becomes active** off; unloading/reloading the page interrupts its lease/playback. Reuse the same source across scenes instead of creating competing players. If that behavior is unsuitable for a scene, pause playback deliberately before unloading it.

URLs contain scoped credentials. Keep source properties, scene exports, screenshots and logs private. Owner sessions and moderator permissions are unnecessary in an OBS source. Widget read tokens authorize only their named source; the player also has a separate acknowledgement token in the URL fragment. Preserve the complete URL including that fragment.

To revoke a leaked source, open **Maintenance → Source and API tokens**, revoke its read token and, for a player, its player token. Create a new source URL and replace it in OBS. Revoking only the read token does not revoke the independent player credential.

## Source types

| Type | Displays | Target/configuration |
| --- | --- | --- |
| `alerts` | Active queued alert with image/sound | Enabled alert configurations and uploaded asset IDs |
| `chat` | Retained recent chat | Limit; empty when chat history is disabled |
| `player` | Visible YouTube player | Media enabled, approved queue, separate player token |
| `nowplaying` | Current item/title/requester | Media state |
| `queue` | Waiting approved items | Limit |
| `eventfeed` | Recent follows/subscriptions | Observed events and limit |
| `supporter` | Latest observed supporter | Observed follow/subscription event |
| `goal` | One or more enabled goals | Goal ID in Target, or blank for enabled goals up to Limit |
| `multigoal` | Multiple goal progress values | Optional goal ID filter and limit |
| `status` | Stream state and recent viewer sample | Unobserved/stale counts show unavailable |
| `counter` | A custom command's counter | Command document ID in Target |
| `leaderboard` | Highest point balances | Limit |
| `poll` | Latest or selected poll and totals | Poll ID in Target, or blank for latest |
| `raffle` | Latest or selected raffle/winners | Raffle ID in Target, or blank for latest |
| `countdown` | Time to configured deadline | Ends at (Unix milliseconds), Text |
| `shoutout` | Latest permitted shoutout | Moderator `!so` action |
| `socials` | Configured social text | Maintenance Socials setting |
| `activity` | Rotating observed supporter activity | Observed events and limit |

Use IDs shown on configuration cards, not their display names. All widgets use built-in themes and literal text; custom executable HTML/script templates are unsupported. Retention limits what historical sources can display.

### Choosing dimensions and targets

Start with 800 × 400 for an alert or compact list, then adjust the widget and OBS source together. Width/height are source pixels, not a promise that every type fits every layout. Review long names/titles and all three themes at your actual scene scale. Use **Reduced motion** for presentation that should minimize animation.

A counter needs a command ID with Counter enabled. A selected poll/raffle/goal needs that document's ID; leaving Target blank follows the type's default selection. A countdown needs a future Ends at value in milliseconds and optional Text. A chat source needs retained chat bodies. A supporter/activity source needs observed support events. A blank source can be an expected empty state rather than a connection failure. [All widget fields](CONFIGURATION_FIELDS.md#widget).

## Follow alert walkthrough

1. In **Alerts**, upload a supported image/sound if wanted. Copy the returned asset IDs.
2. Select **Add alert**, choose `channel.followed`, set text such as `Thanks for following, {user}!`, and enter the optional image/sound IDs. Save.
3. Select that preview event and **Preview without delivery**. The preview creates no live provider history; use its audio controls to test the asset.
4. Create an `alerts` widget/source as above. Use **Send manual alert** with a separate `manual` alert configuration to verify the source path deliberately, then verify a genuine follow event when available.
5. Check volume/muting in OBS and the operating system. If using **Control audio via OBS** in Browser Source properties, configure its mixer/monitoring/output intentionally. Test the actual recorded/stream output, not only local monitoring.

PNG/JPEG/GIF/WebP and WAV/OGG/MP3 assets up to 8 MiB are accepted. SVG/HTML are rejected. Alert duration, priority, volume and animation are configurable. Alert volume is 0–1; player volume is 0–100. Remove asset references before deleting an asset. Use only assets you can redistribute/display.

## YouTube request and approval walkthrough

1. Configure the YouTube key, enable media in Maintenance and create **one** player source in OBS.
2. From a viewer account, send `!sr <YouTube URL or video ID>` in the configured creator's Kick chat.
3. Wait for metadata validation. A durable chat update reports pending approval, acceptance or a rejection reason. Inspect **Media** for the item's ID, status and version.
4. Approve it in the dashboard, or use Discord's `/kekbot action:media.approve target:<ITEM_ID> version:<VERSION>` after media permission/routing setup.
5. In Media, select **resume** if playback is paused. Use OBS **Interact** to address browser playback restrictions where possible. Confirm the visible video and actual audio output.
6. Let the item finish and verify that the queue advances once. Add another item to check ordering. Use **pause**, **resume**, **skip** and volume controls deliberately.

Dashboard-added moderator requests auto-approve after validation; viewer requests use the selected approval policy. Queue clearing preserves the current item. Reordering applies to the exact waiting approved set. Reject/remove/approve actions use the displayed current version; refresh after another operator edits the item.

Keep YouTube's embedded interface visible, including required controls/branding; do not hide it behind an overlay or crop it to extract audio. Browser autoplay, embedding, geographic/account restrictions and video removal can still prevent playback after successful metadata validation.

## Restart, disconnect or playback error

The queue and current item persist. Restart or player disconnection pauses playback, and a moderator must explicitly resume; the current item starts again from the beginning. An error never silently skips the item. Decide whether to retry a playable item, remove/skip it, or leave playback paused.

Only one player can hold the active lease. A second player cannot take over a healthy lease; stale completion callbacks cannot advance a newer item. Close/remove unwanted sources, wait for the old lease to expire (15 seconds), then resume from the intended source. A now-playing or queue source has no playback authority.

For blank sources, lost credentials, autoplay/embedding errors or unexpected audio, see [troubleshooting](TROUBLESHOOTING.md#obs-and-media).

## Scene and credential checklist

- Keep one persistent player Browser Source and reuse that source across scenes. Separate copies can compete for the lease.
- Preserve the complete source URL, including a player's `#player=` fragment. A read URL alone cannot acknowledge playback.
- Test actual recorded/stream audio and visible player controls. Monitoring sound locally does not establish output delivery.
- Revoke both token kinds when replacing a player source. Existing scene collections/exports still contain the old credential values; keep them private.
- After reconnect/restart, inspect the current item and error before moderator resume. Closing a source is not an end-of-item event.
- Preview changes separately from live manual alerts. Only actual provider/OBS tests establish those live boundaries.
