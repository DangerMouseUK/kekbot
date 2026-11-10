"use client";
import { useState } from "react";
import { describeError, jobKindLabels, permissionLabels, statusLabel } from "../messages";
import {
  CopyField,
  Table,
  ViewerPicker,
  downloadJson,
  formatBytes,
  formatTime,
  relative,
  text,
  type Row,
  type Viewer,
} from "../ui";
import { scopes } from "./cards";
import type { PanelProps } from "./types";
import WorkQueue from "./work-queue";

const problem = (code: unknown) => (code ? describeError(String(code)).title : "—");

function Diagnostics({ snapshot: s, auth, run, busy }: PanelProps) {
  const d = s.diagnostics;
  const jobs = ((d.jobs as Row[]) ?? [])
    .map((row) => `${statusLabel(row.status)}: ${row.count}`)
    .join(" · ");
  const last = d.lastVerifiedEvent as Row | null;
  const facts: [string, string][] = [
    ["KekBot version", text(d.version)],
    ["Database schema", text(d.schemaVersion)],
    [
      "Background worker",
      d.workerHeartbeat ? `Last check ${relative(Number(d.workerHeartbeat))}` : "No heartbeat yet",
    ],
    ["Stream status", d.stream === "true" ? "Live" : d.stream === "false" ? "Offline" : "Unknown"],
    [
      "Last verified event",
      last ? `${text(last.eventType)} · ${formatTime(last.receivedAt)}` : "None yet",
    ],
    ["Deliveries", jobs || "None yet"],
    ["Public callback URL", d.callbacksConfigured ? "Configured" : "Not configured"],
    ["Free disk space", d.diskFreeBytes === null ? "Unknown" : formatBytes(d.diskFreeBytes)],
  ];
  const problems = [d.lastError, d.kickRepairError, d.streamSampleError].filter(Boolean);
  return (
    <section>
      <h2>Diagnostics</h2>
      <dl className="facts">
        {facts.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {problems.map((code) => (
        <p key={String(code)} className="problem">
          {problem(code)} {describeError(String(code)).next}
        </p>
      ))}
      {auth.actor?.role === "owner" && (
        <button
          disabled={busy}
          onClick={async () => {
            const result = await run(
              "diagnostics.export",
              {},
              { success: "Support data downloaded. It is redacted, but review it before sharing." },
            );
            if (result) downloadJson("kekbot-support.json", result);
          }}
        >
          Download redacted support data
        </button>
      )}
    </section>
  );
}

function Privacy({ run, busy, confirm, expired }: PanelProps) {
  const [viewer, setViewer] = useState<Viewer>();
  return (
    <section aria-labelledby="privacy-heading">
      <h2 id="privacy-heading">Viewer privacy</h2>
      <p className="help">
        Download everything KekBot keeps about a viewer, or erase their profile and chat.
      </p>
      <ViewerPicker value={viewer} onChange={setViewer} expired={expired} />
      <div className="actions">
        <button
          disabled={busy || !viewer}
          onClick={async () => {
            const result = await run("privacy.export", { viewer: viewer!.id });
            if (result) downloadJson(`kekbot-viewer-${viewer!.id}.json`, result);
          }}
        >
          Export viewer history
        </button>
        <button
          className="secondary"
          disabled={busy || !viewer}
          onClick={async () => {
            if (
              await confirm({
                title: `Erase ${viewer!.name}?`,
                body: (
                  <p>
                    Their retained profile and chat are erased. Points and redemption history stay,
                    without their name. This cannot be undone.
                  </p>
                ),
                confirm: "Erase viewer",
                danger: true,
              })
            )
              if (await run("privacy.erase", { viewer: viewer!.id })) setViewer(undefined);
          }}
        >
          Erase retained viewer profile and chat
        </button>
      </div>
    </section>
  );
}

function ApiTokens({ snapshot: s, run, busy, confirm }: PanelProps) {
  const [issued, setIssued] = useState<string>();
  const tokens = (s.tokens ?? []).filter((token) => token.kind === "api");
  return (
    <section>
      <h2>API tokens</h2>
      <p className="help">
        For your own scripts. Widget source URLs are managed on each widget card.
      </p>
      {tokens.length ? (
        <ul className="token-list">
          {tokens.map((token) => (
            <li key={String(token.id)}>
              <span>
                <strong>{text(token.name)}</strong> ·{" "}
                {scopes(token)
                  .map((scope) => permissionLabels[scope] ?? scope)
                  .join(", ")}{" "}
                · created {relative(Number(token.created_at))}
              </span>
              <button
                className="secondary small"
                disabled={busy}
                onClick={async () => {
                  if (
                    await confirm({
                      title: `Revoke ${text(token.name)}?`,
                      body: <p>Scripts using it stop working straight away.</p>,
                      confirm: "Revoke",
                      danger: true,
                    })
                  )
                    void run("token.revoke", { id: token.id });
                }}
              >
                Revoke<span className="visually-hidden"> {text(token.name)}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="empty">No API tokens.</p>
      )}
      <form
        onSubmit={async (event) => {
          event.preventDefault();
          const element = event.currentTarget,
            form = new FormData(element);
          const result = await run(
            "token.create",
            { kind: "api", name: form.get("name"), scopes: form.getAll("scopes") },
            { quiet: true },
          );
          if (result) {
            setIssued(String(result.token));
            element.reset();
          }
        }}
      >
        <label>
          Token name
          <input name="name" required maxLength={80} />
        </label>
        <fieldset>
          <legend>Permissions</legend>
          <div className="checks">
            {["read", "configure", "operate", "moderate", "media", "engage"].map((scope) => (
              <label key={scope} className="check">
                <input name="scopes" type="checkbox" value={scope} />
                {permissionLabels[scope]}
              </label>
            ))}
          </div>
        </fieldset>
        <button disabled={busy}>Create API token</button>
      </form>
      {issued && (
        <div className="source-result">
          <CopyField
            label="New API token"
            value={issued}
            help="Shown only once. Store it like a password."
          />
          <button className="secondary" onClick={() => setIssued(undefined)}>
            Hide token
          </button>
        </div>
      )}
    </section>
  );
}

export default function MaintenancePanel(props: PanelProps) {
  const { snapshot: s, auth, run, busy, message, expired } = props;
  const owner = auth.actor?.role === "owner";
  const [preview, setPreview] = useState<Row>();
  return (
    <>
      <Diagnostics {...props} />
      <section>
        <h2>Uncertain deliveries</h2>
        <p className="help">
          KekBot sent these but could not confirm the result. Check Kick or Discord, then record
          what happened. Recording a result never resends anything.
        </p>
        <WorkQueue firstPage={s.uncertainJobs} view="uncertain-jobs" expired={expired}>
          {(job, refresh) => (
            <article key={String(job.id)} className="work-item">
              <p>
                <strong>{jobKindLabels[String(job.kind)] ?? text(job.kind)}</strong> ·{" "}
                {formatTime(job.createdAt)} · {problem(job.error)}
              </p>
              <p className="help">Reference {text(job.id)}</p>
              {owner && (
                <div className="actions">
                  <button
                    disabled={busy}
                    onClick={async () => {
                      await run("job.resolve", { id: job.id, result: "confirmed" });
                      await refresh();
                    }}
                  >
                    Provider confirms success
                  </button>
                  <button
                    className="secondary"
                    disabled={busy}
                    onClick={async () => {
                      await run("job.resolve", { id: job.id, result: "failed" });
                      await refresh();
                    }}
                  >
                    Provider confirms failure
                  </button>
                </div>
              )}
            </article>
          )}
        </WorkQueue>
      </section>
      <section>
        <h2>Delivery outcomes</h2>
        <Table
          caption="Recent delivery outcomes"
          empty="No deliveries yet."
          rows={s.jobs}
          columns={[
            {
              key: "kind",
              label: "What",
              render: (row) => jobKindLabels[String(row.kind)] ?? text(row.kind),
            },
            "status",
            { key: "error", label: "Problem", render: (row) => problem(row.error) },
            "attempts",
            { key: "createdAt", label: "When", render: (row) => formatTime(row.createdAt) },
          ]}
        />
      </section>
      {owner && (
        <>
          <ApiTokens {...props} />
          <Privacy {...props} />
          <section>
            <h2>Configuration portability</h2>
            <p className="help">
              Export commands, timers, alerts and other configuration to reuse elsewhere. Exports
              exclude credentials, accounts and sessions; use a full backup for disaster recovery.
            </p>
            <button
              disabled={busy}
              onClick={async () => {
                const result = await run("configuration.export");
                if (result) downloadJson("kekbot-configuration.json", result);
              }}
            >
              Export configuration
            </button>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                let bundle: unknown;
                try {
                  bundle = JSON.parse(String(form.get("bundle")));
                } catch {
                  return message("That is not valid JSON. Paste the whole exported file.");
                }
                const apply = form.get("apply") === "on";
                const result = await run(
                  "configuration.import",
                  { bundle, mode: form.get("mode"), apply },
                  {
                    success: apply
                      ? "Configuration imported."
                      : "Preview ready. Nothing was changed.",
                  },
                );
                if (result) setPreview(result);
              }}
            >
              <label>
                Exported configuration (JSON)
                <textarea name="bundle" required rows={6} />
              </label>
              <label>
                Mode
                <select name="mode">
                  <option value="merge">Merge: add and update, keep everything else</option>
                  <option value="replace">Replace: also remove items not in the file</option>
                </select>
              </label>
              <label className="check">
                <input name="apply" type="checkbox" /> Apply after reviewing the preview
              </label>
              <button disabled={busy}>Validate / import</button>
            </form>
            {preview && (
              <div className="source-result" aria-live="polite">
                <p>
                  <strong>{preview.applied ? "Imported" : "Preview"}</strong> · {text(preview.mode)}{" "}
                  · {text(preview.create)} new item(s) ·{" "}
                  {(preview.conflicts as unknown[] | undefined)?.length ?? 0} existing item(s)
                  updated
                  {(preview.replaceRemoves as unknown[] | undefined)?.length
                    ? ` · ${(preview.replaceRemoves as unknown[]).length} removed`
                    : ""}
                  .
                </p>
              </div>
            )}
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
            else message(String((await response.json()).error));
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
          <button disabled={busy}>Change password and revoke sessions</button>
        </form>
      </section>
    </>
  );
}
