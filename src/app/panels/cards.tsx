"use client";
import { useEffect, useRef, useState, type FormEvent } from "react";
import type { ConfigDocument, Kind } from "../../server/domain/catalog.ts";
import { eventLabels, statusLabel } from "../messages";
import {
  CopyField,
  Progress,
  formatTime,
  permitted,
  relative,
  useNow,
  type Row,
  type Snapshot,
} from "../ui";
import type { PanelProps } from "./types";

const titles: Record<Kind, string> = {
  command: "Commands",
  timer: "Timers",
  alert: "Alerts",
  widget: "Widgets",
  rule: "Automatic rules",
  goal: "Goals",
  reward: "Rewards",
  poll: "Polls",
  raffle: "Raffles",
  note: "Moderator notes",
  guild: "Discord servers",
  settings: "Instance settings",
};
export const kindTitle = (kind: Kind) => titles[kind];

export const widgetTypes: Record<string, string> = {
  alerts: "Alerts for follows, subscriptions and manual call-outs",
  chat: "Recent chat messages",
  player: "YouTube media player that plays approved requests",
  nowplaying: "Title and requester of the video playing now",
  queue: "Upcoming media requests",
  eventfeed: "Recent follows and subscriptions",
  supporter: "Your latest supporter",
  goal: "Progress bar for one goal",
  multigoal: "Progress bars for several goals",
  status: "Live status and viewer count",
  counter: "A command counter",
  leaderboard: "Top points balances",
  poll: "Live poll results",
  raffle: "Raffle status and winners",
  countdown: "Countdown to a time you choose",
  shoutout: "Your latest !so shout-out",
  socials: "Your social links from settings",
  activity: "Recent supporter activity",
};
const ruleTypes: Record<string, string> = {
  link: "Links",
  phrase: "Blocked phrases",
  repetition: "Repeated messages",
  caps: "Too many capitals",
  burst: "Message bursts",
};
export const actionLabels: Record<string, string> = {
  warn: "Warn",
  delete: "Delete message",
  timeout: "Time out",
  ban: "Ban",
};
const metrics: Record<string, string> = {
  manual: "Counted by hand",
  follow: "Counts new followers automatically",
  subscription: "Counts subscriptions automatically",
  points: "Counts points earned automatically",
  media: "Counts media requests automatically",
};

/** 600 → "10 min", 5400 → "1 h 30 min". */
export function interval(seconds: unknown) {
  const total = Number(seconds);
  if (total < 60) return `${total} s`;
  const h = Math.floor(total / 3600),
    m = Math.round((total % 3600) / 60);
  return [h && `${h} h`, m && `${m} min`].filter(Boolean).join(" ");
}
const quote = (value: unknown) => `“${String(value ?? "")}”`;
const list = (value: unknown) => (Array.isArray(value) ? (value as unknown[]) : []);
const onOff = (value: unknown) => (value ? "on" : "off");

