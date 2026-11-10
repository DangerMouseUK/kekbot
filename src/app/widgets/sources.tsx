"use client";
// Renderers for every OBS source type. All provider and configuration values render as React text nodes; no source
// accepts markup, custom CSS or script. Timed content compares against `now`, the server-adjusted clock.
import { useEffect, useState, type ComponentProps, type ReactNode } from "react";
import dynamic from "next/dynamic";
import Image from "next/image";
import type { WidgetConfig } from "./[id]/widget";
import {
  alertKicker, chatFade, chatRoleOf, formatCountdown, formatDuration, formatElapsed, formatNumber, goalProgress, pollRows,
  relativeTime, roleBadge, rotation, rowKeys, socialLines, socialPlatform, splitHighlight, supportKind, supportLabel, timedPhase, type SupportKind
} from "./format.ts";
const Player = dynamic(() => import("./[id]/player"));

type Row = Record<string, unknown>;
type Props = { widget: string; config: WidgetConfig; data: unknown; now: number; asset: (name: string) => string };
const str = (value: unknown, fallback = "") => (value === null || value === undefined || typeof value === "object" ? fallback : String(value));

function Title({ config, children }: { config: WidgetConfig; children: ReactNode }) {
  return config.showTitle ? <h2 className="w-title">{config.title || children}</h2> : null;
}
function Empty({ config, children }: { config: WidgetConfig; children: ReactNode }) {
  return config.showEmpty ? <p className="w-panel w-empty">{children}</p> : null;
}

const iconPaths: Record<SupportKind | "eye" | "clock" | "trophy", string> = {
  follow: "M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.7 4.5c2.1 0 3.6 1.1 5.3 3 1.7-1.9 3.2-3 5.3-3 3.7 0 5.8 3.9 4.3 7.3C19.5 16.4 12 21 12 21z",
  subscription: "M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z",
  gift: "M4 10h16v11H4zM3 6.5h18V10H3zM11 6.5h2V21h-2zM12 6.5C10 3 6.5 3 6.5 5c0 1.5 2.5 1.5 5.5 1.5zm0 0c2-3.5 5.5-3.5 5.5-1.5 0 1.5-2.5 1.5-5.5 1.5z",
  support: "M12 2l2.4 7.6H22l-6.2 4.5 2.4 7.4L12 17l-6.2 4.5 2.4-7.4L2 9.6h7.6z",
  eye: "M12 5C6.5 5 2.7 9.2 1.5 12c1.2 2.8 5 7 10.5 7s9.3-4.2 10.5-7C21.3 9.2 17.5 5 12 5zm0 11a4 4 0 110-8 4 4 0 010 8z",
  clock: "M12 2a10 10 0 100 20 10 10 0 000-20zm1 10.4l4 2.4-1 1.7-5-3V6h2z",
  trophy: "M7 3h10v2h4v3a5 5 0 01-5 5h-.3A5 5 0 0113 15.9V18h3v3H8v-3h3v-2.1A5 5 0 018.3 13H8a5 5 0 01-5-5V5h4zm0 4H5v1a3 3 0 002 2.8zm10 0v3.8A3 3 0 0019 8V7z"
};
function Icon({ name }: { name: keyof typeof iconPaths }) {
  return <svg className={`w-icon w-icon-${name}`} viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d={iconPaths[name]} /></svg>;
}

