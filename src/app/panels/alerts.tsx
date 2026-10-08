"use client";
import { useState } from "react";
import Image from "next/image";
import { ActionForm, Table, permitted, text, type Row } from "../ui";
import type { PanelProps } from "./types";

export default function AlertsPanel({ snapshot: s, auth, run, busy, message }: PanelProps) {
  const owner = auth.actor?.role === "owner",
    can = (permission: Parameters<typeof permitted>[1]) => permitted(auth.actor, permission);
  const [preview, setPreview] = useState<Row[]>();
  return (
    <>
      {can("operate") && (
        <>
          <ActionForm
            action="alert.manual"
            fields={["reason"]}
            button="Send manual alert"
            run={run}
            busy={busy}
          />
          <label>
            Preview event
            <select id="preview-event">
              {[
                "channel.followed",
                "channel.subscription.new",
                "channel.subscription.renewal",
                "channel.subscription.gifts",
                "manual",
                "goal",
                "media",
              ].map((event) => (
                <option key={event}>{event}</option>
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
          <h3>Upload image or sound</h3>
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
          <Table rows={s.assets ?? []} columns={["id", "name", "format", "bytes"]} />
          {s.assets?.map((asset) => (
            <button
              key={String(asset.id)}
              type="button"
              className="secondary"
              onClick={() => run("asset.delete", { id: asset.id })}
            >
              Delete {text(asset.name)}
            </button>
          ))}
        </form>
      )}
    </>
  );
}
