# OBS sources and media playback

Use this when you want alerts, chat or videos to appear on your stream. In OBS, a **Browser Source** displays a web page supplied by KekBot. Start with one alerts source; the video player can come later. Keep its private URL out of screenshots and public scene exports.

Install/claim KekBot and connect the relevant [providers](PROVIDERS.md) first. Fixtures can exercise source layouts and simulated playback without real YouTube. Real OBS playback/audio and provider delivery remain live acceptance checks. Return to the [documentation index](README.md).

<!-- contents:start -->
**On this page**

- [Create a source](#create-a-source)
- [Source types](#source-types)
- [Themes and presentation options](#themes-and-presentation-options)
- [Follow alert walkthrough](#follow-alert-walkthrough)
- [YouTube request and approval walkthrough](#youtube-request-and-approval-walkthrough)
- [Restart, disconnect or playback error](#restart-disconnect-or-playback-error)
- [Scene and credential checklist](#scene-and-credential-checklist)
- [Queue and history](#queue-and-history)
<!-- contents:end -->

## Create a source

1. Sign in as the owner and open **Widgets → Add widget**.
2. Choose a **Name**, what it shows under **What it shows**, a **Theme**, **Width**, **Height** and, for list types, **Items to show**. Optionally adjust **Accent colour**, **Text size**, **Alignment**, **Background**, **Spacing** and the show/hide options described in [themes and presentation options](#themes-and-presentation-options). Turn on **Reduce motion** when desired. Select **Save widget**.
3. Select **Create OBS source URL** on its card. Copy the private URL immediately; its token is shown once. Store it privately.
4. In OBS Studio, choose **Sources → + → Browser**, create a source and paste the URL. Keep **Local file** off. Set width/height to match the widget.
5. Confirm the source is visible, updates and recovers after a network interruption. A disabled widget renders empty; some types are empty until an event or target exists.

OBS documents its [Browser Source properties](https://obsproject.com/kb/browser-source). For a persistent player, leave **Shutdown source when not visible** and **Refresh browser source when scene becomes active** off; unloading/reloading the page interrupts its lease/playback. Reuse the same source across scenes instead of creating competing players. If that behavior is unsuitable for a scene, pause playback deliberately before unloading it.

URLs contain scoped credentials. Keep source properties, scene exports, screenshots and logs private. Owner sessions and moderator permissions are unnecessary in an OBS source. Widget read tokens authorize only their named source; the player also has a separate acknowledgement token in the URL fragment. Preserve the complete URL including that fragment.

To revoke a leaked source, open **Widgets**, find the widget's card and use **Revoke** under **Source URLs issued** for its **Display URL** and, for a media player, its **Playback credential**. URLs whose widget was deleted are listed under **Source URLs for deleted widgets** on the same page. Create a new source URL and replace it in OBS. Revoking only the display URL does not revoke the independent playback credential.

## Source types

| Type | Displays | Target/configuration |
| --- | --- | --- |
| `alerts` | The active queued alert, one at a time: optional image, an event kicker ("New follower", "Gifted subs"), the rendered text with the supporter name emphasised, and optional sound. It enters and leaves with the alert's `fade`/`slide`/`none` animation | Enabled alert configurations and uploaded asset IDs |
| `chat` | Retained recent chat after moderation inspection, newest at the bottom, names coloured by role with Host/Mod/VIP/Sub badges and optional fade-out; messages that matched a rule or were removed by a moderator are never shown | Limit and Chat fade seconds; empty when chat history is disabled |
| `player` | Visible YouTube player with a now-playing bar (title, requester, duration and playback state) | Media enabled, approved queue, separate player token |
| `nowplaying` | Current item card: title, "Requested by …", duration and a playing indicator | Media state |
| `queue` | "Up next" rows numbered by place in the queue (1, 2, 3…), with title, requester and duration. The number is the play order, not the request number used in chat and Discord | Limit |
| `eventfeed` | Recent supporters with human labels ("followed", "subscribed for 3 months", "gifted 5 subs") and relative times | Observed events and limit |
| `supporter` | Latest observed supporter card | Observed follow/subscription event |
| `goal` | One card per goal with a progress bar, value/target, percentage and a "Goal reached!" completion state | Goal ID in Target, or blank for enabled goals up to Limit |
| `multigoal` | Several goal bars in one panel | Optional goal ID filter and limit |
| `status` | Live/Offline badge, uptime and viewer count. An unknown state, start time or stale viewer sample shows as unavailable, never guessed | Show uptime and Show viewer count |
| `counter` | A custom command's counter as a large number | Command document ID in Target |
| `leaderboard` | Ranked point balances with gold/silver/bronze markers for the top three | Limit |
| `poll` | Latest or selected poll: numbered options, bars with whole-number percentages that total 100, vote counts, time remaining and the `!vote` hint | Poll ID in Target, or blank for latest |
| `raffle` | Entry count and `!enter` hint while open, then an animated winner reveal once drawn | Raffle ID in Target, or blank for latest |
| `countdown` | Time to the deadline as `hh:mm:ss`, or `Nd hh:mm:ss` with a day or more left, then the end message | Ends at (Unix milliseconds), Text and End text |
| `shoutout` | Latest permitted shoutout card, hidden after the configured duration | Moderator `!so` action and Show each shoutout for |
| `socials` | Configured social lines, rotating every 8 seconds with a recognised platform label | Maintenance Socials setting |
| `activity` | Rotating observed supporter activity, one card at a time | Observed events and limit |

Use IDs shown on configuration cards, not their display names. All widgets use built-in themes and literal text; custom executable HTML/script templates are unsupported. Retention limits what historical sources can display.

Timed content (alerts, shoutouts, countdowns and uptime) follows the KekBot server's clock. Every source update carries the server time, so an OBS computer whose clock is fast or slow still shows an alert for its full duration.

### Choosing dimensions and targets

Use the [recommended sizes](#recommended-sizes) as a starting point, then adjust the widget and OBS source together. Width/height are source pixels, not a promise that every type fits every layout. Review long names/titles and your chosen theme at your actual scene scale. Use **Reduced motion** for presentation that should minimize animation.

A counter needs a command with **Count uses** enabled, chosen in the widget's **Command** list. A poll/raffle/goal widget can select one from its list; **Automatic** follows the type's default selection. A countdown needs a future **Count down to** date and time and an optional **Countdown label**. API callers send document IDs and Unix milliseconds instead. A chat source needs retained chat bodies. A supporter/activity source needs observed support events. A blank source can be an expected empty state rather than a connection failure. [All widget fields](CONFIGURATION_FIELDS.md#widget).

## Themes and presentation options

Every theme is a built-in pack of typography, spacing, corner radius, panel translucency, accent colour and entrance motion. Each pack keeps text readable over bright or busy game footage with a translucent or opaque panel. The page background is always transparent in OBS.

| Theme | Look | Motion |
| --- | --- | --- |
| `mint` (default) | Dark green translucent panels, rounded corners, mint accent | Rise |
| `midnight` | Deep navy translucent panels, periwinkle accent | Gentle fade-up |
| `paper` | Light cream panels, dark text, serif headings, forest-green accent | Fade |
| `neon` | Near-black panels with a glowing cyan border, uppercase condensed headings, magenta highlights | Quick pop |
| `ember` | Warm charcoal panels, heavy type, orange accent, large radius | Slide in from the left |
| `glass` | Frosted dark translucent panels, thin light border, large radius | Soft float |
| `contrast` | Opaque black panels, white text, thick yellow border, square corners | Short fade |

Themes use fonts already installed on the streaming computer (for example Segoe UI, Bahnschrift, Trebuchet MS, Verdana or Georgia) and fall back to the system font; nothing is downloaded. Other presentation options are optional. A source saved before they existed keeps its content behaviour: empty sources stay blank and a shoutout stays until the next one. The dashboard starts new widgets with a placeholder and a 20-second shoutout ([exact bounds](CONFIGURATION_FIELDS.md#widget)):

- **Accent colour** replaces the pack accent with a colour from a fixed palette. There is no free-form colour, CSS, HTML or script input.
- **Text size** multiplies the text size (0.5–3). **Alignment** places cards and text; Automatic centres alerts, shoutouts, countdowns and counters. **Background** chooses the pack's see-through panel, a solid panel, or no panel with outlined text. **Spacing** Compact tightens spacing.
- **Heading text** overrides a heading such as "Up next". **Show heading**, **Show details**, **Show uptime** and **Show viewer count** hide parts; a hidden viewer count is your choice, while an unknown one shows `Viewers unavailable`. Turn off **Show a placeholder when empty** to keep a source fully transparent until it has something to display.
- **Message when it ends** is the countdown's end message. **Show each shoutout for** controls how long a shoutout card stays (`0` keeps it until the next shoutout). **Fade messages after** fades older chat messages (`0`, never).

**Reduced motion** on the source, or the operating system's reduced-motion preference, removes entrance/exit animation and transitions; content still appears and disappears on time.

### Recommended sizes

| Type | Start at (width × height) |
| --- | --- |
| `alerts` | 800 × 400 |
| `chat` | 400 × 600 |
| `player` | 1280 × 720 |
| `nowplaying` | 600 × 140 |
| `queue`, `eventfeed`, `leaderboard` | 500 × 400 |
| `supporter`, `activity` | 500 × 160 |
| `goal`, `multigoal` | 600 × 300 |
| `poll` | 600 × 360 |
| `raffle` | 500 × 260 |
| `countdown` | 500 × 200 |
| `counter` | 300 × 160 |
| `shoutout` | 600 × 220 |
| `status` | 420 × 100 |
| `socials` | 600 × 100 |

These sizes were reviewed with synthetic fixture data in a desktop Chromium browser over a busy test background. Real OBS rendering, the fonts on your streaming computer and audio output still need checking in OBS itself.

## Follow alert walkthrough

1. In **Alerts**, upload a supported image/sound if wanted, or upload later from the alert form.
2. Select **Add alert**, set **Show this alert for** to **New follower**, set text such as `Thanks for following, {user}!`, and optionally pick the image/sound from the **Image**/**Sound** lists. Save.
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

## Queue and history

Queue sources and playback use active media state. Completed, rejected and failed history is browsed separately in the dashboard and cannot hide active requests. History pagination does not alter the player lease, acknowledgements or explicit resume after restart.
