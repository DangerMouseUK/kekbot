"use client";
import { useState } from "react";
import { describeError, statusLabel } from "../messages";
import {
  Dialog,
  Empty,
  countdown,
  formatTime,
  permitted,
  relative,
  text,
  useNow,
  type Row,
  type Run,
} from "../ui";
import { actionLabels } from "./cards";
import type { PanelProps } from "./types";

type Action = "warn" | "timeout" | "ban" | "delete";
type Target = { userId: number; name: string; messageId?: string; text?: string };
const reasons = ["Spam", "Unwanted links", "Harassment", "Hateful language", "Spoilers", "Other"];
const timeouts: [number, string][] = [
  [1, "1 minute"],
  [5, "5 minutes"],
  [10, "10 minutes"],
  [60, "1 hour"],
  [1440, "1 day"],
  [10080, "1 week"],
];
const presets: Record<string, string> = {
  links: "Links",
  burst: "Message bursts",
  combined: "Links and message bursts",
};

function ActionDialog({
  targets,
  initial,
  run,
  close,
}: {
  targets: Target[];
  initial: Action;
  run: Run;
  close: () => void;
}) {
  const bulk = targets.length > 1,
    single = targets[0];
  const allowed: Action[] =
    bulk || !single.messageId ? ["warn", "timeout", "ban"] : ["warn", "timeout", "ban", "delete"];
  const [action, setAction] = useState<Action>(allowed.includes(initial) ? initial : "warn");
  const [reason, setReason] = useState(reasons[0]),
    [custom, setCustom] = useState(""),
    [minutes, setMinutes] = useState(10),
    [sending, setSending] = useState(false);
  const who = bulk ? `${targets.length} viewers` : single.name;
  const serious = bulk || action === "ban" || action === "delete";
  const verb: Record<Action, string> = {
    warn: `Warn ${who}`,
    timeout: `Time out ${who}`,
    ban: `Ban ${who}`,
    delete: "Delete message",
  };
  const finalReason = (reason === "Other" ? custom : reason).trim().slice(0, 100);
  return (
    <Dialog title={bulk ? `Moderate ${who}` : `Moderate ${single.name}`} onClose={close}>
      <form
        className="dialog-form"
        onSubmit={async (event) => {
          event.preventDefault();
          if (!finalReason) return;
          setSending(true);
          const result = bulk
            ? await run("moderation.bulk", {
                operation: action,
                targets: targets.map((target) => target.userId),
                reason: finalReason,
                duration: minutes,
                acknowledge: true,
              })
            : await run(`moderation.${action}`, {
                target: String(single.userId),
                reason: finalReason,
                ...(action === "timeout" ? { value: minutes } : {}),
                ...(action === "delete" ? { message: single.messageId } : {}),
                acknowledge: serious,
              });
          setSending(false);
          if (result) close();
        }}
      >
        {bulk ? (
          <p>Selected: {targets.map((target) => target.name).join(", ")}</p>
        ) : (
          single.text && (
            <blockquote>
              <strong>{single.name}:</strong> {single.text}
            </blockquote>
          )
        )}
        <fieldset>
          <legend>Action</legend>
          <div className="segmented">
            {allowed.map((value) => (
              <label key={value}>
                <input
                  type="radio"
                  name="action"
                  checked={action === value}
                  onChange={() => setAction(value)}
                />
                {actionLabels[value]}
              </label>
            ))}
          </div>
        </fieldset>
        {action === "timeout" && (
          <label>
            Timeout length
            <select value={minutes} onChange={(event) => setMinutes(Number(event.target.value))}>
              {timeouts.map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Reason
          <select value={reason} onChange={(event) => setReason(event.target.value)}>
            {reasons.map((value) => (
              <option key={value}>{value}</option>
            ))}
          </select>
        </label>
        {reason === "Other" && (
          <label>
            Reason in your words
            <input
              value={custom}
              maxLength={100}
              required
              onChange={(event) => setCustom(event.target.value)}
            />
          </label>
        )}
        {serious && (
          <p className="problem">
            {action === "ban"
              ? `This asks Kick to ban ${who} from your chat. Unban on Kick if you change your mind.`
              : action === "delete"
                ? "This asks Kick to delete the message. It is hidden from OBS chat straight away."
                : `This sends one action for each of the ${targets.length} viewers. Check the list above.`}{" "}
            Selecting the button below confirms you have reviewed this.
          </p>
        )}
        <div className="actions dialog-actions">
          <button className={serious ? "danger" : undefined} disabled={sending || !finalReason}>
            {verb[action]}
          </button>
          <button type="button" className="secondary" onClick={close}>
            Cancel
          </button>
        </div>
      </form>
    </Dialog>
  );
}

function IncidentMode({ snapshot: s, auth, run, busy }: PanelProps) {
  const now = useNow(1000);
  const mode = s.incidentMode && s.incidentMode.endsAt > now ? s.incidentMode : null;
  return (
    <section aria-labelledby="incident-heading" className={mode ? "banner warn" : undefined}>
      <div>
        <h2 id="incident-heading">Incident mode</h2>
        {mode ? (
          <p>
            <strong>{presets[mode.preset] ?? mode.preset} preset active</strong> ·{" "}
            <span className="countdown">{countdown(mode.endsAt - now)}</span> left (ends at{" "}
            {formatTime(mode.endsAt)}).
          </p>
        ) : (
          <p>
            No temporary preset active. During a raid or spam wave, incident mode warns anyone
            posting links or bursts of messages. Moderators and the broadcaster are exempt, your
            saved rules still come first, and it switches itself off.
          </p>
        )}
      </div>
      {permitted(auth.actor, "moderate") &&
        (mode ? (
          <button disabled={busy} onClick={() => run("moderation.incident.stop")}>
            Stop incident mode
          </button>
        ) : (
          <form
            className="inline"
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
              For
              <select name="minutes" defaultValue="15">
                {[5, 15, 30, 60, 120].map((minutes) => (
                  <option key={minutes} value={minutes}>
                    {minutes < 60
                      ? `${minutes} minutes`
                      : `${minutes / 60} hour${minutes > 60 ? "s" : ""}`}
                  </option>
                ))}
              </select>
            </label>
            <label className="check">
              <input name="acknowledge" type="checkbox" required /> I have reviewed the temporary
              warning rules
            </label>
            <button disabled={busy}>Start incident mode</button>
          </form>
        ))}
    </section>
  );
}

function RuleTest({ snapshot: s, run, busy }: PanelProps) {
  const rules = s.documents.filter((doc) => doc.kind === "rule");
  const [ruleId, setRuleId] = useState(""),
    [content, setContent] = useState(""),
    [role, setRole] = useState("viewer"),
    [result, setResult] = useState<{
      matched: boolean;
      rule: string;
      enabled: boolean;
      action: string;
    }>();
  const rule = rules.find((doc) => doc.id === ruleId) ?? rules[0];
  return (
    <section aria-labelledby="rule-test-heading">
      <h2 id="rule-test-heading">Test a rule</h2>
      <p className="help">
        Type a sample message to see whether a rule would act. Nothing is sent to Kick.
      </p>
      {!rule ? (
        <Empty title="No rules to test yet.">Add an automatic rule below, then test it here.</Empty>
      ) : (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const outcome = await run(
              "moderation.test",
              { rule: rule.data, content, role },
              { quiet: true },
            );
            if (outcome)
              setResult({
                matched: Boolean(outcome.matched),
                rule: String(rule.data.name),
                enabled: rule.data.enabled !== false,
                action: String(rule.data.action),
              });
          }}
        >
          <div className="fields">
            <label>
              Rule
              <select value={rule.id} onChange={(event) => setRuleId(event.target.value)}>
                {rules.map((doc) => (
                  <option value={doc.id} key={doc.id}>
                    {String(doc.data.name)}
                    {doc.data.enabled === false ? " (off)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sender is a
              <select value={role} onChange={(event) => setRole(event.target.value)}>
                {["viewer", "subscriber", "vip", "moderator", "broadcaster"].map((value) => (
                  <option key={value} value={value}>
                    {value === "vip" ? "VIP" : value.charAt(0).toUpperCase() + value.slice(1)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Sample message
            <textarea
              value={content}
              required
              maxLength={500}
              rows={2}
              onChange={(event) => setContent(event.target.value)}
            />
          </label>
          <button disabled={busy}>Test message</button>
        </form>
      )}
      <div aria-live="polite">
        {result && (
          <p className={result.matched ? "problem" : "ok"}>
            {result.matched
              ? `Match: “${result.rule}” would ${String(actionLabels[result.action] ?? result.action).toLowerCase()} this sender.`
              : result.enabled
                ? `No match: “${result.rule}” would let this message through.`
                : `No match because “${result.rule}” is turned off. Turn it on to test it.`}
          </p>
        )}
      </div>
      <p className="help">
        Repetition and burst rules count earlier messages, so a single sample cannot trigger them.
      </p>
    </section>
  );
}

export default function ModerationPanel(props: PanelProps) {
  const { snapshot: s, auth, run, busy } = props;
  const can = permitted(auth.actor, "moderate");
  const now = useNow(30000);
  const [query, setQuery] = useState(""),
    [selected, setSelected] = useState<Target[]>([]),
    [dialog, setDialog] = useState<{ targets: Target[]; action: Action }>(),
    [manual, setManual] = useState("");
  const viewers = s.viewers.filter((viewer) =>
    `${viewer.id} ${viewer.name}`.toLowerCase().includes(query.trim().toLowerCase()),
  );
  const target = (row: Row): Target => ({
    userId: Number(row.userId ?? row.viewer ?? row.id),
    name: String(row.name ?? row.viewerName ?? `Kick user ${row.viewer ?? row.id}`),
    messageId: row.messageId ? String(row.messageId) : undefined,
    text: row.text ? String(row.text) : undefined,
  });
  const open = (row: Row, action: Action = "warn") => setDialog({ targets: [target(row)], action });
  const paused = Boolean(s.settings.moderationPaused);
  return (
    <>
      {dialog && (
        <ActionDialog
          targets={dialog.targets}
          initial={dialog.action}
          run={run}
          close={() => setDialog(undefined)}
        />
      )}
      <IncidentMode {...props} />
      <section aria-labelledby="auto-heading" className={paused ? "banner warn" : "banner"}>
        <div>
          <h2 id="auto-heading">
            {paused ? "Automatic moderation is paused" : "Automatic moderation is running"}
          </h2>
          <p>
            {paused
              ? "Rules and incident mode will not act. Manual actions below still work."
              : "Your rules act on new chat messages. Pause them instantly if something goes wrong."}
          </p>
        </div>
        {can && (
          <button
            className={paused ? undefined : "secondary"}
            disabled={busy}
            onClick={() => run(paused ? "moderation.resume" : "moderation.pause")}
          >
            {paused ? "Resume moderation" : "Emergency pause moderation"}
          </button>
        )}
      </section>
      {can && (
        <section aria-labelledby="chat-heading">
          <h2 id="chat-heading">Recent chat</h2>
          {s.recentChat?.length ? (
            <ul className="chat-list">
              {s.recentChat.slice(0, 25).map((row) => (
                <li key={String(row.id)} className={row.removed ? "removed" : undefined}>
                  <div>
                    <strong>{text(row.name)}</strong>{" "}
                    <span className="help">{relative(Number(row.at), now)}</span>
                    {Boolean(row.flagged) && <span className="badge warn">Caught by a rule</span>}
                    {Boolean(row.removed) && <span className="badge muted">Removed</span>}
                    <p>{text(row.text)}</p>
                  </div>
                  <button className="secondary small" disabled={busy} onClick={() => open(row)}>
                    Moderate
                    <span className="visually-hidden">
                      {" "}
                      {text(row.name)}: {text(row.text)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="empty">No chat messages received yet.</p>
          )}
        </section>
      )}
      <section aria-labelledby="incidents-heading">
        <h2 id="incidents-heading">What happened</h2>
        {s.incidents.length ? (
          <ul className="incident-list">
            {s.incidents.slice(0, 50).map((row) => (
              <li key={String(row.id)}>
                <div>
                  <strong>{text(row.viewerName ?? `Kick user ${row.viewer}`)}</strong> ·{" "}
                  {String(actionLabels[String(row.action)] ?? row.action)} ·{" "}
                  {row.rule === "manual" ? "by a moderator" : `rule “${text(row.ruleName)}”`} ·{" "}
                  {text(row.reason)}
                  <p className="help">
                    {formatTime(row.at)} · {statusLabel(row.outcome)}
                    {row.error ? ` · ${describeError(String(row.error)).title}` : ""}
                  </p>
                </div>
                {can && (
                  <button
                    className="secondary small"
                    disabled={busy}
                    onClick={() => open(row, "timeout")}
                  >
                    Moderate
                    <span className="visually-hidden"> {text(row.viewerName ?? row.viewer)}</span>
                  </button>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="empty">
            No moderation actions yet. Rule matches and manual actions appear here with Kick&apos;s
            result.
          </p>
        )}
      </section>
      <section aria-labelledby="viewers-heading">
        <h2 id="viewers-heading">Observed viewers</h2>
        <label>
          Find an observed viewer
          <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} />
        </label>
        <p className="help">
          The 100 most recent chatters. Select several to act on up to 20 at once.
        </p>
        {can && selected.length > 0 && (
          <div className="bulk-bar">
            <span>{selected.length} selected</span>
            <button
              disabled={busy}
              onClick={() => setDialog({ targets: selected, action: "timeout" })}
            >
              Moderate selected
            </button>
            <button className="secondary small" onClick={() => setSelected([])}>
              Clear selection
            </button>
          </div>
        )}
        {viewers.length ? (
          <ul className="viewer-list">
            {viewers.map((row) => {
              const checked = selected.some((item) => item.userId === Number(row.id));
              return (
                <li key={String(row.id)}>
                  {can && (
                    <input
                      type="checkbox"
                      aria-label={`Select ${text(row.name)}`}
                      checked={checked}
                      disabled={!checked && selected.length >= 20}
                      onChange={() =>
                        setSelected(
                          checked
                            ? selected.filter((item) => item.userId !== Number(row.id))
                            : [...selected, target({ ...row, userId: row.id, name: row.name })],
                        )
                      }
                    />
                  )}
                  <span>
                    <strong>{text(row.name)}</strong>{" "}
                    <span className="help">
                      {text(row.role)} · seen {relative(Number(row.last_seen), now)} ·{" "}
                      {Number(row.messages) === 1 ? "1 message" : `${text(row.messages)} messages`}
                    </span>
                  </span>
                  {can && (
                    <button
                      className="secondary small"
                      disabled={busy}
                      onClick={() => open({ ...row, userId: row.id })}
                    >
                      Moderate<span className="visually-hidden"> {text(row.name)}</span>
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        ) : (
          <p className="empty">
            {query ? "No observed viewer matches." : "No viewers have chatted yet."}
          </p>
        )}
        {can && (
          <details>
            <summary>Act on someone who is not listed</summary>
            <form
              className="inline"
              onSubmit={(event) => {
                event.preventDefault();
                setDialog({
                  targets: [{ userId: Number(manual), name: `Kick user ${manual}` }],
                  action: "timeout",
                });
              }}
            >
              <label>
                Kick user ID (numbers only)
                <input
                  value={manual}
                  inputMode="numeric"
                  pattern="\d{1,24}"
                  required
                  onChange={(event) => setManual(event.target.value)}
                />
              </label>
              <button className="secondary">Continue</button>
            </form>
          </details>
        )}
      </section>
      {can && <RuleTest {...props} />}
    </>
  );
}
