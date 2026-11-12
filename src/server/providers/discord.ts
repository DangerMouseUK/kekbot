import { createPublicKey, verify } from "node:crypto";
import { z } from "zod";
import { encrypt, decrypt } from "../crypto.ts";
import { AppError, DeliveryError } from "../errors.ts";
import type { Actor, Permission } from "../auth.ts";
import { State } from "../domain/state.ts";
import type { MediaItem } from "../domain/media.ts";
import type { Job } from "../storage/repository.ts";
import {
  autocomplete,
  prepare,
  type Prepared,
  commandTree,
  runButton,
  runCommand,
  type ActionFn,
  type RawOption,
} from "./discord-commands.ts";
import * as format from "./discord-format.ts";
import type { Message, Outcome, Row } from "./discord-format.ts";

type Credentials = { applicationId: string; publicKey: string; botToken: string };
const snowflake = z.string().regex(/^\d{1,24}$/);
const option: z.ZodType<RawOption> = z.lazy(() =>
  z.object({
    name: z.string().max(32),
    type: z.number().int().optional(),
    value: z.union([z.string().max(1000), z.number(), z.boolean()]).optional(),
    focused: z.boolean().optional(),
    options: z.array(option).max(25).optional(),
  }),
);
const interactionSchema = z.object({
  id: snowflake,
  application_id: snowflake,
  type: z.number().int(),
  token: z.string().min(1).max(512),
  guild_id: snowflake.optional(),
  channel_id: snowflake.optional(),
  member: z
    .object({ user: z.object({ id: snowflake }), roles: z.array(snowflake).max(250) })
    .optional(),
  data: z
    .object({
      name: z.string().max(32).optional(),
      custom_id: z.string().max(100).optional(),
      component_type: z.number().int().optional(),
      options: z.array(option).max(25).optional(),
    })
    .optional(),
  // Only what a button click needs to update its own notification.
  message: z.object({ id: snowflake, flags: z.number().int().optional() }).optional(),
});
type Interaction = z.infer<typeof interactionSchema>;
/** `code` is the refusal's error code, kept server-side for diagnosis and never sent to Discord. */
type Stored = { reply?: Message; update?: Row[]; delivered?: boolean; code?: string };

/** Interaction types and callback types: https://docs.discord.com/developers/interactions/receiving-and-responding */
const PING = 1,
  COMMAND = 2,
  COMPONENT = 3,
  AUTOCOMPLETE = 4;
const EPHEMERAL = 64;
/** Shown privately to members who use KekBot where the owner has not added a route. */
export const UNROUTED =
  "KekBot isn't set up for this channel. Ask the streamer to add it in KekBot under Connections → Discord servers.";
/** Interaction job payload format; absent on jobs queued by the single-command release. */
const PAYLOAD_FORMAT = 2;

/** Bot permissions the notification channel needs: View Channel, Send Messages, Embed Links. */
export const DISCORD_BOT_PERMISSIONS = String((1 << 10) | (1 << 11) | (1 << 14));
export const DISCORD_SCOPES = ["bot", "applications.commands"] as const;

export class DiscordService {
  readonly state: State;
  private readonly request: typeof fetch;
  constructor(state: State, request: typeof fetch = fetch) {
    this.state = state;
    this.request = request;
  }
  credentials(): Credentials | undefined {
    if (this.state.config.mode === "fixture")
      return {
        applicationId: "900",
        publicKey: createPublicKey(this.state.config.fixtureDiscordPublicKey!)
          .export({ type: "spki", format: "der" })
          .subarray(-32)
          .toString("hex"),
        botToken: "fixture-disabled",
      };
    return this.state.secret<Credentials>("discord");
  }
  actor(interaction: Interaction): Actor {
    const guild = this.state
      .list("guild")
      .find(
        (g) =>
          g.data.enabled &&
          g.data.guildId === interaction.guild_id &&
          g.data.channelId === interaction.channel_id,
      );
    if (!guild || !interaction.member)
      throw new AppError("discord_guild_or_channel_not_allowed", 403);
    const member = interaction.member;
    const grants = new Set<Permission>(
      [
        ...guild.data.roles.filter((r) => member.roles.includes(r.id)),
        ...guild.data.users.filter((u) => u.id === member.user.id),
      ].map((g) => g.permission),
    );
    return {
      id: `discord:${interaction.guild_id}:${member.user.id}`,
      role: grants.size ? "moderator" : "readonly",
      permissions: [...grants],
      discord: {
        guild: interaction.guild_id!,
        channel: interaction.channel_id!,
        roles: member.roles,
        user: member.user.id,
      },
    };
  }

