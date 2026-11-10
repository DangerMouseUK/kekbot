// Discord guild grants: `{ id, permission }[]` stored on a guild route, edited as rows.
// IDs stay strings end to end; a Discord snowflake must never pass through a JavaScript number.

export const grantPermissions = ["operate", "moderate", "media", "engage"] as const;
export type GrantPermission = (typeof grantPermissions)[number];
/**
 * `permission` is normally one of `grantPermissions`. A stored value KekBot does not recognise
 * is carried through unchanged (never coerced to a real permission) and shown read-only.
 */
export type Grant = { id: string; permission: unknown };
export type GrantRow = { key: string; id: string; permission: unknown };

export const maxGrants = 30;

export const permissionLabels: Record<GrantPermission, { label: string; help: string }> = {
  operate: {
    label: "Operate",
    help: "Pause/resume timers, send manual alerts, adjust goals, shout out",
  },
  moderate: { label: "Moderate", help: "Moderation actions, notes and incident mode" },
  media: { label: "Media", help: "Approve, reject, reorder requests and control the player" },
  engage: { label: "Engage", help: "Points, reward redemptions, close/draw polls and raffles" },
};

export const isPermission = (value: unknown): value is GrantPermission =>
  typeof value === "string" && (grantPermissions as readonly string[]).includes(value);

/** Stored grants → editable rows. Unknown permissions are kept exactly as stored. */
export function grantsToRows(value: unknown, makeKey: () => string): GrantRow[] {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const item = (entry ?? {}) as Record<string, unknown>;
    return {
      key: makeKey(),
      id: typeof item.id === "string" ? item.id : item.id === undefined ? "" : String(item.id),
      permission: item.permission,
    };
  });
}

/** Rows → stored grants. Blank rows are dropped; IDs are trimmed; permissions pass through as-is. */
export function rowsToGrants(rows: GrantRow[]): Grant[] {
  return rows
    .map((row) => ({ id: row.id.trim(), permission: row.permission }))
    .filter((grant) => grant.id !== "" || !isPermission(grant.permission));
}

/** Per-row problems keyed by row key, mirroring the schema's 1–24 digit snowflake rule. */
export function grantRowErrors(rows: GrantRow[], noun: "role" | "user"): Record<string, string> {
  const errors: Record<string, string> = {};
  const seen = new Set<string>();
  for (const row of rows) {
    const id = row.id.trim();
    if (!isPermission(row.permission)) {
      errors[row.key] =
        `This row has a permission KekBot does not recognise (${describeRaw(row.permission)}). It is kept unchanged; remove the row to save.`;
      continue;
    }
    if (id === "") continue;
    if (!/^\d{1,24}$/.test(id))
      errors[row.key] = `A Discord ${noun} ID is 1–24 digits only (no @, # or spaces).`;
    else if (seen.has(`${id}:${row.permission}`))
      errors[row.key] =
        `This ${noun} already has the ${permissionLabels[row.permission].label} permission.`;
    seen.add(`${id}:${row.permission}`);
  }
  return errors;
}

export function describeRaw(value: unknown): string {
  if (value === undefined) return "missing";
  return typeof value === "string" ? `“${value}”` : (JSON.stringify(value) ?? String(value));
}
