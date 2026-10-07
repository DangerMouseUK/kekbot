import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { randomToken } from "./crypto.ts";
import { AppError } from "./errors.ts";
import type { Config } from "./config.ts";
import { openStore } from "./storage/database.ts";
import { Repository } from "./storage/repository.ts";
import { AuthService, type Actor } from "./auth.ts";
import { BotService } from "./domain/bot.ts";
import { widgetKinds } from "./domain/catalog.ts";

export async function seedFixture(config: Config) {
  if (config.mode !== "fixture") throw new AppError("fixture_command_requires_explicit_fixture_mode", 403);
  const repository = new Repository(openStore(config)), lease = randomUUID();
  try {
    repository.acquireLease(lease);
    const auth = new AuthService(repository), bot = new BotService(repository, config);
    const credentialsFile = join(/* turbopackIgnore: true */ config.directory, "secrets", "fixture-account.json");
    let account = repository.store.sqlite.prepare("SELECT id FROM accounts WHERE role='owner'").get() as { id: string } | undefined;
    if (!account) {
      const credentials = { username: "fixture-owner", password: randomToken() };
      const session = await auth.setup(readFileSync(config.setupTokenFile, "utf8").trim(), credentials);
      account = auth.session(session.token);
      writeFileSync(credentialsFile, JSON.stringify(credentials), { flag: "wx", mode: 0o600 });
    }
    const owner: Actor = { id: account.id, role: "owner", permissions: [] };
    const save = (kind: Parameters<typeof bot.state.save>[1], id: string, data: unknown) => { if (!bot.state.document(id)) bot.state.save(owner, kind, id, data); };
    save("settings", "instance", { mediaEnabled: true, pointsEnabled: true });
    save("command", "fixture-welcome", { name: "Welcome", trigger: "!welcome", responses: ["Welcome {user}! Community counter: {counter}"], counter: true });
    save("timer", "fixture-reminder", { name: "Community reminder", messages: ["Thanks for joining us."], interval: 300, minMessages: 5 });
    for (const event of ["channel.followed", "manual", "goal", "media"]) save("alert", `fixture-alert-${event.replaceAll(".", "-")}`, { name: event, event, template: "{name}: thanks, {user}!" });
    save("goal", "fixture-goal", { name: "Community goal", metric: "follow", target: 100 });
    save("reward", "fixture-reward", { name: "Community shoutout", cost: 10 });
    save("rule", "fixture-link-rule", { name: "Unapproved link warning", type: "link", allowedDomains: ["kick.com"], enabled: false });
    save("poll", "fixture-poll", { name: "Next activity", options: ["Game", "Chat"], endsAt: Date.now() + 86400000 });
    save("raffle", "fixture-raffle", { name: "Community draw", endsAt: Date.now() + 86400000 });
    for (const kind of widgetKinds) save("widget", `fixture-widget-${kind}`, { name: `Fixture ${kind}`, type: kind, target: kind === "counter" ? "fixture-welcome" : "", endsAt: kind === "countdown" ? Date.now() + 3600000 : null });
    repository.store.sqlite.prepare("INSERT OR IGNORE INTO viewers(id,name,role,last_seen) VALUES('456','Fixture viewer','viewer',?)").run(Date.now());
    bot.engagement.adjust(owner, "456", 100, "fixture_initial_balance", "fixture-balance");
    return { seeded: true, credentialsFile: existsSync(credentialsFile) ? credentialsFile : null, credentials: "Read the protected fixture-account file locally; never publish it.", widgets: widgetKinds.length };
  } finally { repository.releaseLease(lease); repository.store.close(); }
}
