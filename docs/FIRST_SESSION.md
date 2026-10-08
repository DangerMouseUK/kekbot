# Your first session

After [guided installation](INSTALLER.md), use the reported private setup-token or random fixture-account path. The terminal wizard handles the host; the browser steps below configure all application modules, with [every field](CONFIGURATION_FIELDS.md) explained separately. It never needs provider secrets in the terminal.

This walkthrough turns a claimed installation into a small, understandable setup. It is for the **owner**; [accounts](ACCOUNTS.md) explains delegated access. Start with [installation](INSTALLATION.md) for live hosting or the [quickstart](QUICKSTART.md) for an isolated demonstration. [All documentation](README.md).

Fixture installations simulate effects. On a live installation, the command and alert checks below contact real services. Use a channel and identities you control. This walkthrough is an operator check, not completion of the release acceptance campaign.

<!-- contents:start -->
**On this page**

- [1. Check the starting state](#1-check-the-starting-state)
- [2. Add one command](#2-add-one-command)
- [3. Add a cautious timer](#3-add-a-cautious-timer)
- [4. Create an alert and source](#4-create-an-alert-and-source)
- [5. Delegate deliberately](#5-delegate-deliberately)
- [6. Enable media when you are ready](#6-enable-media-when-you-are-ready)
- [7. Finish with a recovery checkpoint](#7-finish-with-a-recovery-checkpoint)
<!-- contents:end -->

## 1. Check the starting state

Sign in at the exact configured origin. **Control room** should show a working worker. Open **Maintenance → Diagnostics** and check storage/worker errors before adding features. Owner-only **Connections** should show the expected integrations. “Offline” or “unavailable” stream state can be correct for a channel that has not streamed.

For live use, finish [Kick setup](PROVIDERS.md#kick) first. Confirm the authorized account is the creator whose chat you intend to serve. A developer application's display name does not choose the reply sender.

## 2. Add one command

Open **Commands → Add command** and set the values below. If you used `fixture-seed`, edit its existing Welcome command instead: `!welcome` is already taken. A trigger cannot belong to two saved commands.

| Field | Value |
| --- | --- |
| Name | Welcome |
| Enabled | On |
| Trigger | `!welcome` |
| Responses | `Welcome, {user}! Thanks for visiting {channel}.` |
| Cooldown / User cooldown | `10` / `30` seconds |
| Roles | Empty |
| Stream only | Off |
| Condition | `always` |

Save, then choose **Preview responses**. Expect substituted example text with no delivery, counter or cooldown change. On live Kick, send `!welcome` in **the configured creator's chat**, wait for the reply, and check **Maintenance → Delivery outcomes**. Allow the cooldown before repeating. On fixtures, the CLI's `fixture-event` exercises the built-in `!kekbot` path; it does not send arbitrary custom text. Preview your custom command separately.

Give the installation a useful **Name** under **Maintenance → Edit settings**; `{channel}` uses this configured name. Add rules/Discord/social text there if you want the built-in utility commands. [All command behaviors](USER_GUIDE.md#commands).

## 3. Add a cautious timer

Open **Timers → Add timer**. Use a 600-second interval, five minimum messages, stream-only enabled and a useful message such as `Chat rules: be kind and avoid spoilers.` Set an explicit IANA timezone such as `Europe/London`. Leave both quiet-hour fields blank initially. Save and preview.

No message is due immediately. A stream-only timer waits for observed live state and enough intervening chat. **Pause all timers** stops queued work that is no longer eligible; **Resume timers** starts scheduling again without sending a catch-up batch. Leave the timer disabled if you are not ready for live sends. [Timer details](USER_GUIDE.md#timers).

## 4. Create an alert and source

1. In **Alerts → Add alert**, create an enabled `manual` alert with template `{text}`, duration 5 seconds and priority 0.
2. Choose **Preview without delivery** to inspect a synthetic preview.
3. In **Widgets → Add widget**, create an enabled `alerts` widget. Choose theme/dimensions; 800 × 400 is a starting point.
4. Save and choose **Create OBS source URL**. Copy the private URL shown once into an OBS Browser Source, with matching dimensions.
5. In **Alerts**, send a manual alert with text such as `Presentation check`. It should appear in the source. A configured Discord alert route will also receive this live event.

Preview is pure; sending a manual alert changes live history. Optional assets require owner upload and their returned IDs in the alert's Image/Sound fields. Check [OBS](OBS.md) for audio, source tokens, supported types and recovery.

## 5. Delegate deliberately

Create a separate read-only or moderator invitation in **Accounts**. If using Discord, add only the intended guild/channel route and role/user grants, then register slash commands. Test that an ordinary unmapped member cannot operate the bot. Dashboard roles and Discord mappings are independent. See [accounts](ACCOUNTS.md) and [Discord setup](PROVIDERS.md#discord).

## 6. Enable media when you are ready

Media is off in a fresh live installation; fixture seeding enables simulated media and points examples. For live use, save a [YouTube metadata key](PROVIDERS.md#youtube), enable media in Maintenance, keep auto approval off, and create a `player` source. Re-register Discord commands if using Discord approval. Follow the [complete request/approval/playback workflow](OBS.md#youtube-request-and-approval-walkthrough), including a second item and one verified advancement.

Keep the visible embedded player unobscured. Metadata acceptance does not guarantee browser playback. A restart, lost lease or player error pauses the current item and requires moderator review/resume.

## 7. Finish with a recovery checkpoint

- Record the source SHA, image identity and private runtime paths in your operator record outside Git.
- Protect an independent copy of the installation encryption key.
- Stop the app, create a database/asset backup and verify restoration into a separate empty directory using [backup and recovery](BACKUP_RECOVERY.md).
- Start the original installation again; inspect health, connections and delivery outcomes. Resume media explicitly if needed.
- Review retention before accumulating viewer history. Do not publish private diagnostics or source URLs.

For each later stream, use the [stream checklist](OPERATIONS.md#stream-checklist). Configure additional commands, goals, rewards and activities with the [user guide](USER_GUIDE.md) and [complete field reference](CONFIGURATION_FIELDS.md). If a step fails, stop at that boundary and use [troubleshooting](TROUBLESHOOTING.md).
