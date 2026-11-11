// Plain-English text for API error codes. The codes stay the API contract;
// this file only decides what an operator reads in the dashboard.

export type ErrorText = { title: string; next?: string };

const reload = "The latest values are shown now. Check them, then try again.";
const askOwner = "Ask the installation owner to review your permissions.";
const checkHost = "Check Maintenance → Diagnostics or the host logs.";

const messages: Record<string, [string, string?]> = {
  // Conflicts: someone else changed the record first.
  configuration_changed_reload: ["Someone changed this item while you were looking at it.", reload],
  goal_changed_reload: ["This goal changed while you were looking at it.", reload],
  media_changed_reload: ["This request changed while you were looking at it.", reload],
  raffle_changed_reload: ["This raffle changed while you were looking at it.", reload],
  media_not_found: ["That request no longer exists.", reload],
  media_not_waiting: ["That request isn't waiting in the approved queue, so it can't be moved.", reload],
  media_number_ambiguous: ["More than one request has that number.", "Pick the request from the queue list instead."],
  name_ambiguous: ["More than one item has that name.", "Pick the exact item from the list."],
  redemption_not_found: ["That redemption no longer exists.", reload],
  viewer_not_found: ["KekBot hasn't seen that viewer in chat yet.", "Check the name, or wait until they chat."],
  invalid_poll_options: ["A poll needs 2 to 10 different, non-empty options.", "Fix the options and try again."],
  invalid_command_input: ["One of the values isn't valid.", "Check the fields and try again."],
  open_activity_limit: ["Too many polls and raffles are open at once.", "Close one before starting another."],
  points_disabled: ["Points are turned off for this installation.", "Turn on points in Maintenance → Settings first."],
  discord_commands_outdated: ["Discord is using an older set of KekBot commands.", "Re-register Discord commands in Connections."],
  queue_changed_reload: ["The queue changed while you were reordering it.", reload],
  player_changed_reload: ["The player changed while you were using it.", reload],
  account_changed_retry: ["This account changed at the same time.", "Try again."],
  kick_connection_changed_retry: ["The Kick connection changed at the same time.", "Try again."],
  redemption_already_decided: [
    "Someone already fulfilled or refunded this redemption.",
    "Nothing else is needed.",
  ],
  activity_not_open: ["This poll or raffle is already closed.", "Nothing else is needed."],
  invalid_media_transition: [
    "That action is not possible for this request any more.",
    "It may already be playing, finished or removed.",
  ],
  job_not_uncertain: ["This delivery has already been resolved.", "Nothing else is needed."],
  // Permissions and sessions.
  permission_denied: ["Your account cannot do that.", askOwner],
  owner_required: ["Only the installation owner can do that.", undefined],
  account_disabled_or_removed: [
    "Your account was disabled or removed.",
    "Sign in again or ask the owner.",
  ],
  api_permission_revoked: ["This API token no longer has that permission.", "Create a new token."],
  login_required: ["Your session ended.", "Sign in again."],
  csrf_required: ["Your session security check failed.", "Reload the page and sign in again."],
  same_origin_required: [
    "The request came from a different address.",
    "Open KekBot from its own URL.",
  ],
  json_required: ["The request was not sent as JSON.", "Reload the page and try again."],
  invalid_credentials: ["The username or password is not correct.", undefined],
  login_rate_limited: ["Too many sign-in attempts.", "Wait a minute, then try again."],
  authentication_rate_limited: ["Too many attempts.", "Wait a minute, then try again."],
  password_service_busy: ["The password service is busy.", "Try again in a moment."],
  username_unavailable: ["That username is already taken.", "Choose another one."],
  invitation_invalid_or_expired: [
    "This invitation is not valid or has expired.",
    "Ask for a new one.",
  ],
  invitation_exceeds_admin_grant: [
    "You cannot invite someone with more access than you have.",
    undefined,
  ],
  invitation_creator_unavailable: [
    "The person who created this invitation no longer has access.",
    "Ask for a new one.",
  ],
  setup_token_invalid_or_expired: [
    "The setup token is not valid or has expired.",
    "Run pnpm kekbot init on the host for a new one.",
  ],
  installation_already_claimed_or_expired: [
    "This installation already has an owner.",
    "Sign in instead.",
  ],
  cannot_disable_owner: ["The owner account cannot be disabled.", undefined],
  owner_not_found: ["No owner account exists yet.", "Claim the installation first."],
  // Input problems.
  invalid_input: ["Some values are missing or out of range.", "Check the highlighted fields."],
  invalid_document_id: ["That item reference is not valid.", "Reload the page and try again."],
  configuration_not_found: ["That item no longer exists.", "Someone may have deleted it."],
  configuration_limit: [
    "You have reached the limit of 500 items of this type.",
    "Delete unused ones first.",
  ],
  command_trigger_conflict: [
    "That trigger is already used by another command or a built-in command.",
    "Choose a different trigger or alias.",
  ],
  alert_asset_missing_or_wrong_type: [
    "The chosen image or sound is missing or the wrong type.",
    "Upload it again in Alerts.",
  ],
  // Media.
  media_disabled: [
    "Media requests are turned off.",
    "Turn them on in Maintenance → Edit settings.",
  ],
  invalid_youtube_url: [
    "That is not a YouTube link or video ID.",
    "Paste a youtube.com or youtu.be link.",
  ],
  queue_full: ["The media queue is full.", "Remove or play some requests first."],
  video_already_queued: ["That video is already in the queue.", undefined],
  request_limit: ["This person already has the maximum number of requests waiting.", undefined],
  request_cooldown: ["Requests are on cooldown.", "Wait a moment, then try again."],
  youtube_key_missing: [
    "No YouTube API key is configured.",
    "The owner can add one in Connections.",
  ],
  youtube_unavailable: ["YouTube could not be reached.", "Try again later."],
  youtube_video_unavailable: ["That video is private, removed or unavailable.", undefined],
  youtube_embedding_disabled: ["That video does not allow playback outside YouTube.", undefined],
  youtube_live_or_duration_unavailable: [
    "Live streams and videos without a length cannot be requested.",
    undefined,
  ],
  video_duration_rejected: [
    "That video is longer than the allowed maximum.",
    "Change the limit in Maintenance → Edit settings.",
  ],
  video_rule_rejected: ["That video matches a blocked uploader or title.", undefined],
  player_has_no_current_item: ["Nothing is playing right now.", undefined],
  another_player_is_active: [
    "Another OBS player source is already playing.",
    "Close the other source, then resume.",
  ],
  player_disconnected_resume_required: [
    "The OBS player disconnected.",
    "Check the player source in OBS, then press Resume.",
  ],
  player_source_disabled: ["The player widget is turned off.", "Turn it on in Widgets."],
  stale_player_acknowledgement: [
    "The player reported an old item.",
    "Reload the OBS player source.",
  ],
  // Goals, points, rewards, polls and raffles.
  insufficient_points: ["That would take the balance below zero.", "Use a smaller amount."],
  reward_not_found: ["That reward no longer exists.", undefined],
  reward_disabled: ["That reward or points are turned off.", undefined],
  poll_not_found: ["That poll no longer exists.", undefined],
  poll_closed: ["That poll is closed.", undefined],
  invalid_vote: ["That is not one of the poll's option numbers.", undefined],
  vote_already_cast: ["This viewer has already voted.", undefined],
  raffle_not_found: ["That raffle no longer exists.", undefined],
  raffle_closed: ["That raffle is closed.", undefined],
  raffle_ineligible: ["This viewer cannot enter this raffle.", undefined],
  close_raffle_before_draw: ["Close the raffle before drawing a winner.", "Select Close first."],
  no_eligible_entries: [
    "There are no entries left to draw from.",
    "Previous winners cannot be drawn again.",
  ],
  no_open_poll: ["There is no open poll.", undefined],
  no_open_raffle: ["There is no open raffle.", undefined],
  // Moderation.
  operator_acknowledgement_required: [
    "This action needs your confirmation.",
    "Confirm it in the dialog.",
  ],
  message_id_required: [
    "Choose the message to delete.",
    "Use Delete from the recent chat or incident list.",
  ],
  duplicate_bulk_target: ["The same viewer was selected twice.", undefined],
  automatic_moderation_paused: ["Automatic moderation is paused.", "Resume it in Moderation."],
  // Widgets, assets and tokens.
  widget_not_found: ["That widget no longer exists.", undefined],
  invalid_widget_scope: ["That widget no longer exists.", "Reload the page."],
  player_widget_required: ["Player credentials are only for player widgets.", undefined],
  invalid_api_scope: ["Choose at least one valid permission for the token.", undefined],
  invalid_access_token: ["That token is not valid.", undefined],
  invalid_or_revoked_access_token: [
    "That token was revoked or is not valid.",
    "Create a new OBS source URL.",
  ],
  asset_in_use: ["An alert still uses this file.", "Change or delete that alert first."],
  asset_not_found: ["That file no longer exists.", undefined],
  unsupported_asset_format: [
    "That file type is not supported.",
    "Use PNG, JPEG, GIF, WebP, MP3, OGG or WAV.",
  ],
  invalid_asset_size_or_encoding: ["The file is empty or larger than 8 MiB.", undefined],
  invalid_asset_filename: ["That file name is not allowed.", undefined],
  // Providers and connections.
  fixture_mode_rejects_live_credentials: [
    "This is a fixture (demo) installation, so it cannot store real provider credentials.",
    "Use a live installation for real Kick, Discord or YouTube keys.",
  ],
  live_actions_disabled_in_fixture_mode: [
    "Live provider actions are turned off in this fixture installation.",
    undefined,
  ],
  unknown_integration: ["That provider is not supported.", undefined],
  kick_not_authorized: ["Kick is not connected.", "The owner can connect it in Connections."],
  kick_configuration_incomplete: [
    "Kick application settings are incomplete.",
    "Fill in Connections → Kick application settings.",
  ],
  kick_refresh_failed_reauthorize: [
    "The Kick connection expired.",
    "Authorize Kick again in Connections.",
  ],
  kick_moderation_scope_missing_reauthorize: [
    "Kick moderation permission is missing.",
    "Authorize Kick with moderation in Connections.",
  ],
  kick_channel_changed_reauthorize: [
    "The authorized Kick channel changed.",
    "Authorize Kick again in Connections.",
  ],
  kick_required_scopes_missing: [
    "Kick did not grant every permission KekBot needs.",
    "Authorize Kick again and accept all permissions.",
  ],
  authorize_configured_channel_owner: [
    "Sign in to Kick as the configured channel owner.",
    undefined,
  ],
  kick_rate_limited: ["Kick is rate limiting requests.", "Wait a minute, then try again."],
  kick_network_error: ["Kick could not be reached.", "Try again later."],
  kick_reply_not_sent: ["Kick did not accept the chat message.", undefined],
  kick_subscription_not_confirmed: [
    "Kick did not confirm the event subscription.",
    "Try Subscribe to events again.",
  ],
  broadcaster_not_configured: [
    "No Kick channel is configured.",
    "Set the broadcaster ID in Connections.",
  ],
  invalid_or_expired_oauth_state: ["The Kick sign-in link expired.", "Start authorization again."],
  discord_not_configured: ["Discord is not configured.", "The owner can add it in Connections."],
  discord_permission_denied: ["That Discord role or user has no permission for this.", undefined],
  discord_rate_limited: ["Discord is rate limiting requests.", "Wait a minute, then try again."],
  discord_network_error: ["Discord could not be reached.", "Try again later."],
  operation_not_in_integration_api: ["That action is not available through the API.", undefined],
  // Host, storage and maintenance.
  configuration_or_storage_error: ["KekBot could not read or save its data.", checkHost],
  runtime_unavailable: ["KekBot is starting or unavailable.", "Wait a moment, then reload."],
  job_backlog_full: ["Too much work is waiting.", "Wait for queued deliveries to finish."],
  privacy_processing_pending_retry_after_jobs_complete: [
    "This viewer still has deliveries in progress.",
    "Try again when they finish.",
  ],
  import_too_large: [
    "That configuration file is too large.",
    "Split it, or use a full backup instead.",
  ],
  config_bundle_too_large_use_backup_or_split_assets: [
    "That configuration file is too large.",
    "Split it, or use a full backup instead.",
  ],
  request_too_large: ["The upload is too large.", undefined],
  unknown_operation: [
    "KekBot does not recognise that action.",
    "Reload the page; the dashboard may be out of date.",
  ],
  api_rate_limited: ["Too many API requests.", "Wait a minute, then try again."],
  invalid_work_queue_cursor: ["That page link expired.", "Go back to the newest items."],
  invalid_media_history_cursor: ["That page link expired.", "Go back to the latest history."],
  invalid_event_cursor: ["The live update link expired.", "Reload the page."],
  // Configuration import and export.
  duplicate_import_id: [
    "The file lists the same item twice.",
    "Export it again, or remove the duplicate.",
  ],
  duplicate_import_asset: ["The file lists the same image or sound twice.", "Export it again."],
  import_asset_conflict: [
    "A file in the import has the same name as a different file here.",
    "Delete or rename one of them, then import again.",
  ],
  import_asset_missing: [
    "An alert in the file uses an image or sound that is not included.",
    "Export it again with its files.",
  ],
  import_asset_type_mismatch: [
    "An image or sound in the file is not the type its alert expects.",
    undefined,
  ],
  import_id_conflicts_with_nonportable_state: [
    "An item in the file has the same ID as something that cannot be replaced here.",
    "Use Merge instead of Replace, or remove that item from the file.",
  ],
  import_id_conflicts_with_other_state: [
    "An item in the file has the same ID as a different kind of item here.",
    "Remove that item from the file, then import again.",
  ],
  import_settings_id_invalid: [
    "The settings in the file are not valid.",
    "Export them again from KekBot.",
  ],
  // Secrets and keys.
  secret_decryption_failed_check_key: [
    "KekBot could not unlock saved credentials.",
    "Check that the host uses the original encryption key file.",
  ],
  // Kick connection and deliveries (also shown in delivery outcomes and diagnostics).
  invalid_broadcaster_id: [
    "That Kick broadcaster ID is not a number.",
    "Use your channel's numeric Kick user ID.",
  ],
  kick_identity_response_invalid: [
    "Kick sent an unexpected reply about your account.",
    "Try authorizing again later.",
  ],
  kick_invalid_response: [
    "Kick sent an unexpected reply.",
    "Check the result on Kick before trying again.",
  ],
  kick_reply_confirmation_invalid: [
    "Kick did not clearly confirm a chat message.",
    "Check your chat to see whether it was posted.",
  ],
  kick_stored_token_invalid: [
    "The saved Kick connection is not readable.",
    "Authorize Kick again in Connections.",
  ],
  kick_stream_sample_invalid: ["Kick sent an unexpected stream status.", "KekBot will try again."],
  kick_subscription_response_invalid: [
    "Kick sent an unexpected reply about event subscriptions.",
    "Try Subscribe to events again.",
  ],
  kick_token_response_invalid: [
    "Kick sent an unexpected sign-in reply.",
    "Authorize Kick again in Connections.",
  ],
  trusted_kick_key_unavailable: [
    "KekBot could not fetch Kick's signing key.",
    "Events wait until Kick can be reached.",
  ],
  event_for_different_channel: [
    "An event arrived for a different Kick channel and was ignored.",
    "Check the broadcaster ID in Connections.",
  ],
  invalid_webhook_signature: ["An event failed Kick's signature check and was ignored.", undefined],
  invalid_webhook_json: ["An event from Kick was not readable and was ignored.", undefined],
  invalid_webhook_payload: ["An event from Kick was incomplete and was ignored.", undefined],
  missing_or_invalid_signed_headers: [
    "An event arrived without Kick's signature and was ignored.",
    undefined,
  ],
  webhook_timestamp_outside_retry_window: [
    "An event from Kick was too old and was ignored.",
    undefined,
  ],
  webhook_too_large: ["An event from Kick was too large and was ignored.", undefined],
  unsupported_event_type: ["KekBot does not handle that kind of Kick event.", undefined],
  unsupported_event_version: ["KekBot does not support that Kick event version.", undefined],
  receipt_payload_missing: [
    "The event's details were already removed by retention.",
    "Nothing else is needed.",
  ],
  // Background delivery bookkeeping.
  timer_no_longer_eligible: [
    "A timer message was skipped because the timer changed, was paused or the stream went offline.",
    "Nothing else is needed.",
  ],
  chat_announcement_turned_off: [
    "A chat announcement was skipped because it was turned off in settings before it was sent.",
    "Nothing else is needed.",
  ],
  job_lease_lost: [
    "A delivery was taken over after a restart.",
    "Check its final result before retrying.",
  ],
  job_without_lease: ["A delivery could not be tracked.", checkHost],
  unsupported_job: ["KekBot found queued work it does not recognise.", checkHost],
  // Discord deliveries and commands.
  discord_route_revoked: [
    "That Discord server or channel is no longer allowed.",
    "Check Discord servers in Connections.",
  ],
  discord_interaction_expired: [
    "The Discord command expired before KekBot replied.",
    "Run it again in Discord.",
  ],
  discord_guild_or_channel_not_allowed: [
    "That Discord server or channel is not allowed.",
    "Add it under Discord servers in Connections.",
  ],
  wrong_discord_application: [
    "A Discord request was for a different application and was ignored.",
    "Check the Discord application ID.",
  ],
  invalid_discord_signature: [
    "A Discord request failed its signature check and was ignored.",
    "Check the Discord public key.",
  ],
  invalid_discord_json: ["A Discord request was not readable and was ignored.", undefined],
  unsupported_discord_interaction: ["KekBot does not handle that Discord interaction.", undefined],
  // Chat and analytics.
  provide_channel_username: ["Add a Kick channel name after !so.", undefined],
  oauth_callback_missing_parameters: [
    "Kick returned without completing sign-in.",
    "Start authorization again in Connections.",
  ],
  unknown_authentication_action: [
    "That sign-in action is not recognised.",
    "Reload the page and try again.",
  ],
  stream_not_observed: ["KekBot has no record of that stream.", "Choose a stream from the list."],
  invalid_analytics_range: [
    "That date range is not valid.",
    "Choose an end date on or after the start date, within ten years.",
  ],
  invalid_time_zone: [
    "This browser's time zone was not recognised.",
    "Check the device's time zone setting, then reload the page.",
  ],
};

