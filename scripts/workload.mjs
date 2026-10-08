import { spawn, execFileSync } from "node:child_process";
import { randomBytes, sign } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { createServer } from "node:net";
import { join, resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { parseArgs } from "node:util";
import { chromium } from "@playwright/test";
import { initialize } from "../src/server/maintenance.ts";
import { readConfig } from "../src/server/config.ts";
import { seedFixture } from "../src/server/fixture-seed.ts";

// Ordinary CI uses smoke; an explicit workflow dispatch can run the full soak.
const { values } = parseArgs({ options: { smoke: { type: "boolean" }, reference: { type: "boolean" }, "remote-config": { type: "string" } } });
const reference = Boolean(values.reference), remoteConfig = values["remote-config"];
if (reference && values.smoke) throw new Error("invalid_workload_arguments");
const profile = reference ? { sustainedSeconds: 3600, burstSeconds: 60, drainSeconds: 120 } : { sustainedSeconds: 8, burstSeconds: 2, drainSeconds: 30 };
const run = randomBytes(8).toString("hex").toUpperCase(), commandId = `workload_${run}`, widgetId = `workload_widget_${run}`;
let child, browser, localRoot, origin, privateKey, proofToken, account, cookie, csrf;
let peakRssBytes = 0, peakBacklog = 0, sequence = 0;
const requests = [], failures = [], updateMs = [];
const samples = [];
let sampleTimer, sampling = Promise.resolve();
async function availablePort() { const server = createServer(); await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); const port = server.address().port; await new Promise(resolve => server.close(resolve)); return port; }
async function waitReady() { for (let index = 0; index < 60; index++) { try { if ((await fetch(`${origin}/api/health/ready`, { signal: AbortSignal.timeout(2000) })).ok) return; } catch {} await delay(500); } throw new Error("workload_startup_failed"); }
function startLocal(env) { child = spawn(process.execPath, ["server.js"], { cwd: resolve(".next/standalone"), env: { ...process.env, ...env, NODE_ENV: "production", NEXT_TELEMETRY_DISABLED: "1", NEXT_MANUAL_SIG_HANDLE: "1" }, stdio: "ignore", windowsHide: true }); }
async function stopLocal() { if (!child || child.exitCode !== null) return; const current = child; await new Promise(resolve => { const timer = setTimeout(() => current.kill("SIGKILL"), 20000); current.once("exit", () => { clearTimeout(timer); resolve(); }); current.kill("SIGTERM"); }); child = undefined; }
async function operation(action, input = {}) {
  const response = await fetch(`${origin}/api/control`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin, Cookie: cookie, "X-CSRF-Token": csrf }, body: JSON.stringify({ action, input }), signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("workload_control_failed"); return response.json();
}
async function stats(final = false) {
  const response = await fetch(`${origin}/api/foundation/workload?run=${run}${final ? "&final=1" : ""}`, { headers: { Authorization: `Bearer ${proofToken}` }, signal: AbortSignal.timeout(10000) });
  if (!response.ok) throw new Error("workload_metrics_failed"); return response.json();
}
async function sample() { const result = await stats(); peakRssBytes = Math.max(peakRssBytes, result.rssBytes); peakBacklog = Math.max(peakBacklog, (result.counts.pendingDecisions ?? 0) + (result.counts.pendingReplies ?? 0)); return result; }
async function deliver() {
  const id = `${run}${String(++sequence).padStart(10, "0")}`, timestamp = new Date().toISOString();
  const body = JSON.stringify({ message_id: id, broadcaster: { user_id: 123 }, sender: { user_id: 456, username: "Synthetic workload viewer" }, content: `!load_${run.toLowerCase()}` });
  const started = performance.now();
  try {
    const response = await fetch(`${origin}/api/providers/kick/events`, { method: "POST", headers: { "Content-Type": "application/json", "Kick-Event-Message-Id": id, "Kick-Event-Message-Timestamp": timestamp, "Kick-Event-Signature": sign("RSA-SHA256", Buffer.from(`${id}.${timestamp}.${body}`), privateKey).toString("base64"), "Kick-Event-Type": "chat.message.sent", "Kick-Event-Version": "1" }, body, signal: AbortSignal.timeout(10000) });
    if (!response.ok || !(await response.json()).accepted) failures.push("delivery_rejected");
    samples.push(performance.now() - started);
  } catch { failures.push("delivery_failed"); }
}
async function phase(rate, seconds) {
  const started = performance.now();
  for (let index = 0; index < rate * seconds; index++) {
    const due = started + index * 1000 / rate;
    await delay(Math.max(0, due - performance.now()));
    requests.push(deliver());
  }
  await Promise.all(requests.splice(0));
}
async function visibleUpdate(pages, iteration) {
  const started = performance.now(), name = `Synthetic workload update ${iteration}`;
  const state = await (await fetch(`${origin}/api/control`, { headers: { Cookie: cookie } })).json();
  const document = state.documents.find(doc => doc.id === widgetId);
  await operation("config.save", { kind: "widget", id: widgetId, version: document.version, data: { ...document.data, name } });
  await Promise.all(pages.map(page => page.getByRole("heading", { name, exact: true }).waitFor({ state: "visible", timeout: 10000 })));
  updateMs.push(performance.now() - started);
}

