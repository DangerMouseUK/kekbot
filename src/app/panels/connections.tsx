"use client";
import { type Row } from "../ui";
import type { PanelProps } from "./types";

export default function ConnectionsPanel({ snapshot: s, auth, run, busy, message }: PanelProps) {
  const owner = auth.actor?.role === "owner";
  if (!owner) return null;
  return (
    <>
      <section>
        <h2>Kick connection</h2>
        <pre>{JSON.stringify(s.kick, null, 2)}</pre>
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
                if (!response.ok) throw new Error(result.error);
                location.assign(result.url);
              } catch (error) {
                message(error instanceof Error ? error.message : "Authorization failed");
              }
            }}
          >
            Authorize Kick with moderation
          </button>
          {["refresh", "subscribe", "disconnect"].map((action) => (
            <button
              className="secondary"
              disabled={busy}
              key={action}
              onClick={() => run(`kick.${action}`)}
            >
              {action}
            </button>
          ))}
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
            await run("integration.save", { provider, data });
            form.reset();
          }}
        >
          <h2>{provider} application settings</h2>
          <p className="help">
            Encrypted on the host and never returned. Fixture mode rejects live credentials.
          </p>
          <div className="fields">
            {(provider === "kick"
              ? ["clientId", "clientSecret", "broadcasterId"]
              : provider === "discord"
                ? ["applicationId", "publicKey", "botToken"]
                : ["key"]
            ).map((key) => (
              <label key={key}>
                {key}
                <input
                  name={key}
                  type={/secret|token|key/i.test(key) ? "password" : "text"}
                  autoComplete="off"
                  required
                />
              </label>
            ))}
          </div>
          <button disabled={busy}>Save {provider} settings</button>
        </form>
      ))}
      <button disabled={busy} onClick={() => run("discord.register")}>
        Register Discord commands in allowed guilds
      </button>
    </>
  );
}