export function cardSummary(kind: Kind, doc: ConfigDocument, snapshot: Snapshot) {
  const d = doc.data;
  switch (kind) {
    case "command": {
      const responses = list(d.responses);
      return `${d.trigger}${list(d.aliases).length ? ` (also ${list(d.aliases).join(", ")})` : ""} · ${quote(responses[0])}${responses.length > 1 ? ` and ${responses.length - 1} more` : ""}`;
    }
    case "timer":
      return `Every ${interval(d.interval)}${Number(d.minMessages) ? ` · needs ${d.minMessages} chat messages in between` : ""}${d.streamOnly ? " · only while live" : ""}${d.quietStart !== null && d.quietEnd !== null ? ` · quiet ${d.quietStart}:00–${d.quietEnd}:00 ${d.timezone}` : ""}`;
    case "alert":
      return `${eventLabels[String(d.event)] ?? d.event} · ${quote(d.template)} · ${d.duration} s`;
    case "widget":
      return `${widgetTypes[String(d.type)] ?? d.type} · ${d.theme} theme · ${d.width} × ${d.height}`;
    case "rule":
      return `${ruleTypes[String(d.type)] ?? d.type} · ${actionLabels[String(d.action)] ?? d.action}${d.action === "timeout" ? ` for ${d.duration} min` : ""}${d.escalation ? ` · escalates to ${String(actionLabels[String(d.escalationAction)] ?? d.escalationAction).toLowerCase()}` : ""}`;
    case "goal":
      return metrics[String(d.metric)] ?? String(d.metric);
    case "reward":
      return `${Number(d.cost).toLocaleString()} points · ${d.fulfillment === "alert" ? "shows an alert when fulfilled" : "fulfilled by a moderator"}${d.description ? ` · ${d.description}` : ""}`;
    case "poll":
      return `${list(d.options).length} options · viewers type !vote and a number`;
    case "raffle":
      return `Viewers type !enter${Number(d.minPoints) ? ` · needs ${d.minPoints} points` : ""}${list(d.roles).length ? ` · only ${list(d.roles).join(", ")}` : ""}`;
    case "note": {
      const viewer = snapshot.viewers.find((row) => row.id === d.viewer);
      return `About ${viewer ? String(viewer.name) : `Kick user ${d.viewer}`}: ${d.text}`;
    }
    case "guild":
      return `Server ${d.guildId} · channel ${d.channelId} · posts ${list(d.events).join(", ") || "nothing yet"} · ${list(d.roles).length + list(d.users).length} permission mappings`;
    case "settings":
      return `Channel name ${quote(d.name)} · media requests ${onOff(d.mediaEnabled)} · points ${onOff(d.pointsEnabled)} · timers ${d.timersPaused ? "paused" : "running"} · automatic moderation ${d.moderationPaused ? "paused" : "running"}`;
  }
}

type CardProps = PanelProps & { kind: Kind; doc: ConfigDocument };
export function CardBody(props: CardProps) {
  switch (props.kind) {
    case "goal":
      return <GoalControls {...props} />;
    case "timer":
      return <TimerStatus {...props} />;
    case "poll":
      return <PollResults {...props} />;
    case "raffle":
      return <RaffleResults {...props} />;
    case "widget":
      return <WidgetSource {...props} />;
    default:
      return null;
  }
}

function GoalControls({ doc, auth, run, busy, confirm }: CardProps) {
  const name = String(doc.data.name),
    value = Number(doc.data.value),
    target = Number(doc.data.target);
  const [delta, setDelta] = useState(""),
    [absolute, setAbsolute] = useState("");
  const adjust = (next: number) =>
    run("goal.adjust", {
      target: doc.id,
      version: doc.version,
      value: Math.max(0, Math.round(next)),
    });
  const submit = (event: FormEvent, next: number, reset: () => void) => {
    event.preventDefault();
    if (Number.isFinite(next)) void adjust(next).then((result) => result && reset());
  };
  return (
    <>
      <Progress value={value} max={target} label={`${name} progress`} />
      {Boolean(doc.data.completed) && <p className="badge success">Goal reached</p>}
      {permitted(auth.actor, "operate") && (
        <div className="goal-controls">
          <div className="actions">
            {[1, 5].map((step) => (
              <button key={step} disabled={busy} onClick={() => adjust(value + step)}>
                +{step}
                <span className="visually-hidden"> to {name}</span>
              </button>
            ))}
            <button
              className="secondary"
              disabled={busy || value === 0}
              onClick={async () => {
                if (
                  await confirm({
                    title: `Reset ${name} to 0?`,
                    body: <p>The bar starts again from zero. Completion is cleared.</p>,
                    confirm: "Reset goal",
                  })
                )
                  void adjust(0);
              }}
            >
              Reset<span className="visually-hidden"> {name}</span>
            </button>
          </div>
          <form
            className="inline"
            onSubmit={(event) => submit(event, value + Number(delta), () => setDelta(""))}
          >
            <label>
              Add or subtract
              <input
                type="number"
                step={1}
                required
                value={delta}
                placeholder="e.g. 10 or -3"
                onChange={(event) => setDelta(event.target.value)}
              />
            </label>
            <button className="secondary" disabled={busy}>
              Apply<span className="visually-hidden"> change to {name}</span>
            </button>
          </form>
          <form
            className="inline"
            onSubmit={(event) => submit(event, Number(absolute), () => setAbsolute(""))}
          >
            <label>
              Set exactly
              <input
                type="number"
                min={0}
                step={1}
                required
                value={absolute}
                onChange={(event) => setAbsolute(event.target.value)}
              />
            </label>
            <button className="secondary" disabled={busy}>
              Set<span className="visually-hidden"> {name}</span>
            </button>
          </form>
        </div>
      )}
    </>
  );
}

