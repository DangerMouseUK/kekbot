import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sign } from "node:crypto";
import Database from "better-sqlite3";
import { widgetKinds } from "../../src/server/domain/catalog.ts";
const origin = "http://127.0.0.1:3137";
const password = "a strong browser fixture password";
function root() { return readFileSync("output/playwright/e2e-data-path.txt", "utf8"); }
async function login(request: APIRequestContext) {
  const response = await request.post("/api/auth", { headers: { Origin: origin }, data: { action: "login", username: "owner", password } });
  expect(response.ok()).toBe(true); return (await response.json()).csrf as string;
}
async function operation(request: APIRequestContext, csrf: string, action: string, input: Record<string, unknown> = {}) {
  const response = await request.post("/api/control", { headers: { Origin: origin, "X-CSRF-Token": csrf }, data: { action, input } });
  expect(response.ok(), action).toBe(true); return response.json();
}
test("owner setup, command editor, CSRF denial and read-only permissions work in production", async ({ page, request, browser }) => {
  await page.goto("/"); await expect(page.getByRole("heading", { name: "Claim this installation" })).toBeVisible();
  await page.getByLabel("Setup token").fill(readFileSync(join(root(), "fixture/secrets/setup.token"), "utf8").trim());
  await page.getByLabel("Username", { exact: true }).fill("owner"); await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Create owner account" }).click(); await expect(page.getByRole("heading", { name: "Control room" })).toBeVisible();
  await page.getByRole("button", { name: "Commands", exact: true }).click(); await page.getByRole("button", { name: "Add command" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Browser greeting"); await page.getByLabel("Trigger", { exact: true }).fill("!greeting");
  await page.getByLabel("Responses", { exact: true }).fill("Hello {user}"); await page.getByRole("button", { name: "Save command" }).click();
  await expect(page.getByRole("heading", { name: "Browser greeting" })).toBeVisible();
  const csrf = await login(request);
  expect((await request.post("/api/control", { headers: { Origin: origin }, data: { action: "timers.pause" } })).status()).toBe(403);
  expect((await request.post("/api/control", { headers: { Origin: "https://untrusted.example", "X-CSRF-Token": csrf }, data: { action: "timers.pause" } })).status()).toBe(403);
  const invitation = await operation(request, csrf, "account.invite", { role: "readonly" });
  const member = await browser.newContext({ baseURL: origin });
  try {
    expect((await member.request.post("/api/auth", { headers: { Origin: origin }, data: { action: "invite", token: invitation.token, username: "readonly", password } })).ok()).toBe(true);
    const session = await (await member.request.get("/api/auth")).json();
    expect((await member.request.post("/api/control", { headers: { Origin: origin, "X-CSRF-Token": session.csrf }, data: { action: "timers.pause" } })).status()).toBe(403);
    const memberPage = await member.newPage(); await memberPage.goto("/"); await expect(memberPage.getByRole("heading", { name: "Control room" })).toBeVisible();
    await memberPage.getByRole("button", { name: "Commands", exact: true }).click();
    await expect(memberPage.getByRole("heading", { name: "Browser greeting" })).toBeVisible();
    await member.setOffline(true);
    const greeting = (await (await request.get("/api/control")).json()).documents.find((doc: { kind: string }) => doc.kind === "command");
    await operation(request, csrf, "config.save", { kind: "command", id: greeting.id, version: greeting.version, data: { ...greeting.data, name: "Reconnected greeting" } });
    await member.setOffline(false);
    await expect(memberPage.getByRole("heading", { name: "Reconnected greeting" })).toBeVisible();
    await operation(request, csrf, "account.disable", { id: session.actor.id, disabled: true });
    await expect(memberPage.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  } finally { await member.close(); }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Control room", exact: true }).click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "output/playwright/dashboard-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.getByRole("button", { name: "Commands", exact: true }).click();
  await page.screenshot({ path: "output/playwright/dashboard-desktop.png", fullPage: true });
  await page.getByRole("button", { name: "Widgets", exact: true }).click();
  await page.getByRole("button", { name: "Add widget" }).click();
  await page.getByLabel("Name", { exact: true }).fill("Private source");
  await page.getByRole("button", { name: "Save widget" }).click();
  await page.getByRole("button", { name: "Create OBS source URL" }).click();
  await expect(page.getByRole("status")).toContainText("Copy this private OBS");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Welcome back" })).toBeVisible();
  await expect(page.locator("body")).not.toContainText("token=");
});

test("signed Discord approval reaches a fixture player and a duplicate completion cannot advance again", async ({ request, browser }) => {
  const csrf = await login(request);
  await operation(request, csrf, "config.save", { kind: "settings", id: "instance", data: { mediaEnabled: true, requestCooldown: 0 } });
  await operation(request, csrf, "config.save", { kind: "guild", data: { name: "Fixture guild", guildId: "100", channelId: "200", roles: [{ id: "300", permission: "media" }] } });
  const item = await operation(request, csrf, "media.request", { url: "abcdefghijk" });
  await expect.poll(async () => (await (await request.get("/api/control")).json()).media.find((row: { id: string }) => row.id === item.id).status).toBe("approved");
  // Viewer requests require approval rather than moderator auto-approval.
  const body = JSON.stringify({ message_id: "browser-media-request", broadcaster: { user_id: 123 }, sender: { user_id: 456, username: "Fixture viewer" }, content: "!sr lmnopqrstuv" });
  const eventId = "01J00000000000000000000009", timestamp = new Date().toISOString();
  const signed = sign("RSA-SHA256", Buffer.from(`${eventId}.${timestamp}.${body}`), readFileSync(join(root(), "fixture/secrets/fixture-private.pem"))).toString("base64");
  expect((await request.post("/api/providers/kick/events", { headers: { "Content-Type": "application/json", "Kick-Event-Message-Id": eventId, "Kick-Event-Message-Timestamp": timestamp, "Kick-Event-Signature": signed, "Kick-Event-Type": "chat.message.sent", "Kick-Event-Version": "1" }, data: body })).ok()).toBe(true);
  let pending: { id: string; version: number };
  await expect.poll(async () => { const state = await (await request.get("/api/control")).json(); pending = state.media.find((row: { status: string }) => row.status === "pending"); return Boolean(pending); }).toBe(true);
  const interaction = Buffer.from(JSON.stringify({ id: "500", application_id: "900", type: 2, token: "fixture-interaction", guild_id: "100", channel_id: "200", member: { user: { id: "400" }, roles: ["300"] }, data: { name: "kekbot", options: [{ name: "action", value: "media.approve" }, { name: "target", value: pending!.id }, { name: "version", value: pending!.version }] } }));
  const stamp = String(Math.floor(Date.now() / 1000));
  const headers = { "Content-Type": "application/json", "X-Signature-Timestamp": stamp, "X-Signature-Ed25519": sign(null, Buffer.concat([Buffer.from(stamp), interaction]), readFileSync(join(root(), "fixture/secrets/fixture-discord-private.pem"))).toString("hex") };
  expect((await (await request.post("/api/providers/discord/interactions", { headers, data: interaction })).json()).type).toBe(5);
  expect((await (await request.post("/api/providers/discord/interactions", { headers, data: interaction })).json()).type).toBe(5);
  await expect.poll(async () => (await (await request.get("/api/control")).json()).media.find((row: { id: string }) => row.id === pending!.id).status).toBe("approved");
  const source = await operation(request, csrf, "config.save", { kind: "widget", data: { name: "Fixture player", type: "player" } });
  const read = await operation(request, csrf, "token.create", { name: "OBS read", kind: "widget", scopes: [`widget:${source.id}`] });
  const player = await operation(request, csrf, "token.create", { name: "OBS player", kind: "player", scopes: [`widget:${source.id}`] });
  const obs = await browser.newContext({ baseURL: origin });
  try {
    const page = await obs.newPage(); let youtubeRequests = 0; page.on("request", request => { if (request.url().includes("youtube.com")) youtubeRequests++; });
    await page.goto(`/widgets/${source.id}?token=${read.token}#player=${player.token}`);
    await expect(page.getByRole("status")).toContainText("Fixture player");
    let state = await (await request.get("/api/control")).json();
    await operation(request, csrf, "player.resume", { version: state.player.version });
    await expect(page.getByRole("button", { name: "Finish fixture item" })).toBeEnabled();
    await page.getByRole("button", { name: "Finish fixture item" }).click();
    await expect.poll(async () => (await (await request.get("/api/control?view=media-history")).json()).items.find((row: { id: string }) => row.id === item.id)?.status).toBe("completed");
    state = await (await request.get("/api/control")).json(); expect(state.player.current).toBe(pending!.id); expect(youtubeRequests).toBe(0);
    const label = await operation(request, csrf, "config.save", { kind: "widget", data: { name: "Current requester", type: "nowplaying" } });
    const labelToken = await operation(request, csrf, "token.create", { name: "Requester label", kind: "widget", scopes: [`widget:${label.id}`] });
    const labelPage = await obs.newPage(); await labelPage.goto(`/widgets/${label.id}?token=${labelToken.token}`);
    await expect(labelPage.getByText("Requested by Fixture viewer", { exact: true })).toBeVisible();
    await operation(request, csrf, "token.revoke", { id: read.id });
    await expect(page.getByRole("status")).toContainText("invalid_or_revoked_access_token");
    expect((await request.post(`/api/player/${source.id}`, { headers: { Authorization: `Bearer ${read.token}` }, data: { action: "lease" } })).status()).toBe(401);
  } finally { await obs.close(); }
});

test("every widget family renders with scoped read access and an API token cannot exceed its scopes", async ({ request, page }) => {
  const csrf = await login(request);
  for (const type of widgetKinds.filter(kind => kind !== "player")) {
    const doc = await operation(request, csrf, "config.save", { kind: "widget", data: { name: `Fixture ${type}`, type } });
    const token = await operation(request, csrf, "token.create", { name: `Read ${type}`, kind: "widget", scopes: [`widget:${doc.id}`] });
    await page.goto(`/widgets/${doc.id}?token=${token.token}`);
    await expect(page.locator(".widget-root")).toHaveAttribute("data-theme", "mint");
    expect((await request.get(`/api/widgets/wrong?token=${token.token}`)).status()).toBe(401);
  }
  const token = await operation(request, csrf, "token.create", { name: "Read API", kind: "api", scopes: ["read"] });
  expect((await request.get("/api/v1/control", { headers: { Authorization: `Bearer ${token.token}` } })).ok()).toBe(true);
  expect((await request.post("/api/v1/control", { headers: { Authorization: `Bearer ${token.token}` }, data: { action: "timers.pause" } })).status()).toBe(401);
  await operation(request, csrf, "token.revoke", { id: token.id });
  expect((await request.get("/api/v1/control", { headers: { Authorization: `Bearer ${token.token}` } })).status()).toBe(401);
});


test("large terminal history stays separate from the active queue and pages without granting mutation authority", async ({ request, page }) => {
  const csrf = await login(request);
  const db = new Database(join(root(), "fixture/kekbot.sqlite"));
  try {
    const add = db.prepare("INSERT INTO media(id,video_id,requester,title,status,position,created_at) VALUES(?,'abcdefghijk','456',?,'completed',0,?)");
    db.transaction(() => {
      for (let i = 0; i < 1200; i++) {
        const name = `History fixture ${String(i).padStart(4, "0")}`;
        add.run(`browser-history-${i}`, name, 100);
      }
    })();
    await login(page.request);
    await page.goto("/");
    await page.getByRole("button", { name: "Media", exact: true }).click();
    await expect(page.getByRole("heading", { name: "Requests and queue", exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "History fixture 0999", exact: true })).toHaveCount(0);
    await page.getByRole("button", { name: "Load media history", exact: true }).click();
    const history = page.locator("section").filter({ has: page.getByRole("heading", { name: "Media history", exact: true }) });
    await expect(history.locator("article")).toHaveCount(50);
    const firstPage = await history.locator("article h3").allTextContents();
    await page.getByRole("button", { name: "Older history", exact: true }).click();
    await expect.poll(async () => (await history.locator("article h3").allTextContents()).some(name => firstPage.includes(name))).toBe(false);
    await expect(history.locator("article")).toHaveCount(50);
    await page.getByRole("button", { name: "Latest history", exact: true }).click();
    await expect.poll(() => history.locator("article h3").allTextContents()).toEqual(firstPage);
    const token = await operation(request, csrf, "token.create", { name: "History read", kind: "api", scopes: ["read"] });
    const headers = { Authorization: `Bearer ${token.token}` };
    expect((await request.get("/api/v1/control?view=media-history&limit=100", { headers })).ok()).toBe(true);
    expect((await request.get("/api/v1/control?view=media-history&limit=101", { headers })).status()).toBe(400);
    expect((await request.post("/api/v1/control", { headers, data: { action: "media.clear" } })).status()).toBe(401);
    await operation(request, csrf, "token.revoke", { id: token.id });
    expect((await request.get("/api/v1/control?view=media-history", { headers })).status()).toBe(401);
  } finally {
    db.prepare("DELETE FROM media WHERE id LIKE 'browser-history-%'").run(); db.close();
  }
});

test("older unresolved deliveries and rewards stay actionable through bounded pages and current permissions", async ({ request, page, browser }) => {
  const csrf = await login(request), db = new Database(join(root(), "fixture/kekbot.sqlite"));
  const createdAt = Date.now() - 60000;
  try {
    const job = db.prepare("INSERT INTO jobs(id,kind,payload,status,due_at,created_at) VALUES(?,'kick.reply','{}',?,0,?)");
    const redemption = db.prepare("INSERT INTO redemptions(id,viewer,reward,cost,status,created_at) VALUES(?,'456','Browser reward',10,?,?)");
    db.transaction(() => {
      for (let i = 0; i < 125; i++) {
        const suffix = String(i).padStart(3, "0");
        job.run(`browser-waiting-job-${suffix}`, "uncertain", createdAt);
        redemption.run(`browser-waiting-reward-${suffix}`, "pending", createdAt);
      }
      for (let i = 0; i < 150; i++) {
        job.run(`browser-terminal-job-${i}`, "succeeded", createdAt + 100);
        redemption.run(`browser-terminal-reward-${i}`, "completed", createdAt + 100);
      }
    })();
    await login(page.request); await page.goto("/");
    await page.getByRole("button", { name: "Maintenance", exact: true }).click();
    const deliveries = page.locator("section").filter({ has: page.getByRole("heading", { name: "Uncertain deliveries", exact: true }) });
    await expect(deliveries.locator("article")).toHaveCount(50);
    await deliveries.getByRole("button", { name: "Older waiting items", exact: true }).click();
    await expect(deliveries.locator("article").first()).toContainText("browser-waiting-job-074");
    await deliveries.getByRole("button", { name: "Older waiting items", exact: true }).click();
    await expect(deliveries.locator("article")).toHaveCount(25);
    const oldJob = deliveries.locator("article").filter({ hasText: "browser-waiting-job-000" });
    await oldJob.getByRole("button", { name: "Provider confirms success", exact: true }).click();
    await expect(oldJob).toHaveCount(0);
    expect(db.prepare("SELECT status,payload,payload_state FROM jobs WHERE id='browser-waiting-job-000'").get()).toEqual({ status: "succeeded", payload: "{}", payload_state: "scrubbed" });
    await deliveries.getByRole("button", { name: "Newest waiting items", exact: true }).click();
    await expect(deliveries.locator("article").first()).toContainText("browser-waiting-job-124");
    await page.getByRole("button", { name: "Points & rewards", exact: true }).click();
    const rewards = page.locator("section").filter({ has: page.getByRole("heading", { name: "Pending redemptions", exact: true }) });
    await expect(rewards.locator("article")).toHaveCount(50);
    await rewards.getByRole("button", { name: "Older waiting items", exact: true }).click();
    await expect(rewards.locator("article").first()).toContainText("browser-waiting-reward-074");
    await rewards.getByRole("button", { name: "Older waiting items", exact: true }).click();
    await expect(rewards.locator("article")).toHaveCount(25);
    const oldReward = rewards.locator("article").filter({ hasText: "browser-waiting-reward-000" });
    await oldReward.getByRole("button", { name: "Mark fulfilled", exact: true }).click();
    await expect(oldReward).toHaveCount(0);
    expect(db.prepare("SELECT status FROM redemptions WHERE id='browser-waiting-reward-000'").get()).toEqual({ status: "completed" });

    const token = await operation(request, csrf, "token.create", { name: "Waiting work read", kind: "api", scopes: ["read"] });
    const headers = { Authorization: `Bearer ${token.token}` };
    for (const view of ["uncertain-jobs", "pending-redemptions"]) {
      const result = await request.get(`/api/v1/control?view=${view}&limit=100`, { headers });
      expect(result.ok()).toBe(true); expect((await result.json()).items).toHaveLength(100);
      expect((await request.get(`/api/control?view=${view}&cursor=modified`)).status()).toBe(400);
      expect((await request.get(`/api/v1/control?view=${view}&limit=101`, { headers })).status()).toBe(400);
    }
    expect((await request.post("/api/v1/control", { headers, data: { action: "job.resolve", input: { id: "browser-waiting-job-001", result: "confirmed" } } })).status()).toBe(403);
    await operation(request, csrf, "token.revoke", { id: token.id });
    expect((await request.get("/api/v1/control?view=uncertain-jobs", { headers })).status()).toBe(401);

    const invitation = await operation(request, csrf, "account.invite", { role: "readonly" });
    const reader = await browser.newContext({ baseURL: origin });
    try {
      expect((await reader.request.post("/api/auth", { headers: { Origin: origin }, data: { action: "invite", token: invitation.token, username: "queue-reader", password } })).ok()).toBe(true);
      const readerPage = await reader.newPage(); await readerPage.goto("/");
      await readerPage.getByRole("button", { name: "Maintenance", exact: true }).click();
      await expect(readerPage.getByRole("heading", { name: "Uncertain deliveries", exact: true })).toBeVisible();
      await expect(readerPage.getByRole("button", { name: "Provider confirms success", exact: true })).toHaveCount(0);
      await readerPage.getByRole("button", { name: "Points & rewards", exact: true }).click();
      await expect(readerPage.getByRole("heading", { name: "Pending redemptions", exact: true })).toBeVisible();
      await expect(readerPage.getByRole("button", { name: "Mark fulfilled", exact: true })).toHaveCount(0);
      const session = await (await reader.request.get("/api/auth")).json();
      for (const [action, input] of [["job.resolve", { id: "browser-waiting-job-001", result: "confirmed" }], ["reward.complete", { target: "browser-waiting-reward-001" }]] as const) {
        expect((await reader.request.post("/api/control", { headers: { Origin: origin, "X-CSRF-Token": session.csrf }, data: { action, input } })).status()).toBe(403);
      }
    } finally { await reader.close(); }
  } finally {
    db.prepare("DELETE FROM jobs WHERE id LIKE 'browser-waiting-job-%' OR id LIKE 'browser-terminal-job-%'").run();
    db.prepare("DELETE FROM redemptions WHERE id LIKE 'browser-waiting-reward-%' OR id LIKE 'browser-terminal-reward-%'").run(); db.close();
  }
});
