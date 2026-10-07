import { createPublicKey, verify } from "node:crypto";
import { z } from "zod";
import { encrypt, decrypt } from "../crypto.ts";
import { AppError, DeliveryError } from "../errors.ts";
import type { Actor, Permission } from "../auth.ts";
import { State } from "../domain/state.ts";
import type { Job } from "../storage/repository.ts";

type Credentials = { applicationId: string; publicKey: string; botToken: string };
const snowflake = z.string().regex(/^\d{1,24}$/);
const interactionSchema = z.object({ id: snowflake, application_id: snowflake, type: z.number().int(), token: z.string().min(1).max(512), guild_id: snowflake.optional(), channel_id: snowflake.optional(), member: z.object({ user: z.object({ id: snowflake }), roles: z.array(snowflake).max(250) }).optional(), data: z.object({ name: z.string().max(32).optional(), options: z.array(z.object({ name: z.string().max(32), value: z.union([z.string().max(500), z.number(), z.boolean()]) })).max(20).optional() }).optional() });
type Interaction = z.infer<typeof interactionSchema>;

export class DiscordService {
  readonly state: State;
  private readonly request: typeof fetch;
  constructor(state: State, request: typeof fetch = fetch) { this.state = state; this.request = request; }
  credentials(): Credentials | undefined {
    if (this.state.config.mode === "fixture") return { applicationId: "900", publicKey: createPublicKey(this.state.config.fixtureDiscordPublicKey!).export({ type: "spki", format: "der" }).subarray(-32).toString("hex"), botToken: "fixture-disabled" };
    return this.state.secret<Credentials>("discord");
  }
  actor(interaction: Interaction): Actor {
    const guild = this.state.list("guild").find(g => g.data.enabled && g.data.guildId === interaction.guild_id && g.data.channelId === interaction.channel_id);
    if (!guild || !interaction.member) throw new AppError("discord_guild_or_channel_not_allowed", 403);
    const member = interaction.member;
    const grants = new Set<Permission>([...guild.data.roles.filter(r => member.roles.includes(r.id)), ...guild.data.users.filter(u => u.id === member.user.id)].map(g => g.permission));
    return { id: `discord:${interaction.guild_id}:${member.user.id}`, role: grants.size ? "moderator" : "readonly", permissions: [...grants], discord: { guild: interaction.guild_id!, channel: interaction.channel_id!, roles: member.roles, user: member.user.id } };
  }

