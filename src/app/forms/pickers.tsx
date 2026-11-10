"use client";
// Controls populated from current dashboard state: uploaded assets, other documents, recent
// viewers and Discord grant rows. Each falls back to a plain input when state is unavailable.
import { useRef, useState } from "react";
import Image from "next/image";
import type { ConfigDocument } from "../../server/domain/catalog.ts";
import type { Row, Snapshot } from "../ui";
import { insertAt, VariableButtons, type Described } from "./fields.tsx";
import {
  grantPermissions,
  grantRowErrors,
  grantsToRows,
  maxGrants,
  permissionLabels,
  rowsToGrants,
  type GrantPermission,
  type GrantRow,
} from "./grants.ts";
import { alertEvents } from "./template.ts";
import { localTimezone, timezones } from "./time.ts";

const aria = (d: Described) => ({
  id: d.id,
  "aria-describedby": d.describedBy,
  "aria-invalid": d.invalid || undefined,
});

export function TimezoneSelect({
  d,
  value,
  set,
}: {
  d: Described;
  value: unknown;
  set: (value: string) => void;
}) {
  const current = String(value ?? "UTC");
  const [zones] = useState(() => timezones(current));
  const [mine] = useState(localTimezone);
  return (
    <div className="kf-inline">
      <select {...aria(d)} value={current} onChange={(event) => set(event.target.value)}>
        {zones.map((zone) => (
          <option key={zone} value={zone}>
            {zone.replaceAll("_", " ")}
            {zone === mine ? " (your timezone)" : ""}
          </option>
        ))}
      </select>
      {mine !== current && (
        <button type="button" className="secondary kf-small" onClick={() => set(mine)}>
          Use mine
        </button>
      )}
    </div>
  );
}

const formats = { image: ["png", "jpg", "gif", "webp"], sound: ["wav", "ogg", "mp3"] };
const accepts = {
  image: "image/png,image/jpeg,image/gif,image/webp",
  sound: "audio/mpeg,audio/ogg,audio/wav",
};

async function upload(file: File): Promise<Row> {
  if (file.size > 8 * 1024 * 1024) throw new Error("Files must be 8 MiB or smaller.");
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1] ?? "");
    reader.onerror = () => reject(new Error("The file could not be read."));
    reader.readAsDataURL(file);
  });
  const session = await (await fetch("/api/auth", { cache: "no-store" })).json();
  const response = await fetch("/api/control", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrf ?? "" },
    body: JSON.stringify({ action: "asset.upload", input: { name: file.name, base64 } }),
  });
  const result = await response.json();
  if (!response.ok)
    throw new Error(
      result.error === "permission_denied"
        ? "Your account cannot upload files."
        : result.error === "unsupported_asset_format"
          ? "That file type is not supported. Use PNG, JPG, GIF, WebP, WAV, OGG or MP3."
          : result.error === "invalid_asset_size_or_encoding"
            ? "That file is empty, larger than 8 MiB or damaged."
            : `Upload failed (${String(result.error ?? "unknown error").replaceAll("_", " ")}).`,
    );
  return result as Row;
}

export function AssetPicker({
  d,
  label,
  value,
  set,
  accept,
  snapshot,
}: {
  d: Described;
  label: string;
  value: unknown;
  set: (value: string | null) => void;
  accept: "image" | "sound";
  snapshot?: Snapshot;
}) {
  const [uploaded, setUploaded] = useState<Row[]>([]);
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const current = typeof value === "string" && value ? value : null;
  if (!snapshot?.assets)
    return (
      <>
        <input
          {...aria(d)}
          className="kf-mono"
          value={current ?? ""}
          placeholder="No file"
          onChange={(event) => set(event.target.value.trim() || null)}
        />
        <p className="kf-count">
          Only the owner can browse uploaded files. Ask them for the file ID from Alerts → Upload
          image or sound, or leave blank.
        </p>
      </>
    );
  const assets = [...snapshot.assets, ...uploaded].filter(
    (asset, index, all) =>
      formats[accept].includes(String(asset.format)) &&
      all.findIndex((other) => other.id === asset.id) === index,
  );
  const known = assets.some((asset) => asset.id === current);
  const src = current && known ? `/api/assets/${encodeURIComponent(current)}` : null;
  return (
    <>
      <select
        {...aria(d)}
        value={current ?? ""}
        onChange={(event) => set(event.target.value || null)}
      >
        <option value="">No {accept}</option>
        {assets.map((asset) => (
          <option key={String(asset.id)} value={String(asset.id)}>
            {String(asset.name)} ({String(asset.format).toUpperCase()},{" "}
            {Math.max(1, Math.round(Number(asset.bytes) / 1024))} KB)
          </option>
        ))}
        {current && !known && <option value={current}>Missing file ({current})</option>}
      </select>
      {src && accept === "image" && (
        <Image
          unoptimized
          className="kf-thumb"
          src={src}
          width={160}
          height={90}
          alt={`Selected ${label.toLowerCase()}`}
        />
      )}
      {src && accept === "sound" && (
        <audio controls src={src} className="kf-audio" aria-label={`Play selected ${label}`} />
      )}
      <label className="kf-upload">
        <span>Upload a new {accept}</span>
        <input
          type="file"
          accept={accepts[accept]}
          disabled={busy}
          onChange={async (event) => {
            const file = event.target.files?.[0];
            event.target.value = "";
            if (!file) return;
            setBusy(true);
            setStatus(`Uploading ${file.name}…`);
            try {
              const asset = await upload(file);
              setUploaded((previous) => [...previous, asset]);
              set(String(asset.id));
              setStatus(`Uploaded ${file.name} and selected it.`);
            } catch (error) {
              setStatus(error instanceof Error ? error.message : "Upload failed.");
            } finally {
              setBusy(false);
            }
          }}
        />
      </label>
      {status && (
        <p className="kf-count" role="status">
          {status}
        </p>
      )}
    </>
  );
}

