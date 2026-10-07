import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sign } from "node:crypto";
const origin = "http://127.0.0.1:3137", password = "a strong browser fixture password";
async function login(request: APIRequestContext) {
  const state = await (await request.get("/api/auth")).json();
  const setup = !state.claimed ? { action: "setup", token: readFileSync(join(readFileSync("output/playwright/e2e-data-path.txt", "utf8"), "fixture/secrets/setup.token"), "utf8").trim() } : { action: "login" };
  const response = await request.post("/api/auth", { headers: { Origin: origin }, data: { ...setup, username: "owner", password } });
  expect(response.ok()).toBe(true); return { csrf: (await response.json()).csrf as string, cookie: response.headers()["set-cookie"].split(";")[0] };
}
async function operation(request: APIRequestContext, csrf: string, action: string, input: Record<string, unknown> = {}) {
  return request.post("/api/control", { headers: { Origin: origin, "X-CSRF-Token": csrf }, data: { action, input } });
}

test("production HTTP denies unauthorised controls and rejects malformed, oversized and wrong-channel signed intake", async ({ request }) => {
  for (const path of ["/api/control", "/api/events", "/api/v1/control", "/api/widgets/missing", "/api/player/missing"]) {
    const response = path.includes("player") ? await request.post(path, { headers: { Origin: origin }, data: { action: "lease" } }) : await request.get(path);
    expect(response.status(), path).toBe(path.includes("player") ? 403 : 401);
    expect(response.headers()["cache-control"]).toContain("no-store");
  }
  for (const path of ["/api/providers/kick/events", "/api/providers/discord/interactions"]) {
    expect((await request.post(path, { data: "x".repeat(65537) })).status()).toBe(413);
    expect([400, 401]).toContain((await request.post(path, { data: "{}" })).status());
  }
  const root = readFileSync("output/playwright/e2e-data-path.txt", "utf8"), privateKey = readFileSync(join(root, "fixture/secrets/fixture-private.pem"));
  for (const [body, status] of [["{invalid", 400], [JSON.stringify({ broadcaster: { user_id: 999 }, sender: { user_id: 456 }, content: "!kekbot", message_id: "wrong" }), 403]] as const) {
    const id = "01J00000000000000000000099", timestamp = new Date().toISOString();
    const response = await request.post("/api/providers/kick/events", { headers: { "Kick-Event-Message-Id": id, "Kick-Event-Message-Timestamp": timestamp, "Kick-Event-Signature": sign("RSA-SHA256", Buffer.from(`${id}.${timestamp}.${body}`), privateKey).toString("base64"), "Kick-Event-Type": "chat.message.sent", "Kick-Event-Version": "1" }, data: body });
    expect(response.status()).toBe(status); expect(await response.text()).not.toContain(privateKey.toString());
  }
});

test("admin and moderator roles enforce permissions through authenticated production routes", async ({ request, playwright }) => {
  const { csrf } = await login(request);
  for (const role of ["admin", "moderator"] as const) {
    const invitation = await (await operation(request, csrf, "account.invite", { role, permissions: role === "admin" ? ["configure"] : [] })).json();
    const member = await playwright.request.newContext({ baseURL: origin });
    try {
      const response = await member.post("/api/auth", { headers: { Origin: origin }, data: { action: "invite", token: invitation.token, username: `campaign-${role}`, password } });
      expect(response.ok()).toBe(true); const memberCsrf = (await response.json()).csrf;
      const command = await operation(member, memberCsrf, "config.save", { kind: "command", data: { name: `Campaign ${role}`, trigger: `!campaign_${role}`, responses: ["Synthetic response"] } });
      expect(command.status()).toBe(role === "admin" ? 200 : 403);
      expect((await operation(member, memberCsrf, "timers.pause")).status()).toBe(role === "moderator" ? 200 : 403);
      for (const [action, input] of [["account.invite", { role: "readonly" }], ["configuration.export", {}], ["integration.save", { provider: "youtube", data: { key: "synthetic-test-key" } }], ["token.create", { name: "Denied", kind: "api", scopes: ["read"] }]] as const) {
        expect((await operation(member, memberCsrf, action, input)).status(), `${role}:${action}`).toBe(403);
      }
    } finally { await member.dispose(); }
  }
});

test("SSE recovers an invalid cursor and closes on session revocation", async ({ request }) => {
  const { csrf, cookie } = await login(request), abort = new AbortController();
  const response = await fetch(`${origin}/api/events?since=9007199254740990`, { headers: { Cookie: cookie }, signal: abort.signal });
  expect(response.ok).toBe(true); expect(response.headers.get("x-accel-buffering")).toBe("no");
  const reader = response.body!.getReader();
  try {
    const first = new TextDecoder().decode((await reader.read()).value); expect(first).toContain("event: snapshot"); expect(first).toContain('"recover":true');
    expect((await request.post("/api/auth", { headers: { Origin: origin, "X-CSRF-Token": csrf }, data: { action: "logout" } })).ok()).toBe(true);
    expect((await reader.read()).done).toBe(true);
    expect((await request.get("/api/control")).status()).toBe(401);
  } finally { abort.abort(); reader.releaseLock(); }
});

test("all dashboard panels pass axe checks, keyboard navigation and responsive layout without executable templates", async ({ page, request }) => {
  test.setTimeout(120000);
  const { csrf, cookie } = await login(request);
  await page.context().addCookies([{ name: "kekbot_session", value: cookie.split("=")[1], url: origin, httpOnly: true, sameSite: "Lax" }]);
  const errors: string[] = [], external: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => { const url = new URL(route.request().url()); if (url.origin !== origin) { external.push(url.origin); return route.abort(); } return route.continue(); });
  const literal = "<img src=x onerror=globalThis.__kekbotXss=1>";
  expect((await operation(request, csrf, "config.save", { kind: "command", data: { name: literal, trigger: "!campaign_literal", responses: [literal] } })).ok()).toBe(true);
  await page.goto("/"); await expect(page).toHaveTitle(/KekBot/); await expect(page.getByRole("heading", { name: "Control room" })).toBeVisible();
  const panels = ["Control room", "Connections", "Commands", "Timers", "Alerts", "Media", "Moderation", "Goals", "Points & rewards", "Polls & raffles", "Widgets", "Analytics", "Accounts", "Maintenance"];
  for (const panel of panels) {
    await page.getByRole("button", { name: panel, exact: true }).click();
    await expect(page.getByRole("heading", { name: panel, exact: true, level: 1 })).toBeVisible();
    const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    expect(scan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) })), panel).toEqual([]);
    const add = page.locator(".section-title").getByRole("button", { name: /^Add / }).first();
    if (await add.count()) {
      await add.click(); await expect(page.locator(".editor")).toBeVisible();
      const editor = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
      expect(editor.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) })), `${panel} editor`).toEqual([]);
    }
  }
  await page.getByRole("button", { name: "Commands", exact: true }).click(); await expect(page.getByRole("heading", { name: literal, exact: true })).toBeVisible();
  expect(await page.evaluate(() => Reflect.get(globalThis, "__kekbotXss"))).toBeUndefined();
  for (const width of [360, 768, 1440]) {
    await page.setViewportSize({ width, height: 1000 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole("button", { name: "Control room", exact: true }).focus(); await page.keyboard.press("Enter");
  await expect(page.getByRole("heading", { name: "Control room" })).toBeVisible();
  await page.emulateMedia({ reducedMotion: "reduce" }); expect(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches)).toBe(true);
  expect(errors).toEqual([]); expect(external).toEqual([]);
  await page.screenshot({ path: "output/playwright/campaign-desktop.png", fullPage: true });
});