export function Source({ widget, config, data, now, asset }: Props) {
  const rows = Array.isArray(data) ? (data as Row[]) : [];
  const value = data && typeof data === "object" && !Array.isArray(data) ? (data as Row) : null;
  switch (config.type) {
    case "player": return value ? <Player widget={widget} config={config} item={value.current as ComponentProps<typeof Player>["item"]} state={value.player as ComponentProps<typeof Player>["state"]} fixture={Boolean(value.fixture)} /> : null;
    case "alerts": return value ? <AlertCard key={str(value.id)} alert={value} config={config} now={now} asset={asset} /> : null;
    case "chat": return <Chat rows={rows} config={config} now={now} />;
    case "nowplaying": return <NowPlaying value={value} config={config} />;
    case "queue": return <Queue rows={(value?.queue ?? []) as Row[]} config={config} />;
    case "eventfeed": return <EventFeed rows={rows} config={config} now={now} />;
    case "supporter": return rows[0] ? <SupporterCard key={rowKeys(rows)[0]} row={rows[0]} config={config} kicker="Latest supporter" now={now} /> : <Empty config={config}>Waiting for the first supporter</Empty>;
    case "activity": { const turn = rotation(rows, now); return turn ? <SupporterCard key={`${turn.index}:${rowKeys(rows)[turn.index]}`} row={turn.item} config={config} kicker="Recent activity" now={now} /> : <Empty config={config}>No recent activity yet</Empty>; }
    case "goal": case "multigoal": return <Goals rows={rows} config={config} />;
    case "status": return <Status value={value} config={config} now={now} />;
    case "counter": return <div className="w-panel w-counter w-enter"><Title config={config}>{config.name}</Title><strong key={str(value?.value)} className="w-big w-bump">{formatNumber(value?.value)}</strong></div>;
    case "leaderboard": return <Leaderboard rows={rows} config={config} />;
    case "poll": return rows[0] ? <Poll poll={rows[0]} config={config} now={now} /> : <Empty config={config}>No poll yet</Empty>;
    case "raffle": return rows[0] ? <Raffle raffle={rows[0]} config={config} /> : <Empty config={config}>No raffle yet</Empty>;
    case "countdown": return <Countdown config={config} now={now} />;
    case "shoutout": return value ? <Shoutout key={`${str(value.name)}:${str(value.at)}`} value={value} config={config} now={now} /> : null;
    case "socials": return <Socials value={value} config={config} now={now} />;
  }
}

function AlertCard({ alert, config, now, asset }: { alert: Row; config: WidgetConfig; now: number; asset: (name: string) => string }) {
  const phase = timedPhase(alert, now);
  if (phase === "hidden") return null;
  const animation = ["fade", "slide", "none"].includes(str(alert.animation)) ? str(alert.animation) : "fade";
  const [before, name, after] = splitHighlight(str(alert.text), alert.highlight);
  return <div className="w-stage">
    <div className={`w-panel w-alert w-alert-${animation}${phase === "leaving" ? " is-leaving" : ""}${alert.image ? " has-media" : ""}`} data-event={str(alert.event)}>
      {Boolean(alert.image) && <Image unoptimized className="w-alert-media" src={asset(str(alert.image))} width={640} height={360} alt="" />}
      <div className="w-alert-body">
        {config.showTitle && <p className="w-kicker">{config.title || alertKicker(alert.event)}</p>}
        <h2 className="w-alert-text">{before}{name !== undefined && <mark>{name}</mark>}{after}</h2>
      </div>
      {Boolean(alert.sound) && <AlertSound src={asset(str(alert.sound))} volume={Number(alert.volume)} />}
    </div>
  </div>;
}

function AlertSound({ src, volume }: { src: string; volume: number }) {
  const [blocked, setBlocked] = useState(false);
  useEffect(() => { const audio = new Audio(src); audio.volume = Math.min(1, Math.max(0, volume || 0)); void audio.play().catch(() => setBlocked(true)); return () => { audio.pause(); audio.src = ""; }; }, [src, volume]);
  return blocked ? <p className="widget-status">Alert audio blocked by browser autoplay settings.</p> : null;
}

