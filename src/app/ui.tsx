"use client";
import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Actor, Permission } from "../server/auth.ts";
import type { ConfigDocument } from "../server/domain/catalog.ts";
import { describeError, statusLabel } from "./messages";

export type Row = Record<string, unknown>;
export type WorkPage = { items: Row[]; nextCursor: string | null };
export type TimerSchedule = {
  id: string;
  next: number | null;
  waitingMessages: number;
  lastSent: { status: string; at: number; error: string | null } | null;
};
export type Snapshot = {
  settings: Row;
  documents: ConfigDocument[];
  player: {
    state: string;
    version: number;
    current: string | null;
    volume: number;
    error?: string;
  };
  media: Row[];
  jobs: Row[];
  uncertainJobs: WorkPage;
  audit: Row[];
  viewers: Row[];
  leaderboard: Row[];
  redemptions: Row[];
  pendingRedemptions: WorkPage;
  incidents: Row[];
  incidentMode?: { preset: string; endsAt: number } | null;
  activities: Row[];
  recentChat?: Row[];
  raffleWinners?: { raffle: string; viewer: string; name: string | null }[];
  timers?: TimerSchedule[];
  stream?: { live: string; startedAt: string | null };
  accounts?: Row[];
  tokens?: Row[];
  assets?: Row[];
  kick: Row;
  integrations: Record<string, boolean>;
  diagnostics: Row;
  mode: string;
  healthy: boolean;
};
export type Session = {
  claimed: boolean;
  actor: (Actor & { username: string }) | null;
  csrf?: string;
  mode: string;
};
export type Notice = { tone: "success" | "error" | "info"; text: string; detail?: string };
export type RunOptions = {
  /** Text shown after success; a function receives the action result. */
  success?: string | ((result: Row) => string);
  /** Skip the global notice; the caller shows the result inline. */
  quiet?: boolean;
};
export type Run = (action: string, input?: Row, options?: RunOptions) => Promise<Row | undefined>;

/** A failed control request. `message` is plain English; `code` stays the API contract. */
export class ControlError extends Error {
  readonly code: string;
  readonly fields: string[];
  readonly status: number;
  constructor(code: string, fields: string[] = [], status = 400) {
    const { title, next } = describeError(code, fields);
    super(next ? `${title} ${next}` : title);
    this.code = code;
    this.fields = fields;
    this.status = status;
  }
}

export function permitted(actor: Actor | null, permission: Permission) {
  return Boolean(
    actor &&
    (actor.role === "owner" ||
      (actor.role === "admin" && actor.permissions.includes(permission)) ||
      (actor.role === "moderator" &&
        ["operate", "moderate", "media", "engage"].includes(permission))),
  );
}

export function text(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length ? value.map(text).join(", ") : "—";
  if (typeof value === "object")
    return Object.entries(value as Row)
      .map(([key, item]) => `${humanize(key)}: ${text(item)}`)
      .join(" · ");
  return String(value);
}