const targetKind: Record<string, "goal" | "poll" | "raffle" | "command"> = {
  goal: "goal",
  multigoal: "goal",
  poll: "poll",
  raffle: "raffle",
  counter: "command",
};

export function TargetPicker({
  d,
  value,
  set,
  type,
  documents,
}: {
  d: Described;
  value: unknown;
  set: (value: string) => void;
  type: string;
  documents?: ConfigDocument[];
}) {
  const current = String(value ?? "");
  const kind = targetKind[type];
  if (!documents || !kind)
    return (
      <input
        {...aria(d)}
        className="kf-mono"
        value={current}
        placeholder="Leave blank for automatic"
        onChange={(event) => set(event.target.value.trim())}
      />
    );
  const choices = documents.filter((doc) => doc.kind === kind);
  const automatic =
    kind === "command"
      ? "Choose a command…"
      : kind === "goal"
        ? "Automatic: all enabled goals"
        : `Automatic: the latest ${kind}`;
  return (
    <>
      <select {...aria(d)} value={current} onChange={(event) => set(event.target.value)}>
        <option value="">{automatic}</option>
        {choices.map((doc) => (
          <option key={doc.id} value={doc.id}>
            {String(doc.data.name)}
            {kind === "command" ? ` (${String(doc.data.trigger)})` : ""}
            {kind === "command" && doc.data.counter !== true ? " — Count uses is off" : ""}
            {doc.data.enabled === false ? " — disabled" : ""}
          </option>
        ))}
        {current && !choices.some((doc) => doc.id === current) && (
          <option value={current}>Missing or deleted ({current})</option>
        )}
      </select>
      {!choices.length && (
        <p className="kf-count">
          No {kind === "command" ? "commands" : `${kind}s`} yet. Create one first, then come back.
        </p>
      )}
    </>
  );
}

export function ViewerInput({
  d,
  value,
  set,
  viewers,
}: {
  d: Described;
  value: unknown;
  set: (value: string) => void;
  viewers?: Row[];
}) {
  const current = String(value ?? "");
  const listId = `${d.id}-viewers`;
  const match = viewers?.find((viewer) => String(viewer.id) === current);
  return (
    <>
      <input
        {...aria(d)}
        className="kf-mono"
        inputMode="numeric"
        list={viewers?.length ? listId : undefined}
        value={current}
        autoComplete="off"
        placeholder="Kick viewer ID"
        onChange={(event) => {
          const typed = event.target.value;
          const byName = viewers?.find(
            (viewer) => String(viewer.name).toLowerCase() === typed.trim().toLowerCase(),
          );
          set(byName ? String(byName.id) : typed.trim());
        }}
      />
      {Boolean(viewers?.length) && (
        <datalist id={listId}>
          {viewers!.map((viewer) => (
            <option key={String(viewer.id)} value={String(viewer.id)}>
              {String(viewer.name)}
            </option>
          ))}
        </datalist>
      )}
      {match && <p className="kf-count">Viewer: {String(match.name)}</p>}
    </>
  );
}

export function Winners({ value, viewers }: { value: unknown; viewers?: Row[] }) {
  const winners = Array.isArray(value) ? value.map(String) : [];
  if (!winners.length)
    return <p className="kf-count">No winners drawn yet. Use Draw on the raffle card.</p>;
  return (
    <>
      <ul className="kf-chips">
        {winners.map((winner, index) => (
          <li key={`${winner}-${index}`} className="kf-chip">
            {String(viewers?.find((viewer) => String(viewer.id) === winner)?.name ?? winner)}
          </li>
        ))}
      </ul>
      <p className="kf-count">Change winners with Draw or Reroll on the raffle card.</p>
    </>
  );
}