function inQuietHours(data: Row, now: number) {
  if (data.quietStart === null || data.quietEnd === null) return false;
  try {
    const hour = Number(
      new Intl.DateTimeFormat("en-GB", {
        hour: "numeric",
        hourCycle: "h23",
        timeZone: String(data.timezone),
      }).format(now),
    );
    const start = Number(data.quietStart),
      end = Number(data.quietEnd);
    return start < end ? hour >= start && hour < end : hour >= start || hour < end;
  } catch {
    return false;
  }
}

function TimerStatus({ doc, snapshot, auth, run, busy }: CardProps) {
  const now = useNow(15000);
  const schedule = snapshot.timers?.find((timer) => timer.id === doc.id);
  const enabled = doc.data.enabled !== false,
    name = String(doc.data.name);
  const live = snapshot.stream?.live === "true";
  const state = !enabled
    ? "Off. This timer will not post."
    : snapshot.settings.timersPaused
      ? "Paused, together with all timers."
      : doc.data.streamOnly && !live
        ? "Waiting for the stream to go live."
        : inQuietHours(doc.data, now)
          ? "In quiet hours. It will post again after them."
          : schedule?.next
            ? `Next send ${relative(schedule.next, now)} (${formatTime(schedule.next)})${schedule.waitingMessages ? `, once ${schedule.waitingMessages} more chat message${schedule.waitingMessages === 1 ? "" : "s"} arrive` : ""}.`
            : "Scheduled after the next background check.";
  return (
    <>
      <dl className="facts">
        <div>
          <dt>Status</dt>
          <dd>{state}</dd>
        </div>
        <div>
          <dt>Last sent</dt>
          <dd>
            {schedule?.lastSent
              ? `${formatTime(schedule.lastSent.at)} · ${statusLabel(schedule.lastSent.status)}`
              : "Not sent yet"}
          </dd>
        </div>
      </dl>
      {permitted(auth.actor, "configure") && (
        <button
          className="switch"
          role="switch"
          aria-checked={enabled}
          disabled={busy}
          onClick={() =>
            run(
              "config.save",
              {
                kind: "timer",
                id: doc.id,
                version: doc.version,
                data: { ...doc.data, enabled: !enabled },
              },
              { success: enabled ? `${name} turned off.` : `${name} turned on.` },
            )
          }
        >
          <span className="track" aria-hidden="true" />
          Timer on<span className="visually-hidden">: {name}</span>
        </button>
      )}
    </>
  );
}

function ClosesIn({ endsAt, open }: { endsAt: number; open: boolean }) {
  const now = useNow(1000);
  if (!open) return null;
  return endsAt > now ? (
    <span>
      closes {relative(endsAt, now)} ({formatTime(endsAt)})
    </span>
  ) : (
    <span>closing now</span>
  );
}

function PollResults({ doc, snapshot, auth, run, busy }: CardProps) {
  const options = list(doc.data.options).map(String),
    name = String(doc.data.name);
  const votes = options.map((_, index) =>
    Number(
      snapshot.activities.find(
        (row) => row.activity === doc.id && String(row.choice) === String(index + 1),
      )?.count ?? 0,
    ),
  );
  const total = votes.reduce((sum, count) => sum + count, 0),
    top = Math.max(...votes);
  const open = doc.data.status === "open";
  return (
    <>
      <p className="status-line">
        <span className={`badge ${open ? "live" : "muted"}`}>{statusLabel(doc.data.status)}</span>{" "}
        <ClosesIn endsAt={Number(doc.data.endsAt)} open={open} /> · {total} vote
        {total === 1 ? "" : "s"}
      </p>
      <ol className="results" aria-label={`${name} results`}>
        {options.map((option, index) => {
          const percent = total ? Math.round((votes[index] / total) * 100) : 0;
          return (
            <li key={index} className={total && votes[index] === top ? "leading" : undefined}>
              <span className="result-label">
                <strong>!vote {index + 1}</strong> {option}
              </span>
              <span className="bar" aria-hidden="true">
                <span style={{ width: `${percent}%` }} />
              </span>
              <span className="result-value">
                {percent}% · {votes[index]}
              </span>
            </li>
          );
        })}
      </ol>
      {!open && total > 0 && (
        <p>
          <strong>Result:</strong>{" "}
          {options.filter((_, index) => votes[index] === top).join(" and ")}
          {votes.filter((count) => count === top).length > 1 ? " (tie)" : ""}
        </p>
      )}
      {open && permitted(auth.actor, "engage") && (
        <div className="actions">
          <button disabled={busy} onClick={() => run("activity.close", { target: doc.id })}>
            Close poll<span className="visually-hidden"> {name}</span>
          </button>
        </div>
      )}
    </>
  );
}

