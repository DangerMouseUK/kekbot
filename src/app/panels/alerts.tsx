"use client";
import { useState } from "react";
import Image from "next/image";
import { eventLabels } from "../messages";
import { Table, formatBytes, permitted, text, type Row } from "../ui";
import type { PanelProps } from "./types";

export default function AlertsPanel({
  snapshot: s,
  auth,
  run,
  busy,
  message,
  confirm,
}: PanelProps) {
  const owner = auth.actor?.role === "owner",
    can = (permission: Parameters<typeof permitted>[1]) => permitted(auth.actor, permission);
  const [preview, setPreview] = useState<Row[]>();
  return (
    <>
      {can("operate") && (
        <>
          <form
            className="inline"
            onSubmit={async (event) => {
              event.preventDefault();
              const form = event.currentTarget;
              const reason = String(new FormData(form).get("reason")).trim();
              if (await run("alert.manual", { reason })) form.reset();
            }}
          >
            <label>
              Manual alert text
              <input name="reason" required maxLength={500} placeholder="Thanks for the raid!" />
            </label>
            <button disabled={busy}>Send manual alert</button>
          </form>
          <p className="help">
            Manual alerts show on your OBS alerts source using your enabled “Manual alert” settings.
          </p>
          <label>
            Preview event
            <select id="preview-event">
              {Object.entries(eventLabels).map(([event, label]) => (
                <option key={event} value={event}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <button
            className="secondary"
            onClick={async () => {
              const event = (document.getElementById("preview-event") as HTMLSelectElement).value;
              const response = await fetch("/api/control", {
                method: "POST",
                headers: { "Content-Type": "application/json", "X-CSRF-Token": auth.csrf ?? "" },
                body: JSON.stringify({ action: "alert.preview", input: { event } }),
              });
              const result = await response.json();
              if (response.ok) setPreview(result.alerts);
              else message(result.error);
            }}
          >
            Preview without delivery
          </button>
          {preview && (
            <div
              className="widget-root"
              data-theme="mint"
              data-motion="true"
              aria-label="Alert preview"
            >
              {preview.length ? (
                preview.map((alert, index) => (
                  <article key={index}>
                    {Boolean(alert.image) && (
                      <Image
                        unoptimized
                        src={`/api/assets/${encodeURIComponent(String(alert.image))}`}
                        width={640}
                        height={360}
                        alt=""
                      />
                    )}
                    <h2>{text(alert.text)}</h2>
                    {Boolean(alert.sound) && (
                      <audio
                        controls
                        src={`/api/assets/${encodeURIComponent(String(alert.sound))}`}
                      />
                    )}
                  </article>
                ))
              ) : (
                <p>No enabled alert configuration for this event.</p>
              )}
            </div>
          )}
        </>
      )}
      {owner && (
        <form
          onSubmit={async (event) => {
            event.preventDefault();
            const file = (event.currentTarget.elements.namedItem("asset") as HTMLInputElement)
              .files?.[0];
            if (!file) return;
            if (file.size > 8 * 1024 * 1024) {
              message("Assets must be at most 8 MiB.");
              return;
            }
            const reader = new FileReader();
            reader.onload = () =>
              void run("asset.upload", {
                name: file.name,
                base64: String(reader.result).split(",")[1],
              });
            reader.readAsDataURL(file);
          }}
        >
          <h3>Images and sounds for alerts</h3>
          <p className="help">PNG, JPEG, GIF, WebP, MP3, OGG or WAV, up to 8 MiB each.</p>
          <label>
            Asset file
            <input
              type="file"
              name="asset"
              accept="image/png,image/jpeg,image/gif,image/webp,audio/mpeg,audio/ogg,audio/wav"
              required
            />
          </label>
          <button disabled={busy}>Upload</button>
          <Table
            caption="Uploaded files"
            empty="No files uploaded yet."
            rows={s.assets ?? []}
            columns={[
              "name",
              { key: "format", label: "Type", render: (row) => String(row.format).toUpperCase() },
              { key: "bytes", label: "Size", render: (row) => formatBytes(row.bytes) },
              {
                key: "actions",
                label: "Actions",
                render: (asset) => (
                  <button
                    type="button"
                    className="secondary small"
                    disabled={busy}
                    onClick={async () => {
                      if (
                        await confirm({
                          title: `Delete ${text(asset.name)}?`,
                          body: (
                            <p>Alerts that use it must be changed first. This cannot be undone.</p>
                          ),
                          confirm: "Delete file",
                          danger: true,
                        })
                      )
                        void run("asset.delete", { id: asset.id });
                    }}
                  >
                    Delete {text(asset.name)}
                  </button>
                ),
              },
            ]}
          />
        </form>
      )}
    </>
  );
}