  /** Whether this interaction comes from a server and channel that has an enabled route. */
  private routed(interaction: Interaction) {
    try {
      this.actor(interaction);
      return true;
    } catch (error) {
      if (error instanceof AppError && error.code === "discord_guild_or_channel_not_allowed")
        return false;
      throw error;
    }
  }

  /** Synchronous HTTP entry: everything here must finish well inside Discord's 3-second deadline. */
  intake(body: Buffer, headers: Headers, credentials = this.credentials(), now = Date.now()) {
    if (!credentials) throw new AppError("discord_not_configured", 409);
    const signature = headers.get("x-signature-ed25519"),
      timestamp = headers.get("x-signature-timestamp");
    if (
      !signature ||
      !/^[a-f0-9]{128}$/i.test(signature) ||
      !timestamp ||
      !/^\d{10}$/.test(timestamp) ||
      Math.abs(now - Number(timestamp) * 1000) > 300000
    )
      throw new AppError("invalid_discord_signature", 401);
    const key = createPublicKey({
      key: Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"),
        Buffer.from(credentials.publicKey, "hex"),
      ]),
      format: "der",
      type: "spki",
    });
    if (
      !verify(
        null,
        Buffer.concat([Buffer.from(timestamp), body]),
        key,
        Buffer.from(signature, "hex"),
      )
    )
      throw new AppError("invalid_discord_signature", 401);
    let value: unknown;
    try {
      value = JSON.parse(body.toString());
    } catch {
      throw new AppError("invalid_discord_json", 400);
    }
    const interaction = interactionSchema.parse(value);
    if (interaction.application_id !== credentials.applicationId)
      throw new AppError("wrong_discord_application", 403);
    if (interaction.type === PING) return { type: 1 };
    if (interaction.type === AUTOCOMPLETE) {
      if (interaction.data?.name !== "kekbot")
        throw new AppError("unsupported_discord_interaction", 400);
      // Read-only suggestions are answered inline. Unknown routes and members get no data.
      try {
        return {
          type: 8,
          data: {
            choices: autocomplete(
              this.state,
              this.actor(interaction),
              interaction.data.options,
              now,
            ),
          },
        };
      } catch {
        return { type: 8, data: { choices: [] } };
      }
    }
    if (
      interaction.type === COMMAND
        ? interaction.data?.name !== "kekbot"
        : interaction.type !== COMPONENT || !format.parseCustomId(interaction.data?.custom_id ?? "")
    )
      throw new AppError("unsupported_discord_interaction", 400);
    // A verified request from a server or channel without a route gets a private explanation
    // instead of Discord's generic "interaction failed". It reveals no configuration and queues nothing.
    if (!this.routed(interaction))
      return {
        type: 4,
        data: { flags: EPHEMERAL, content: UNROUTED, allowed_mentions: { parse: [] } },
      };
    this.state.db
      .transaction(() => {
        const id = `discord:${interaction.id}`;
        if (this.state.db.prepare("SELECT 1 FROM receipts WHERE id=?").get(id)) return;
        const backlog = this.state.db
          .prepare("SELECT count(*) AS n FROM jobs WHERE status IN ('pending','running')")
          .get() as { n: number };
        if (backlog.n >= 10000) throw new AppError("job_backlog_full", 503);
        this.state.db
          .prepare(
            "INSERT INTO receipts(id,event_type,payload,received_at) VALUES(?,'discord.interaction',NULL,?)",
          )
          .run(id, now);
        // Capture what the member acted on now; the worker must not pick up newer state.
        const prepared =
          interaction.type === COMMAND ? prepare(this.state, interaction.data?.options) : undefined;
        // Interaction tokens are bearer credentials and expire after 15 minutes.
        this.state.effect(id, "discord.interaction", {
          encrypted: encrypt(
            JSON.stringify({
              interaction,
              expires: now + 14 * 60000,
              format: PAYLOAD_FORMAT,
              prepared,
            }),
            this.state.config.key,
            "discord.interaction",
          ),
        });
      })
      .immediate();
    // Commands and clicks both answer with a private "thinking…" reply that the worker edits.
    return { type: 5, data: { flags: EPHEMERAL } };
  }

  async http(path: string, init: RequestInit, mutation = true) {
    if (this.state.config.mode === "fixture")
      throw new AppError("live_actions_disabled_in_fixture_mode", 409);
    let response: Response;
    try {
      response = await this.request(`https://discord.com/api/v10${path}`, {
        ...init,
        signal: AbortSignal.timeout(10000),
        redirect: "error",
      });
    } catch {
      throw new DeliveryError("discord_network_error", mutation ? "uncertain" : "failed");
    }
    if (response.status === 429)
      throw new DeliveryError(
        "discord_rate_limited",
        "retry",
        Math.min(
          300000,
          Math.max(1000, (Number(response.headers.get("retry-after")) || 10) * 1000),
        ),
      );
    if (!response.ok)
      throw new DeliveryError(
        `discord_http_${response.status}`,
        mutation && response.status >= 500 ? "uncertain" : "failed",
      );
    return response;
  }

  /** Render a notification. Job IDs are `discord:<notification id>:<route id>`; media approval,
   * redemption and raffle-close notices get buttons rendered with the version current right now. */
  notification(input: { event: string; text: string }, jobId = ""): Message {
    const plainText = format.text(input.text.slice(0, 1800));
    const key = jobId.startsWith("discord:") ? jobId.slice(8, jobId.lastIndexOf(":")) : "";
    if (input.event === "media" && key.startsWith("media:")) {
      const item = this.state.db.prepare("SELECT * FROM media WHERE id=?").get(key.slice(6)) as
        MediaItem | undefined;
      if (!item) return plainText;
      const pending = item.status === "pending";
      const embed = {
        ...format.mediaEmbed(
          { ...item, requesterName: this.state.viewerName(item.requester) ?? null },
          format.plain(item.title, "Untitled video", 200),
        ),
        color: pending ? format.colors.warning : format.colors.info,
      };
      embed.fields = [
        ...(embed.fields ?? []),
        { name: "Video", value: `https://youtu.be/${item.video_id}` },
      ];
      const components = pending
        ? format.row(
            format.button("Approve", 3, "ma", item.id, item.version),
            format.button("Reject", 4, "mr", item.id, item.version),
          )
        : [];
      return format.message([embed], {
        content: pending
          ? `🎵 Song request **#${item.position}** needs approval`
          : `🎵 Song request **#${item.position}** was queued`,
        ...(components.length ? { components } : {}),
      });
    }
    if (input.event === "engagement" && key.startsWith("redemption:")) {
      const id = key.slice(11);
      const row = this.state.db
        .prepare(
          "SELECT viewer,reward,cost,status,created_at AS createdAt FROM redemptions WHERE id=?",
        )
        .get(id) as
        | { viewer: string; reward: string; cost: number; status: string; createdAt: number }
        | undefined;
      if (!row) return plainText;
      const reward = this.state.document(row.reward);
      const pending = row.status === "pending";
      const components = pending
        ? format.row(
            format.button("Complete", 3, "rc", id, 0),
            format.button("Refund", 2, "rf", id, 0),
          )
        : [];
      return format.message(
        [
          {
            title: format.plain(String(reward?.data.name ?? ""), "Removed reward", 200),
            description: reward?.data.description
              ? format.plain(String(reward.data.description), "", 500)
              : undefined,
            color: pending ? format.colors.warning : format.colors.neutral,
            fields: [
              {
                name: "Viewer",
                value: format.plain(this.state.viewerName(row.viewer), `Viewer ${row.viewer}`, 80),
                inline: true,
              },
              { name: "Cost", value: `${row.cost} points`, inline: true },
              { name: "Requested", value: format.relative(row.createdAt), inline: true },
            ],
          },
        ],
        {
          content: pending
            ? "🎁 Reward redemption needs fulfilment"
            : `🎁 Reward redemption (${row.status})`,
          ...(components.length ? { components } : {}),
        },
      );
    }
    if (input.event === "engagement" && key.startsWith("close:")) {
      const raffle = this.state.list("raffle").find((doc) => doc.id === key.slice(6));
      if (!raffle || raffle.data.status !== "closed") return plainText;
      const entries = (
        this.state.db
          .prepare("SELECT count(*) AS n FROM participation WHERE activity=?")
          .get(raffle.id) as { n: number }
      ).n;
      const components = format.row(
        format.button("Draw winner", 1, "rd", raffle.id, raffle.version),
      );
      return format.message(
        [
          {
            title: format.plain(raffle.data.name, "Raffle", 200),
            color: format.colors.info,
            fields: [{ name: "Entries", value: String(entries), inline: true }],
          },
        ],
        { content: "🎟️ Raffle closed", ...(components.length ? { components } : {}) },
      );
    }
    return plainText;
  }

  async send(
    input: { event: string; guildId: string; channelId: string; text: string },
    jobId?: string,
  ) {
    // Recheck routing after a job has been queued; removing a guild stops pending sends.
    if (
      !this.state
        .list("guild")
        .some(
          (g) =>
            g.data.enabled &&
            g.data.guildId === input.guildId &&
            g.data.channelId === input.channelId &&
            g.data.events.includes(input.event as never),
        )
    )
      throw new AppError("discord_route_revoked", 403);
    const body = this.notification(input, jobId);
    if (this.state.config.mode === "fixture") {
      this.state.repository.set(
        "fixture_discord_last_send",
        JSON.stringify({ guildId: input.guildId, channelId: input.channelId }),
      );
      return;
    }
    const config = this.credentials();
    if (!config) throw new AppError("discord_not_configured", 409);
    await this.http(`/channels/${snowflake.parse(input.channelId)}/messages`, {
      method: "POST",
      headers: { Authorization: `Bot ${config.botToken}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  }

  private stored(key: string): Stored | undefined {
    const raw = this.state.repository.setting(key);
    if (raw === undefined) return undefined;
    try {
      const value = JSON.parse(raw) as Stored;
      if (value && typeof value === "object" && (value.reply || value.delivered)) return value;
    } catch {
      // Results stored before structured replies were plain text.
    }
    return { reply: format.text(raw) };
  }

  async execute(job: Job, action: ActionFn) {
    const raw = JSON.parse(job.payload) as { encrypted: string };
    const data = JSON.parse(
      decrypt(raw.encrypted, this.state.config.key, "discord.interaction"),
    ) as { interaction: Interaction; expires: number; format?: number; prepared?: Prepared };
    if (data.expires <= Date.now()) throw new AppError("discord_interaction_expired", 409);
    const interaction = data.interaction;
    // Recheck the route and grants at execution time, not only at intake.
    const actor = this.actor(interaction);
    const key = `discord_result:${interaction.id}`;
    let result = this.stored(key);
    if (!result) {
      let outcome: Outcome & { code?: string };
      const ctx = { actor, state: this.state, action, id: interaction.id, prepared: data.prepared };
      try {
        outcome =
          interaction.type === COMPONENT
            ? await runButton(ctx, interaction.data?.custom_id ?? "")
            : // Payloads without a format marker were queued before the subcommand tree.
              await runCommand(ctx, interaction.data?.options, data.format === undefined);
      } catch (error) {
        outcome = { reply: format.errorMessage(error), code: format.errorCode(error) };
      }
      const editable =
        interaction.type === COMPONENT &&
        interaction.message &&
        !((interaction.message.flags ?? 0) & EPHEMERAL);
      result = {
        reply: outcome.reply,
        ...(editable && outcome.update ? { update: outcome.update } : {}),
        ...(outcome.code ? { code: outcome.code } : {}),
      };
      // Commit the outcome before any delivery so a retried job never repeats the action.
      this.state.repository.set(key, JSON.stringify(result));
    }
    if (this.state.config.mode === "fixture" || result.delivered) return;
    await this.http(
      `/webhooks/${interaction.application_id}/${encodeURIComponent(interaction.token)}/messages/@original`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...result.reply, allowed_mentions: { parse: [] } }),
      },
    );
    if (result.update && interaction.message && interaction.channel_id) {
      const config = this.credentials();
      // Replacing the clicked notice's buttons is idempotent and cosmetic; the action is already final.
      if (config)
        await this.http(`/channels/${interaction.channel_id}/messages/${interaction.message.id}`, {
          method: "PATCH",
          headers: { Authorization: `Bot ${config.botToken}`, "Content-Type": "application/json" },
          body: JSON.stringify({ components: result.update }),
        }).catch(() => undefined);
    }
    // Keep only a marker (and any refusal code) once delivered, so viewer names in replies are not retained.
    this.state.repository.set(
      key,
      JSON.stringify({ delivered: true, ...(result.code ? { code: result.code } : {}) }),
    );
  }

  commands() {
    const settings = this.state.settings;
    return commandTree({ media: settings.mediaEnabled, points: settings.pointsEnabled });
  }
  async register(actor: Actor) {
    this.state.assertActor(actor, "integrations");
    if (this.state.config.mode === "fixture") return { fixture: true, commands: this.commands() };
    const config = this.credentials();
    if (!config) throw new AppError("discord_not_configured", 409);
    for (const guild of this.state.list("guild").filter((g) => g.data.enabled))
      await this.http(
        `/applications/${config.applicationId}/guilds/${guild.data.guildId}/commands`,
        {
          method: "PUT",
          headers: { Authorization: `Bot ${config.botToken}`, "Content-Type": "application/json" },
          body: JSON.stringify(this.commands()),
        },
      );
    this.state.audit(actor.id, "discord.commands.register", "allowed_guilds");
    return { registered: true };
  }
}
