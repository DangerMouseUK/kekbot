"use client";
// Live previews rendered locally with the same template rules the server uses. They send
// nothing to chat or OBS; the dashboard's own preview actions remain available after saving.
import Image from "next/image";
import type { Data } from "./layouts.ts";
import { alertEvents, commandSample, renderTemplate, timerSample } from "./template.ts";

function Unavailable({ text }: { text: string }) {
  const missing = [...text.matchAll(/\[([a-z][a-z0-9_]*) unavailable\]/g)].map((m) => m[1]);
  if (!missing.length) return null;
  return (
    <p className="kf-warning">
      {[...new Set(missing)].map((name) => `{${name}}`).join(", ")} is not available here and will
      show as “[… unavailable]”.
    </p>
  );
}

export function TemplatePreview({
  kind,
  data,
  channel,
}: {
  kind: "command" | "timer" | "alert";
  data: Data;
  channel: string;
}) {
  if (kind === "alert") {
    const event = alertEvents[String(data.event)];
    const text = renderTemplate(String(data.template ?? ""), event?.sample ?? {});
    const image = typeof data.image === "string" && data.image ? data.image : null;
    return (
      <div className="kf-preview" role="group" aria-label="Alert preview">
        <p className="kf-preview-title">
          Preview · {event?.label ?? String(data.event)} with sample values
        </p>
        <div className="kf-alert-preview">
          {image && (
            <Image
              unoptimized
              src={`/api/assets/${encodeURIComponent(image)}`}
              width={160}
              height={90}
              alt=""
            />
          )}
          <strong>{text || "(empty)"}</strong>
        </div>
        <Unavailable text={text} />
        {event && <p className="kf-count">{event.help}</p>}
      </div>
    );
  }
  const lines = (
    Array.isArray(kind === "command" ? data.responses : data.messages)
      ? ((kind === "command" ? data.responses : data.messages) as unknown[])
      : []
  ).map(String);
  const sample = kind === "command" ? commandSample(channel) : timerSample(channel);
  const rendered = lines.map((line) => renderTemplate(line, sample));
  return (
    <div className="kf-preview" role="group" aria-label={`${kind} preview`}>
      <p className="kf-preview-title">
        Preview ·{" "}
        {kind === "command"
          ? `when “Preview viewer” types ${String(data.trigger || "the trigger")} sample arguments`
          : "what chat will see"}
      </p>
      {rendered.length ? (
        <ol className="kf-chat">
          {rendered.map((line, index) => (
            <li key={index}>
              <span className="kf-chat-name">{channel}</span>{" "}
              {line || <em>(empty {kind === "command" ? "response" : "message"})</em>}
            </li>
          ))}
        </ol>
      ) : (
        <p className="kf-count">
          Add a {kind === "command" ? "response" : "message"} to preview it.
        </p>
      )}
      <Unavailable text={rendered.join(" ")} />
      <p className="kf-count">
        {kind === "command"
          ? "One response is picked at random each time. Preview only: nothing is sent."
          : "Messages rotate in this order. Preview only: nothing is sent."}
      </p>
    </div>
  );
}