function Chat({ rows, config, now }: { rows: Row[]; config: WidgetConfig; now: number }) {
  const keys = rowKeys(rows);
  const lines = rows.map((row, index) => ({ row, key: keys[index], fade: chatFade(row.at, now, config.chatFadeSeconds) })).filter(line => line.fade !== "gone");
  if (!lines.length) return <div className="w-chat"><Empty config={config}>Chat messages appear here</Empty></div>;
  return <ol className="w-chat" aria-label="Chat">{lines.map(({ row, key, fade }) => {
    const role = chatRoleOf(row.role), badge = roleBadge[role];
    return <li key={key} className={`w-chat-line w-enter${fade === "fading" ? " is-fading" : ""}`} data-role={role}>
      {config.showDetails && badge && <span className="w-badge">{badge}</span>}
      <strong className="w-chat-name">{str(row.name, "Viewer")}</strong>
      <span className="w-chat-text">{str(row.text)}</span>
    </li>;
  })}</ol>;
}

function Equalizer({ playing }: { playing: boolean }) {
  return <span className={`w-eq${playing ? " is-playing" : ""}`} aria-hidden="true"><i /><i /><i /><i /></span>;
}

function NowPlaying({ value, config }: { value: Row | null; config: WidgetConfig }) {
  const current = value?.current as Row | null | undefined, state = str((value?.player as Row | undefined)?.state);
  if (!current) return <Empty config={config}>Nothing playing</Empty>;
  const duration = formatDuration(current.duration);
  return <div className="w-panel w-media w-enter" key={str(current.id)}>
    <Equalizer playing={state === "playing"} />
    <div className="w-media-body">
      {config.showTitle && <p className="w-kicker">{config.title || (state === "playing" ? "Now playing" : "Paused")}</p>}
      <h2 className="w-media-title">{str(current.title, "Title unavailable")}</h2>
      {config.showDetails && <p className="w-meta">Requested by {str(current.requesterName, "Requester unavailable")}</p>}
    </div>
    {config.showDetails && duration && <span className="w-chip">{duration}</span>}
  </div>;
}

function Queue({ rows, config }: { rows: Row[]; config: WidgetConfig }) {
  if (!rows.length) return <Empty config={config}>Queue is empty</Empty>;
  return <div className="w-panel w-list w-enter"><Title config={config}>Up next</Title><ol className="w-rows">{rows.map((row, index) => {
    const duration = formatDuration(row.duration);
    return <li key={str(row.id)} className="w-row w-enter">
      <span className="w-pos" aria-label={`Up next, number ${index + 1}`}>{index + 1}</span>
      <span className="w-row-main"><span className="w-row-title">{str(row.title, "Title unavailable")}</span>{config.showDetails && <span className="w-row-sub">{str(row.requesterName, "Requester unavailable")}</span>}</span>
      {config.showDetails && duration && <span className="w-row-end">{duration}</span>}
    </li>;
  })}</ol></div>;
}

function EventFeed({ rows, config, now }: { rows: Row[]; config: WidgetConfig; now: number }) {
  if (!rows.length) return <Empty config={config}>Recent follows and subs appear here</Empty>;
  const keys = rowKeys(rows);
  return <div className="w-panel w-list w-enter"><Title config={config}>Recent supporters</Title><ol className="w-rows">{rows.map((row, index) => {
    const kind = supportKind(row.event);
    return <li key={keys[index]} className="w-row w-enter" data-kind={kind}>
      <Icon name={kind} />
      <span className="w-row-main"><span className="w-row-title"><strong>{str(row.name, "Supporter")}</strong> {supportLabel(row)}</span></span>
      {config.showDetails && <span className="w-row-end">{relativeTime(row.at, now)}</span>}
    </li>;
  })}</ol></div>;
}

function SupporterCard({ row, config, kicker, now }: { row: Row; config: WidgetConfig; kicker: string; now: number }) {
  const kind = supportKind(row.event);
  return <div className="w-panel w-supporter w-enter" data-kind={kind}>
    <Icon name={kind} />
    <div className="w-media-body">
      {config.showTitle && <p className="w-kicker">{config.title || kicker}</p>}
      <h2 className="w-big-name">{str(row.name, "Supporter")}</h2>
      <p className="w-meta">{supportLabel(row)}{config.showDetails && ` · ${relativeTime(row.at, now)}`}</p>
    </div>
  </div>;
}

