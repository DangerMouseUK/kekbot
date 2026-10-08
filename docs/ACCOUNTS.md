# Accounts and permissions

Use this guide to claim an installation, invite operators and remove access. Host installation comes first: [installation guide](INSTALLATION.md). Daily controls are in the [user guide](USER_GUIDE.md). [All documentation](README.md).

<!-- contents:start -->
**On this page**

- [Identity boundaries](#identity-boundaries)
- [Claim the installation](#claim-the-installation)
- [Capability matrix](#capability-matrix)
- [Invite an operator](#invite-an-operator)
- [Sessions and password changes](#sessions-and-password-changes)
- [Remove access](#remove-access)
- [Access to viewer data](#access-to-viewer-data)
<!-- contents:end -->

## Identity boundaries

A **local account** signs into your KekBot dashboard. It is separate from a Kick account, a Discord member and a provider developer application. Authorizing Kick connects the configured creator; it does not log someone into KekBot. Discord grants apply only in their configured guild/channel. OBS source tokens grant source access, not a dashboard role.

There is one owner per installation. There is no public registration, email verification, password-reset email, shared default password or second-owner invitation. Someone with trusted host access can recover the existing owner using the CLI.

## Claim the installation

After `init`, read the setup-token file privately at the path it reports. Open the configured HTTPS origin and complete **Claim this installation** with that token, a username and a password. A username is 3–32 characters, starts with a letter/number, and otherwise permits letters/numbers, `_`, `-` and `.`. It is normalized to lowercase. Passwords must be 12–256 characters.

The token expires after one hour and can claim only an unowned installation. If it expires before claim, stop the application, rerun `init` and start it again. This renews setup eligibility without replacing the encryption key. After claim, use owner recovery instead. Never send the setup token to a prospective moderator.

## Capability matrix

An admin receives only the grants the owner selects. A moderator receives the four operational capabilities below. Read-only users can inspect operational state but cannot read moderator notes. All roles can change their own password and sign out.

| Capability / operation | Owner | Admin | Moderator | Read-only |
| --- | --- | --- | --- | --- |
| Read control room, configurations, analytics | Yes | Yes | Yes | Yes |
| `configure`: edit commands, timers, alerts, widgets, rules, goals, rewards, polls, raffles | Yes | If granted | No | No |
| `operate`: timer pause/resume, manual alerts, goal adjustment, shoutout | Yes | If granted | Yes | No |
| `moderate`: notes, rule tests, emergency pause, incident mode, manual moderation | Yes | If granted | Yes | No |
| `media`: add/decide/reorder/clear requests and control the player | Yes | If granted | Yes | No |
| `engage`: point adjustments, redemption decisions, activity close/draw/reroll | Yes | If granted | Yes | No |
| `invite`: bounded invitations | Yes | If granted; see below | No | No |
| Account disable/enable and session revocation | Yes | No | No | No |
| Provider credentials, Kick authorization and Discord routes | Yes | No | No | No |
| Instance settings and source/API credentials | Yes | No | No | No |
| Asset upload/delete through local control API | Yes | With `configure`; dashboard upload controls are owner-visible | No | No |
| Privacy operations, configuration import/export, support export, uncertain-job resolution | Yes | No | No | No |

Creating an OBS URL requires owner token authority even when an admin can configure the widget. API tokens have their own narrower [scope rules](API.md#authentication-boundaries). Permission checks run on the server and again before deferred actions execute; a visible button or an old session does not preserve revoked authority.

## Invite an operator

1. As owner, open **Accounts → Invite an operator**.
2. Choose a role. For an admin, select the individual capabilities they need. Prefer a read-only account for someone who only needs to inspect state.
3. Create the invitation and copy the token shown once. Share your installation URL and token through a private channel.
4. The recipient opens that URL, selects **I have an invitation**, enters the token and chooses their own username/password.
5. Verify the new account appears in Accounts. Ask the operator to check the intended controls with their own login.

An invitation expires after one day, is single use and never creates another owner. There is no invitation email delivery. Keep invitations out of issue reports and screenshots.

An admin with `invite` can invite a reader or an admin with a subset of their own grants. They cannot delegate `invite`. A moderator invitation requires the inviter to have all four operational grants (`operate`, `moderate`, `media`, `engage`). Acceptance rechecks the inviter's current enabled account and authority; removing their grants can invalidate a pending invitation.

## Sessions and password changes

Sessions expire after 12 hours. Cookies are HttpOnly and marked Secure on the configured HTTPS origin. Use the same origin as `KEKBOT_PUBLIC_URL`; switching between IP/hostname or `localhost`/`127.0.0.1` can fail the origin check.

Use **Maintenance → Change password** with the current and new passwords. This revokes all your sessions, including the current one; sign in again. There is no dashboard reset of another user's password. For a forgotten owner password, follow [stopped-host recovery](BACKUP_RECOVERY.md#recover-the-owner).

## Remove access

In **Accounts**, the owner can revoke a user's sessions or disable their account. Session revocation signs them out; disabling also prevents further login. Re-enabling does not restore revoked sessions. The owner account cannot be disabled through this control.

Remove related Discord role/user mappings separately, and revoke leaked widget/player/API tokens in **Maintenance**. Provider credentials and host SSH access are separate authority. Revoking a dashboard account does not rotate them. An effect already accepted by a provider cannot be recalled.

## Access to viewer data

Invited readers can see operational history retained by the installation. Moderator notes are restricted to moderation authority; owner exports and maintenance powers are more sensitive. Invite trusted operators, explain your retention policy and use separate accounts rather than sharing the owner's password. See [privacy and retention](OPERATIONS.md#privacy-and-retention).

If login fails, check [troubleshooting](TROUBLESHOOTING.md) before repeatedly retrying. Login attempts have both per-username and global rate limits.
