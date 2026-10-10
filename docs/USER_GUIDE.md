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

**Control room** shows worker, Kick and player state plus recent activity. **Connections** holds owner-only provider configuration. Other panels cover Commands, Timers, Alerts, Media, Moderation, Goals, Points & rewards, Polls & raffles, Widgets, Analytics, Accounts and Maintenance. Available controls depend on your role.

Configuration cards display an **ID** and **Version**. Use IDs when another control asks for a target. A version conflict means someone changed that record; refresh and review it before retrying. Most edits take effect without restarting.

The configuration editor uses one value per line for ordinary lists. Guild role/user mappings use JSON. Fields ending in `At` use Unix milliseconds; use the [source/container deadline example](CONFIGURATION_FIELDS.md#conventions) to obtain a future value. Blank optional timestamps disable that bound. Field constraints/defaults are in the [field reference](CONFIGURATION_FIELDS.md).

Use **Edit** to change a card and save the form. Use **Delete** only after reviewing dependencies: deleting a target can leave a counter/activity widget empty. Disabling a configuration is a reversible way to stop new use while preserving its ID. The dashboard shows current state; it is not required to stay open for jobs/timers to work.

## Commands

1. Open **Commands → Add command**.
2. Give it a name and lowercase trigger such as `!welcome`.
3. Enter responses, one per line: `Welcome, {user}!` is a simple first example.
4. Set aliases, group, permitted roles, channel/user cooldowns and live/offline conditions. An empty role list allows viewers generally.
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

In **Timers → Add timer**, enter rotating messages and an interval of at least 60 seconds. Configure minimum intervening chat messages, stream-only behavior, timezone and optional quiet-hour start/end (0–23). Save and preview the responses.

Use **Pause all timers** before disruptive work; **Resume timers** when ready. Offline, paused and restarted timers reschedule without sending missed reminders. Queued sends recheck current eligibility/version/schedule; superseded work is recorded as `timer_no_longer_eligible`. A send already accepted by Kick cannot be recalled.

For a ten-minute reminder, use Interval `600`, Min messages `5`, Stream only on. A quiet window `22` → `7` suppresses 22:00 through 06:59 in the selected timezone. Both endpoints are needed; equal endpoints suppress all hours. Leave both blank for no quiet window. If not enough messages arrive by the due time, the timer waits another interval. A pure preview does not schedule a send. See [timer fields](CONFIGURATION_FIELDS.md#timer).

## Alerts, goals and presentation

Configure event/manual alerts in **Alerts** and test **Preview without delivery** before sending a live manual alert. Use [OBS setup](OBS.md) for assets, sound and private Browser Sources.

Create goals in **Goals** with metric, current value and target. Event goals update from observed events; manual changes/reset require the current version. Completion can create alerts/notifications if configured. Widgets have mint, midnight and paper themes plus reduced-motion settings. Goal/counter/activity targets use document IDs.

To make a manual goal, choose `manual`, set Target to `100` and Value to `0`, then save. Copy its card ID/version into **Adjust or reset goal**. Value is the **new absolute amount**, not an increment; use `25` to display 25/100 and `0` to reset. Reset below the target clears completion. Automatic follow/subscription/points/media goals start from observed events after configuration; they do not import historic provider totals. Completed automatic goals stop incrementing until reset. Configure an alert with Event `goal` and template `{name}: {value}/{target}` for completion presentation.

## Media requests

Owners enable media and configure its rules in Maintenance after adding a YouTube key. Viewers request in the configured creator's Kick chat. Moderators approve/reject in Media or through permitted Discord controls. Dashboard-added requests auto-approve after metadata validation; viewer requests use the selected policy.

Follow the [complete media walkthrough](OBS.md#youtube-request-and-approval-walkthrough) for OBS playback. Pause/resume/skip/volume use the current player version. Restart or player loss preserves the queue/current item, pauses, and requires moderator resume from the beginning. An error never silently advances.

The request progresses through validating → pending (manual policy) or approved → playing → completed. Failed validation leaves a sanitized reason on the item. Pending requests offer approve/reject/remove; approved/failed items can be removed. Use **Move to top** for an approved waiting item. **Clear waiting items** also removes requests still validating; it preserves the current item. To stop the current item, use player pause/skip instead. A missing approval response can mean another moderator already decided it: reload before acting again.

## Moderation

Start with disabled rules. In **Moderation**, configure a link, phrase, repetition, caps or burst rule; set trusted-role exceptions, thresholds, time windows, action and optional schedule. Use safe sample tests first: tests report matches without sending effects. Try warning behavior on an authorized test channel before enabling destructive actions.

Optional escalation is scoped to the matching rule and uses previous incident count, a time window and an escalation action. Reviewed temporary incident presets cover links, bursts (five messages in ten seconds), or both for 1–120 minutes. Presets warn, persist across restart, expire automatically, and leave saved rules intact.

**Emergency pause** stops automatic actions while explicit permitted manual actions remain available. Ban/delete/bulk operations require acknowledgement. Check incident **delivery outcomes** as well as rule decisions; a match does not prove a provider action succeeded. Moderator viewer search covers the latest 100 observed viewers. Notes require moderation authority.

### Build and test a rule

1. With `configure`, add a rule and leave it disabled. Choose a descriptive name and `warn` action first.
2. Configure the relevant fields below; most fields apply only to selected rule types.
3. Save, edit to enable, then use **Safe rule test → Evaluate without effects** with both matching and permitted messages. The test respects Enabled, role and schedule, so a disabled rule always reports no match. Pause automatic moderation while evaluating an enabled rule if necessary.
4. Test a trusted-role exception and an allowed domain. A test has no prior-message history; repetition/burst behavior needs a controlled fixture/live sequence as well.
5. Enable normal processing only after reviewing results, current provider scopes and intended channel. Inspect incidents and actual provider outcomes.

| Rule | Matching behavior | Example configuration |
| --- | --- | --- |
| Phrase | Case-insensitive literal substring, not a regular expression or word boundary | Patterns: `synthetic spoiler phrase` |
| Link | Recognized domain links except allowed exact hosts/subdomains | Allowed domains: `example.com`, without protocol/path |
| Repetition | Same viewer's equal text within the window, including current message | Threshold 3, Window seconds 30 |
| Burst | Same viewer's message count within the window, including current message | Threshold 5, Window seconds 10 |
| Caps | Uppercase percentage with at least ten alphabetic characters | Threshold 80 |

Only the first matching saved rule acts; temporary presets follow saved rules. Escalation counts previous incidents for that viewer and rule, not confirmed successful sanctions. `Escalation after = 2` escalates the next matching incident when two previous incidents exist in the selected window. Actions already accepted by Kick cannot be undone by disabling the rule.

### Manual actions and notes

Find a viewer in **Observed viewers** and copy their numeric ID. Use the manual action form with a clear reason. Timeout Value is minutes; delete additionally needs the exact message ID. Ban/delete and every bulk operation require deliberate acknowledgement. Bulk accepts at most 20 unique numeric viewer IDs. Review all targets before queueing; the bot cannot infer whom you intended.

Create a note with the viewer's numeric ID, a short internal name and bounded text. Notes are visible only to moderation authority and remain private. Do not put credentials or unnecessary personal details in notes. For a disruptive incident use **Emergency pause moderation**; separately stop an active temporary preset if it should not resume with moderation.

## Points and rewards

Enable points in Maintenance and configure award amount/cadence/recent-chat activity window. Accrual runs while the observed stream state is live and follows recent chat activity; silent viewers cannot be measured. Watchtime is explicitly estimated and accrues with the enabled points activity loop.

Add rewards in **Points & rewards** with cost, description and manual/alert fulfillment. A redemption debits atomically. Moderators complete a fulfilled redemption or reject it for a single refund. Point adjustments need a reason. Balances/decisions survive restart; neither privacy erasure nor retention silently rewrites economic history.

For a first reward, configure Name `Choose a topic`, Cost `100`, Fulfillment `manual`. Viewers use `!redeem Choose a topic` or the reward ID. In **Pending redemptions**, perform the real promised action before **Mark fulfilled**. Choose **Reject and refund** when it cannot be fulfilled; repeat decisions are rejected. Alert fulfillment still needs moderator completion and uses enabled manual-alert configurations.

Pending redemptions are independent of **Recent redemptions**, which shows the latest 100 decisions/requests. The pending queue shows 50 waiting items per page; use **Older waiting items** until you reach the request, **Newest waiting items** to return, or **Refresh this page** to reload an older page. Fulfillment/refund refreshes that page. Older pending requests remain actionable even after hundreds of newer completed rewards. Read-only users can browse but cannot fulfill or refund.

To correct a balance, enter the numeric viewer ID, signed Amount and Reason in **Adjust points**. A negative adjustment cannot make the balance negative. Accrual awards once per eligible cadence bucket while observed live; it does not backfill downtime or prove silent viewing. Watchtime advances in whole estimated minutes with that same enabled loop. [Point settings](CONFIGURATION_FIELDS.md#settings).

## Polls and raffles

In **Polls & raffles**, add an activity with a future deadline. Polls have 2–10 options and optional vote changes; viewers use `!vote <number>`. Raffles can restrict roles and minimum points; viewers use `!enter`. One effective vote/entry per verified identity prevents duplicate delivery from adding another.

Close before drawing a raffle. **Draw winner** and **Reroll** are audited; rerolls exclude previous winners. Deadlines persist through restart. Use poll/raffle widgets to show results without exposing operator controls.

### Run a poll

Create an enabled poll, enter 2–10 options one per line and a future Ends at value in milliseconds ([calculate one](CONFIGURATION_FIELDS.md#conventions)). Leave Status `open`. Announce option numbers starting at 1; viewers send `!vote 1`, for example. Enable Allow change only if replacing a vote should be allowed. **Close** ends voting early; otherwise the deadline closes it. Repeating the same vote does not add another participant. A poll widget can target its card ID so a later poll does not replace it on stream.

### Run a raffle

Create an enabled raffle with a future deadline and an empty Winners field. Empty Roles permits all observed chat roles; Min points is checked when entering and does not spend points. Viewers send `!enter`. Close or wait for expiry, then **Draw winner**. An empty eligible set produces an explicit error. **Reroll** records another winner excluding previous winners; it does not erase the original draw. Use a new raffle for a new round rather than editing winners by hand. Entry eligibility is based on observed verified identity and conditions when entering, not a complete provider follower roster.

## Analytics and private data

In **Analytics**, choose From/To dates, optionally an observed Stream receipt ID, then **Load history**. The dates include the selected To day. **Download last 30 days CSV** always exports that rolling window; it does not use the form's selected filters. Filtered JSON/CSV is available through the [session analytics route](API.md#route-inventory).

Values describe observed events; viewer samples are averages/min/max, not a sum of concurrent viewers. Worker gaps and missing provider data remain visible. Worker presence does not prove complete provider delivery. Estimated watchtime is not a provider-certified count. No pre-installation history is imported, and retention limits available rows.

Owners manage retention, viewer exports/erasure, redacted support data and native configuration imports in Maintenance. Read [privacy and retention](OPERATIONS.md#privacy-and-retention) before exporting or deleting data. Configuration exports are useful for reusable setups; use a [full backup](BACKUP_RECOVERY.md) for disaster recovery.

For a stuck action, source or connection, use [troubleshooting](TROUBLESHOOTING.md) and inspect delivery outcomes before repeating a provider mutation.

## Browse older media requests

In **Media**, **Requests and queue** shows all active requests independently of history. **Load media history** loads up to 50 terminal requests; **Older history** moves to the next page and **Latest history** refreshes recent results. History does not refresh automatically after an action. Failed requests can be removed by an operator with media permission; read-only users can browse without acting. Queue reordering includes the complete approved queue even after extensive history accumulates. OBS playback/lease and explicit recovery rules remain unchanged.
