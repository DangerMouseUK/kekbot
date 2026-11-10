// Runs after application.spec.ts (alphabetical order), which must claim the fresh installation itself.
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type APIRequestContext } from "@playwright/test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { sign } from "node:crypto";
const origin = "http://127.0.0.1:3137", password = "a strong browser fixture password";
const root = () => readFileSync("output/playwright/e2e-data-path.txt", "utf8");
async function login(request: APIRequestContext) {
  const state = await (await request.get("/api/auth")).json();
  const setup = !state.claimed ? { action: "setup", token: readFileSync(join(root(), "fixture/secrets/setup.token"), "utf8").trim() } : { action: "login" };
  const response = await request.post("/api/auth", { headers: { Origin: origin }, data: { ...setup, username: "owner", password } });
  expect(response.ok()).toBe(true); return { cookie: response.headers()["set-cookie"].split(";")[0] };
}
// Synthetic, locally signed fixture deliveries; nothing is sent to Kick.
async function kick(request: APIRequestContext, suffix: string, type: string, payload: Record<string, unknown>) {
  const body = JSON.stringify({ broadcaster: { user_id: 123 }, ...payload });
  const id = `01JAN${"0".repeat(19)}${suffix}`, timestamp = new Date().toISOString();
  const signature = sign("RSA-SHA256", Buffer.from(`${id}.${timestamp}.${body}`), readFileSync(join(root(), "fixture/secrets/fixture-private.pem"))).toString("base64");
  const response = await request.post("/api/providers/kick/events", { headers: { "Content-Type": "application/json", "Kick-Event-Message-Id": id, "Kick-Event-Message-Timestamp": timestamp, "Kick-Event-Signature": signature, "Kick-Event-Type": type, "Kick-Event-Version": "1" }, data: body });
  expect(response.ok(), type).toBe(true);
}

test("analytics shows an observed fixture stream, exports exactly the selection and passes axe", async ({ request, page }) => {
  test.setTimeout(90000);
  const { cookie } = await login(request);
  // Start the stream now: earlier specs sent chat messages that must stay outside its window.
  await kick(request, "01", "livestream.status.updated", { is_live: true, started_at: new Date().toISOString(), ended_at: null });
  await kick(request, "02", "chat.message.sent", { message_id: "analytics-chat", sender: { user_id: 456, username: "Fixture viewer" }, content: "hello analytics" });
  let streamId = "";
  await expect.poll(async () => {
    const result = await (await request.get("/api/control?view=analytics&stream=latest")).json();
    streamId = result.selection?.stream?.id ?? "";
    return result.summary?.metrics.find((metric: { id: string }) => metric.id === "chat.messages")?.value;
  }).toBe(1);

  const csv = await request.get(`/api/control?view=analytics&stream=${streamId}&format=csv&tz=0`);
  expect(csv.headers()["content-type"]).toContain("text/csv");
  expect(csv.headers()["content-disposition"]).toMatch(/^attachment; filename=kekbot-analytics-stream-\d{4}-\d{2}-\d{2}\.csv$/);
  const lines = (await csv.text()).split("\r\n");
  expect(lines[0]).toBe('"day","metric","label","unit","value","samples","minimum","maximum"');
  expect(lines.some(line => line.includes('"chat.messages","Chat messages","messages","1"'))).toBe(true);
  const json = await request.get(`/api/control?view=analytics&stream=${streamId}&format=json`);
  expect(json.headers()["content-disposition"]).toContain(".json");
  expect((await json.json()).selection.stream.id).toBe(streamId);
  // A range that ended before the stream exports headers only.
  const before = await request.get(`/api/control?view=analytics&from=${Date.now() - 3 * 86400000}&to=${Date.now() - 2 * 86400000}&format=csv`);
  expect(before.headers()["content-disposition"]).toMatch(/kekbot-analytics-\d{4}-\d{2}-\d{2}-to-\d{4}-\d{2}-\d{2}\.csv$/);
  expect((await before.text()).split("\r\n")).toHaveLength(1);
  expect((await request.get("/api/control?view=analytics&from=10&to=5")).status()).toBe(400);
  expect((await request.get("/api/control?view=analytics&stream=missing")).status()).toBe(404);

  await page.context().addCookies([{ name: "kekbot_session", value: cookie.split("=")[1], url: origin, httpOnly: true, sameSite: "Lax" }]);
  await page.goto("/");
  await page.getByRole("button", { name: "Analytics", exact: true }).click();
  await expect(page.getByRole("heading", { name: /^Stream: / })).toBeVisible();
  await expect(page.getByRole("region", { name: "Coverage" })).toContainText("does not prove that Kick or Discord delivered every event");
  const messages = page.locator(".an-card").filter({ hasText: "Chat messages" });
  await expect(messages).toContainText("1");
  await expect(page.getByRole("link", { name: "Download this selection (CSV)" })).toHaveAttribute("href", new RegExp(`stream=${streamId}`));
  const chart = page.getByRole("group", { name: /Chat messages chart/ });
  await chart.focus(); await page.keyboard.press("End");
  await expect(page.locator(".an-tooltip")).toBeVisible();
  const scan = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  expect(scan.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(node => node.target) }))).toEqual([]);
  // A preset range drops the stream from the download link.
  await page.getByLabel("Show").selectOption("7d");
  await expect(page.getByRole("link", { name: "Download this selection (CSV)" })).not.toHaveAttribute("href", /stream=/);
  await expect(page.getByRole("heading", { name: "Streams in this period" })).toBeVisible();

  // End the fixture stream so later specs see an offline channel.
  await kick(request, "03", "livestream.status.updated", { is_live: false, started_at: null, ended_at: new Date().toISOString() });
  await expect.poll(async () => (await (await request.get("/api/control?view=analytics&stream=latest")).json()).selection.stream.ongoing).toBe(false);
});