function Goals({ rows, config }: { rows: Row[]; config: WidgetConfig }) {
  if (!rows.length) return <Empty config={config}>No active goals</Empty>;
  const many = config.type === "multigoal";
  const goals = rows.map(row => {
    const { percent, complete } = goalProgress(row.value, row.target);
    return <div key={str(row.id)} className={`w-goal${many ? "" : " w-panel w-enter"}${complete ? " is-complete" : ""}`}>
      <div className="w-goal-head"><h3 className="w-goal-name">{str(row.name, "Goal")}</h3>{config.showDetails && <span className="w-goal-count">{formatNumber(row.value)} / {formatNumber(row.target)}</span>}</div>
      <div className="w-bar" role="progressbar" aria-label={str(row.name, "Goal")} aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}><span style={{ width: `${percent}%` }} /></div>
      <p className="w-goal-foot">{complete ? <span className="w-done">Goal reached!</span> : `${percent}%`}</p>
    </div>;
  });
  return many ? <div className="w-panel w-goals w-enter"><Title config={config}>Goals</Title>{goals}</div> : <div className="w-goals">{goals}</div>;
}

function Status({ value, config, now }: { value: Row | null; config: WidgetConfig; now: number }) {
  const live = str(value?.live), started = Date.parse(str(value?.startedAt));
  const viewers = value?.viewers === null || value?.viewers === undefined ? null : Number(value.viewers);
  const known = live === "true" || live === "false", counted = viewers !== null && Number.isFinite(viewers);
  return <div className="w-panel w-status w-enter" data-live={known ? live : "unknown"}>
    <span className="w-live"><i className="w-dot" aria-hidden="true" />{live === "true" ? "Live" : live === "false" ? "Offline" : "Status unavailable"}</span>
    {config.showUptime && live === "true" && (Number.isFinite(started) ? <span className="w-stat"><Icon name="clock" /><span className="w-sr">Uptime </span>{formatElapsed(now - started)}</span> : <span className="w-stat is-unavailable"><Icon name="clock" />Uptime unavailable</span>)}
    {config.showViewers && (counted ? <span className="w-stat"><Icon name="eye" />{formatNumber(viewers)}<span className="w-sr"> viewers</span></span> : <span className="w-stat is-unavailable"><Icon name="eye" />Viewers unavailable</span>)}
  </div>;
}

function Leaderboard({ rows, config }: { rows: Row[]; config: WidgetConfig }) {
  if (!rows.length) return <Empty config={config}>No points earned yet</Empty>;
  return <div className="w-panel w-list w-enter"><Title config={config}>Top points</Title><ol className="w-rows">{rows.map((row, index) =>
    <li key={`${index}:${str(row.name)}`} className="w-row w-enter" data-rank={index + 1}>
      <span className="w-rank">{index < 3 ? <Icon name="trophy" /> : null}<span>{index + 1}</span></span>
      <span className="w-row-main"><span className="w-row-title">{str(row.name, "Viewer")}</span></span>
      <span className="w-row-end w-points">{formatNumber(row.balance)}<span className="w-sr"> points</span></span>
    </li>)}</ol></div>;
}

function Poll({ poll, config, now }: { poll: Row; config: WidgetConfig; now: number }) {
  const options = Array.isArray(poll.options) ? poll.options : [];
  const { total, rows } = pollRows(options, Array.isArray(poll.results) ? (poll.results as Row[]) : []);
  const open = poll.status === "open", ends = Number(poll.endsAt);
  return <div className="w-panel w-poll w-enter" data-open={open}>
    <div className="w-head"><h2 className="w-title">{str(poll.name, "Poll")}</h2><span className="w-chip">{open ? (ends > now ? `Ends in ${formatCountdown(ends - now)}` : "Open") : "Final results"}</span></div>
    <ol className="w-options">{rows.map(row => <li key={row.number} className={`w-option${row.leading ? " is-leading" : ""}`}>
      <span className="w-option-fill" style={{ width: `${row.percent}%` }} aria-hidden="true" />
      <span className="w-option-number">{row.number}</span>
      <span className="w-option-label">{row.label}</span>
      <span className="w-option-value">{row.percent}%{config.showDetails && <small> · {formatNumber(row.count)}</small>}</span>
    </li>)}</ol>
    {config.showDetails && <p className="w-meta">{formatNumber(total)} {total === 1 ? "vote" : "votes"}{open && options.length ? ` · Type !vote 1–${options.length}` : ""}</p>}
  </div>;
}