/**
 * Codes that only the host command line, backup/restore, proof tools or workload
 * benchmarks raise. The dashboard never shows them, so they need no dashboard text.
 */
export const hostOnlyErrorCodes = new Set([
  "backup_asset_checksum_mismatch",
  "backup_contains_non_regular_file",
  "backup_database_checksum_mismatch",
  "backup_database_integrity_failed",
  "backup_database_metadata_mismatch",
  "backup_destination_already_exists",
  "backup_destination_inside_data",
  "backup_mode_mismatch",
  "duplicate_backup_asset",
  "unsupported_or_invalid_backup_manifest",
  "restore_requires_empty_assets_directory",
  "restore_requires_new_data_directory",
  "restore_requires_original_encryption_key",
  "database_missing_run_init",
  "database_mode_mismatch",
  "encryption_key_does_not_match_database",
  "invalid_encryption_key",
  "migrations_directory_missing",
  "unsupported_schema_version",
  "stop_application_before_upgrade",
  "instance_already_running_or_in_maintenance",
  "public_url_must_be_https_origin",
  "fixture_command_requires_explicit_fixture_mode",
  "fixture_discord_key_pair_incomplete",
  "fixture_key_pair_incomplete",
  "invalid_proof_token",
  "invalid_capture_delivery_id",
  "proof_auth_rate_limited",
  "proof_capture_expired_or_future_timestamp",
  "proof_capture_unavailable_or_invalid",
  "proof_replay_not_confirmed_duplicate",
  "proof_replay_request_failed",
  "proof_replay_requires_committed_receipt",
  "proof_replay_requires_configured_https_origin",
  "proof_replay_requires_live_mode_and_flag",
  "proof_token_required",
  "proof_tools_disabled",
  "invalid_workload_run",
  "workload_result_limit",
  "fixture_workload_only",
]);

