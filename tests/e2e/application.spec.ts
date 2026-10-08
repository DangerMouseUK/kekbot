import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sign } from "node:crypto";
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
    await expect.poll(async () => (await (await request.get("/api/control")).json()).media.find((row: { id: string }) => row.id === item.id).status).toBe("completed");
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