let rowCounter = 0;
const nextKey = () => `grant-${++rowCounter}`;

export function GrantRows({
  d,
  value,
  set,
  noun,
}: {
  d: Described;
  value: unknown;
  set: (value: { id: string; permission: GrantPermission }[]) => void;
  noun: "role" | "user";
}) {
  const [rows, setRows] = useState<GrantRow[]>(() => grantsToRows(value, nextKey));
  const refs = useRef<Record<string, HTMLInputElement | null>>({});
  const errors = grantRowErrors(rows, noun);
  const update = (next: GrantRow[]) => {
    setRows(next);
    set(rowsToGrants(next));
  };
  const title = noun === "role" ? "Role" : "User";
  return (
    <>
      {rows.length === 0 && <p className="kf-count">No {noun} grants yet.</p>}
      <ol className="kf-grants">
        {rows.map((row, index) => {
          const idInput = `${d.id}-${row.key}-id`,
            permission = `${d.id}-${row.key}-permission`,
            error = errors[row.key];
          return (
            <li key={row.key} className="kf-grant">
              <div>
                <label className="kf-row-label" htmlFor={idInput}>
                  {title} ID {index + 1}
                </label>
                <input
                  ref={(element) => {
                    refs.current[row.key] = element;
                  }}
                  id={idInput}
                  className="kf-mono"
                  inputMode="numeric"
                  autoComplete="off"
                  placeholder={noun === "role" ? "Role ID" : "User ID"}
                  value={row.id}
                  aria-invalid={Boolean(error) || undefined}
                  aria-describedby={error ? `${idInput}-error` : undefined}
                  onChange={(event) =>
                    update(
                      rows.map((item) =>
                        item.key === row.key ? { ...item, id: event.target.value } : item,
                      ),
                    )
                  }
                />
              </div>
              <div>
                <label className="kf-row-label" htmlFor={permission}>
                  Permission {index + 1}
                </label>
                <select
                  id={permission}
                  value={row.permission}
                  aria-describedby={`${permission}-help`}
                  onChange={(event) =>
                    update(
                      rows.map((item) =>
                        item.key === row.key
                          ? { ...item, permission: event.target.value as GrantPermission }
                          : item,
                      ),
                    )
                  }
                >
                  {grantPermissions.map((option) => (
                    <option key={option} value={option}>
                      {permissionLabels[option].label}
                    </option>
                  ))}
                </select>
                <span className="kf-count" id={`${permission}-help`}>
                  {permissionLabels[row.permission].help}
                </span>
              </div>
              <button
                type="button"
                className="secondary kf-small"
                aria-label={`Remove ${noun} grant ${index + 1}`}
                onClick={() => update(rows.filter((item) => item.key !== row.key))}
              >
                Remove
              </button>
              {error && (
                <p className="kf-error kf-grant-error" id={`${idInput}-error`}>
                  {error}
                </p>
              )}
            </li>
          );
        })}
      </ol>
      <button
        type="button"
        className="secondary"
        disabled={rows.length >= maxGrants}
        onClick={() => {
          const row = { key: nextKey(), id: "", permission: "operate" as const };
          setRows([...rows, row]);
          requestAnimationFrame(() => refs.current[row.key]?.focus());
        }}
      >
        Add {noun} grant
      </button>
      {rows.length >= maxGrants && <p className="kf-count">Maximum of {maxGrants} reached.</p>}
    </>
  );
}

export function TemplateInput({
  d,
  value,
  set,
  event,
  maxLength,
}: {
  d: Described;
  value: unknown;
  set: (value: string) => void;
  event: string;
  maxLength?: number;
}) {
  const text = String(value ?? "");
  const ref = useRef<HTMLTextAreaElement>(null);
  const caret = useRef({ start: -1, end: -1 });
  const remember = () => {
    if (ref.current)
      caret.current = {
        start: ref.current.selectionStart ?? text.length,
        end: ref.current.selectionEnd ?? text.length,
      };
  };
  return (
    <>
      <VariableButtons
        variables={alertEvents[event]?.variables ?? []}
        insert={(token) => {
          const start = caret.current.start < 0 ? text.length : caret.current.start;
          const end = caret.current.end < 0 ? text.length : caret.current.end;
          const result = insertAt(text, token, start, end);
          set(result.text);
          caret.current = { start: result.caret, end: result.caret };
          requestAnimationFrame(() => {
            ref.current?.focus();
            ref.current?.setSelectionRange(result.caret, result.caret);
          });
        }}
      />
      <textarea
        {...aria(d)}
        ref={ref}
        rows={2}
        value={text}
        maxLength={maxLength}
        onChange={(event) => {
          set(event.target.value);
          remember();
        }}
        onSelect={remember}
        onFocus={remember}
      />
    </>
  );
}