/** True when the dashboard has plain-English text for this code. */
export const hasErrorText = (code: string) => code in messages;

const fieldNames: Record<string, string> = {
  target: "item",
  version: "version",
  value: "value",
  amount: "amount",
  viewer: "viewer",
  reason: "reason",
  url: "link",
  ids: "queue order",
  targets: "viewers",
  minutes: "duration",
  preset: "preset",
  name: "name",
};

/** Plain-English title and next step for an API error code. */
export function describeError(code: string, fields: string[] = []): ErrorText {
  const known = messages[code];
  if (code === "invalid_input" && fields.length) {
    const names = [
      ...new Set(fields.map((field) => fieldNames[field.split(".").pop() ?? ""] ?? field)),
    ];
    return {
      title: `Check these values: ${names.join(", ")}.`,
      next: "Some are missing or out of range.",
    };
  }
  if (known) return { title: known[0], next: known[1] };
  if (code.endsWith("_changed_reload") || code.endsWith("_changed_retry"))
    return { title: "Someone changed this at the same time.", next: reload };
  if (code.endsWith("_rate_limited"))
    return { title: "Too many requests.", next: "Wait a minute, then try again." };
  if (code.endsWith("_reauthorize"))
    return { title: "The connection needs authorizing again.", next: "Open Connections." };
  if (/^[a-z0-9_]+$/.test(code))
    return {
      title: `${code.charAt(0).toUpperCase()}${code.slice(1).replaceAll("_", " ")}.`,
      next: undefined,
    };
  return { title: code || "Something went wrong.", next: undefined };
}

