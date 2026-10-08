"use client";
import { permitted, text } from "../ui";
import type { PanelProps } from "./types";

export default function AccountsPanel({ snapshot: s, auth, run, busy }: PanelProps) {
  const owner = auth.actor?.role === "owner",
    can = (permission: Parameters<typeof permitted>[1]) => permitted(auth.actor, permission);
  if (!can("invite")) return null;
  return (
    <>
      <p>
        Invited operators can read retained viewer history and operational data. Grant
        administration and moderation only to trusted people; their permitted actions can affect
        your channel. Provider secrets, recovery and permission delegation remain owner-only. Admin
        invitations cannot exceed their existing grants.
      </p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void run("account.invite", {
            role: form.get("role"),
            permissions: form.getAll("permissions"),
          });
        }}
      >
        <h2>Invite an operator</h2>
        <label>
          Role
          <select name="role">
            <option value="readonly">Read-only</option>
            {(owner ||
              (["operate", "moderate", "media", "engage"] as const).every((permission) =>
                can(permission),
              )) && <option value="moderator">Moderator</option>}
            <option value="admin">Admin</option>
          </select>
        </label>
        <p>Admin grants (owner powers cannot be delegated):</p>
        <div className="actions">
          {(["configure", "operate", "moderate", "media", "engage", "invite"] as const)
            .filter((permission) => owner || (permission !== "invite" && can(permission)))
            .map((permission) => (
              <label key={permission}>
                {permission}
                <input name="permissions" type="checkbox" value={permission} />
              </label>
            ))}
        </div>
        <button disabled={busy}>Create one-day invitation</button>
      </form>
      {owner && (
        <section>
          <h2>Accounts</h2>
          {s.accounts?.map((account) => (
            <article key={String(account.id)}>
              <h3>{text(account.username)}</h3>
              <p>
                {text(account.role)} · {account.disabled ? "Disabled" : "Active"}
              </p>
              <div className="actions">
                {account.role !== "owner" && (
                  <button
                    className="secondary"
                    onClick={() =>
                      run("account.disable", { id: account.id, disabled: !account.disabled })
                    }
                  >
                    {account.disabled ? "Enable" : "Disable"}
                  </button>
                )}
                <button
                  className="secondary"
                  onClick={() => run("account.revoke", { id: account.id })}
                >
                  Revoke sessions
                </button>
              </div>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
