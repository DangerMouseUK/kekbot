import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sign } from "node:crypto";

function secrets() {
  const root = readFileSync("output/playwright/e2e-data-path.txt", "utf8");
  return { token: readFileSync(join(root, "fixture/secrets/proof.token"), "utf8").trim(), privateKey: readFileSync(join(root, "fixture/secrets/fixture-private.pem"), "utf8") };
}

test("operator controls are protected and the browser shows real fixture state", async ({ page, request }) => {
  const denied = await request.get("/api/foundation/status");
  expect(denied.status()).toBe(401);
  const mutation = await request.post("/api/foundation/probe");
  expect(mutation.status()).toBe(401);
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "KekBot", exact: true })).toBeVisible();
  await page.getByLabel("Foundation proof token").fill(secrets().token);
  await page.getByRole("button", { name: "Inspect status" }).click();
  await expect(page.locator("pre")).toContainText('"mode": "fixture"');
  await expect(page.locator("pre")).toContainText('"runtimeHealthy": true');
  await page.getByRole("button", { name: "Authorize Kick", exact: true }).click();
  await expect(page.locator("pre")).toContainText("live_actions_disabled_in_fixture_mode");
});

test("standalone jobs run without a dashboard and signed deliveries cannot repeat", async ({ request }) => {
  const { token, privateKey } = secrets();
  const authorization = { Authorization: `Bearer ${token}` };
  const probe = await request.post("/api/foundation/probe", { headers: authorization });
  expect(probe.status()).toBe(202);
  const { id } = await probe.json();
  await expect.poll(async () => (await (await request.get("/api/foundation/status", { headers: authorization })).json()).proofLastRecord).toBe(id);
  const eventId = "01J00000000000000000000001";
  const timestamp = new Date().toISOString();
  const body = JSON.stringify({ message_id: "e2e-message", broadcaster: { user_id: 123 }, sender: { user_id: 456 }, content: "!kekbot" });
  const headers = { "Content-Type": "application/json", "Kick-Event-Message-Id": eventId, "Kick-Event-Message-Timestamp": timestamp,
    "Kick-Event-Type": "chat.message.sent", "Kick-Event-Version": "1", "Kick-Event-Signature": sign("RSA-SHA256", Buffer.from(`${eventId}.${timestamp}.${body}`), privateKey).toString("base64") };
  const accepted = await request.post("/api/providers/kick/events", { headers, data: body });
  expect(accepted.status()).toBe(200);
  expect((await accepted.json()).accepted).toBe(true);
  const replay = await request.post("/api/providers/kick/events", { headers, data: body });
  expect((await replay.json()).duplicate).toBe(true);
  await expect.poll(async () => (await (await request.get("/api/foundation/status", { headers: authorization })).json()).fixtureLastReply).toBe(`reply:${eventId}`);
  const tampered = await request.post("/api/providers/kick/events", { headers, data: body.replace("!kekbot", "forged") });
  expect(tampered.status()).toBe(401);
});

test("failed proof-token guesses are limited without locking out the host operator", async ({ request }) => {
  let lastStatus = 0;
  for (let attempt = 0; attempt < 61; attempt++) {
    lastStatus = (await request.get("/api/foundation/status", { headers: { Authorization: `Bearer ${"x".repeat(43)}` } })).status();
  }
  expect(lastStatus).toBe(429);
  const authorized = await request.get("/api/foundation/status", { headers: { Authorization: `Bearer ${secrets().token}` } });
  expect(authorized.status()).toBe(200);
});
