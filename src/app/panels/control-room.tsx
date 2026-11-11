"use client";
import { auditSentence, statusLabel } from "../messages";
import { formatDuration, permitted, relative, text, useNow, type Row } from "../ui";
import { scopes } from "./cards";
import type { PanelProps } from "./types";

type Step = { label: string; done: boolean; detail: string; panel: string; optional?: boolean };
type Task = { label: string; detail: string; panel: string };

export default function ControlRoom({
  snapshot: s,
  auth,
  run,
  busy,
  navigate,
  confirm,
}: PanelProps) {
  const now = useNow(30000);
  const owner = auth.actor?.role === "owner";
  const has = (kind: string) => s.documents.some((doc) => doc.kind === kind);
  const live = s.stream?.live === "true";
  const started = Date.parse(s.stream?.startedAt ?? "");
  const current = s.media.find((row) => row.id === s.player.current);
  const jobs = Object.fromEntries(
    ((s.diagnostics.jobs as Row[]) ?? []).map((row) => [String(row.status), Number(row.count)]),
  );
  const heartbeat = Number(s.diagnostics.workerHeartbeat ?? 0);
  // Fixture installations simulate YouTube and Discord, so they never need those credentials.
  const fixture = s.mode === "fixture";
  const youtube = Boolean(s.integrations.youtube) || fixture;
  const discordReady = Boolean(s.integrations.discord) || fixture;
  const sourceIssued = (s.tokens ?? []).some((token) =>
    scopes(token).some((scope) => scope.startsWith("widget:")),
  );
  const steps: Step[] = [
    {
      label: "Connect Kick",
      done: Boolean(s.kick.authorized) || fixture,
      detail: s.kick.authorized
        ? `Connected as ${text(s.kick.authorizedUsername)}.`
        : fixture
          ? "Simulated in this fixture installation. A live installation connects a real channel."
          : "Save your Kick app settings, then authorize your channel.",
      panel: "Connections",
    },
    {
      label: "Add a chat command",
      done: has("command"),
      detail: "Try !welcome or !lurk. Preview it before you go live.",
      panel: "Commands",
    },
    {
      label: "Add an alert",
      done: has("alert"),
      detail: "Thank new followers and subscribers on stream.",
      panel: "Alerts",
    },
    {
      label: "Add an OBS source",
      done: has("widget") && (!owner || sourceIssued),
      detail: has("widget")
        ? "Create a private source URL and paste it into an OBS Browser Source."
        : "Create a widget such as alerts or chat, then add it to OBS.",
      panel: "Widgets",
    },
    {
      label: "Add a timer",
      done: has("timer"),
      detail: "A friendly reminder every 15 minutes or so.",
      panel: "Timers",
      optional: true,
    },
    {
      label: "Turn on media requests",
      done: Boolean(s.settings.mediaEnabled) && youtube,
      detail: youtube
        ? "Turn on media requests in Maintenance → Edit settings."
        : "Add a YouTube API key in Connections, then turn media on.",
      panel: youtube ? "Maintenance" : "Connections",
      optional: true,
    },
    {
      label: "Connect Discord",
      done: discordReady && has("guild"),
      detail: discordReady
        ? "Add your server under Connections → Discord servers, then register commands."
        : "Save your Discord app settings, then add your server. Posts go-live notices and lets mods act from Discord.",
      panel: "Connections",
      optional: true,
    },
    {
      label: "Invite a moderator",
      done: (s.accounts?.length ?? 0) > 1,
      detail: "Give a trusted person their own sign-in.",
      panel: "Accounts",
      optional: true,
    },
  ].filter((step) => owner || !["Connections", "Accounts"].includes(step.panel) || step.done);
  const required = steps.filter((step) => !step.optional);
  const doneCount = steps.filter((step) => step.done).length;
  const pendingMedia = s.media.filter((row) => row.status === "pending");
  const redemptions = s.pendingRedemptions.items;
  const uncertain = s.uncertainJobs.items;
  const canMedia = permitted(auth.actor, "media"),
    canEngage = permitted(auth.actor, "engage"),
    canOperate = permitted(auth.actor, "operate"),
    canModerate = permitted(auth.actor, "moderate"),
    // The setup checklist is about configuration; accounts that cannot configure see what
    // they can do instead. The server still checks every action.
    canConfigure = permitted(auth.actor, "configure");
  const tasks: Task[] = [
    ...(canMedia
      ? [
          {
            label: "Media requests",
            detail: "Approve, reject and reorder requests, and control the player.",
            panel: "Media",
          },
        ]
      : []),
    ...(canEngage
      ? [
          {
            label: "Rewards",
            detail: "Fulfil or refund redemptions and adjust a viewer's points.",
            panel: "Points & rewards",
          },
          {
            label: "Polls and raffles",
            detail: "Close a poll early, or draw and reroll raffle winners.",
            panel: "Polls & raffles",
          },
        ]
      : []),
    ...(canModerate
      ? [
          {
            label: "Moderation",
            detail:
              "Time out or ban viewers, test rules, keep private notes and pause automatic moderation.",
            panel: "Moderation",
          },
        ]
      : []),
    ...(canOperate
      ? [
          {
            label: "Timers",
            detail: "Pause or resume every timer at once.",
            panel: "Timers",
          },
          { label: "Alerts", detail: "Play a manual alert on stream.", panel: "Alerts" },
          { label: "Goals", detail: "Nudge a goal's progress up or down.", panel: "Goals" },
        ]
      : []),
    ...(permitted(auth.actor, "invite")
      ? [
          {
            label: "Accounts",
            detail: "Invite another operator to this installation.",
            panel: "Accounts",
          },
        ]
      : []),
  ];
  const refund = async (row: Row) => {
    if (await confirmRefund(confirm, row)) await run("reward.reject", { target: row.id });
  };
  const waiting = pendingMedia.length + redemptions.length + (owner ? uncertain.length : 0);
  return (
    <>
      <div className="stats" aria-label="Live status">
        <article>
          <span>Stream</span>
          <strong className={live ? "good" : undefined}>
            {live ? "Live" : s.stream?.live === "false" ? "Offline" : "Unknown"}
          </strong>
          <p className="help">
            {live && Number.isFinite(started)
              ? `Went live ${relative(started, now)}.`
              : live
                ? "Start time unavailable."
                : s.stream?.live === "false"
                  ? "KekBot will notice when you go live."
                  : "No stream status received from Kick yet."}
          </p>
        </article>
        <article>
          <span>Kick</span>
          <strong className={s.kick.authorized ? "good" : "warn"}>
            {s.kick.authorized ? "Connected" : "Not connected"}
          </strong>
          <p className="help">
            {s.kick.authorized
              ? `As ${text(s.kick.authorizedUsername)}.`
              : owner
                ? "Connect it in Connections."
                : "The owner connects Kick."}
          </p>
        </article>
        <article>
          <span>Media player</span>
          <strong className={s.player.error ? "warn" : undefined}>
            {s.player.error
              ? "Needs attention"
              : s.player.state === "playing"
                ? "Playing"
                : "Paused"}
          </strong>
          <p className="help">
            {current
              ? `#${text(current.position)} · ${text(current.title ?? "Untitled")} · ${formatDuration(current.duration)}`
              : s.settings.mediaEnabled
                ? "Nothing playing."
                : "Media requests are off."}
          </p>
        </article>
        <article>
          <span>Background work</span>
          <strong className={s.healthy ? "good" : "warn"}>
            {s.healthy ? "Running" : "Unavailable"}
          </strong>
          <p className="help">
            {jobs.pending || jobs.running
              ? `${(jobs.pending ?? 0) + (jobs.running ?? 0)} deliveries in progress. `
              : ""}
            {heartbeat ? `Last check ${relative(heartbeat, now)}.` : "No heartbeat recorded yet."}
          </p>
        </article>
      </div>

      <section aria-labelledby="pending-heading">
        <div className="section-title">
          <h2 id="pending-heading">Needs attention</h2>
          <span className={`badge ${waiting ? "warn" : "muted"}`}>
            {waiting ? `${waiting} waiting` : "All clear"}
          </span>
        </div>
        {!waiting && (
          <p className="empty">
            Nothing is waiting for you. New requests and redemptions show up here.
          </p>
        )}
        {pendingMedia.length > 0 && (
          <>
            <h3>Media requests to approve</h3>
            <ul className="work-list">
              {pendingMedia.slice(0, 5).map((item) => (
                <li key={String(item.id)}>
                  <span>
                    <strong>
                      #{text(item.position)} · {text(item.title ?? "Untitled")}
                    </strong>{" "}
                    · {text(item.requesterName ?? "unknown requester")} ·{" "}
                    {formatDuration(item.duration)}
                  </span>
                  {canMedia && (
                    <span className="actions">
                      <button
                        disabled={busy}
                        onClick={() =>
                          run("media.approve", { target: item.id, version: item.version })
                        }
                      >
                        Approve<span className="visually-hidden"> {text(item.title)}</span>
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() =>
                          run("media.reject", { target: item.id, version: item.version })
                        }
                      >
                        Reject<span className="visually-hidden"> {text(item.title)}</span>
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {!canMedia && <p className="help">A moderator or the owner approves media requests.</p>}
            {pendingMedia.length > 5 && (
              <button className="link" onClick={() => navigate("Media")}>
                See all {pendingMedia.length} in Media
              </button>
            )}
          </>
        )}
        {redemptions.length > 0 && (
          <>
            <h3>Rewards to fulfil</h3>
            <ul className="work-list">
              {redemptions.slice(0, 5).map((row) => (
                <li key={String(row.id)}>
                  <span>
                    <strong>{text(row.viewerName ?? "A viewer")}</strong> redeemed{" "}
                    <strong>{text(row.rewardName ?? "a reward")}</strong> ·{" "}
                    {Number(row.cost).toLocaleString()} points ·{" "}
                    {relative(Number(row.createdAt), now)}
                  </span>
                  {canEngage && (
                    <span className="actions">
                      <button
                        disabled={busy}
                        onClick={() => run("reward.complete", { target: row.id })}
                      >
                        Mark fulfilled
                        <span className="visually-hidden">
                          {" "}
                          {text(row.rewardName)} for {text(row.viewerName)}
                        </span>
                      </button>
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={() => void refund(row)}
                      >
                        Reject and refund
                        <span className="visually-hidden">
                          {" "}
                          {text(row.rewardName)} for {text(row.viewerName)}
                        </span>
                      </button>
                    </span>
                  )}
                </li>
              ))}
            </ul>
            {!canEngage && (
              <p className="help">A moderator or the owner fulfils or refunds redemptions.</p>
            )}
            {redemptions.length > 5 && (
              <button className="link" onClick={() => navigate("Points & rewards")}>
                See all waiting redemptions
              </button>
            )}
          </>
        )}
        {owner && uncertain.length > 0 && (
          <>
            <h3>Deliveries to check</h3>
            <p>
              KekBot could not confirm {uncertain.length === 50 ? "50 or more" : uncertain.length}{" "}
              provider deliveries. Check Kick or Discord, then record what happened. Nothing is
              resent automatically.
            </p>
            <button className="secondary" onClick={() => navigate("Maintenance")}>
              Review uncertain deliveries
            </button>
          </>
        )}
      </section>

      {canConfigure ? (
        <section aria-labelledby="setup-heading">
          <div className="section-title">
            <h2 id="setup-heading">Setup checklist</h2>
            <span className="badge muted">
              {/* "Claim this installation" is always shown and always done, so it counts too. */}
              {doneCount + 1} of {steps.length + 1} done
            </span>
          </div>
          {required.every((step) => step.done) && (
            <p className="help">
              {steps.every((step) => step.done)
                ? "Everything on this list is set up."
                : "The essentials are done. The remaining steps are optional."}
            </p>
          )}
          <ol className="checklist">
            <li className="done">
              <span className="check" aria-hidden="true">
                ✓
              </span>
              <span>
                <strong>Claim this installation</strong>
                <span className="visually-hidden"> (done)</span>
                <span className="help">Your owner account exists.</span>
              </span>
            </li>
            {steps.map((step) => (
              <li key={step.label} className={step.done ? "done" : undefined}>
                <span className="check" aria-hidden="true">
                  {step.done ? "✓" : ""}
                </span>
                <span>
                  <strong>{step.label}</strong>
                  {step.optional && <span className="badge muted">Optional</span>}
                  <span className="visually-hidden">{step.done ? " (done)" : " (not done)"}</span>
                  <span className="help">{step.detail}</span>
                </span>
                {(owner || !["Connections", "Accounts"].includes(step.panel)) && (
                  <button
                    className={step.done ? "secondary small" : "small"}
                    onClick={() => navigate(step.panel)}
                  >
                    {step.done ? "Review" : "Set up"}
                    <span className="visually-hidden"> {step.label.toLowerCase()}</span>
                  </button>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : (
        <section aria-labelledby="tasks-heading">
          <h2 id="tasks-heading">What you can do</h2>
          {tasks.length ? (
            <>
              <ul className="checklist tasks">
                {tasks.map((task) => (
                  <li key={task.label}>
                    <span>
                      <strong>{task.label}</strong>
                      <span className="help">{task.detail}</span>
                    </span>
                    <button className="secondary small" onClick={() => navigate(task.panel)}>
                      Open<span className="visually-hidden"> {task.panel}</span>
                    </button>
                  </li>
                ))}
              </ul>
              <p className="help">
                The owner sets up commands, alerts, widgets and connections. Ask them if something
                needs changing.
              </p>
            </>
          ) : (
            <p className="empty">
              Waiting requests and redemptions appear under Needs attention as they arrive, and
              Analytics shows how streams went. To approve requests or moderate chat, ask the owner
              for a moderator account.
            </p>
          )}
        </section>
      )}

      <section aria-labelledby="activity-heading">
        <h2 id="activity-heading">Recent activity</h2>
        {s.audit.length ? (
          <ul className="activity">
            {s.audit.slice(0, 15).map((row) => (
              <li key={String(row.id)}>
                <span>{auditSentence(row, auth.actor?.id)}</span>
                <time dateTime={new Date(Number(row.at)).toISOString()}>
                  {relative(Number(row.at), now)}
                </time>
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">
            Nothing has happened yet. Actions by you, your team and KekBot appear here.
          </p>
        )}
        {s.jobs.some((job) => job.status === "failed") && (
          <p className="help">
            Some deliveries failed recently ({statusLabel("failed").toLowerCase()}). Maintenance →
            Delivery outcomes shows why.
          </p>
        )}
      </section>
    </>
  );
}

/** "Reject and refund" is final: ask first, with Cancel focused. */
export function confirmRefund(confirm: PanelProps["confirm"], row: Row) {
  return confirm({
    title: "Reject and refund this redemption?",
    body: (
      <p>
        {text(row.viewerName ?? "The viewer")} gets {Number(row.cost).toLocaleString()} points back
        for {text(row.rewardName ?? "the reward")}. This cannot be undone.
      </p>
    ),
    confirm: "Reject and refund",
    danger: true,
  });
}