  intake(body: Buffer, headers: Headers, credentials = this.credentials(), now = Date.now()) {
    if (!credentials) throw new AppError("discord_not_configured", 409);
    const signature = headers.get("x-signature-ed25519"), timestamp = headers.get("x-signature-timestamp");
    if (!signature || !/^[a-f0-9]{128}$/i.test(signature) || !timestamp || !/^\d{10}$/.test(timestamp) || Math.abs(now - Number(timestamp) * 1000) > 300000) throw new AppError("invalid_discord_signature", 401);
    const key = createPublicKey({ key: Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), Buffer.from(credentials.publicKey, "hex")]), format: "der", type: "spki" });
    if (!verify(null, Buffer.concat([Buffer.from(timestamp), body]), key, Buffer.from(signature, "hex"))) throw new AppError("invalid_discord_signature", 401);
    let value: unknown;
    try { value = JSON.parse(body.toString()); }
    catch { throw new AppError("invalid_discord_json", 400); }
    const interaction = interactionSchema.parse(value);
    if (interaction.application_id !== credentials.applicationId) throw new AppError("wrong_discord_application", 403);
    if (interaction.type === 1) return { type: 1 };
    if (interaction.type !== 2 || interaction.data?.name !== "kekbot") throw new AppError("unsupported_discord_interaction", 400);
    this.actor(interaction);
    this.state.db.transaction(() => {
      const id = `discord:${interaction.id}`;
      if (this.state.db.prepare("SELECT 1 FROM receipts WHERE id=?").get(id)) return;
      const backlog = this.state.db.prepare("SELECT count(*) AS n FROM jobs WHERE status IN ('pending','running')").get() as { n: number };
      if (backlog.n >= 10000) throw new AppError("job_backlog_full", 503);
      this.state.db.prepare("INSERT INTO receipts(id,event_type,payload,received_at) VALUES(?,'discord.interaction',NULL,?)").run(id, now);
      // Interaction tokens are bearer credentials and expire after 15 minutes.
      this.state.effect(id, "discord.interaction", { encrypted: encrypt(JSON.stringify({ interaction, expires: now + 14 * 60000 }), this.state.config.key, "discord.interaction") });
    }).immediate();
    return { type: 5, data: { flags: 64 } };
  }

  async http(path: string, init: RequestInit, mutation = true) {
    if (this.state.config.mode === "fixture") throw new AppError("live_actions_disabled_in_fixture_mode", 409);
    let response: Response;
    try { response = await this.request(`https://discord.com/api/v10${path}`, { ...init, signal: AbortSignal.timeout(10000), redirect: "error" }); }
    catch { throw new DeliveryError("discord_network_error", mutation ? "uncertain" : "failed"); }
    if (response.status === 429) throw new DeliveryError("discord_rate_limited", "retry", Math.min(300000, Math.max(1000, (Number(response.headers.get("retry-after")) || 10) * 1000)));
    if (!response.ok) throw new DeliveryError(`discord_http_${response.status}`, mutation && response.status >= 500 ? "uncertain" : "failed");
    return response;
  }
  async send(input: { event: string; guildId: string; channelId: string; text: string }) {
    // Recheck routing after a job has been queued; removing a guild stops pending sends.
    if (!this.state.list("guild").some(g => g.data.enabled && g.data.guildId === input.guildId && g.data.channelId === input.channelId && g.data.events.includes(input.event as never))) throw new AppError("discord_route_revoked", 403);
    if (this.state.config.mode === "fixture") { this.state.repository.set("fixture_discord_last_send", JSON.stringify({ guildId: input.guildId, channelId: input.channelId })); return; }
    const config = this.credentials();
    if (!config) throw new AppError("discord_not_configured", 409);
    await this.http(`/channels/${snowflake.parse(input.channelId)}/messages`, { method: "POST", headers: { Authorization: `Bot ${config.botToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ content: input.text.slice(0, 1800), allowed_mentions: { parse: [] } }) });
  }

  async execute(job: Job, action: (actor: Actor, name: string, input: Record<string, unknown>, id: string) => Promise<unknown>) {
    const raw = JSON.parse(job.payload) as { encrypted: string };
    const data = JSON.parse(decrypt(raw.encrypted, this.state.config.key, "discord.interaction")) as { interaction: Interaction; expires: number };
    if (data.expires <= Date.now()) throw new AppError("discord_interaction_expired", 409);
    const interaction = data.interaction;
    const actor = this.actor(interaction);
    let content = this.state.repository.setting(`discord_result:${interaction.id}`);
    if (!content) {
      try {
        const options = Object.fromEntries((interaction.data?.options ?? []).map(option => [option.name, option.value]));
        const name = z.string().parse(options.action);
        const result = await action(actor, name, options, interaction.id);
        content = JSON.stringify(result).slice(0, 1800);
      } catch (error) { content = error instanceof AppError ? error.code : "invalid_command_input"; }
      this.state.repository.set(`discord_result:${interaction.id}`, content);
    }
    if (this.state.config.mode === "fixture") return;
    await this.http(`/webhooks/${interaction.application_id}/${encodeURIComponent(interaction.token)}/messages/@original`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content, allowed_mentions: { parse: [] } }) });
  }

  commands() {
    const actions = ["status", "timers.pause", "timers.resume", "alert.manual", "moderation.pause", "moderation.resume", "moderation.warn", "moderation.delete", "moderation.timeout", "moderation.ban", "goal.adjust", "reward.complete", "reward.reject", "activity.close", "raffle.draw", "raffle.reroll"];
    if (this.state.settings.mediaEnabled) actions.push("media.approve", "media.reject", "media.remove", "player.pause", "player.resume", "player.skip", "player.volume");
    return [{ name: "kekbot", description: "Operate your self-hosted KekBot", dm_permission: false, options: [
      { type: 3, name: "action", description: "Operation", required: true, choices: actions.map(value => ({ name: value, value })) },
      { type: 3, name: "target", description: "Item, activity, goal or user ID" }, { type: 4, name: "version", description: "Current item version" },
      { type: 4, name: "value", description: "Volume, goal value or timeout minutes" }, { type: 3, name: "reason", description: "Action reason or alert text" },
      { type: 3, name: "message", description: "Message ID for deletion" }, { type: 5, name: "acknowledge", description: "Confirm an irreversible action" }
    ] }];
  }
  async register(actor: Actor) {
    this.state.assertActor(actor, "integrations");
    if (this.state.config.mode === "fixture") return { fixture: true, commands: this.commands() };
    const config = this.credentials();
    if (!config) throw new AppError("discord_not_configured", 409);
    for (const guild of this.state.list("guild").filter(g => g.data.enabled)) await this.http(`/applications/${config.applicationId}/guilds/${guild.data.guildId}/commands`, { method: "PUT", headers: { Authorization: `Bot ${config.botToken}`, "Content-Type": "application/json" }, body: JSON.stringify(this.commands()) });
    this.state.audit(actor.id, "discord.commands.register", "allowed_guilds");
    return { registered: true };
  }
}
