// Server errors reach the editor as `Error.message` from the dashboard's `call()`: either an
// AppError code (`command_trigger_conflict`) or `invalid_input: field, field`. The codes are
// the API contract; this module only turns them into plain English for the form.

export type ServerProblem = {
  code: string;
  summary: string;
  fields: Record<string, string>;
  conflict: boolean;
};

const nouns: Record<string, string> = {
  command: "command",
  timer: "timer",
  alert: "alert",
  widget: "widget",
  rule: "rule",
  goal: "goal",
  reward: "reward",
  poll: "poll",
  raffle: "raffle",
  note: "note",
  guild: "Discord route",
  settings: "settings",
};

export function describeServerError(message: string, kind: string): ServerProblem {
  const match = /^([a-z0-9_]+)(?::\s*(.*))?$/.exec(message.trim());
  const noun = nouns[kind] ?? "item";
  if (!match)
    return { code: "", summary: message || "Saving failed.", fields: {}, conflict: false };
  const code = match[1]!;
  const listed = (match[2] ?? "")
    .split(",")
    .map((field) => field.trim().split(".")[0]!)
    .filter(Boolean);
  const fields: Record<string, string> = {};
  let summary: string;
  switch (code) {
    case "configuration_changed_reload":
      summary = `Someone else changed this ${noun} after you opened it, so your changes were not saved. Reload the latest values, review them, then make your changes again.`;
      return { code, summary, fields, conflict: true };
    case "command_trigger_conflict":
      summary =
        "That trigger or one of the aliases is already used by another command or by a built-in command such as !points or !sr. Choose a different one.";
      fields.trigger = "Already in use. Choose a different trigger or alias.";
      break;
    case "alert_asset_missing_or_wrong_type":
      summary =
        "The chosen image or sound no longer exists or is the wrong type. Choose another file.";
      fields.image = "Check this file still exists and is an image.";
      fields.sound = "Check this file still exists and is a sound.";
      break;
    case "configuration_limit":
      summary = `You have reached the limit of 500 saved ${noun}s. Delete one you no longer need first.`;
      break;
    case "configuration_not_found":
      summary = `This ${noun} no longer exists; someone may have deleted it. Cancel and refresh the list.`;
      break;
    case "invalid_input":
      summary = listed.length
        ? "Some values were not accepted. Check the highlighted fields."
        : "Some values were not accepted. Check the form and try again.";
      for (const field of listed) fields[field] = "Not accepted by the server. Check this value.";
      break;
    case "permission_denied":
    case "owner_required":
      summary = `Your account is not allowed to change this ${noun}. Ask the installation owner to review your access.`;
      break;
    case "api_permission_revoked":
    case "account_disabled_or_removed":
    case "login_required":
      summary = "Your access changed or your session ended. Sign in again, then retry.";
      break;
    case "csrf_required":
    case "same_origin_required":
      summary = "The browser session could not be verified. Reload the page, then try again.";
      break;
    case "request_too_large":
      summary = "That is too large to save. Shorten long text or use a smaller file.";
      break;
    case "configuration_or_storage_error":
      summary = "KekBot could not save right now. Wait a moment and try again.";
      break;
    default:
      summary = `Saving failed (${code.replaceAll("_", " ")}).`;
  }
  return { code, summary, fields, conflict: false };
}
