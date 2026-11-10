# Using KekBot

**Start small:** use [your first session](FIRST_SESSION.md) for a worked command/timer/alert. This page is the reference for daily tasks; read the module you need, not every section. [Glossary](GLOSSARY.md).

This guide is for creators and operators using an existing installation. For initial host setup use [Getting started](GETTING_STARTED.md), then [provider setup](PROVIDERS.md) and the [first-session walkthrough](FIRST_SESSION.md). For a demonstration with synthetic data, use the [quickstart](QUICKSTART.md). Every editor field has a [reference with defaults and bounds](CONFIGURATION_FIELDS.md). Return to the [documentation index](README.md).

<!-- contents:start -->
**On this page**

- [Accounts and permissions](#accounts-and-permissions)
- [Find your way around](#find-your-way-around)
- [Commands](#commands)
- [Timers](#timers)
- [Alerts, goals and presentation](#alerts-goals-and-presentation)
- [Media requests](#media-requests)
- [Moderation](#moderation)
- [Points and rewards](#points-and-rewards)
- [Polls and raffles](#polls-and-raffles)
- [Analytics and private data](#analytics-and-private-data)
- [Browse older media requests](#browse-older-media-requests)
<!-- contents:end -->

## Accounts and permissions

Sign in at your installation's URL with a local account. KekBot accounts are separate from Kick/Discord accounts. Sessions last up to 12 hours. Sign out on shared devices. Change your password in **Maintenance → Change password**; changing it signs out your existing sessions.

| Role | What it can do |
| --- | --- |
| Owner | All configuration, operations, integrations, accounts, source/API tokens and privacy/maintenance actions |
| Admin | Only owner-granted `configure`, `operate`, `moderate`, `media`, `engage`, `invite` capabilities |
| Moderator | Operations, moderation/notes, media and engagement; no general configuration or owner powers |
| Read-only | View operational state and change own password/sign out; no moderator notes or operational mutations |

Owners use **Accounts → Invite an operator** to create a one-day, single-use invitation. Send it privately. The recipient opens the installation, selects **I have an invitation**, enters the token and creates their own username/password. Invitations do not add a second owner.

Owners can disable accounts or revoke sessions from Accounts. An admin with explicit `invite` authority can invite a reader or an admin with a subset of their operational grants; inviting a moderator requires all four moderator capabilities. Admins cannot delegate `invite` or owner powers. Invitation acceptance rechecks the creator's current authority. Invited operators can see retained viewer/operational history, so choose trusted people.

Discord has its own [role/user mappings](PROVIDERS.md#discord). A dashboard invitation does not grant Discord authority, and a Discord role does not create a dashboard account.

The complete [account guide](ACCOUNTS.md) covers claim, invitation acceptance, the capability matrix, session expiry and removing access. In the workflows below, **configure** means the owner or an admin explicitly granted `configure`; operational capabilities can also belong to moderators. If a control is unavailable, ask your installation's owner to review your grants.

## Find your way around

**Control room** opens with live status (stream, Kick, media player and background work), a **Needs attention** list with direct **Approve**/**Reject** and **Fulfilled**/**Refund** buttons, a **Setup checklist** whose **Set up** buttons open each step, and **Recent activity** written as sentences. **Connections** holds owner-only provider configuration. Other panels cover Commands, Timers, Alerts, Media, Moderation, Goals, Points & rewards, Polls & raffles, Widgets, Analytics, Accounts and Maintenance. Available controls depend on your role.

Configuration cards describe each item in plain words, and the buttons on a card act on that item directly: you do not copy IDs or versions. If someone else changed the item first, KekBot reloads the latest state and says what changed; check it and try again. **Details** on a card shows its reference ID, which a widget target, Discord command or the API may still ask for. Problems appear as a sentence with a next step at the top of the page; the API keeps its error codes. Most edits take effect without restarting. On a phone, the panel list scrolls sideways under the KekBot name.

The configuration editor groups each kind into short sections with help text, and only shows fields that apply to your choices (for example, a countdown widget shows **Count down to**; a link rule shows **Allowed websites**). Hidden fields keep their saved values. Dates use a date-time picker in your browser's timezone; durations have a unit selector; lists use numbered rows or tags (type a value and press Enter); Discord grants are ID/permission rows. Problems appear next to the field and in a summary at the top of the form when you save; select a summary entry to jump to the field. Field constraints/defaults are in the [field reference](CONFIGURATION_FIELDS.md).

Use **Edit** to change a card and save the form. Use **Delete** only after reviewing dependencies: deleting a target can leave a counter/activity widget empty. Disabling a configuration is a reversible way to stop new use while preserving its ID. The dashboard shows current state; it is not required to stay open for jobs/timers to work.

## Commands

1. Open **Commands → Add command**.
2. Give it a name and lowercase trigger such as `!welcome`.
3. Enter a response in **Response 1**: `Welcome, {user}!` is a simple first example. **Add response** adds more; one is picked at random. The **Insert** buttons add variables, and the preview under the list shows the reply with sample values.
4. Add aliases (type one and press Enter), a group, **Allowed roles**, **Cooldown for everyone**/**Cooldown per viewer** and **When it works**. Leaving every role unticked allows viewers generally. Built-in or already-used triggers are flagged before you save.
5. Save, then select **Preview responses**. Preview sends no chat and changes no counter/cooldown.
6. Send the trigger in the configured creator's Kick chat and check its actual reply/delivery outcome.

Templates support `{user}`, `{args}`, `{channel}`, `{counter}`, `{points}` as plain text. Turn on **Counter** for a persisted command counter. Custom commands cannot override reserved built-ins. Runtime edits apply without a restart.

| Built-in | Use |
| --- | --- |
| `!kekbot`, `!commands` | Proof response / available command listing |
| `!uptime`, `!rules`, `!discord`, `!socials` | Observed stream uptime / configured utility text |
| `!so <channel>` | Moderator shoutout |
| `!goal` | Goal information |
| `!points`, `!watchtime`, `!top` | Balance, estimated activity watchtime, leaderboard |
| `!redeem <reward>` | Redeem a configured reward |
| `!vote <number>`, `!enter` | Vote in an open poll / enter an open raffle |
| `!sr <URL or video ID>`, `!queue`, `!nowplaying` | Enabled media requests and queue information |
| `!skip` | Moderator media skip |

Utility text comes from **Maintenance → Edit settings**. Missing configuration or unobserved uptime produces an explanation rather than invented data. Built-ins also have cooldowns; a suppressed command is not proof that intake is broken.

### Command behavior and common surprises

An enabled custom command selects one response randomly. Aliases use the same restrictions, cooldowns and persistent counter. A disallowed role, cooldown or stream condition suppresses the command silently. Roles are exact observed roles, not a hierarchy: include `moderator`/`broadcaster` explicitly if a restricted command should work for them. An empty list is the simplest unrestricted starting point.

`{channel}` is the configured instance name; `{user}` is the sender display name. `{args}` is text after the trigger, bounded to 200 characters. Unknown variables show an unavailable marker. Turn Counter on before relying on `{counter}`. Preview substitutes a sample viewer and does not establish real delivery. Custom trigger/alias names must be unique and cannot replace built-ins.

Most built-ins have a five-second per-viewer cooldown; `!kekbot` additionally has a ten-second installation-wide proof cooldown. `!so`/`!skip` need an observed Kick moderator/broadcaster. `!redeem` accepts a reward ID or full name. `!vote`/`!enter` use the latest open activity of that type; keep only one open poll and raffle at a time to avoid ambiguity. `!commands` lists enabled commands, not a guarantee that the caller meets their restrictions. Its output is capped at 500 characters.

The five-second guard applies per viewer and command, including error replies for invalid input or missing permission. Rapid repeated invalid `!sr` or forbidden `!skip` requests produce one explanation rather than a reply for every message. The guard survives restart; wait five seconds before trying again. Custom command cooldown settings remain separate.

## Timers

In **Timers → Add timer**, enter rotating messages and **Post every** (at least 1 minute). Configure **Chat messages needed in between**, **Only while live**, **Timezone** and optional **Quiet from**/**Quiet until** hours. The form previews the messages as you type; save, then preview again from the card.

Each timer card shows its status (next send time, waiting for the stream or for chat messages, quiet hours, paused or off), when it last sent with the delivery result, and a **Timer on** switch (needs `configure`). The banner at the top of **Timers** shows whether all timers are paused. Use **Pause all timers** before disruptive work; **Resume timers** when ready. Offline, paused and restarted timers reschedule without sending missed reminders. Queued sends recheck current eligibility/version/schedule; superseded work is recorded as `timer_no_longer_eligible`. A send already accepted by Kick cannot be recalled.

For a ten-minute reminder, use **Post every** `10` minutes, **Chat messages needed in between** `5`, **Only while live** on. A quiet window from `22:00` until `07:00` suppresses 22:00 through 06:59 in the selected timezone. Both endpoints are needed (the form warns when only one is set); equal endpoints suppress all hours. Leave both **Not set** for no quiet window. If not enough messages arrive by the due time, the timer waits another interval. A pure preview does not schedule a send. See [timer fields](CONFIGURATION_FIELDS.md#timer).

## Alerts, goals and presentation

Configure event/manual alerts in **Alerts** and test **Preview without delivery** before sending a live manual alert with **Manual alert text → Send manual alert**. Use [OBS setup](OBS.md) for assets, sound and private Browser Sources.

In **Widgets**, each card shows the widget type, theme and the Browser Source width and height to use in OBS. Owners select **Create OBS source URL**: the private URL appears once with a **Copy** button and a live preview. A player widget instead shows an **OBS player source URL**, which includes the separate playback credential after `#player=`, and a **Display-only URL**; the dashboard does not preview players, so audio cannot play twice. Each card lists the URLs already issued with **Revoke**, and URLs left over from deleted widgets appear under **Source URLs for deleted widgets**. The panel also has a short **How to add a widget to OBS** guide.

Create goals in **Goals** with metric, current value and target. Event goals update from observed events; manual changes/reset require the current version. Completion can create alerts/notifications if configured. Widgets have seven built-in themes (`mint`, `midnight`, `paper`, `neon`, `ember`, `glass`, `contrast`), a fixed accent palette, text size/alignment/backdrop/layout options and reduced-motion settings; see [OBS themes](OBS.md#themes-and-presentation-options). For goal, poll, raffle and counter widgets the editor lists your goals, polls, raffles or counting commands to choose from; the API stores the chosen document ID.

To make a manual goal, choose `manual`, set Target to `100` and Value to `0`, then save. Each goal card shows a progress bar. With `operate`, use **+1** or **+5**, **Add or subtract → Apply** for a relative change such as `-3`, **Set exactly → Set** for a new absolute amount such as `25`, or **Reset** (after a confirmation) to return to 0. Reset below the target clears completion. Automatic follow/subscription/points/media goals start from observed events after configuration; they do not import historic provider totals. Completed automatic goals stop incrementing until reset. Configure an alert with Event `goal` and template `{name}: {value}/{target}` for completion presentation.

## Media requests

Owners enable media and configure its rules in Maintenance after adding a YouTube key. Viewers request in the configured creator's Kick chat. Moderators approve/reject in Media or through permitted Discord controls. Dashboard-added requests auto-approve after metadata validation; viewer requests use the selected policy.

Follow the [complete media walkthrough](OBS.md#youtube-request-and-approval-walkthrough) for OBS playback. Pause/resume/skip/volume use the current player version. Restart or player loss preserves the queue/current item, pauses, and requires moderator resume from the beginning. An error never silently advances.

The request progresses through validating → pending (manual policy) or approved → playing → completed. Failed validation leaves a plain-English reason on the item. Requests show as `#position · title · requester · duration`. The **Player** section has **Pause** or **Resume**, **Skip** and a **Volume** slider that saves when you release it. **Requests and queue** groups requests into **Waiting for your approval** (**Approve**/**Reject**), **Up next** (drag a request, or use ↑, ↓ and **Move to top**; **Remove**) and **Being checked**. Add one yourself with **Add a YouTube video → Add request**. **Clear queue** asks for confirmation; it also removes requests still validating and keeps the current item. To stop the current item, use **Pause** or **Skip** instead. If another moderator acted first, KekBot reloads and says what changed.

## Moderation

Start with disabled rules. In **Moderation**, configure a link, phrase, repetition, caps or burst rule; set trusted-role exceptions, thresholds, time windows, action and optional schedule. Use safe sample tests first: tests report matches without sending effects. Try warning behavior on an authorized test channel before enabling destructive actions.

Optional escalation is scoped to the matching rule and uses previous incident count, a time window and an escalation action. Reviewed temporary incident presets cover links, bursts (five messages in ten seconds), or both for 1–120 minutes. Presets warn, persist across restart, expire automatically, and leave saved rules intact.

**Emergency pause moderation** stops automatic actions while explicit permitted manual actions remain available; **Resume moderation** restarts them. The banner says which state you are in. Active incident mode shows a live countdown and **Stop incident mode**. Ban/delete/bulk operations require confirmation in a dialog. Check incident **delivery outcomes** as well as rule decisions; a match does not prove a provider action succeeded. Moderator viewer search covers the latest 100 observed viewers. Notes require moderation authority.

### Build and test a rule

1. With `configure`, add a rule and leave it disabled. Choose a descriptive name and `warn` action first.
2. Configure the relevant fields below; the form shows only the fields for the selected type (**What to look for**), and **Timeout length** only when an action is a timeout.
3. Save, edit to enable, then in **Test a rule** choose the rule and sender role, type a **Sample message** and select **Test message**. Try both matching and permitted messages. The test respects Enabled, role and schedule, so a disabled rule always reports no match. Pause automatic moderation while evaluating an enabled rule if necessary.
4. Test a trusted-role exception and an allowed domain. A test has no prior-message history; repetition/burst behavior needs a controlled fixture/live sequence as well.
5. Enable normal processing only after reviewing results, current provider scopes and intended channel. Inspect incidents and actual provider outcomes.

| Rule | Matching behavior | Example configuration |
| --- | --- | --- |
| Phrase | Case-insensitive literal substring, not a regular expression or word boundary | Patterns: `synthetic spoiler phrase` |
| Link | Recognized domain links except allowed exact hosts/subdomains | Allowed domains: `example.com`, without protocol/path |
| Repetition | Same viewer's equal text within the window, including current message | Repeats before acting 3, Within 30 seconds |
| Burst | Same viewer's message count within the window, including current message | Messages before acting 5, Within 10 seconds |
| Caps | Uppercase percentage with at least ten alphabetic characters | Capital letters 80 |

Only the first matching saved rule acts; temporary presets follow saved rules. Escalation counts previous incidents for that viewer and rule, not confirmed successful sanctions. `Escalation after = 2` escalates the next matching incident when two previous incidents exist in the selected window. Actions already accepted by Kick cannot be undone by disabling the rule.

### Manual actions and notes

Select **Moderate** next to a message in **Recent chat** (moderators only; the latest inspected messages), an entry in **What happened**, or a person in **Observed viewers**. Choose **Warn**, **Time out** (1 minute to 1 week), **Ban** or **Delete message**, pick a reason or write your own, then select the action button. Delete is offered only for a chat message or a rule incident that recorded one. Ban, delete and bulk actions explain what will happen, and the dialog's action button is your acknowledgement. To act on several people, tick up to 20 in **Observed viewers** and select **Moderate selected**; review the list in the dialog first. For someone who is not listed, open **Act on someone who is not listed** and enter their numeric Kick user ID. **What happened** shows each action with Kick's result.

Create a note with the viewer's numeric ID, a short internal name and bounded text. Notes are visible only to moderation authority and remain private. Do not put credentials or unnecessary personal details in notes. For a disruptive incident use **Emergency pause moderation**; separately stop an active temporary preset if it should not resume with moderation.

## Points and rewards

Enable points in Maintenance and configure award amount/cadence/recent-chat activity window. Accrual runs while the observed stream state is live and follows recent chat activity; silent viewers cannot be measured. Watchtime is explicitly estimated; it uses the same live state, cadence and activity window but accrues whether or not points are enabled.

Add rewards in **Points & rewards** with cost, description and manual/alert fulfillment. A redemption debits atomically. Moderators complete a fulfilled redemption or reject it for a single refund. Point adjustments need a reason. Balances/decisions survive restart; neither privacy erasure nor retention silently rewrites economic history.

For a first reward, configure Name `Choose a topic`, Cost `100`, Fulfillment `manual`. Viewers use `!redeem Choose a topic` or the reward ID. In **Pending redemptions**, each row names the viewer and reward, with a reference ID that matches Discord notices. Perform the real promised action before **Mark fulfilled**. Choose **Reject and refund** when it cannot be fulfilled; repeat decisions are rejected. Alert fulfillment still needs moderator completion and uses enabled manual-alert configurations.

Pending redemptions are independent of **Recent redemptions**, which shows the latest 100 decisions/requests. The pending queue shows 50 waiting items per page; use **Older waiting items** until you reach the request, **Newest waiting items** to return, or **Refresh this page** to reload an older page. Fulfillment/refund refreshes that page. Older pending requests remain actionable even after hundreds of newer completed rewards. Read-only users can browse but cannot fulfill or refund.

To correct a balance, use **Give or remove points**: search for an observed viewer by name or Kick user ID, choose them, enter Points and a Reason, then select **Add points** or **Remove points**. The new balance is shown. A removal cannot make the balance negative. The **Leaderboard** and **Recent redemptions** tables show viewer and reward names. Accrual awards once per eligible cadence bucket while observed live; it does not backfill downtime or prove silent viewing. Watchtime advances in whole estimated minutes once per cadence bucket, even with points disabled. [Point settings](CONFIGURATION_FIELDS.md#settings).

## Polls and raffles

In **Polls & raffles**, add an activity with a future deadline. Polls have 2–10 options and optional vote changes; viewers use `!vote <number>`. Raffles can restrict roles and minimum points; viewers use `!enter`. One effective vote/entry per verified identity prevents duplicate delivery from adding another.

**Quick start** (needs `configure`) opens a poll with a question, 2–10 options, a duration from 2 minutes to 1 hour and optional vote changes, or a raffle with a name, duration and minimum points, without entering timestamps. Poll cards show live results with option numbers, percentages and vote counts, a closing countdown and **Close poll**; closed polls show the result. Raffle cards show the entry count, **Close entries**, **Draw winner** and **Reroll**, and list winners by name. Close before drawing a raffle. **Draw winner** and **Reroll** are audited; rerolls exclude previous winners. Deadlines persist through restart. Use poll/raffle widgets to show results without exposing operator controls.

### Run a poll

Create an enabled poll, enter 2–10 **Choices** (one per row; **Add choice** adds another) and a future **Voting closes** date and time, or use **Quick start**. Leave Status **Open for votes**. Announce option numbers starting at 1; viewers send `!vote 1`, for example. Enable **Let viewers change their vote** only if replacing a vote should be allowed. **Close poll** ends voting early; otherwise the deadline closes it. Repeating the same vote does not add another participant. A poll widget can select that poll so a later poll does not replace it on stream.

### Run a raffle

Create an enabled raffle with a future **Entries close** time. Winners are shown read-only in the form and change only through Draw/Reroll. Leaving every **Allowed roles** box unticked permits all observed chat roles; **Minimum points balance** is checked when entering and does not spend points. Viewers send `!enter`. Close or wait for expiry, then **Draw winner**. An empty eligible set produces an explicit error. **Reroll** records another winner excluding previous winners; it does not erase the original draw. Use a new raffle for a new round rather than editing winners by hand. Entry eligibility is based on observed verified identity and conditions when entering, not a complete provider follower roster.

## Discord controls

After the owner [connects Discord](PROVIDERS.md#discord), grants your role or user a permission and registers commands, type `/kekbot` in the configured channel. Replies are private to you. Options that name something offer suggestions as you type; pick one rather than typing IDs. A song request's number is its queue position, `#12`; you can type `#12` or `12`. You never type versions: KekBot captures what you named when you send the command, and if it changed before the command runs (or someone acted first), it replies **This changed** and does nothing.

| Command | What it does | Grant |
| --- | --- | --- |
| `/kekbot status` | Stream, player, timers, auto-moderation, incident mode and waiting work | Any KekBot grant |
| `/kekbot media queue` | The active queue by number, with Approve/Reject buttons for the first five waiting requests | `media` |
| `/kekbot media approve request:` / `reject request:` | Decide a waiting request | `media` |
| `/kekbot media remove request:` | Remove a waiting or queued request (use skip for the current song) | `media` |
| `/kekbot media move request: position:` | Move an approved request; `position:1` plays it next. The approved queue is renumbered | `media` |
| `/kekbot media clear confirm:True` | Remove every waiting and queued request; the current song keeps playing | `media` |
| `/kekbot media skip` / `pause` / `resume` / `volume level:` | Player controls; volume is 0–100 | `media` |
| `/kekbot goal list` | Goals with progress bars | `operate` |
| `/kekbot goal add goal: amount:` | Add to a goal; a negative amount subtracts (never below 0) | `operate` |
| `/kekbot goal set goal: value:` / `reset goal:` | Set the current value, or set it to 0 | `operate` |
| `/kekbot poll create question: options: [minutes:] [allow_change:]` | Start a poll with 2–10 answers separated by commas or `\|`; it stays open 5 minutes unless you set 1–1440. Viewers use `!vote <number>`. At most 10 polls and raffles can be open at once | `engage` |
| `/kekbot poll close poll:` / `results poll:` | Close a poll and show final results, or show current results | `engage` |
| `/kekbot raffle create name: [minutes:] [min_points:]` | Start a raffle; viewers use `!enter`. Counts toward the same limit of 10 open | `engage` |
| `/kekbot raffle close raffle:` | Stop entries; the reply has a Draw winner button | `engage` |
| `/kekbot raffle draw raffle:` / `reroll raffle:` | Draw a winner; reroll excludes earlier winners | `engage` |
| `/kekbot reward pending` | Waiting redemptions with Complete/Refund buttons for the first five | `engage` |
| `/kekbot reward complete redemption:` / `refund redemption:` | Mark fulfilled, or refund the points once | `engage` |
| `/kekbot points viewer:` | A viewer's points, estimated watchtime and when they were last seen | `engage` |
| `/kekbot mod warn viewer: reason:` | Warn in Kick chat | `moderate` |
| `/kekbot mod timeout viewer: reason: [minutes:]` | Time out; 10 minutes unless you set 1–10080 | `moderate` |
| `/kekbot mod ban viewer: reason: confirm:True` | Ban on Kick | `moderate` |
| `/kekbot mod delete viewer: message: reason: confirm:True` | Delete one chat message; `message:` suggests the viewer's recent retained messages | `moderate` |
| `/kekbot mod pause` / `resume` | Pause or resume automatic moderation rules; manual actions still work | `moderate` |
| `/kekbot mod incident-start preset: minutes: confirm:True` / `incident-stop` | Temporary link and/or burst warnings for 1–120 minutes | `moderate` |
| `/kekbot timers pause` / `resume` | Pause or resume chat timers without catch-up messages | `operate` |
| `/kekbot alert send text:` | Show a manual alert in OBS | `operate` |

The `media` group appears only when media is enabled, and `reward`/`points` only when points are enabled; they also refuse to run while their module is off. `engage` lets you start polls and raffles as well as close and draw them. Ask the owner to register commands again after changing either setting. Viewer suggestions list recently seen viewers by name; you can also type a name or a numeric Kick ID. Moderation replies mean the request was sent to Kick; Kick confirms separately, so check incidents and jobs in the dashboard if something did not happen.

Notification buttons work the same way: **Approve**/**Reject** on song requests, **Complete**/**Refund** on reward redemptions and **Draw winner** on raffle-close notices. After someone uses a button, the notice shows a disabled label such as **Approved**. An older button replies **This changed** instead of acting. Every error reply explains what went wrong in plain English and ends with a code, such as `Code: discord_permission_denied`, to share with the owner.

## Analytics and private data

**Analytics** opens on your most recent observed stream. Use **Show** to switch between:

- **Last stream**: the newest stream KekBot saw go live. A stream that is still live shows its time so far.
- **A specific stream**: pick from every retained stream, listed by date, start time and duration (for example `Sun, 1 Nov 2026, 18:00 · 2 h`). Streams appear once KekBot observes Kick's live/offline status events. If none has been observed yet, **Last stream** shows the last 30 days instead and says so.
- **Last 7 days** / **Last 30 days**: whole calendar days in this browser's time zone, from local midnight up to now.
- **Custom dates**: choose From and To, then **Show these dates**. The To day is included in full.

The summary cards group what KekBot observed in that period: chat messages, distinct chatters, commands answered, follows, subscriptions (with new, renewed and gifted counts), sampled viewers (average and peak), estimated watchtime, points awarded, redemptions, media requests and completions, moderation incidents, poll votes, raffle entries, alerts and goal progress. Each card shows a plain label and unit:

- **0** means nothing was observed while the worker was running.
- **Unknown** means the worker was not running, so KekBot could not observe anything. It is never shown as zero.
- **Not sampled** means no viewer-count samples exist. Viewer samples come from Kick roughly once a minute while live; they are an average and peak, not a total.
- **Estimated watchtime** is estimated from recent chat activity, not a provider-certified count.
- Distinct chatters are counted once per stream, so a range covering several streams adds each stream's chatters together.
- A metric KekBot records but has no label for yet appears under its raw ID instead of being hidden.

**Coverage** explains in words how long the worker was running in the period and lists each gap of more than two minutes, for example *Worker offline 19:01–19:20 (19 min)*. Gaps are also labelled when they fall before KekBot started recording or are older than the analytics retention period. A running worker does not prove that Kick or Discord delivered every event.

**Over time** charts one metric at a time; choose it with **Metric**. Counts are columns and viewer samples are a line. Hatched bands mark periods with no data. Hover over or tap a period, or focus the chart and use the arrow keys, Home and End, to read its value and worker coverage. **Show as a table** gives the same values as text. **Streams in this period** compares each stream's duration, coverage, messages, chatters, follows, subscriptions and viewers; with two or more streams it also charts the selected metric per stream.

**Download this selection (CSV)** and **Download this selection (JSON)** export exactly the period or stream on screen. The CSV has one row per day and metric with `day`, `metric`, `label`, `unit`, `value`, `samples`, `minimum` and `maximum` columns; a viewer-sample `value` is the day's average. Days, in the CSV and in daily or weekly charts, run from local midnight to local midnight in this browser's time zone, so a day when the clocks change lasts 23 or 25 hours and nothing shifts into the neighbouring day. Cells starting with `=`, `+`, `-`, `@` or a control character are prefixed with `'` so spreadsheets do not run them as formulas. The JSON contains the full analytics result, including coverage gaps and per-stream summaries. The same exports are available through the [session analytics route](API.md#route-inventory).

No pre-installation history is imported, and retention limits available rows. Real-session accuracy has not been live-verified yet; it is acceptance gate L17 in [live acceptance](LIVE_ACCEPTANCE.md).

Owners manage retention, viewer exports/erasure, redacted support data and native configuration imports in Maintenance. Read [privacy and retention](OPERATIONS.md#privacy-and-retention) before exporting or deleting data. Configuration exports are useful for reusable setups; use a [full backup](BACKUP_RECOVERY.md) for disaster recovery.

For a stuck action, source or connection, use [troubleshooting](TROUBLESHOOTING.md) and inspect delivery outcomes before repeating a provider mutation.

## Browse older media requests

In **Media**, **Requests and queue** shows all active requests independently of history. **Load media history** loads up to 50 terminal requests; **Older history** moves to the next page and **Latest history** refreshes recent results. History does not refresh automatically after an action. Failed requests can be removed by an operator with media permission; read-only users can browse without acting. Queue reordering includes the complete approved queue even after extensive history accumulates. OBS playback/lease and explicit recovery rules remain unchanged.
