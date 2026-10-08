# Using KekBot

This guide is for creators and operators using an existing installation. For initial host setup use [installation](INSTALLATION.md), then [provider setup](PROVIDERS.md). For a demonstration with synthetic data, use the [quickstart](QUICKSTART.md). Return to the [documentation index](README.md).

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

## Find your way around

**Control room** shows worker, Kick and player state plus recent activity. **Connections** holds owner-only provider configuration. Other panels cover Commands, Timers, Alerts, Media, Moderation, Goals, Points & rewards, Polls & raffles, Widgets, Analytics, Accounts and Maintenance. Available controls depend on your role.

Configuration cards display an **ID** and **Version**. Use IDs when another control asks for a target. A version conflict means someone changed that record; refresh and review it before retrying. Most edits take effect without restarting.

The configuration editor uses one value per line for ordinary lists. Guild role/user mappings use JSON. Fields ending in `At` use Unix milliseconds, for example `Date.parse('2030-01-01T00:00:00Z')` in a trusted JavaScript console. Blank optional timestamps disable that bound. Field constraints/defaults are in the [configuration reference](CONFIGURATION.md).

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

## Timers

In **Timers → Add timer**, enter rotating messages and an interval of at least 60 seconds. Configure minimum intervening chat messages, stream-only behavior, timezone and optional quiet-hour start/end (0–23). Save and preview the responses.

Use **Pause all timers** before disruptive work; **Resume timers** when ready. Offline, paused and restarted timers reschedule without sending missed reminders. Queued sends recheck current eligibility/version/schedule; superseded work is recorded as `timer_no_longer_eligible`. A send already accepted by Kick cannot be recalled.

## Alerts, goals and presentation

Configure event/manual alerts in **Alerts** and test **Preview without delivery** before sending a live manual alert. Use [OBS setup](OBS.md) for assets, sound and private Browser Sources.

Create goals in **Goals** with metric, current value and target. Event goals update from observed events; manual changes/reset require the current version. Completion can create alerts/notifications if configured. Widgets have mint, midnight and paper themes plus reduced-motion settings. Goal/counter/activity targets use document IDs.

## Media requests

Owners enable media and configure its rules in Maintenance after adding a YouTube key. Viewers request in the configured creator's Kick chat. Moderators approve/reject in Media or through permitted Discord controls. Dashboard-added requests auto-approve after metadata validation; viewer requests use the selected policy.

Follow the [complete media walkthrough](OBS.md#youtube-request-and-approval-walkthrough) for OBS playback. Pause/resume/skip/volume use the current player version. Restart or player loss preserves the queue/current item, pauses, and requires moderator resume from the beginning. An error never silently advances.

## Moderation

Start with disabled rules. In **Moderation**, configure a link, phrase, repetition, caps or burst rule; set trusted-role exceptions, thresholds, time windows, action and optional schedule. Use safe sample tests first: tests report matches without sending effects. Try warning behavior on an authorized test channel before enabling destructive actions.

Optional escalation is scoped to the matching rule and uses previous incident count, a time window and an escalation action. Reviewed temporary incident presets cover links, bursts (five messages in ten seconds), or both for 1–120 minutes. Presets warn, persist across restart, expire automatically, and leave saved rules intact.

**Emergency pause** stops automatic actions while explicit permitted manual actions remain available. Ban/delete/bulk operations require acknowledgement. Check incident **delivery outcomes** as well as rule decisions; a match does not prove a provider action succeeded. Moderator viewer search covers the latest 100 observed viewers. Notes require moderation authority.

## Points and rewards

Enable points in Maintenance and configure award amount/cadence/recent-chat activity window. Accrual runs while the observed stream state is live and follows recent chat activity; silent viewers cannot be measured. Watchtime is explicitly estimated and accrues with the enabled points activity loop.

Add rewards in **Points & rewards** with cost, description and manual/alert fulfillment. A redemption debits atomically. Moderators complete a fulfilled redemption or reject it for a single refund. Point adjustments need a reason. Balances/decisions survive restart; neither privacy erasure nor retention silently rewrites economic history.

## Polls and raffles

In **Polls & raffles**, add an activity with a future deadline. Polls have 2–10 options and optional vote changes; viewers use `!vote <number>`. Raffles can restrict roles and minimum points; viewers use `!enter`. One effective vote/entry per verified identity prevents duplicate delivery from adding another.

Close before drawing a raffle. **Draw winner** and **Reroll** are audited; rerolls exclude previous winners. Deadlines persist through restart. Use poll/raffle widgets to show results without exposing operator controls.

## Analytics and private data

Analytics supports date and observed-stream filters with JSON/CSV output. Values describe observed events; viewer samples are averages/min/max, not a sum of concurrent viewers. Worker gaps and missing provider data remain visible. Estimated watchtime is not a provider-certified count.

Owners manage retention, viewer exports/erasure, redacted support data and native configuration imports in Maintenance. Read [privacy and retention](OPERATIONS.md#privacy-and-retention) before exporting or deleting data. Configuration exports are useful for reusable setups; use a [full backup](BACKUP_RECOVERY.md) for disaster recovery.

For a stuck action, source or connection, use [troubleshooting](TROUBLESHOOTING.md) and inspect delivery outcomes before repeating a provider mutation.
