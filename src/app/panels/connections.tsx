"use client";
import { describeError, errorText } from "../messages";
import { ControlError, formatTime, text, type Row } from "../ui";
import type { PanelProps } from "./types";

// `name` is the API field; `label` and `help` are what people read.
const fields: Record<string, { name: string; label: string; help: string }[]> = {
  kick: [
    { name: "clientId", label: "Client ID", help: "From your Kick developer app." },
    { name: "clientSecret", label: "Client secret", help: "From the same Kick app." },
    {
      name: "broadcasterId",
      label: "Channel user ID",
      help: "Your channel's numeric Kick user ID.",
    },
  ],
  discord: [
    {
      name: "applicationId",
      label: "Application ID",
      help: "From the Discord developer portal, General Information.",
    },
    { name: "publicKey", label: "Public key", help: "From the same page." },
    { name: "botToken", label: "Bot token", help: "From the Bot page." },
  ],
  youtube: [
    { name: "key", label: "YouTube Data API key", help: "Used to check requested videos." },
  ],
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
  const fixture = s.mode === "fixture";
  // Say why a button cannot be used yet instead of letting it fail.
  const kickBlocked = fixture
    ? "Live provider actions are turned off in this fixture installation."
    : !s.integrations.kick
      ? "Save your Kick application settings below first."
      : undefined;
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
        {kickBlocked && !kick.authorized && !kick.error && (
          <p className="help" id="kick-blocked">
            {kickBlocked}
          </p>
        )}
        <div className="actions">
          <button
            disabled={busy || Boolean(kickBlocked)}
            aria-describedby={kickBlocked ? "kick-blocked" : undefined}
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
          <button
            className="secondary"
            disabled={busy || !kick.authorized}
            title={kick.authorized ? undefined : "Authorize Kick first."}
            onClick={() => run("kick.subscribe")}
          >
            Subscribe to events
          </button>
          <button
            className="secondary"
            disabled={busy || !kick.authorized}
            title={kick.authorized ? undefined : "Authorize Kick first."}
            onClick={() => run("kick.refresh")}
          >
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
            {fixture
              ? "This fixture installation simulates this provider and cannot store real credentials."
              : "Encrypted on the host and never shown again. Saving replaces the previous values."}
          </p>
          <div className="fields">
            {fields[provider].map(({ name, label, help }) => (
              <label key={name}>
                {label}
                <span className="help field-help">{help}</span>
                <input
                  name={name}
                  type={/secret|token|key/i.test(name) ? "password" : "text"}
                  inputMode={name === "broadcasterId" ? "numeric" : undefined}
                  autoComplete="off"
                  required
                  disabled={fixture}
                />
              </label>
            ))}
          </div>
          <button disabled={busy || fixture}>Save {names[provider]} settings</button>
        </form>
      ))}
      <section aria-labelledby="discord-commands">
        <h2 id="discord-commands">Discord commands</h2>
        <p className="help">
          After adding Discord servers below, register KekBot&apos;s slash commands in them. Repeat
          after changing servers or turning media requests or points on or off.
        </p>
        {!fixture && !s.integrations.discord && (
          <p className="help" id="discord-blocked">
            Save your Discord application settings above first.
          </p>
        )}
        <button
          disabled={busy || (!fixture && !s.integrations.discord)}
          aria-describedby={!fixture && !s.integrations.discord ? "discord-blocked" : undefined}
          onClick={() => run("discord.register")}
        >
          Register Discord commands in your servers
        </button>
      </section>
    </>
  );
}