/** One display sentence for any thrown value. */
export function errorText(error: unknown, fallback = "Something went wrong. Try again.") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) {
    const { title, next } = describeError(error);
    return next ? `${title} ${next}` : title;
  }
  return fallback;
}

/** True for optimistic-version conflicts where a refresh shows the newer state. */
export function isConflict(code: string) {
  return (
    code.endsWith("_changed_reload") ||
    code === "redemption_already_decided" ||
    code === "activity_not_open" ||
    code === "job_not_uncertain"
  );
}

const roleLabels: Record<string, string> = {
  owner: "Owner",
  admin: "Admin",
  moderator: "Moderator",
  readonly: "Read-only",
};
export const roleLabel = (role: unknown) => roleLabels[String(role)] ?? String(role);

export const permissionLabels: Record<string, string> = {
  configure: "Change configuration",
  operate: "Run timers, alerts and goals",
  moderate: "Moderate chat",
  media: "Manage media requests",
  engage: "Run points, rewards, polls and raffles",
  invite: "Invite operators",
  read: "Read state",
};

export const eventLabels: Record<string, string> = {
  "channel.followed": "New follower",
  "channel.subscription.new": "New subscription",
  "channel.subscription.renewal": "Subscription renewal",
  "channel.subscription.gifts": "Gifted subscriptions",
  manual: "Manual alert",
  goal: "Goal completed",
  media: "Media request",
};

