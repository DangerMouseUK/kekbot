"use client";
import { ActionForm, Table, text } from "../ui";
import type { PanelProps } from "./types";

export default function MaintenancePanel({
  snapshot: s,
  auth,
  run,
  busy,
  message,
  expired,
}: PanelProps) {
  const owner = auth.actor?.role === "owner";
  return (
    <>
      <section>
        <h2>Diagnostics</h2>
        <pre>{JSON.stringify(s.diagnostics, null, 2)}</pre>
        {owner && (
          <button onClick={() => run("diagnostics.export")}>Generate redacted support data</button>
        )}
      </section>
      <section>
        <h2>Delivery outcomes</h2>
        <Table rows={s.jobs} columns={["id", "kind", "status", "error", "attempts"]} />
        {owner &&
          s.jobs
            .filter((job) => job.status === "uncertain")
            .map((job) => (
              <article key={String(job.id)}>
                <p>
                  Inspect the provider before reconciling {text(job.id)}. This does not resend it.
                </p>
                <button onClick={() => run("job.resolve", { id: job.id, result: "confirmed" })}>
                  Provider confirms success
                </button>
                <button
                  className="secondary"
                  onClick={() => run("job.resolve", { id: job.id, result: "failed" })}
                >
                  Provider confirms failure
                </button>
              </article>
            ))}
      </section>
      {owner && (
        <>
          <section>
            <h2>Source and API tokens</h2>
            {s.tokens?.map((token) => (
              <article key={String(token.id)}>
                <p>
                  {text(token.name)} · {text(token.kind)} · {text(token.scopes)}
                </p>
                <button className="secondary" onClick={() => run("token.revoke", { id: token.id })}>
                  Revoke
                </button>
              </article>
            ))}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                void run("token.create", {
                  kind: "api",
                  name: form.get("name"),
                  scopes: form.getAll("scopes"),
                });
              }}
            >
              <label>
                Token name
                <input name="name" required />
              </label>
              <div className="actions">
                {["read", "configure", "operate", "moderate", "media", "engage"].map((scope) => (
                  <label key={scope}>
                    {scope}
                    <input name="scopes" type="checkbox" value={scope} />
                  </label>
                ))}
              </div>
              <button>Create API token</button>
            </form>
          </section>
          <ActionForm
            action="privacy.export"
            fields={["viewer"]}
            button="Export viewer history"
            run={run}
            busy={busy}
          />
          <ActionForm
            action="privacy.erase"
            fields={["viewer"]}
            button="Erase retained viewer profile and chat"
            run={run}
            busy={busy}
          />
          <section>
            <h2>Configuration portability</h2>
            <button onClick={() => run("configuration.export")}>Export configuration</button>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                try {
                  void run("configuration.import", {
                    bundle: JSON.parse(String(form.get("bundle"))),
                    mode: form.get("mode"),
                    apply: form.get("apply") === "on",
                  });
                } catch {
                  message("Invalid configuration JSON");
                }
              }}
            >
              <label>
                Versioned configuration JSON
                <textarea name="bundle" required rows={8} />
              </label>
              <label>
                Mode
                <select name="mode">
                  <option>merge</option>
                  <option>replace</option>
                </select>
              </label>
              <label>
                Apply after reviewing the preview
                <input name="apply" type="checkbox" />
              </label>
              <button>Validate / import</button>
            </form>
          </section>
          <section>
            <h2>Host maintenance</h2>
            <p>
              Stop the application before backup, restore or owner recovery. Use the documented
              kekbot CLI with protected runtime files. Configuration exports exclude credentials,
              accounts and sessions.
            </p>
            <a
              href="https://github.com/DangerMouseUK/kekbot/blob/main/docs/OPERATIONS.md"
              rel="noreferrer"
              target="_blank"
            >
              Operator guide
            </a>
          </section>
        </>
      )}
      <section>
        <h2>Change password</h2>
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const values = Object.fromEntries(new FormData(event.currentTarget));
            const response = await fetch("/api/auth", {
              method: "POST",
              headers: { "Content-Type": "application/json", "X-CSRF-Token": auth.csrf ?? "" },
              body: JSON.stringify({ action: "password", ...values }),
            });
            if (response.ok) expired();
            else message((await response.json()).error);
          }}
        >
          <label>
            Current password
            <input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <label>
            New password
            <input
              name="password"
              type="password"
              autoComplete="new-password"
              minLength={12}
              required
            />
          </label>
          <button>Change password and revoke sessions</button>
        </form>
      </section>
    </>
  );
}