/** "lastSeen" or "last_seen" → "Last seen". */
export function humanize(key: string) {
  const words = key
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function formatTime(ms: unknown) {
  const value = typeof ms === "string" && !/^\d+$/.test(ms) ? Date.parse(ms) : Number(ms);
  if (!Number.isFinite(value) || value <= 0) return "—";
  const date = new Date(value);
  const today = new Date().toDateString() === date.toDateString();
  return today
    ? date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : date.toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
}

/** "in 4 min", "3 min ago", "just now". */
export function relative(ms: number, now = Date.now()) {
  const delta = ms - now,
    abs = Math.abs(delta);
  if (abs < 45000) return delta > 0 ? "in under a minute" : "just now";
  const units: [number, string][] = [
    [86400000, "day"],
    [3600000, "hour"],
    [60000, "min"],
  ];
  const [size, unit] = units.find(([size]) => abs >= size) ?? units[2];
  const count = Math.round(abs / size);
  const label = `${count} ${unit}${count === 1 || unit === "min" ? "" : "s"}`;
  return delta > 0 ? `in ${label}` : `${label} ago`;
}

/** Seconds → "3:07" or "1:02:03". */
export function formatDuration(seconds: unknown) {
  const total = Number(seconds);
  if (!Number.isFinite(total) || total <= 0) return "length unknown";
  const h = Math.floor(total / 3600),
    m = Math.floor((total % 3600) / 60),
    s = Math.floor(total % 60);
  return h
    ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`
    : `${m}:${String(s).padStart(2, "0")}`;
}

/** Remaining time as "12:34" or "1:02:03". */
export function countdown(ms: number) {
  return formatDuration(Math.max(1, Math.ceil(ms / 1000)));
}

export function formatBytes(value: unknown) {
  const bytes = Number(value);
  if (!Number.isFinite(bytes)) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 ** 3) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

/** Re-renders every `interval` ms so countdowns and relative times stay current. */
export function useNow(interval = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), interval);
    return () => clearInterval(timer);
  }, [interval]);
  return now;
}

const columnLabels: Record<string, string> = {
  id: "Reference",
  kind: "Type",
  error: "Problem",
  bytes: "Size",
  balance: "Points",
  createdAt: "Created",
  created_at: "Created",
  at: "When",
  last_seen: "Last seen",
};
export type Column = { key: string; label?: string; render?: (row: Row) => ReactNode };

function cell(key: string, value: unknown) {
  if (/(?:_at|At|last_seen|^at)$/.test(key) && Number(value) > 0) return formatTime(value);
  if (key === "status" || key === "outcome") return statusLabel(value);
  if (key === "bytes") return formatBytes(value);
  return text(value);
}

export function Table({
  rows,
  columns,
  caption,
  empty = "Nothing recorded yet.",
}: {
  rows: Row[];
  columns: (string | Column)[];
  caption?: string;
  empty?: string;
}) {
  const defs = columns.map((column) =>
    typeof column === "string"
      ? { key: column, label: columnLabels[column] ?? humanize(column) }
      : column,
  );
  if (!rows.length) return <p className="empty">{empty}</p>;
  return (
    <div className="table-scroll" tabIndex={0} role="region" aria-label={caption ?? "Table"}>
      <table>
        {caption && <caption className="visually-hidden">{caption}</caption>}
        <thead>
          <tr>
            {defs.map((column) => (
              <th key={column.key} scope="col">
                {column.label ?? humanize(column.key)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={String(row.id ?? i)}>
              {defs.map((column) => (
                <td key={column.key} data-label={column.label ?? humanize(column.key)}>
                  {column.render ? column.render(row) : cell(column.key, row[column.key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="empty-state">
      <p>
        <strong>{title}</strong>
      </p>
      {children && <div className="help">{children}</div>}
    </div>
  );
}

export function Progress({ value, max, label }: { value: number; max: number; label: string }) {
  const percent = max > 0 ? Math.min(100, Math.round((value / max) * 100)) : 0;
  return (
    <div className="progress">
      <div
        className="progress-track"
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={Math.min(value, max)}
        aria-valuetext={`${value} of ${max} (${percent}%)`}
      >
        <span style={{ width: `${percent}%` }} />
      </div>
      <span className="progress-label">
        {value.toLocaleString()} / {max.toLocaleString()} · {percent}%
      </span>
    </div>
  );
}

export function CopyField({
  label,
  value,
  help,
}: {
  label: string;
  value: string;
  help?: ReactNode;
}) {
  const id = useId();
  const [copied, setCopied] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
    } catch {
      input.current?.select();
      document.execCommand("copy");
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  }
  return (
    <div className="copy-field">
      <label htmlFor={id}>{label}</label>
      <div className="copy-row">
        <input
          id={id}
          ref={input}
          readOnly
          value={value}
          onFocus={(event) => event.currentTarget.select()}
        />
        <button type="button" onClick={copy}>
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <span className="visually-hidden" aria-live="polite">
        {copied ? `${label} copied` : ""}
      </span>
      {help && <p className="help">{help}</p>}
    </div>
  );
}

export type ConfirmOptions = {
  title: string;
  body?: ReactNode;
  confirm: string;
  danger?: boolean;
};

/** Accessible modal confirmation using the native dialog element. */
export function useConfirm() {
  const [request, setRequest] = useState<ConfirmOptions & { resolve: (ok: boolean) => void }>();
  const ask = useCallback(
    (options: ConfirmOptions) =>
      new Promise<boolean>((resolve) => setRequest({ ...options, resolve })),
    [],
  );
  const finish = (ok: boolean) => {
    request?.resolve(ok);
    setRequest(undefined);
  };
  const element = request ? (
    <Dialog title={request.title} onClose={() => finish(false)}>
      {request.body}
      <div className="actions dialog-actions">
        <button
          type="button"
          className={request.danger ? "danger" : undefined}
          onClick={() => finish(true)}
        >
          {request.confirm}
        </button>
        <button
          type="button"
          className="secondary"
          // A stray Enter must never delete or erase: destructive dialogs open on Cancel.
          data-autofocus={request.danger ? "" : undefined}
          onClick={() => finish(false)}
        >
          Cancel
        </button>
      </div>
    </Dialog>
  ) : null;
  return [element, ask] as const;
}

export function Dialog({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    const opener = document.activeElement as HTMLElement | null;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>("[data-autofocus]")?.focus();
    const cancel = (event: Event) => {
      event.preventDefault();
      close.current();
    };
    dialog.addEventListener("cancel", cancel);
    return () => {
      dialog.removeEventListener("cancel", cancel);
      if (dialog.open) dialog.close();
      opener?.focus?.();
    };
  }, []);
  return (
    <dialog ref={ref} aria-labelledby={id} className="dialog">
      <h2 id={id}>{title}</h2>
      {children}
    </dialog>
  );
}

export type Viewer = {
  id: string;
  name: string;
  role?: string;
  balance?: number;
  lastSeen?: number;
};

/** Search observed viewers by name or Kick user ID. */
export function ViewerPicker({
  label = "Viewer",
  value,
  onChange,
  expired,
}: {
  label?: string;
  value?: Viewer;
  onChange: (viewer?: Viewer) => void;
  expired?: () => void;
}) {
  const id = useId();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Viewer[]>([]);
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const expiredRef = useRef(expired);
  useEffect(() => {
    expiredRef.current = expired;
  }, [expired]);
  useEffect(() => {
    if (value) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      setState("loading");
      try {
        const response = await fetch(
          `/api/control?${new URLSearchParams({ view: "viewers", q: query.trim() })}`,
          {
            cache: "no-store",
            signal: controller.signal,
          },
        );
        if (response.status === 401) return expiredRef.current?.();
        const data = await response.json();
        if (!response.ok) throw new Error(data.error);
        setResults(data.items as Viewer[]);
        setState("idle");
      } catch {
        if (!controller.signal.aborted) setState("error");
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query, value]);
  if (value)
    return (
      <div className="picked">
        <span className="picked-label">{label}</span>
        <strong>{value.name}</strong>
        {value.balance !== undefined && (
          <span className="help">{value.balance.toLocaleString()} points</span>
        )}
        <button type="button" className="secondary small" onClick={() => onChange(undefined)}>
          Change<span className="visually-hidden"> {label.toLowerCase()}</span>
        </button>
      </div>
    );
  return (
    <div className="viewer-picker">
      <label htmlFor={id}>
        {label}
        <input
          id={id}
          type="search"
          value={query}
          placeholder="Search by name or Kick user ID"
          autoComplete="off"
          aria-describedby={`${id}-hint`}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>
      <p id={`${id}-hint`} className="help" aria-live="polite">
        {state === "loading"
          ? "Searching…"
          : state === "error"
            ? "Search is unavailable right now."
            : results.length
              ? `${results.length} viewer${results.length === 1 ? "" : "s"} found. Choose one.`
              : query
                ? "No observed viewer matches. Viewers appear after they chat."
                : "No viewers have chatted yet."}
      </p>
      {results.length > 0 && (
        <ul className="pick-list">
          {results.map((viewer) => (
            <li key={viewer.id}>
              <button type="button" className="secondary" onClick={() => onChange(viewer)}>
                <strong>{viewer.name}</strong>
                <span>
                  {viewer.balance !== undefined
                    ? `${Number(viewer.balance).toLocaleString()} points · `
                    : ""}
                  seen {viewer.lastSeen ? relative(Number(viewer.lastSeen)) : "—"}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Save JSON returned by an export action as a file. */
export function downloadJson(name: string, data: unknown) {
  const url = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