/** Signed Kick webhook types in plain English, e.g. for "Last verified event". */
export const kickEventLabels: Record<string, string> = {
  "chat.message.sent": "Chat message",
  "channel.followed": "New follower",
  "channel.subscription.new": "New subscription",
  "channel.subscription.renewal": "Subscription renewal",
  "channel.subscription.gifts": "Gifted subscriptions",
  "livestream.status.updated": "Stream went live or offline",
};

export const jobKindLabels: Record<string, string> = {
  "kick.event": "Incoming Kick event",
  "kick.reply": "Kick chat message",
  "kick.action": "Kick moderation action",
  "proof.record": "Proof record",
  "discord.send": "Discord message",
  "discord.interaction": "Discord command reply",
  "media.validate": "Media check",
};

export const statusLabels: Record<string, string> = {
  pending: "Waiting",
  running: "In progress",
  succeeded: "Delivered",
  failed: "Failed",
  uncertain: "Needs checking",
  completed: "Fulfilled",
  refunded: "Refunded",
  approved: "Approved",
  validating: "Checking",
  playing: "Playing",
  rejected: "Rejected",
  removed: "Removed",
  skipped: "Skipped",
  open: "Open",
  closed: "Closed",
  drawn: "Winner drawn",
  confirmed: "Done",
};
export const statusLabel = (status: unknown) =>
  statusLabels[String(status)] ?? String(status ?? "Unknown");

