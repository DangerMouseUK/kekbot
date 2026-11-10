"use client";
import { useState } from "react";
import { permissionLabels, roleLabel } from "../messages";
import { CopyField, formatTime, permitted, text } from "../ui";
import type { PanelProps } from "./types";

export default function AccountsPanel({ snapshot: s, auth, run, busy, confirm }: PanelProps) {
  const owner = auth.actor?.role === "owner",
    can = (permission: Parameters<typeof permitted>[1]) => permitted(auth.actor, permission);
  const [invitation, setInvitation] = useState<{ token: string; role: string }>();
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
        onSubmit={async (event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const role = String(form.get("role"));
          const result = await run(
            "account.invite",
            { role, permissions: form.getAll("permissions") },
            { quiet: true },
          );
          if (result) setInvitation({ token: String(result.token), role });
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
        <fieldset>
          <legend>
            Admin permissions (ignored for other roles; owner powers cannot be delegated)
          </legend>
          <div className="checks">
            {(["configure", "operate", "moderate", "media", "engage", "invite"] as const)
              .filter((permission) => owner || (permission !== "invite" && can(permission)))
              .map((permission) => (
                <label key={permission} className="check">
                  <input name="permissions" type="checkbox" value={permission} />
                  {permissionLabels[permission]}
                </label>
              ))}
          </div>
        </fieldset>
        <button disabled={busy}>Create one-day invitation</button>
      </form>
      {invitation && (
        <div className="source-result">
          <p>
            <strong>Send this invitation token privately. It is shown only once</strong> and works
            for one day. The person opens KekBot, selects “I have an invitation” and creates their
            own password.
          </p>
          <CopyField
            label="Invitation token"
            value={invitation.token}
            help={`Role: ${roleLabel(invitation.role)}.`}
          />
          <button className="secondary" onClick={() => setInvitation(undefined)}>
            Hide token
          </button>
        </div>
      )}
      {owner && (
        <section>
          <h2>Accounts</h2>
          {s.accounts?.map((account) => {
            const grants = (() => {
              try {
                return JSON.parse(String(account.permissions)) as string[];
              } catch {
                return [];
              }
            })();
            return (
              <article key={String(account.id)}>
                <div className="card-head">
                  <h3>{text(account.username)}</h3>
                  <span className={`badge ${account.disabled ? "muted" : "live"}`}>
                    {account.disabled ? "Disabled" : "Active"}
                  </span>
                </div>
                <p>
                  {roleLabel(account.role)}
                  {account.role === "admin" &&
                    ` · ${grants.map((grant) => permissionLabels[grant] ?? grant).join(", ") || "no permissions"}`}{" "}
                  · joined {formatTime(account.created_at)}
                </p>
                <div className="actions">
                  {account.role !== "owner" && (
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() =>
                        run("account.disable", { id: account.id, disabled: !account.disabled })
                      }
                    >
                      {account.disabled ? "Enable" : "Disable"}
                      <span className="visually-hidden"> {text(account.username)}</span>
                    </button>
                  )}
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Sign out ${text(account.username)} everywhere?`,
                          body: (
                            <p>Every session for this account ends now. They can sign in again.</p>
                          ),
                          confirm: "Revoke sessions",
                        })
                      )
                        void run("account.revoke", { id: account.id });
                    }}
                  >
                    Revoke sessions
                    <span className="visually-hidden"> for {text(account.username)}</span>
                  </button>
                </div>
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
