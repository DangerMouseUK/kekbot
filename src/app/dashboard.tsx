"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Kind, ConfigDocument } from "../server/domain/catalog.ts";
import { Table, text, permitted, type Row, type Snapshot, type Session } from "./ui";
const ConfigEditor = dynamic(() => import("./config-editor"));
const ModulePanels = dynamic(() => import("./module-panels"));
const panels = [
  "Control room",
  "Connections",
  "Commands",
  "Timers",
  "Alerts",
  "Media",
  "Moderation",
  "Goals",
  "Points & rewards",
  "Polls & raffles",
  "Widgets",
  "Analytics",
  "Accounts",
  "Maintenance",
];
const kinds: Record<string, Kind[]> = {
  Connections: ["guild"],
  Commands: ["command"],
  Timers: ["timer"],
  Alerts: ["alert"],
  Moderation: ["rule", "note"],
  Goals: ["goal"],
  "Points & rewards": ["reward"],
  "Polls & raffles": ["poll", "raffle"],
  Widgets: ["widget"],
  Maintenance: ["settings"],
};

export default function Dashboard() {
  const authEpoch = useRef(0);
  const invalidateRequests = useCallback(() => {
    authEpoch.current++;
  }, []);
  const [auth, setAuth] = useState<Session>(),
    [snapshot, setSnapshot] = useState<Snapshot>();
  const [panel, setPanel] = useState("Control room"),
    [editor, setEditor] = useState<{ kind: Kind; document?: ConfigDocument }>();
  const [message, setMessage] = useState(""),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [loginMode, setLoginMode] = useState("login");
  const refresh = useCallback(async () => {
    const epoch = authEpoch.current;
    const response = await fetch("/api/control", { cache: "no-store" });
    if (epoch !== authEpoch.current) return;
    if (response.status === 401) {
      authEpoch.current++;
      setSnapshot(undefined);
      setMessage("");
      setAuth((previous) => (previous ? { ...previous, actor: null } : previous));
      return;
    }
    const data = await response.json();
    if (epoch !== authEpoch.current) return;
    if (response.ok) setSnapshot(data);
    else setMessage(data.error ?? "Runtime unavailable");
  }, []);
  useEffect(() => {
    let active = true;
    fetch("/api/auth", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (active) setAuth(data);
      })
      .catch(() => {
        if (active) setMessage("Cannot reach this installation. Check host diagnostics.");
      });
    return () => {
      active = false;
    };
  }, []);
  useEffect(() => {
    if (!auth?.actor?.id) return;
    let active = true;
    const events = new EventSource("/api/events");
    const changed = () => {
      if (active) {
        setConnected(true);
        void refresh();
      }
    };
    events.addEventListener("snapshot", changed);
    events.addEventListener("change", changed);
    events.onopen = () => setConnected(true);
    events.onerror = () => {
      setConnected(false);
      void fetch("/api/auth", { cache: "no-store" })
        .then((response) => response.json())
        .then((data) => {
          if (active) {
            if (!data.actor) {
              invalidateRequests();
              setSnapshot(undefined);
              setMessage("");
            }
            setAuth(data);
          }
        })
        .catch(() => {
          /* reconnect keeps the last snapshot until the host returns */
        });
    };
    return () => {
      active = false;
      invalidateRequests();
      events.close();
    };
  }, [auth?.actor?.id, refresh, invalidateRequests]);
  async function call(action: string, input: Row = {}) {
    const epoch = authEpoch.current;
    const response = await fetch("/api/control", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": auth?.csrf ?? "" },
      body: JSON.stringify({ action, input }),
    });
    const data = await response.json();
    if (epoch !== authEpoch.current) throw new Error("Session changed; result discarded");
    if (!response.ok)
      throw new Error(
        (data.error ?? "Request failed") +
          (data.fields?.length ? `: ${data.fields.join(", ")}` : ""),
      );
    await refresh();
    if (epoch !== authEpoch.current) throw new Error("Session changed; result discarded");
    return data;
  }
  async function run(action: string, input: Row = {}) {
    setBusy(true);
    setMessage("");
    try {
      setMessage(JSON.stringify(await call(action, input), null, 2));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Request failed");
    } finally {
      setBusy(false);
    }
  }
  async function source(doc: ConfigDocument) {
    setBusy(true);
    try {
      const read = await call("token.create", {
        kind: "widget",
        name: `${String(doc.data.name)} read`,
        scopes: [`widget:${doc.id}`],
      });
      let url = `${location.origin}/widgets/${doc.id}?token=${encodeURIComponent(read.token)}`;
      if (doc.data.type === "player") {
        const player = await call("token.create", {
          kind: "player",
          name: `${String(doc.data.name)} player`,
          scopes: [`widget:${doc.id}`],
        });
        url += `#player=${encodeURIComponent(player.token)}`;
      }
      setMessage(`Copy this private OBS Browser Source URL now. It is shown once.\n${url}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Source creation failed");
    } finally {
      setBusy(false);
    }
  }
  async function logout() {
    authEpoch.current++;
    setMessage("");
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": auth?.csrf ?? "" },
      body: JSON.stringify({ action: "logout" }),
    });
    setAuth((previous) => (previous ? { ...previous, actor: null } : previous));
    setSnapshot(undefined);
    setMessage("");
  }
  if (!auth)
    return (
      <main>
        <h1>KekBot</h1>
        <p role="status">{message || "Loading installation…"}</p>
      </main>
    );
  if (!auth.actor)
    return (
      <main className="auth-page">
        <p className="eyebrow">Your community. Your installation.</p>
        <h1>KekBot</h1>
        <h2>
          {!auth.claimed
            ? "Claim this installation"
            : loginMode === "invite"
              ? "Accept invitation"
              : "Welcome back"}
        </h2>
        {!auth.claimed && (
          <p>
            Run <code>pnpm kekbot init</code> on the host, then read the setup-token file reported
            by the command. The token expires after one hour.
          </p>
        )}
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            setBusy(true);
            const values = Object.fromEntries(new FormData(event.currentTarget));
            try {
              const response = await fetch("/api/auth", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ ...values, action: !auth.claimed ? "setup" : loginMode }),
              });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error);
              setAuth(await (await fetch("/api/auth", { cache: "no-store" })).json());
              setMessage("");
            } catch (error) {
              setMessage(error instanceof Error ? error.message : "Sign-in failed");
            } finally {
              setBusy(false);
            }
          }}
        >
          {(!auth.claimed || loginMode === "invite") && (
            <label>
              {auth.claimed ? "Invitation token" : "Setup token"}
              <input name="token" type="password" autoComplete="off" required />
            </label>
          )}
          <label>
            Username
            <input
              name="username"
              autoComplete="username"
              pattern="[a-zA-Z0-9][a-zA-Z0-9_.-]{2,31}"
              required
            />
          </label>
          <label>
            Password
            <input
              name="password"
              type="password"
              autoComplete={
                !auth.claimed || loginMode === "invite" ? "new-password" : "current-password"
              }
              minLength={12}
              maxLength={256}
              required
            />
          </label>
          <button disabled={busy}>
            {!auth.claimed
              ? "Create owner account"
              : loginMode === "invite"
                ? "Create invited account"
                : "Sign in"}
          </button>
        </form>
        {auth.claimed && (
          <button
            className="secondary"
            onClick={() => setLoginMode(loginMode === "login" ? "invite" : "login")}
          >
            {loginMode === "login" ? "I have an invitation" : "Back to sign in"}
          </button>
        )}
        {message && <p role="alert">{message}</p>}
        <p className="help">Use at least 12 characters. Recovery requires host access.</p>
      </main>
    );
  const owner = auth.actor.role === "owner";
  return (
    <div className="app-shell">
      <aside>
        <Link className="brand" href="/">
          KekBot<span>Creator toolkit</span>
        </Link>
        <nav aria-label="Main navigation">
          {panels
            .filter(
              (name) =>
                owner ||
                (name === "Accounts" && permitted(auth.actor, "invite")) ||
                !["Accounts", "Connections"].includes(name),
            )
            .map((name) => (
              <button
                key={name}
                aria-current={panel === name ? "page" : undefined}
                onClick={() => {
                  setPanel(name);
                  setEditor(undefined);
                  setMessage("");
                }}
              >
                {name}
              </button>
            ))}
        </nav>
        <p className="identity">
          {auth.actor.username}
          <span>{auth.actor.role}</span>
        </p>
        <button className="secondary" onClick={logout}>
          Sign out
        </button>
      </aside>
      <main className="workspace">
        <header>
          <div>
            <p className="eyebrow">
              {auth.mode === "fixture"
                ? "Fixture installation · live effects disabled"
                : "Self-hosted installation"}
            </p>
            <h1>{panel}</h1>
          </div>
          <span className={`connection ${connected ? "connected" : ""}`}>
            {connected ? "Live connection" : "Reconnecting…"}
          </span>
        </header>
        {message && (
          <pre className="notice" role="status">
            {message}
          </pre>
        )}
        {!snapshot ? (
          <p>Loading current state…</p>
        ) : (
          <>
            {panel === "Control room" && (
              <>
                <div className="stats">
                  <article>
                    <span>Worker</span>
                    <strong>{snapshot.healthy ? "Running" : "Unavailable"}</strong>
                  </article>
                  <article>
                    <span>Kick</span>
                    <strong>{snapshot.kick.authorized ? "Authorized" : "Disconnected"}</strong>
                  </article>
                  <article>
                    <span>Media</span>
                    <strong>{snapshot.player.state}</strong>
                  </article>
                </div>
                <section>
                  <h2>Setup progress</h2>
                  <ul>
                    <li>Owner account claimed</li>
                    <li>
                      Kick:{" "}
                      {snapshot.kick.authorized
                        ? "authorized creator verified"
                        : "configure and authorize your app"}
                    </li>
                    <li>
                      Discord:{" "}
                      {snapshot.integrations.discord
                        ? "configured; live acceptance pending"
                        : "optional · not configured"}
                    </li>
                    <li>
                      YouTube:{" "}
                      {snapshot.integrations.youtube
                        ? "configured; metadata checked per request"
                        : "optional · not configured"}
                    </li>
                  </ul>
                </section>
                <section>
                  <h2>Recent activity</h2>
                  <Table
                    rows={snapshot.audit.slice(0, 12)}
                    columns={["action", "target", "outcome", "at"]}
                  />
                </section>
              </>
            )}
            {(kinds[panel] ?? []).map((kind) => (
              <section key={kind}>
                <div className="section-title">
                  <h2>
                    {kind === "settings"
                      ? "Instance settings"
                      : `${kind.charAt(0).toUpperCase()}${kind.slice(1)}s`}
                  </h2>
                  {(kind === "settings" || kind === "guild"
                    ? owner
                    : permitted(auth.actor, kind === "note" ? "moderate" : "configure")) && (
                    <button
                      disabled={busy}
                      onClick={() =>
                        setEditor({
                          kind,
                          document:
                            kind === "settings"
                              ? snapshot.documents.find((d) => d.id === "instance")
                              : undefined,
                        })
                      }
                    >
                      {kind === "settings" ? "Edit settings" : `Add ${kind}`}
                    </button>
                  )}
                </div>
                {editor?.kind === kind && (
                  <ConfigEditor
                    key={editor.document?.id ?? kind}
                    kind={kind}
                    document={editor.document}
                    cancel={() => setEditor(undefined)}
                    save={async (data) => {
                      await call("config.save", {
                        kind,
                        id: editor.document?.id,
                        version: editor.document?.version,
                        data,
                      });
                      setEditor(undefined);
                    }}
                  />
                )}
                <div className="cards">
                  {snapshot.documents
                    .filter((doc) => doc.kind === kind)
                    .map((doc) => (
                      <article key={doc.id}>
                        <h3>{String(doc.data.name)}</h3>
                        <span className="badge">
                          {text(
                            doc.data.enabled === false
                              ? "Disabled"
                              : (doc.data.type ?? doc.data.trigger ?? doc.data.event ?? "Enabled"),
                          )}
                        </span>
                        <p className="help">
                          ID: {doc.id} · Version {doc.version}
                        </p>
                        <p>{text(doc.data.template ?? doc.data.responses ?? "")}</p>
                        {kind === "goal" && (
                          <p>
                            {Number(doc.data.value)} / {Number(doc.data.target)}
                          </p>
                        )}
                        {kind === "poll" && (
                          <p>
                            {(doc.data.options as string[]).join(" · ")} · {String(doc.data.status)}
                          </p>
                        )}
                        {kind === "raffle" && (
                          <p>
                            {String(doc.data.status)} · {(doc.data.winners as string[]).length}{" "}
                            draws
                          </p>
                        )}
                        <div className="actions">
                          {(kind === "guild" || kind === "settings"
                            ? owner
                            : permitted(
                                auth.actor,
                                kind === "note" ? "moderate" : "configure",
                              )) && (
                            <>
                              <button
                                className="secondary"
                                onClick={() => setEditor({ kind, document: doc })}
                              >
                                Edit
                              </button>
                              {kind !== "settings" && (
                                <button
                                  className="secondary"
                                  onClick={() => {
                                    if (confirm(`Delete ${String(doc.data.name)}?`))
                                      void run("config.delete", {
                                        id: doc.id,
                                        version: doc.version,
                                      });
                                  }}
                                >
                                  Delete
                                </button>
                              )}
                            </>
                          )}
                          {["command", "timer"].includes(kind) &&
                            permitted(auth.actor, "configure") && (
                              <button
                                className="secondary"
                                onClick={() => run(`${kind}.preview`, { id: doc.id })}
                              >
                                Preview responses
                              </button>
                            )}
                          {kind === "widget" && owner && (
                            <button onClick={() => source(doc)}>Create OBS source URL</button>
                          )}
                          {["poll", "raffle"].includes(kind) &&
                            permitted(auth.actor, "engage") &&
                            doc.data.status === "open" && (
                              <button onClick={() => run("activity.close", { target: doc.id })}>
                                Close
                              </button>
                            )}
                          {kind === "raffle" &&
                            permitted(auth.actor, "engage") &&
                            doc.data.status !== "open" && (
                              <button
                                onClick={() =>
                                  run(
                                    doc.data.status === "drawn" ? "raffle.reroll" : "raffle.draw",
                                    { target: doc.id },
                                  )
                                }
                              >
                                {doc.data.status === "drawn" ? "Reroll" : "Draw winner"}
                              </button>
                            )}
                        </div>
                      </article>
                    ))}
                </div>
                {!snapshot.documents.some((doc) => doc.kind === kind) && (
                  <p className="empty">No {kind} configuration yet.</p>
                )}
              </section>
            ))}
            <ModulePanels
              panel={panel}
              snapshot={snapshot}
              auth={auth}
              run={run}
              busy={busy}
              message={setMessage}
              expired={() => {
                invalidateRequests();
                setMessage("");
                setAuth({ ...auth, actor: null });
                setSnapshot(undefined);
              }}
            />
          </>
        )}
      </main>
    </div>
  );
}
