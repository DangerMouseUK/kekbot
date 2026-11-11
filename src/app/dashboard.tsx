"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import type { Kind, ConfigDocument } from "../server/domain/catalog.ts";
import {
  ControlError,
  humanize,
  permitted,
  relative,
  text,
  useConfirm,
  type Notice,
  type Row,
  type Run,
  type Snapshot,
  type Session,
} from "./ui";
import {
  describeError,
  errorText,
  isConflict,
  roleLabel,
  statusLabel,
  successText,
} from "./messages";
import { CardBody, cardSummary, kindTitle } from "./panels/cards";
const ConfigEditor = dynamic(() => import("./config-editor"));
const ModulePanels = dynamic(() => import("./module-panels"));
const ControlRoom = dynamic(() => import("./panels/control-room"));
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
// Panels whose live controls matter more than their saved configuration.
const controlsFirst = [
  "Connections",
  "Timers",
  "Moderation",
  "Points & rewards",
  "Polls & raffles",
];
const intros: Record<string, string> = {
  "Control room": "What needs attention now, live status, and what to set up next.",
  Connections: "Connect Kick, Discord and YouTube. Only the owner sees this page.",
  Commands:
    "Your own chat commands, such as !welcome. Built-in replies like !discord and !rules are set in Maintenance → Edit settings.",
  Timers: "Messages KekBot posts in chat on a schedule while you stream.",
  Alerts: "On-stream alerts for follows, subscriptions and manual call-outs.",
  Media: "YouTube requests from chat: approve them, put them in order and control playback.",
  Moderation: "Act on chat, review what happened and set up automatic rules.",
  Goals: "Progress bars for follows, subscriptions, points or anything you count by hand.",
  "Points & rewards": "Viewer points, rewards viewers can redeem, and redemptions waiting for you.",
  "Polls & raffles": "Start a poll or raffle in seconds and follow the results live.",
  Widgets: "Overlays for OBS. Create a private source URL and add it as a Browser Source.",
  Analytics: "Observed stream history and trends.",
  Accounts: "Invite moderators and manage who can sign in.",
  Maintenance: "Instance settings, delivery problems, exports and host maintenance.",
};
const addLabels: Partial<Record<Kind, string>> = { guild: "Add Discord server" };

/** Explain a version conflict by comparing the snapshot before and after the refresh. */
function describeChange(
  before: Snapshot | undefined,
  after: Snapshot | undefined,
  action: string,
  input: Row,
) {
  if (!before || !after) return undefined;
  const id = String(input.target ?? input.id ?? "");
  if (action.startsWith("player.")) {
    const changes = [
      before.player.state !== after.player.state && `the player is now ${after.player.state}`,
      before.player.current !== after.player.current && "a different video is current",
      before.player.volume !== after.player.volume && `the volume is now ${after.player.volume}%`,
    ].filter(Boolean);
    return changes.length ? `What changed: ${changes.join(", ")}.` : undefined;
  }
  if (action === "media.reorder")
    return `What changed: the queue now has ${after.media.filter((row) => row.status === "approved").length} approved requests.`;
  if (action.startsWith("media.")) {
    const was = before.media.find((row) => row.id === id),
      now = after.media.find((row) => row.id === id);
    if (was && !now)
      return "What changed: this request has left the active queue. Media history shows it.";
    if (was && now && was.status !== now.status)
      return `What changed: this request is now ${statusLabel(now.status).toLowerCase()}.`;
    return undefined;
  }
  const was = before.documents.find((doc) => doc.id === id),
    now = after.documents.find((doc) => doc.id === id);
  if (was && !now) return "What changed: it has been deleted.";
  if (!was || !now) return undefined;
  const keys = Object.keys({ ...was.data, ...now.data }).filter(
    (key) => JSON.stringify(was.data[key]) !== JSON.stringify(now.data[key]),
  );
  if (!keys.length) return undefined;
  const parts = keys
    .slice(0, 4)
    .map((key) =>
      typeof now.data[key] === "object" && now.data[key] !== null
        ? `${humanize(key)} changed`
        : `${humanize(key)} is now ${text(now.data[key])}`,
    );
  return `What changed: ${parts.join("; ")}${keys.length > 4 ? "…" : ""}.`;
}