function RaffleResults({ doc, snapshot, auth, run, busy }: CardProps) {
  const name = String(doc.data.name),
    status = String(doc.data.status);
  const entries = Number(
    snapshot.activities.find((row) => row.activity === doc.id && row.choice === "entry")?.count ??
      0,
  );
  const winners = (snapshot.raffleWinners ?? []).filter((row) => row.raffle === doc.id);
  const canRun = permitted(auth.actor, "engage");
  return (
    <>
      <p className="status-line">
        <span className={`badge ${status === "open" ? "live" : "muted"}`}>
          {statusLabel(status)}
        </span>{" "}
        <ClosesIn endsAt={Number(doc.data.endsAt)} open={status === "open"} /> · {entries}{" "}
        {entries === 1 ? "entry" : "entries"}
      </p>
      {winners.length > 0 && (
        <div>
          <strong>{winners.length === 1 ? "Winner" : "Winners (latest last)"}</strong>
          <ol className="winners">
            {winners.map((winner) => (
              <li key={winner.viewer}>{winner.name ?? "Viewer name unavailable"}</li>
            ))}
          </ol>
        </div>
      )}
      {canRun && (
        <div className="actions">
          {status === "open" && (
            <button disabled={busy} onClick={() => run("activity.close", { target: doc.id })}>
              Close entries<span className="visually-hidden"> for {name}</span>
            </button>
          )}
          {status === "closed" && (
            <button
              disabled={busy || entries === 0}
              onClick={() => run("raffle.draw", { target: doc.id })}
            >
              Draw winner<span className="visually-hidden"> for {name}</span>
            </button>
          )}
          {status === "drawn" && (
            <button
              className="secondary"
              disabled={busy}
              onClick={() => run("raffle.reroll", { target: doc.id })}
            >
              Reroll<span className="visually-hidden"> {name}</span>
            </button>
          )}
        </div>
      )}
      {canRun && status === "closed" && entries === 0 && (
        <p className="help">Nobody entered, so there is nobody to draw.</p>
      )}
    </>
  );
}

/** Shows the source at its real OBS size, scaled down to the card width. */
function ScaledPreview({
  src,
  title,
  width,
  height,
}: {
  src: string;
  title: string;
  width: number;
  height: number;
}) {
  const box = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(0);
  useEffect(() => {
    const element = box.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) =>
      setScale(Math.min(1, entry.contentRect.width / width)),
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [width]);
  return (
    <div
      ref={box}
      className="preview-box"
      style={{
        height: scale ? height * scale : undefined,
        aspectRatio: scale ? undefined : `${width} / ${height}`,
      }}
    >
      <iframe
        src={src}
        title={title}
        width={width}
        height={height}
        referrerPolicy="no-referrer"
        style={{ transform: `scale(${scale || 1})` }}
      />
    </div>
  );
}

export function scopes(token: Row) {
  try {
    return JSON.parse(String(token.scopes)) as string[];
  } catch {
    return [];
  }
}