type Result = Record<string, unknown>;
const successes: Record<string, string | ((result: Result) => string)> = {
  "config.save": "Saved.",
  "config.delete": "Deleted.",
  "goal.adjust": (result) => {
    const data = (result.data ?? {}) as Result;
    return `Goal updated: ${data.value ?? "?"} / ${data.target ?? "?"}.`;
  },
  "media.request": "Request added. KekBot is checking the video.",
  "media.approve": "Request approved.",
  "media.reject": "Request rejected.",
  "media.remove": "Request removed.",
  "media.reorder": "Queue order saved.",
  "media.clear": "Queue cleared. The item playing now was kept.",
  "player.pause": "Player paused.",
  "player.resume": "Player resumed.",
  "player.skip": "Skipped to the next request.",
  "player.volume": (result) => `Volume set to ${result.volume ?? "?"}%.`,
  "points.adjust": (result) =>
    `Points saved. New balance: ${Number(result.balance ?? 0).toLocaleString()}.`,
  "reward.complete": "Redemption marked fulfilled.",
  "reward.reject": "Redemption rejected and points refunded.",
  "activity.close": "Closed. Viewers can no longer take part.",
  "raffle.draw": (result) => `Winner: ${result.winnerName ?? "viewer name unavailable"}.`,
  "raffle.reroll": (result) => `New winner: ${result.winnerName ?? "viewer name unavailable"}.`,
  "timers.pause": "All timers paused.",
  "timers.resume": "Timers resumed. Missed messages are not sent.",
  "alert.manual": (result) =>
    Number(result.queued) > 0
      ? "Manual alert queued for your OBS alert source."
      : "Nothing was shown: no enabled alert is set to “Manual alert”. Add one with Add alert first.",
  "moderation.warn": "Warning sent to Kick. Check the incident list for the result.",
  "moderation.timeout": "Timeout sent to Kick. Check the incident list for the result.",
  "moderation.ban": "Ban sent to Kick. Check the incident list for the result.",
  "moderation.delete": "Delete request sent to Kick. The message is hidden from OBS chat now.",
  "moderation.bulk": (result) =>
    `${Array.isArray(result) ? result.length : "The"} moderation actions were queued.`,
  "moderation.pause": "Automatic moderation paused. Manual actions still work.",
  "moderation.resume": "Automatic moderation resumed.",
  "moderation.incident.start": "Incident mode started.",
  "moderation.incident.stop": "Incident mode stopped.",
  "token.revoke": "Token revoked. Sources using it stop updating.",
  "account.disable": "Account updated.",
  "account.revoke": "That account's sessions were signed out.",
  "asset.upload": "File uploaded.",
  "asset.delete": "File deleted.",
  "integration.save": "Settings saved and encrypted on the host.",
  "kick.refresh": "Kick connection refreshed.",
  "kick.subscribe": "Kick event subscriptions checked.",
  "kick.disconnect": "Kick disconnected.",
  "discord.register": (result) =>
    result.fixture
      ? "Command list checked. This fixture installation sends nothing to Discord."
      : "Discord commands registered.",
  "job.resolve": "Delivery resolved. Nothing was resent.",
  "privacy.erase": "Viewer profile and chat erased.",
  "privacy.export": "Viewer history downloaded.",
  "configuration.export": "Configuration downloaded.",
  "diagnostics.export": "Support data downloaded.",
};