try {
  let localEnv;
  if (remoteConfig) {
    const input = JSON.parse(readFileSync(remoteConfig, "utf8"));
    const url = new URL(input.origin);
    if (url.protocol !== "https:" || url.username || url.password || url.pathname !== "/" || url.search || url.hash) throw new Error("workload_requires_trusted_https_origin");
    origin = url.origin;
    privateKey = readFileSync(input.privateKeyFile); proofToken = readFileSync(input.proofTokenFile, "utf8").trim(); account = JSON.parse(readFileSync(input.accountFile, "utf8"));
  } else {
    localRoot = mkdtempSync(join(tmpdir(), "kekbot-workload-")); const port = await availablePort(); origin = `http://127.0.0.1:${port}`;
    localEnv = { KEKBOT_MODE: "fixture", KEKBOT_DATA_DIR: localRoot, KEKBOT_RUN_JOBS: "1", KEKBOT_ENABLE_PROOF: "1", KICK_BROADCASTER_USER_ID: "123", KEKBOT_PUBLIC_URL: origin, HOSTNAME: "127.0.0.1", PORT: String(port), KICK_CLIENT_ID: undefined, KICK_CLIENT_SECRET: undefined, KICK_CLIENT_SECRET_FILE: undefined, KEKBOT_ENCRYPTION_KEY_FILE: undefined, KEKBOT_PROOF_TOKEN_FILE: undefined };
    initialize(localEnv); await seedFixture(readConfig(localEnv));
    privateKey = readFileSync(join(localRoot, "fixture/secrets/fixture-private.pem")); proofToken = readFileSync(join(localRoot, "fixture/secrets/proof.token"), "utf8").trim(); account = JSON.parse(readFileSync(join(localRoot, "fixture/secrets/fixture-account.json"), "utf8"));
    startLocal(localEnv); await waitReady();
  }
  // Check isolation before authenticating or submitting any traffic, including remote runs.
  const mode = await (await fetch(`${origin}/api/auth`)).json(); if (mode.mode !== "fixture") throw new Error("workload_refuses_live_target");
  const login = await fetch(`${origin}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify({ action: "login", ...account }) });
  if (!login.ok) throw new Error("workload_login_failed"); cookie = login.headers.get("set-cookie").split(";")[0]; csrf = (await login.json()).csrf;
  await operation("config.save", { kind: "command", id: commandId, data: { name: "Synthetic workload command", trigger: `!load_${run.toLowerCase()}`, responses: ["Synthetic reply #{counter}"], cooldown: 0, userCooldown: 0, counter: true } });
  await operation("config.save", { kind: "widget", id: widgetId, data: { name: "Synthetic workload counter", type: "counter", target: commandId } });
  const token = await operation("token.create", { name: "Synthetic workload source", kind: "widget", scopes: [`widget:${widgetId}`] });
  browser = await chromium.launch(); const pages = await Promise.all(Array.from({ length: 5 }, async () => { const page = await browser.newPage(); await page.goto(`${origin}/widgets/${widgetId}?token=${token.token}`); await page.getByRole("heading", { name: "Synthetic workload counter" }).waitFor(); return page; }));
  await visibleUpdate(pages, 0); await sample();
  sampleTimer = setInterval(() => { sampling = sampling.then(() => sample()).catch(() => failures.push("metrics_unavailable")); }, 1000);
  process.stdout.write(`Running synthetic ${reference ? "reference-duration" : "smoke"} profile with five browser clients; no provider mutations.\n`);
  await phase(25, profile.sustainedSeconds); await visibleUpdate(pages, 1);
  const burstStart = performance.now(); await phase(100, profile.burstSeconds); const burstEnd = performance.now();
  let final = await sample();
  while ((final.counts.decided !== sequence || final.counts.replied !== sequence) && performance.now() - burstEnd < profile.drainSeconds * 1000) { await delay(250); final = await sample(); }
  const drainMs = performance.now() - burstEnd; await visibleUpdate(pages, 2);
  final = await stats(true);
  clearInterval(sampleTimer); await sampling;
  let restartMs = null;
  if (localEnv) {
    await stopLocal(); const started = performance.now(); startLocal(localEnv); await waitReady();
    final = await stats(true); restartMs = performance.now() - started;
  }
  const sorted = samples.toSorted((a, b) => a - b);
  const report = { format: "kekbot-workload", version: 1, at: new Date().toISOString(), sourceRef: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8", windowsHide: true }).trim(), workingTree: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8", windowsHide: true }).trim() ? "modified" : "clean", profile, targetMode: "fixture", targetLocation: remoteConfig ? "remote" : "local", referenceAcceptance: false,
    browserClients: pages.length, commandTrafficPercent: 100, sent: sequence, counts: final.counts, failures: [...new Set(failures)], peakRssBytes, peakBacklog, burstElapsedMs: burstEnd - burstStart, backlogDrainMs: drainMs, httpIntakeP95Ms: sorted[Math.ceil(sorted.length * .95) - 1] ?? null, ...final.latencies, visibleUpdateMs: updateMs, restartReadyMs: restartMs,
    limits: "Synthetic functionality evidence. Receipt-to-decision includes job waiting; fixture reply excludes provider/network latency. Source identifies the driver checkout; independently verify the remote image identity. Reference-host shape, separate driver resources, actual provider latency, backup duration and physical power loss require live acceptance." };
  mkdirSync("output/workload", { recursive: true }); writeFileSync("output/workload/report.json", JSON.stringify(report, null, 2) + "\n", { mode: 0o600 });
  process.stdout.write(`Completed ${sequence} synthetic requests; decided ${final.counts.decided}, replied ${final.counts.replied}, failures ${failures.length}. Report remains in ignored output/workload.\n`);
  if (failures.length || final.counts.decided !== sequence || final.counts.replied !== sequence || final.counts.failures) process.exitCode = 1;
} catch (error) {
  const code = /^workload_[a-z_]+$/.test(error.message) ? error.message : "workload_internal_failure";
  process.stderr.write(`${code}: no credentials or target details printed.\n`); process.exitCode = 1;
} finally {
  clearInterval(sampleTimer); await browser?.close(); await stopLocal();
  if (localRoot) rmSync(localRoot, { recursive: true, force: true });
}