function Raffle({ raffle, config }: { raffle: Row; config: WidgetConfig }) {
  const entries = (Array.isArray(raffle.results) ? (raffle.results as Row[]) : []).reduce((sum, row) => sum + (Number(row.count) || 0), 0);
  const winners = Array.isArray(raffle.winners) ? raffle.winners.map(name => str(name)).filter(Boolean) : [];
  const status = str(raffle.status);
  return <div className="w-panel w-raffle w-enter" data-status={status}>
    <div className="w-head"><h2 className="w-title">{str(raffle.name, "Raffle")}</h2><span className="w-chip">{status === "open" ? "Entries open" : status === "drawn" ? "Drawn" : "Entries closed"}</span></div>
    {status === "drawn" && winners.length ? <div className="w-winners"><p className="w-kicker">{winners.length === 1 ? "Winner" : "Winners"}</p><ul>{winners.map((name, index) => <li key={`${index}:${name}`} className="w-winner" style={{ animationDelay: `${index * 0.25}s` }}>{name}</li>)}</ul></div>
      : <p className="w-raffle-count"><strong className="w-big">{formatNumber(entries)}</strong> {entries === 1 ? "entry" : "entries"}</p>}
    {config.showDetails && status === "open" && <p className="w-meta">Type !enter to join</p>}
    {status === "drawn" && !winners.length && <p className="w-meta">No eligible entries were drawn</p>}
  </div>;
}

function Countdown({ config, now }: { config: WidgetConfig; now: number }) {
  if (!config.endsAt) return <Empty config={config}>No end time configured</Empty>;
  const remaining = config.endsAt - now, done = remaining <= 0;
  return <div className={`w-panel w-countdown w-enter${done ? " is-done" : ""}`}>
    {config.showTitle && <p className="w-kicker">{config.text || config.title || config.name}</p>}
    <strong className="w-big w-clock" key={done ? "done" : "running"}>{done ? config.endText || "Time's up!" : formatCountdown(remaining)}</strong>
  </div>;
}

function Shoutout({ value, config, now }: { value: Row; config: WidgetConfig; now: number }) {
  const phase = timedPhase({ endsAt: value.expiresAt }, now);
  if (phase === "hidden") return null;
  return <div className="w-stage"><div className={`w-panel w-shoutout w-pop${phase === "leaving" ? " is-leaving" : ""}`}>
    {config.showTitle && <p className="w-kicker">{config.title || "Go check out"}</p>}
    <h2 className="w-big-name">{str(value.name)}</h2>
    {config.showDetails && <p className="w-meta">{str(value.url).replace(/^https?:\/\//, "")}</p>}
  </div></div>;
}

function Socials({ value, config, now }: { value: Row | null; config: WidgetConfig; now: number }) {
  const lines = socialLines(value?.text), turn = rotation(lines, now);
  if (!turn) return <Empty config={config}>Socials not configured</Empty>;
  const platform = socialPlatform(turn.item);
  return <div className="w-panel w-socials">
    <div className="w-social w-enter" key={turn.index}>{platform && <span className="w-chip">{platform}</span>}<span className="w-social-text">{turn.item}</span></div>
    {config.showDetails && lines.length > 1 && <span className="w-dots" aria-hidden="true">{lines.map((_, index) => <i key={index} className={index === turn.index ? "is-active" : ""} />)}</span>}
  </div>;
}
