"use client";
import { describeError, errorText } from "../messages";
import { ControlError, formatTime, text, type Row } from "../ui";
import type { PanelProps } from "./types";

const fields: Record<string, { label: string; help?: string }[]> = {
  kick: [
    { label: "clientId", help: "Client ID from your Kick developer app" },
    { label: "clientSecret", help: "Client secret from the same app" },
    { label: "broadcasterId", help: "Your channel's numeric Kick user ID" },
  ],
  discord: [
    { label: "applicationId", help: "Application ID from the Discord developer portal" },
    { label: "publicKey", help: "Public key from the same page" },
    { label: "botToken", help: "Bot token from the Bot page" },
  ],
  youtube: [{ label: "key", help: "YouTube Data API key, used to check requested videos" }],
};
const names: Record<string, string> = { kick: "Kick", discord: "Discord", youtube: "YouTube" };

export default function ConnectionsPanel({
  snapshot: s,
  auth,
  run,
  busy,
  message,
  confirm,
}: PanelProps) {
  const owner = auth.actor?.role === "owner";
  if (!owner) return null;
  const kick = s.kick;
  const facts: [string, unknown][] = kick.authorized
    ? [
        ["Channel", kick.authorizedUsername],
        ["Broadcaster ID", kick.broadcasterId],
        [
          "Permissions granted",
          Array.isArray(kick.scopes) ? (kick.scopes as string[]).join(", ") : kick.scopes,
        ],
        ["Access expires", formatTime(kick.expiresAt)],
        ["Last refreshed", formatTime(kick.lastRefreshAt)],
        ["Event subscriptions checked", formatTime(kick.subscriptionsCheckedAt)],
        ["Last confirmed chat reply", formatTime(kick.lastConfirmedReply)],
      ]
    : [];
  return (
    <>
      <section aria-labelledby="kick-heading">
        <div className="section-title">
          <h2 id="kick-heading">Kick connection</h2>
          <span className={`badge ${kick.authorized ? "live" : "warn"}`}>
            {kick.authorized ? "Connected" : "Not connected"}
          </span>
        </div>
        {kick.error ? (
          <p className="problem">
            {describeError(String(kick.error)).title} {describeError(String(kick.error)).next}
          </p>
        ) : null}
        {facts.length > 0 ? (
          <dl className="facts">
            {facts.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{text(value)}</dd>
              </div>
            ))}
          </dl>
        ) : (
          <p>
            Save your Kick application settings below, then authorize while signed in to Kick as
            your channel.
          </p>
        )}
        <div className="actions">
          <button
            disabled={busy}
            onClick={async () => {
              try {
                const response = await fetch("/api/connections/kick?moderation=1", {
                  method: "POST",
                  headers: { "Content-Type": "application/json", "X-CSRF-Token": auth.csrf ?? "" },
                  body: "{}",
                });
                const result = await response.json();
                if (!response.ok) throw new ControlError(String(result.error));
                location.assign(result.url);
              } catch (error) {
                message(errorText(error, "Authorization could not start."));
              }
            }}
          >
            Authorize Kick with moderation
          </button>
          <button className="secondary" disabled={busy} onClick={() => run("kick.subscribe")}>
            Subscribe to events
          </button>
          <button className="secondary" disabled={busy} onClick={() => run("kick.refresh")}>
            Refresh connection
          </button>
          <button
            className="secondary"
            disabled={busy || !kick.authorized}
            onClick={async () => {
              if (
                await confirm({
                  title: "Disconnect Kick?",
                  body: (
                    <p>
                      KekBot stops receiving chat and events and asks Kick to revoke its access.
                      Check Kick&apos;s connected apps afterwards.
                    </p>
                  ),
                  confirm: "Disconnect",
                  danger: true,
                })
              )
                void run("kick.disconnect");
            }}
          >
            Disconnect
          </button>
        </div>
      </section>
      {(["kick", "discord", "youtube"] as const).map((provider) => (
        <form
          key={provider}
          onSubmit={async (event) => {
            event.preventDefault();
            const data: Row = Object.fromEntries(new FormData(event.currentTarget));
            if (provider === "kick") data.broadcasterId = Number(data.broadcasterId);
            const form = event.currentTarget;
            if (await run("integration.save", { provider, data })) form.reset();
          }}
        >
          <div className="section-title">
            <h2>{names[provider]} application settings</h2>
            <span className={`badge ${s.integrations[provider] ? "live" : "muted"}`}>
              {s.integrations[provider] ? "Saved" : provider === "kick" ? "Not saved" : "Optional"}
            </span>
          </div>
          <p className="help">
            Encrypted on the host and never shown again. Saving replaces the previous values.
            {s.mode === "fixture"
              ? " This fixture installation cannot store real credentials."
              : ""}
          </p>
          <div className="fields">
            {fields[provider].map(({ label, help }) => (
              <label key={label}>
                {help} ({label})
                <input
                  name={label}
                  type={/secret|token|key/i.test(label) ? "password" : "text"}
                  inputMode={label === "broadcasterId" ? "numeric" : undefined}
                  autoComplete="off"
                  required
                />
              </label>
            ))}
          </div>
          <button disabled={busy}>Save {names[provider]} settings</button>
        </form>
      ))}
      <section aria-labelledby="discord-commands">
        <h2 id="discord-commands">Discord commands</h2>
        <p className="help">
          After adding Discord servers below, register KekBot&apos;s slash commands in them. Repeat
          after changing servers or turning on media.
        </p>
        <button disabled={busy} onClick={() => run("discord.register")}>
          Register Discord commands in allowed guilds
        </button>
      </section>
    </>
  );
}
