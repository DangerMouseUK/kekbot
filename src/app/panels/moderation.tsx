"use client";
import { useState } from "react";
import { ActionForm, Table, permitted } from "../ui";
import type { PanelProps } from "./types";

export default function ModerationPanel({ snapshot: s, auth, run, busy }: PanelProps) {
  const can = (permission: Parameters<typeof permitted>[1]) => permitted(auth.actor, permission);
  const [viewerQuery, setViewerQuery] = useState("");
  return (
    <>
      <section>
        <h2>Temporary incident mode</h2>
        <p>
          {s.incidentMode
            ? `${s.incidentMode.preset} preset active until ${new Date(s.incidentMode.endsAt).toLocaleString()}.`
            : "No temporary preset active."}{" "}
          Presets warn about links or message bursts, exempt moderators/broadcaster, and expire
          automatically. Existing rules retain priority.
        </p>
        {can("moderate") && (
          <>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void run("moderation.incident.start", {
                  preset: form.get("preset"),
                  minutes: Number(form.get("minutes")),
                  acknowledge: form.get("acknowledge") === "on",
                });
              }}
            >
              <label>
                Incident preset
                <select name="preset">
                  <option value="links">Links</option>
                  <option value="burst">Message bursts</option>
                  <option value="combined">Links and bursts</option>
                </select>
              </label>
              <label>
                Duration in minutes
                <input name="minutes" type="number" min={1} max={120} defaultValue={15} required />
              </label>
              <label>
                I have reviewed the temporary warning rules
                <input name="acknowledge" type="checkbox" required />
              </label>
              <button disabled={busy}>Start incident mode</button>
            </form>
            <button
              className="secondary"
              disabled={busy}
              onClick={() => run("moderation.incident.stop")}
            >
              Stop incident mode
            </button>
          </>
        )}
      </section>
      {can("moderate") && (
        <>
          <div className="actions">
            <button onClick={() => run("moderation.pause")}>Emergency pause moderation</button>
            <button onClick={() => run("moderation.resume")}>Resume moderation</button>
          </div>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget);
              void run("moderation.bulk", {
                operation: form.get("operation"),
                targets: String(form.get("targets"))
                  .split(/[\s,]+/)
                  .filter(Boolean)
                  .map(Number),
                reason: form.get("reason"),
                acknowledge: form.get("acknowledge") === "on",
              });
            }}
          >
            <h3>Reviewed bulk moderation (up to 20 viewers)</h3>
            <label>
              Viewer IDs
              <textarea name="targets" required />
            </label>
            <label>
              Action
              <select name="operation">
                <option>warn</option>
                <option>timeout</option>
                <option>ban</option>
              </select>
            </label>
            <label>
              Reason
              <input name="reason" required />
            </label>
            <label>
              I have reviewed every target
              <input name="acknowledge" type="checkbox" required />
            </label>
            <button>Queue reviewed actions</button>
          </form>
        </>
      )}
      {can("moderate") && (
        <>
          <ActionForm
            action="moderation.warn"
            fields={["target", "reason"]}
            button="Warn viewer"
            run={run}
            busy={busy}
          />
          <ActionForm
            action="moderation.timeout"
            fields={["target", "value", "reason"]}
            button="Timeout viewer (minutes)"
            run={run}
            busy={busy}
          />
          <ActionForm
            action="moderation.ban"
            fields={["target", "reason", "acknowledge"]}
            button="Ban viewer"
            run={run}
            busy={busy}
          />
          <ActionForm
            action="moderation.delete"
            fields={["target", "message", "reason", "acknowledge"]}
            button="Delete message"
            run={run}
            busy={busy}
          />
          <form
            onSubmit={(event) => {
              event.preventDefault();
              const form = new FormData(event.currentTarget),
                rule = s.documents.find((d) => d.id === form.get("rule"));
              if (rule)
                void run("moderation.test", {
                  rule: rule.data,
                  content: form.get("content"),
                  role: form.get("role"),
                });
            }}
          >
            <h3>Safe rule test</h3>
            <label>
              Rule
              <select name="rule">
                {s.documents
                  .filter((d) => d.kind === "rule")
                  .map((d) => (
                    <option value={d.id} key={d.id}>
                      {String(d.data.name)}
                    </option>
                  ))}
              </select>
            </label>
            <label>
              Sample message
              <input name="content" required />
            </label>
            <label>
              Viewer role
              <select name="role">
                {["viewer", "subscriber", "vip", "moderator", "broadcaster"].map((role) => (
                  <option key={role}>{role}</option>
                ))}
              </select>
            </label>
            <button>Evaluate without effects</button>
          </form>
        </>
      )}
      <section>
        <h2>Incidents</h2>
        <Table rows={s.incidents} columns={["viewer", "action", "reason", "outcome", "error"]} />
      </section>
      <section>
        <h2>Observed viewers</h2>
        <label>
          Find an observed viewer
          <input value={viewerQuery} onChange={(event) => setViewerQuery(event.target.value)} />
        </label>
        <Table
          rows={s.viewers.filter((viewer) =>
            `${viewer.id} ${viewer.name}`.toLowerCase().includes(viewerQuery.toLowerCase()),
          )}
          columns={["id", "name", "role", "last_seen"]}
        />
      </section>
    </>
  );
}
