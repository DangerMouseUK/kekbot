import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const name = `kekbot-ci-${process.pid}-${Date.now()}`;
const volume = `${name}-data`;
const docker = args => execFileSync("docker", args, { encoding: "utf8", windowsHide: true }).trim();
const options = ["--env", "KEKBOT_MODE=fixture", "--env", "KICK_BROADCASTER_USER_ID=123", "--volume", `${volume}:/data`];
let created = false;
let started = false;
try {
  docker(["volume", "create", volume]); created = true;
  docker(["run", "--rm", ...options, "kekbot:ci", "node", "src/cli.ts", "init"]);
  docker(["run", "--detach", "--name", name, ...options, "--publish", "127.0.0.1::3000", "kekbot:ci"]); started = true;
  const binding = docker(["port", name, "3000/tcp"]);
  const origin = `http://${binding}`;
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    try { ready = (await fetch(`${origin}/api/health/ready`)).ok; } catch {}
    if (ready) break;
    await delay(1000);
  }
  if (!ready) throw new Error("container_readiness_failed");
  const denied = await fetch(`${origin}/api/foundation/probe`, { method: "POST" });
  if (denied.status !== 401) throw new Error("container_mutation_not_protected");
  docker(["exec", name, "node", "src/cli.ts", "fixture-event"]);
  const token = docker(["exec", name, "node", "-e", "process.stdout.write(require('node:fs').readFileSync('/data/fixture/secrets/proof.token','utf8').trim())"]);
  let processed = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const status = await (await fetch(`${origin}/api/foundation/status`, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (status.fixtureLastReply) { processed = true; break; }
    await delay(250);
  }
  if (!processed) throw new Error("container_worker_did_not_process_fixture");
  docker(["stop", name]); started = false;
  docker(["run", "--rm", ...options, "kekbot:ci", "node", "src/cli.ts", "doctor"]);
  process.stdout.write("Non-root container initialization, readiness, protected mutation, signed fixture, and clean shutdown passed.\n");
} finally {
  if (started) docker(["rm", "--force", name]);
  else if (created) { try { docker(["rm", name]); } catch {} }
  if (created) docker(["volume", "rm", volume]);
}