export default function Dashboard() {
  const authEpoch = useRef(0);
  const invalidateRequests = useCallback(() => {
    authEpoch.current++;
  }, []);
  const [auth, setAuth] = useState<Session>(),
    [snapshot, setSnapshot] = useState<Snapshot>();
  const snapshotRef = useRef<Snapshot | undefined>(undefined);
  const [selectedPanel, setPanel] = useState("Control room"),
    [editor, setEditor] = useState<{ kind: Kind; document?: ConfigDocument }>();
  const [notice, setNotice] = useState<Notice>(),
    [message, setMessage] = useState(""),
    [connected, setConnected] = useState(false),
    [busy, setBusy] = useState(false),
    [loginMode, setLoginMode] = useState("login");
  const [confirmDialog, confirm] = useConfirm();
  const workspace = useRef<HTMLElement>(null);
  const refresh = useCallback(async () => {
    const epoch = authEpoch.current;
    const response = await fetch("/api/control", { cache: "no-store" });
    if (epoch !== authEpoch.current) return undefined;
    if (response.status === 401) {
      authEpoch.current++;
      snapshotRef.current = undefined;
      setSnapshot(undefined);
      setNotice(undefined);
      setAuth((previous) => (previous ? { ...previous, actor: null } : previous));
      return undefined;
    }
    const data = await response.json();
    if (epoch !== authEpoch.current) return undefined;
    if (response.ok) {
      snapshotRef.current = data;
      setSnapshot(data);
      return data as Snapshot;
    }
    setNotice({ tone: "error", text: errorText(String(data.error ?? "runtime_unavailable")) });
    return undefined;
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
              snapshotRef.current = undefined;
              setSnapshot(undefined);
              setNotice(undefined);
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
  useEffect(() => {
    // On phones the panel list scrolls sideways; keep the current panel visible.
    document
      .querySelector("nav [aria-current=page]")
      ?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selectedPanel]);
  useEffect(() => {
    if (notice?.tone !== "success") return;
    const timer = setTimeout(
      () => setNotice((current) => (current === notice ? undefined : current)),
      10000,
    );
    return () => clearTimeout(timer);
  }, [notice]);
  async function call(action: string, input: Row = {}) {
    const epoch = authEpoch.current;
    let response: Response;
    try {
      response = await fetch("/api/control", {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-CSRF-Token": auth?.csrf ?? "" },
        body: JSON.stringify({ action, input }),
      });
    } catch {
      throw new ControlError("runtime_unavailable", [], 503);
    }
    const data = await response.json().catch(() => ({}));
    if (epoch !== authEpoch.current)
      throw new Error("Your session changed, so this result was discarded.");
    if (!response.ok) {
      const error = new ControlError(
        String(data.error ?? "configuration_or_storage_error"),
        Array.isArray(data.fields) ? data.fields : [],
        response.status,
      );
      // A conflict means someone else changed it: show the newer state straight away.
      if (isConflict(error.code) || response.status === 401) await refresh();
      throw error;
    }
    await refresh();
    if (epoch !== authEpoch.current)
      throw new Error("Your session changed, so this result was discarded.");
    return data;
  }
  const run: Run = async (action, input = {}, options = {}) => {
    setBusy(true);
    if (!options.quiet) setNotice(undefined);
    const before = snapshotRef.current;
    try {
      const result = (await call(action, input)) as Row;
      if (!options.quiet)
        setNotice({
          tone: "success",
          text:
            typeof options.success === "function"
              ? options.success(result)
              : (options.success ?? successText(action, result)),
        });
      return result;
    } catch (error) {
      const detail =
        error instanceof ControlError && isConflict(error.code)
          ? describeChange(before, snapshotRef.current, action, input)
          : undefined;
      setNotice({ tone: "error", text: errorText(error), detail });
      return undefined;
    } finally {
      setBusy(false);
    }
  };
  /** Panels pass raw API codes or plain sentences; codes become plain English. */
  const showMessage = useCallback((value: string) => {
    if (!value) return setNotice(undefined);
    if (/^[a-z][a-z0-9]*(?:_[a-z0-9]+)+$/.test(value)) {
      const { title, next } = describeError(value);
      return setNotice({ tone: "error", text: next ? `${title} ${next}` : title });
    }
    setNotice({ tone: "info", text: value });
  }, []);
  const expired = useCallback(() => {
    invalidateRequests();
    setNotice(undefined);
    snapshotRef.current = undefined;
    setAuth((previous) => (previous ? { ...previous, actor: null } : previous));
    setSnapshot(undefined);
  }, [invalidateRequests]);
  function navigate(name: string) {
    setPanel(name);
    setEditor(undefined);
    setNotice(undefined);
    workspace.current?.focus();
  }
  async function logout() {
    authEpoch.current++;
    setNotice(undefined);
    await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-CSRF-Token": auth?.csrf ?? "" },
      body: JSON.stringify({ action: "logout" }),
    });
    setAuth((previous) => (previous ? { ...previous, actor: null } : previous));
    snapshotRef.current = undefined;
    setSnapshot(undefined);
    setNotice(undefined);
    // The next person to sign in may have fewer panels: start them in the Control room.
    setPanel("Control room");
    setEditor(undefined);
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
        {!auth.claimed && <SetupTokenHelp />}
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
              if (!response.ok) throw new ControlError(String(result.error), result.fields ?? []);
              setAuth(await (await fetch("/api/auth", { cache: "no-store" })).json());
              setMessage("");
            } catch (error) {
              setMessage(errorText(error, "Sign-in failed. Try again."));
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
        <p className="help">
          {!auth.claimed || loginMode === "invite"
            ? "Choose a password of at least 12 characters. Recovery requires host access."
            : "Forgot your password? Ask the owner for a new invitation. Owner recovery needs host access."}
        </p>
      </main>
    );
  const owner = auth.actor.role === "owner";
  const visiblePanels = panels.filter(
    (name) =>
      owner ||
      (name === "Accounts" && permitted(auth.actor, "invite")) ||
      !["Accounts", "Connections"].includes(name),
  );
  // A panel chosen in an earlier session may be hidden from this account.
  const panel = visiblePanels.includes(selectedPanel) ? selectedPanel : "Control room";
  const counts: Record<string, number> = snapshot
    ? {
        Media: snapshot.media.filter((row) => row.status === "pending").length,
        "Points & rewards": snapshot.pendingRedemptions.items.length,
        Maintenance: owner ? snapshot.uncertainJobs.items.length : 0,
      }
    : {};
  const canEdit = (kind: Kind) =>
    kind === "settings" || kind === "guild"
      ? owner
      : permitted(auth.actor, kind === "note" ? "moderate" : "configure");
  const panelProps = {
    snapshot: snapshot!,
    auth,
    run,
    busy,
    message: showMessage,
    expired,
    navigate,
    confirm,
  };
  const modules = snapshot && <ModulePanels panel={panel} {...panelProps} />;
  return (
    <div className="app-shell">
      <a className="skip-link" href="#workspace">
        Skip to main content
      </a>
      <aside>
        <div className="aside-top">
          <Link className="brand" href="/">
            KekBot<span>Creator toolkit</span>
          </Link>
          <div className="who">
            <p className="identity">
              {auth.actor.username}
              <span>{roleLabel(auth.actor.role)}</span>
            </p>
            <button className="secondary small" onClick={logout}>
              Sign out
            </button>
          </div>
        </div>
        <nav aria-label="Main navigation">
          {visiblePanels.map((name) => (
            <button
              key={name}
              aria-current={panel === name ? "page" : undefined}
              aria-describedby={counts[name] ? `count-${name.replace(/\W/g, "")}` : undefined}
              onClick={() => navigate(name)}
            >
              {name}
              {counts[name] > 0 && (
                <span className="count" aria-hidden="true">
                  {counts[name] >= 50 ? "50+" : counts[name]}
                </span>
              )}
            </button>
          ))}
          {/* Descriptions live outside the buttons so each button's name stays the panel name. */}
          {Object.entries(counts)
            .filter(([, count]) => count > 0)
            .map(([name, count]) => (
              <span key={name} id={`count-${name.replace(/\W/g, "")}`} className="visually-hidden">
                {count >= 50 ? "50 or more" : count} waiting
              </span>
            ))}
        </nav>
      </aside>
      <main className="workspace" id="workspace" ref={workspace} tabIndex={-1}>
        <header>
          <div>
            <p className="eyebrow">
              {auth.mode === "fixture"
                ? "Fixture installation · live effects disabled"
                : "Self-hosted installation"}
            </p>
            <h1>{panel}</h1>
            <p className="intro">
              {panel === "Control room" && !permitted(auth.actor, "configure")
                ? "What needs attention now, live status, and what your account can do."
                : intros[panel]}
            </p>
            {auth.actor.role === "readonly" && (
              <p className="help">
                You have read-only access: you can look at everything here but not change it.
              </p>
            )}
          </div>
          <span
            className={`connection ${connected ? "connected" : ""}`}
            title="Whether this page is receiving live updates from KekBot"
          >
            {connected ? "Page updating live" : "Reconnecting…"}
          </span>
        </header>
        {notice && (
          <div
            className={`notice ${notice.tone}`}
            role={notice.tone === "error" ? "alert" : "status"}
          >
            <div>
              <p>{notice.text}</p>
              {notice.detail && <p className="help">{notice.detail}</p>}
            </div>
            <button className="secondary small" onClick={() => setNotice(undefined)}>
              Dismiss<span className="visually-hidden"> message</span>
            </button>
          </div>
        )}
        {confirmDialog}
        {!snapshot ? (
          <p>Loading current state…</p>
        ) : (
          <>
            {panel === "Control room" && <ControlRoom {...panelProps} />}
            {controlsFirst.includes(panel) && modules}
            {(kinds[panel] ?? []).map((kind) => (
              <section key={kind}>
                <div className="section-title">
                  <h2>{kindTitle(kind)}</h2>
                  {canEdit(kind) && (
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
                      {kind === "settings" ? "Edit settings" : (addLabels[kind] ?? `Add ${kind}`)}
                    </button>
                  )}
                </div>
                {editor?.kind === kind && (
                  <ConfigEditor
                    key={editor.document?.id ?? kind}
                    kind={kind}
                    document={editor.document}
                    snapshot={snapshot}
                    cancel={() => setEditor(undefined)}
                    save={async (data, options) => {
                      await call("config.save", {
                        kind,
                        id: editor.document?.id,
                        // The editor passes the version it loaded, which changes after a
                        // conflict reload; the optimistic check itself stays server-side.
                        version: options ? options.version : editor.document?.version,
                        data,
                      });
                      setEditor(undefined);
                    }}
                  />
                )}
                <div className="cards">
                  {snapshot.documents
                    .filter((doc) => doc.kind === kind)
                    .sort(
                      (a, b) =>
                        Number(b.data.status === "open") - Number(a.data.status === "open") ||
                        b.updatedAt - a.updatedAt,
                    )
                    .map((doc) => (
                      <article
                        key={doc.id}
                        className={doc.data.enabled === false ? "card off" : "card"}
                      >
                        <div className="card-head">
                          <h3>
                            {kind === "settings" ? "Instance settings" : String(doc.data.name)}
                          </h3>
                          {doc.data.enabled === false && <span className="badge muted">Off</span>}
                        </div>
                        <p className="summary">{cardSummary(kind, doc, snapshot)}</p>
                        <CardBody kind={kind} doc={doc} {...panelProps} />
                        <div className="actions">
                          {canEdit(kind) && (
                            <>
                              <button
                                className="secondary"
                                aria-label={`Edit ${kind === "settings" ? "settings" : String(doc.data.name)}`}
                                onClick={() => setEditor({ kind, document: doc })}
                              >
                                Edit
                              </button>
                              {kind !== "settings" && (
                                <button
                                  className="secondary"
                                  aria-label={`Delete ${String(doc.data.name)}`}
                                  onClick={async () => {
                                    if (
                                      await confirm({
                                        title: `Delete ${String(doc.data.name)}?`,
                                        body: (
                                          <p>
                                            This cannot be undone. Widgets that point at it will
                                            show nothing. To stop it for now, edit it and turn it
                                            off instead.
                                          </p>
                                        ),
                                        confirm: "Delete",
                                        danger: true,
                                      })
                                    )
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
                                aria-label={`Preview responses for ${String(doc.data.name)}`}
                                onClick={() =>
                                  run(
                                    `${kind}.preview`,
                                    { id: doc.id },
                                    {
                                      success: (result) =>
                                        `Preview (nothing was sent): ${(
                                          (result.responses as string[]) ?? []
                                        ).join(" / ")}`,
                                    },
                                  )
                                }
                              >
                                Preview responses
                              </button>
                            )}
                        </div>
                        {kind !== "settings" && (
                          <details className="tech">
                            <summary>
                              Details
                              <span className="visually-hidden"> for {String(doc.data.name)}</span>
                            </summary>
                            <p className="help">
                              Reference ID <code>{doc.id}</code> · updated {relative(doc.updatedAt)}
                            </p>
                          </details>
                        )}
                      </article>
                    ))}
                </div>
                {!snapshot.documents.some((doc) => doc.kind === kind) && (
                  <p className="empty">
                    {/* "Discord" is a name and keeps its capital. */}
                    No {kind === "guild" ? kindTitle(kind) : kindTitle(kind).toLowerCase()} yet.
                    {canEdit(kind) && kind !== "settings"
                      ? ` Select “${addLabels[kind] ?? `Add ${kind}`}” to create one.`
                      : ""}
                  </p>
                )}
              </section>
            ))}
            {!controlsFirst.includes(panel) && modules}
          </>
        )}
      </main>
    </div>
  );
}

/**
 * Where the one-hour setup token lives for each install path. Paths and commands follow
 * docs/GETTING_STARTED.md, docs/INSTALLATION.md and docs/QUICKSTART.md; the screen never
 * shows the token or this host's real paths.
 */
function SetupTokenHelp() {
  return (
    <>
      <p>
        Your setup token is in a private file on the computer that runs KekBot. Read it there, paste
        it below and choose your owner login. It expires one hour after it was created.
      </p>
      <details className="claim-help">
        <summary>Where is my setup token?</summary>
        <dl>
          <dt>KekBot installer or launcher</dt>
          <dd>
            The installer&apos;s final message shows the file&apos;s path. For a default live
            install, run <code>sudo cat /srv/kekbot/data/live/secrets/setup.token</code> on the
            server.
          </dd>
          <dt>Docker Compose set up by hand</dt>
          <dd>
            The <code>node src/cli.ts init</code> step you ran in the container prints the path. The
            usual host location is <code>/srv/kekbot/data/live/secrets/setup.token</code>.
          </dd>
          <dt>Running from source with pnpm</dt>
          <dd>
            Run <code>pnpm kekbot init</code> in the checkout, then open{" "}
            <code>data/live/secrets/setup.token</code> (or <code>data/fixture/…</code> for a
            fixture).
          </dd>
        </dl>
        <p>
          Token expired? Stop KekBot, run the same <code>init</code> step again, then start it.{" "}
          <a
            href="https://github.com/DangerMouseUK/kekbot/blob/main/docs/ACCOUNTS.md#claim-the-installation"
            target="_blank"
            rel="noreferrer"
          >
            Owner setup guide
          </a>
        </p>
      </details>
    </>
  );
}