/** Plain-English confirmation for a successful action. */
export function successText(action: string, result: Result) {
  const entry = successes[action];
  if (typeof entry === "function") return entry(result);
  return entry ?? "Done.";
}

const kindNames: Record<string, string> = {
  command: "command",
  timer: "timer",
  alert: "alert",
  widget: "widget",
  rule: "moderation rule",
  goal: "goal",
  reward: "reward",
  poll: "poll",
  raffle: "raffle",
  note: "moderator note",
  guild: "Discord server",
  settings: "instance settings",
};

/** One sentence for an audit row, e.g. "You approved “Song title”." */
export function auditSentence(row: Result, me?: string) {
  const action = String(row.action ?? ""),
    outcome = String(row.outcome ?? "");
  const actor = row.actor === me ? "You" : String(row.actorLabel ?? "Someone");
  // Capitalise descriptions ("the owner" → "The owner") but never a username such as "viewer_two".
  const who = /^(the|a|an|someone)\b/.test(actor)
    ? actor.charAt(0).toUpperCase() + actor.slice(1)
    : actor;
  const named = row.targetName ?? row.mediaTitle ?? row.viewerName;
  const quote = named ? ` “${String(named)}”` : "";
  const [kind, verb] = [
    action.slice(0, action.lastIndexOf(".")),
    action.slice(action.lastIndexOf(".") + 1),
  ];
  const fixed: Record<string, string> = {
    "media.request": `requested a video${quote}`,
    "media.validated": `checked the video${quote}`,
    "media.validation": `could not use a requested video${quote}`,
    "media.approve": `approved${quote || " a request"}`,
    "media.reject": `rejected${quote || " a request"}`,
    "media.remove": `removed${quote || " a request"}`,
    "media.reorder": "reordered the media queue",
    "media.clear": "cleared the media queue",
    "player.pause": "paused the player",
    "player.resume": "resumed the player",
    "player.skip": "skipped the current video",
    "player.volume": "changed the player volume",
    "goal.adjust": `updated the goal${quote}`,
    "points.adjust": `adjusted points for${quote || " a viewer"}`,
    "reward.redeem": "redeemed a reward",
    "reward.complete": "fulfilled a reward redemption",
    "reward.reject": "refunded a reward redemption",
    "activity.close": `closed${quote || " a poll or raffle"}`,
    "raffle.draw": "drew a raffle winner",
    "raffle.reroll": "rerolled a raffle winner",
    "timers.pause": "paused all timers",
    "timers.resume": "resumed timers",
    "alert.manual": "sent a manual alert",
    "moderation.warn": "warned a viewer",
    "moderation.timeout": "timed out a viewer",
    "moderation.ban": "banned a viewer",
    "moderation.delete": "deleted a chat message",
    "moderation.pause": "paused automatic moderation",
    "moderation.resume": "resumed automatic moderation",
    "moderation.incident.start": "started incident mode",
    "moderation.incident.stop": "stopped incident mode",
    "token.create": "created an access token or OBS source URL",
    "token.revoke": "revoked an access token",
    "account.invite": "created an invitation",
    "account.accept_invitation": "joined with an invitation",
    "account.disable": "changed an account's access",
    "account.revoke_sessions": "signed out an account's sessions",
    "account.password": "changed a password",
    "account.recover_owner": "recovered the owner account",
    "installation.claim": "claimed this installation",
    "integration.configure": `saved ${String(row.target)} connection settings`,
    "kick.disconnect": "disconnected Kick",
    "discord.commands.register": "registered Discord commands",
    "job.reconcile": "resolved an uncertain delivery",
    "asset.upload": "uploaded a file",
    "asset.delete": "deleted a file",
    "configuration.import": "imported configuration",
    "privacy.erase_viewer": "erased a viewer's data",
    "api.request": "used the API",
  };
  let sentence = fixed[action];
  if (!sentence && verb === "save" && kindNames[kind])
    sentence = `saved ${kindNames[kind]}${quote}`;
  if (!sentence && verb === "delete" && kindNames[kind])
    sentence = `deleted ${kindNames[kind]}${quote}`;
  if (!sentence && verb === "delivery") {
    // Keep provider names capitalised: "a Kick chat message", "an incoming Kick event".
    const label = jobKindLabels[kind] ?? kind;
    const noun = /^(Kick|Discord)/.test(label)
      ? label
      : label.charAt(0).toLowerCase() + label.slice(1);
    const thing = `${/^[aeiou]/i.test(noun) ? "an" : "a"} ${noun}`;
    sentence =
      outcome === "confirmed"
        ? `delivered ${thing}`
        : outcome === "uncertain"
          ? `could not confirm ${thing}`
          : `failed to deliver ${thing}`;
  }
  sentence ??= action.replaceAll(".", " ").replaceAll("_", " ");
  // Audit rows are written once, so a "pending" outcome is not current; only show failures.
  const suffix = outcome === "failed" && verb !== "delivery" ? " (failed)" : "";
  return `${who} ${sentence}${suffix}.`;
}
