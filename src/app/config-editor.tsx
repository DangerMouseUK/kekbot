"use client";
import { useState } from "react";
import { defaults, type ConfigDocument, type Kind } from "../server/domain/catalog.ts";

export const examples: Record<Kind, Record<string, unknown>> = {
  command: { name: "Welcome", enabled: true, trigger: "!welcome", aliases: [], group: "General", responses: ["Welcome, {user}!"], roles: [], cooldown: 10, userCooldown: 30, streamOnly: false, condition: "always", counter: false },
  timer: { name: "Community reminder", enabled: true, messages: ["Thanks for being here."], interval: 300, minMessages: 5, streamOnly: true, timezone: "UTC", quietStart: null, quietEnd: null },
  alert: { name: "Follow alert", enabled: true, event: "channel.followed", template: "Thanks for following, {user}!", duration: 5, priority: 0, image: null, sound: null, volume: 0.5, animation: "fade" },
  widget: { name: "Chat overlay", enabled: true, type: "chat", theme: "mint", width: 800, height: 400, limit: 10, target: "", text: "", endsAt: null, reducedMotion: false },
  rule: { name: "Link rule", enabled: false, type: "link", patterns: [], allowedDomains: [], threshold: 5, windowSeconds: 30, trustedRoles: ["moderator", "broadcaster"], action: "warn", duration: 10, startsAt: null, endsAt: null, escalation: false, escalationAfter: 2, escalationWindowSeconds: 3600, escalationAction: "timeout" },
  goal: { name: "Follower goal", enabled: true, metric: "follow", target: 100, value: 0, completed: false },
  reward: { name: "Community reward", enabled: true, cost: 100, description: "Fulfilled by a moderator", fulfillment: "manual" },
  poll: { name: "Choose our next game", enabled: true, options: ["Option one", "Option two"], status: "open", endsAt: 0, allowChange: false },
  raffle: { name: "Community raffle", enabled: true, status: "open", endsAt: 0, roles: [], minPoints: 0, winners: [] },
  note: { name: "Moderator note", enabled: true, viewer: "", text: "" },
  guild: { name: "Community guild", enabled: true, guildId: "", channelId: "", events: ["live", "offline"], roles: [], users: [] },
  settings: defaults
};
const choices: Record<string, string[]> = {
  "command.condition": ["always", "live", "offline"], "rule.type": ["link", "phrase", "repetition", "caps", "burst"], "rule.action": ["warn", "delete", "timeout", "ban"], "rule.escalationAction": ["warn", "delete", "timeout", "ban"],
  "alert.event": ["channel.followed", "channel.subscription.new", "channel.subscription.renewal", "channel.subscription.gifts", "manual", "goal", "media"], "alert.animation": ["fade", "slide", "none"],
  "widget.type": ["alerts", "chat", "player", "nowplaying", "queue", "eventfeed", "supporter", "goal", "multigoal", "status", "counter", "leaderboard", "poll", "raffle", "countdown", "shoutout", "socials", "activity"],
  "widget.theme": ["mint", "midnight", "paper"], "goal.metric": ["manual", "follow", "subscription", "points", "media"], "reward.fulfillment": ["manual", "alert"], "poll.status": ["open", "closed"], "raffle.status": ["open", "closed", "drawn"]
};
const label = (key: string) => key.replace(/([A-Z])/g, " $1").replace(/^./, s => s.toUpperCase());
export default function ConfigEditor({ kind, document, save, cancel }: { kind: Kind; document?: ConfigDocument; save: (data: Record<string, unknown>) => Promise<void>; cancel: () => void }) {
  const [data, setData] = useState(() => {
    const initial = { ...examples[kind], ...document?.data };
    if (!document && ["poll", "raffle"].includes(kind)) initial.endsAt = Date.now() + 3600000;
    return initial;
  }), [error, setError] = useState(""), [busy, setBusy] = useState(false);
  return <form className="editor" onSubmit={async event => { event.preventDefault(); setBusy(true); try { await save(data); } catch (e) { setError(e instanceof Error ? e.message : "Save failed"); } finally { setBusy(false); } }}>
    <h3>{document ? "Edit" : "New"} {kind}</h3><p className="help">Responses support {"{user}, {args}, {channel}, {counter}, {points}"}. Lists use one value per line. Time values ending in “At” use Unix milliseconds.</p>
    <div className="fields">{Object.entries(data).map(([key, value]) => {
      const update = (next: unknown) => { setError(""); setData(previous => ({ ...previous, [key]: next })); };
      const options = choices[`${kind}.${key}`], nested = kind === "guild" && ["roles", "users"].includes(key);
      return <label key={key}>{label(key)}{options ? <select aria-label={label(key)} value={String(value)} onChange={event => update(event.target.value)}>{options.map(option => <option key={option}>{option}</option>)}</select> : typeof value === "boolean" ? <input aria-label={label(key)} type="checkbox" checked={value} onChange={event => update(event.target.checked)} /> : Array.isArray(value) ? nested ? <textarea aria-label={label(key)} defaultValue={JSON.stringify(value, null, 2)} onBlur={event => { try { update(JSON.parse(event.target.value)); } catch { setError(`${label(key)} must be a JSON list of id/permission objects.`); } }} /> : <textarea aria-label={label(key)} value={value.join("\n")} onChange={event => update(event.target.value.split("\n").filter(Boolean))} /> : typeof value === "number" || value === null && ["quietStart", "quietEnd", "startsAt", "endsAt"].includes(key) ? <input aria-label={label(key)} type="number" step={key === "volume" ? 0.05 : 1} value={value ?? ""} onChange={event => update(event.target.value === "" ? null : Number(event.target.value))} /> : <input aria-label={label(key)} value={String(value ?? "")} onChange={event => update(value === null && event.target.value === "" ? null : event.target.value)} />}</label>;
    })}</div>{kind === "guild" && <p className="help">Role/user mappings: {"[{\"id\":\"DISCORD_ID\",\"permission\":\"media\"}]"}. Permissions: operate, moderate, media, engage. Empty mappings grant no control.</p>}
    {error && <p role="alert">{error}</p>}<div className="actions"><button disabled={busy}>Save {kind}</button><button type="button" className="secondary" onClick={cancel}>Cancel</button></div>
  </form>;
}