function WidgetSource({ doc, snapshot, auth, run, busy, confirm }: CardProps) {
  const [urls, setUrls] = useState<{ display: string; readId: string; player?: string }>();
  const owner = auth.actor?.role === "owner";
  const name = String(doc.data.name),
    type = String(doc.data.type);
  const width = Number(doc.data.width),
    height = Number(doc.data.height);
  const tokens = (snapshot.tokens ?? []).filter((token) =>
    scopes(token).includes(`widget:${doc.id}`),
  );
  const label = name.slice(0, 70);
  /** Issues the separate playback credential for a display URL that already exists. */
  async function addPlayer(display: string, readId: string) {
    const player = await run(
      "token.create",
      { kind: "player", name: `${label} player`, scopes: [`widget:${doc.id}`] },
      { quiet: true },
    );
    setUrls({
      display,
      readId,
      player: player ? `${display}#player=${encodeURIComponent(String(player.token))}` : undefined,
    });
  }
  async function create() {
    const read = await run(
      "token.create",
      { kind: "widget", name: `${label} read`, scopes: [`widget:${doc.id}`] },
      { quiet: true },
    );
    if (!read) return;
    const display = `${location.origin}/widgets/${doc.id}?token=${encodeURIComponent(String(read.token))}`;
    if (type !== "player") return setUrls({ display, readId: String(read.id) });
    await addPlayer(display, String(read.id));
  }
  if (!owner) return null;
  return (
    <>
      <p className="help">
        OBS Browser Source size: width <strong>{width}</strong>, height <strong>{height}</strong>.
      </p>
      {urls ? (
        <div className="source-result">
          <p>
            <strong>Copy this private URL into OBS now. It is shown only once.</strong> Anyone with
            it can show this overlay. If it leaks, revoke it below and create a new one.
          </p>
          {type === "player" ? (
            <>
              {urls.player ? (
                <CopyField
                  label="OBS player source URL"
                  value={urls.player}
                  help="Use this one in OBS. The part after #player= is a separate playback credential, so this source can play and advance requests."
                />
              ) : (
                <div className="problem" role="alert">
                  <p>
                    <strong>The playback credential was not created.</strong> Only the display-only
                    URL below exists, and it cannot play requests. Try again, or revoke the display
                    URL so it is not left unused.
                  </p>
                  <div className="actions">
                    <button disabled={busy} onClick={() => addPlayer(urls.display, urls.readId)}>
                      Try again
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={async () => {
                        if (await run("token.revoke", { id: urls.readId })) setUrls(undefined);
                      }}
                    >
                      Revoke display URL
                    </button>
                  </div>
                </div>
              )}
              <CopyField
                label="Display-only URL"
                value={urls.display}
                help="Shows the player without playback control. It cannot play or skip anything."
              />
              <p className="help">
                No dashboard preview for players: it could play audio twice. Check it in OBS.
              </p>
            </>
          ) : (
            <>
              <CopyField label="OBS source URL" value={urls.display} />
              <figure className="preview">
                <ScaledPreview
                  src={urls.display}
                  title={`Live preview of ${name}`}
                  width={width}
                  height={height}
                />
                <figcaption className="help">
                  Live preview. A transparent background is normal: OBS shows your scene behind it.
                </figcaption>
              </figure>
            </>
          )}
          <button className="secondary" onClick={() => setUrls(undefined)}>
            Hide URL
          </button>
        </div>
      ) : (
        <div className="actions">
          <button disabled={busy || doc.data.enabled === false} onClick={create}>
            Create OBS source URL<span className="visually-hidden"> for {name}</span>
          </button>
        </div>
      )}
      {doc.data.enabled === false && (
        <p className="help">Turn this widget on before creating a source.</p>
      )}
      {tokens.length > 0 && (
        <div className="token-list">
          <h4>Source URLs issued</h4>
          <ul>
            {tokens.map((token) => (
              <li key={String(token.id)}>
                <span>
                  {token.kind === "player" ? "Playback credential" : "Display URL"} · created{" "}
                  {relative(Number(token.created_at))}
                </span>
                <button
                  className="secondary small"
                  disabled={busy}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: "Revoke this source URL?",
                        body: (
                          <p>
                            OBS sources that use it stop updating straight away. This cannot be
                            undone.
                          </p>
                        ),
                        confirm: "Revoke",
                        danger: true,
                      })
                    )
                      void run("token.revoke", { id: token.id });
                  }}
                >
                  Revoke<span className="visually-hidden"> {String(token.name)}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
