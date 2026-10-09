import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { request as httpsRequest } from "node:https";

const name = `kekbot-ci-${process.pid}-${Date.now()}`;
const volume = `${name}-data`;
const backupVolume = `${name}-backup`;
const restoredVolume = `${name}-restored`;
const extraVolumes = [];
const network = `${name}-network`, proxy = `${name}-proxy`;
const temporary = mkdtempSync(join(tmpdir(), "kekbot-proxy-fixture-"));
const docker = args => execFileSync("docker", args, { encoding: "utf8", windowsHide: true }).trim();
const publicOrigin = "https://kekbot.example";
const options = ["--env", "KEKBOT_MODE=fixture", "--env", "KEKBOT_ENABLE_PROOF=1", "--env", `KEKBOT_PUBLIC_URL=${publicOrigin}`, "--env", "KICK_BROADCASTER_USER_ID=123", "--volume", `${volume}:/data`];
let created = false;
let started = false;
let networkCreated = false, proxyStarted = false;
async function ready(origin) {
  for (let attempt = 0; attempt < 70; attempt++) {
    try { if ((await fetch(`${origin}/api/health/ready`, { signal: AbortSignal.timeout(2000) })).ok) return; } catch {}
    await delay(1000);
  }
  throw new Error("container_readiness_failed");
}
function trustedProxy(port, ca, token, protectedStatus = false) {
  return new Promise((resolve, reject) => {
    const request = httpsRequest({ hostname: "127.0.0.1", port, servername: "kekbot.example", ca, rejectUnauthorized: true, path: protectedStatus ? "/api/foundation/status" : "/api/health/ready", headers: { Host: "kekbot.example", Authorization: `Bearer ${token}` } }, response => {
      if (response.statusCode !== 200 || !response.socket.authorized || !response.headers["content-type"]?.startsWith("application/json")) { response.resume(); reject(new Error("proxy_tls_or_readiness_failed")); return; }
      response.resume(); response.once("end", resolve);
    });
    request.setTimeout(10000, () => request.destroy(new Error("proxy_timeout"))); request.once("error", reject); request.end();
  });
}
async function waitProxy(port, ca, token) {
  for (let attempt = 0; attempt < 30; attempt++) { try { await trustedProxy(port, ca, token); return; } catch { await delay(500); } }
  throw new Error("proxy_trusted_tls_not_ready");
}
try {
  docker(["network", "create", network]); networkCreated = true;
  docker(["volume", "create", volume]); created = true;
  docker(["run", "--rm", ...options, "kekbot:ci", "node", "src/cli.ts", "init"]);
  docker(["run", "--rm", ...options, "kekbot:ci", "node", "src/cli.ts", "fixture-seed"]);
  docker(["run", "--detach", "--name", name, ...options, "--network", network, "--network-alias", "kekbot", "--read-only", "--tmpfs", "/tmp:rw,nosuid,size=16m", "--publish", "127.0.0.1::3000", "kekbot:ci"]); started = true;
  const binding = docker(["port", name, "3000/tcp"]);
  let origin = `http://${binding}`;
  await ready(origin);
  if (docker(["exec", name, "id", "-u"]) !== "1000") throw new Error("container_not_non_root");
  docker(["exec", name, "node", "-e", "for(const binary of ['npm','npx','corepack','yarn','yarnpkg']) {const result=require('node:child_process').spawnSync(binary,['--version']); if(result.error?.code!=='ENOENT') process.exit(1)}"]);
  // The image root is read-only; only /data and the bounded temporary mount write.
  docker(["exec", name, "node", "-e", "try {require('node:fs').writeFileSync('/app/forbidden','x'); process.exit(1)} catch(e) {if(!['EROFS','EACCES'].includes(e.code)) process.exit(1)}"]);
  const credentials = JSON.parse(docker(["exec", name, "node", "-e", "process.stdout.write(require('node:fs').readFileSync('/data/fixture/secrets/fixture-account.json','utf8'))"]));
  // Mutations use the configured public origin even when this driver reaches the
  // loopback Docker binding directly. Do not relax the application's CSRF check.
  const login = await fetch(`${origin}/api/auth`, { method: "POST", headers: { "Content-Type": "application/json", Origin: publicOrigin }, body: JSON.stringify({ action: "login", ...credentials }) });
  if (!login.ok) throw new Error("container_account_login_failed");
  if (!login.headers.get("set-cookie")?.includes("; Secure")) throw new Error("container_https_session_not_secure");
  const cookie = login.headers.get("set-cookie")?.split(";")[0];
  const state = await fetch(`${origin}/api/control`, { headers: { Cookie: cookie } });
  if (!state.ok || (await state.json()).documents.filter(doc => doc.kind === "widget").length !== 18) throw new Error("container_modules_missing");
  const denied = await fetch(`${origin}/api/foundation/probe`, { method: "POST" });
  if (denied.status !== 401) throw new Error("container_mutation_not_protected");
  const token = docker(["exec", name, "node", "-e", "process.stdout.write(require('node:fs').readFileSync('/data/fixture/secrets/proof.token','utf8').trim())"]);
  const capture = await fetch(`${origin}/api/foundation/kick/capture`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  if (!capture.ok) throw new Error("container_capture_arm_failed");
  docker(["exec", "--env", "KEKBOT_PUBLIC_URL=http://127.0.0.1:3000", name, "node", "src/cli.ts", "fixture-event"]);
  let processed = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const status = await (await fetch(`${origin}/api/foundation/status`, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (status.fixtureLastReply) { processed = true; break; }
    await delay(250);
  }
  if (!processed) throw new Error("container_worker_did_not_process_fixture");
  const proxyData = `${name}-proxy-data`; docker(["volume", "create", proxyData]); extraVolumes.push(proxyData);
  const proxyConfig = join(temporary, "Caddyfile");
  writeFileSync(proxyConfig, "{\n admin off\n}\nhttps://kekbot.example {\n tls internal\n reverse_proxy kekbot:3000 {\n flush_interval -1\n }\n}\n");
  docker(["run", "--detach", "--name", proxy, "--network", network, "--publish", "127.0.0.1::443", "--volume", `${proxyData}:/data`, "--volume", `${proxyConfig}:/etc/caddy/Caddyfile:ro`, "kekbot-caddy:2.11.6"]); proxyStarted = true;
  const caPath = join(temporary, "root.crt");
  for (let attempt = 0; attempt < 30; attempt++) {
    try { docker(["cp", `${proxy}:/data/caddy/pki/authorities/local/root.crt`, caPath]); break; } catch { await delay(500); }
  }
  const ca = readFileSync(caPath); let proxyPort = Number(docker(["port", proxy, "443/tcp"]).split(":").at(-1));
  await waitProxy(proxyPort, ca, token);
  // Exercise an actual event stream through Caddy with hostname and CA validation.
  await new Promise((resolve, reject) => {
    const req = httpsRequest({ hostname: "127.0.0.1", port: proxyPort, servername: "kekbot.example", ca, rejectUnauthorized: true, path: "/api/events", headers: { Host: "kekbot.example", Cookie: cookie } }, res => {
      if (res.statusCode !== 200 || !res.headers["content-type"]?.startsWith("text/event-stream") || !res.socket.authorized) { res.resume(); reject(new Error("proxy_stream_headers_failed")); return; }
      res.once("data", chunk => { if (!chunk.toString().includes("event: snapshot")) reject(new Error("proxy_stream_buffered_or_invalid")); else resolve(); req.destroy(); });
    });
    req.setTimeout(5000, () => req.destroy(new Error("proxy_stream_timeout"))); req.once("error", reject); req.end();
  });
  docker(["restart", proxy]); await delay(1000); docker(["cp", `${proxy}:/data/caddy/pki/authorities/local/root.crt`, caPath]);
  if (!readFileSync(caPath).equals(ca)) throw new Error("proxy_certificate_storage_not_persistent");
  proxyPort = Number(docker(["port", proxy, "443/tcp"]).split(":").at(-1)); await waitProxy(proxyPort, ca, token);
  await trustedProxy(proxyPort, ca, token, true);
  docker(["kill", "--signal", "KILL", name]); docker(["start", name]);
  origin = `http://${docker(["port", name, "3000/tcp"])}`;
  await ready(origin);
  const afterRestart = await (await fetch(`${origin}/api/foundation/status`, { headers: { Authorization: `Bearer ${token}` } })).json();
  if (!afterRestart.fixtureLastReply) throw new Error("container_restart_lost_acknowledged_work");
  docker(["stop", name]); started = false;
  docker(["run", "--rm", ...options, "kekbot:ci", "node", "src/cli.ts", "doctor"]);
  for (const target of [backupVolume, restoredVolume]) {
    docker(["volume", "create", target]); extraVolumes.push(target);
  }
  docker(["run", "--rm", "--user", "0", "--volume", `${backupVolume}:/backups`, "kekbot:ci", "chown", "1000:1000", "/backups"]);
  docker(["run", "--rm", ...options, "kekbot:ci", "node", "-e", "require('node:fs').writeFileSync('/data/fixture/assets/proof.txt','fixture recovery asset')"]);
  docker(["run", "--rm", ...options, "--volume", `${backupVolume}:/backups`, "kekbot:ci", "node", "src/cli.ts", "backup", "/backups/snapshot"]);
  const restoredOptions = ["--env", "KEKBOT_MODE=fixture", "--env", "KICK_BROADCASTER_USER_ID=123", "--volume", `${restoredVolume}:/data`];
  docker(["run", "--rm", ...restoredOptions, "--volume", `${volume}:/original:ro`, "kekbot:ci", "node", "-e", `
    const fs = require('node:fs');
    fs.mkdirSync('/data/fixture/secrets', {recursive:true, mode:0o700});
    for (const file of ['encryption.key','fixture-public.pem','fixture-private.pem','fixture-discord-public.pem','fixture-discord-private.pem']) fs.copyFileSync('/original/fixture/secrets/'+file,'/data/fixture/secrets/'+file);
    fs.writeFileSync('/data/fixture/secrets/proof.token',require('node:crypto').randomBytes(32).toString('base64url')+'\\n',{mode:0o600});
  `]);
  // A read-only backup mount catches WAL sidecar dependencies hidden by host tests.
  docker(["run", "--rm", ...restoredOptions, "--volume", `${backupVolume}:/backups:ro`, "kekbot:ci", "node", "src/cli.ts", "restore", "/backups/snapshot"]);
  docker(["run", "--rm", ...restoredOptions, "kekbot:ci", "node", "--input-type=module", "-e", `
    import assert from 'node:assert/strict';
    import {existsSync,readFileSync} from 'node:fs';
    import {readConfig} from './src/server/config.ts';
    import {openStore} from './src/server/storage/database.ts';
    import {Repository} from './src/server/storage/repository.ts';
    const store = openStore(readConfig()); const repository = new Repository(store);
    try {
      const receipt = store.sqlite.prepare('SELECT id,event_type,payload FROM receipts').get();
      assert.ok(receipt); assert.equal(repository.acceptReceipt(receipt.id,receipt.event_type,JSON.parse(receipt.payload)),false);
      assert.equal(store.sqlite.prepare("SELECT count(*) AS n FROM jobs WHERE kind='kick.reply' AND status='succeeded'").get().n,1);
      assert.equal(readFileSync('/data/fixture/assets/proof.txt','utf8'),'fixture recovery asset');
      assert.equal(existsSync('/data/fixture/secrets/proof-captures'),false);
      assert.equal(store.sqlite.prepare("SELECT count(*) AS n FROM accounts WHERE role='owner'").get().n,1);
      assert.equal(store.sqlite.prepare("SELECT count(*) AS n FROM documents WHERE kind='widget'").get().n,18);
      assert.equal(store.sqlite.prepare("SELECT sum(amount) AS balance FROM ledger WHERE viewer='456'").get().balance,100);
    } finally { store.close(); }
  `]);
  process.stdout.write("Non-root/read-only image, trusted fixture TLS and SSE proxy, persistent CA storage, abrupt restart, signed intake, backup/assets/module restore and duplicate protection passed.\n");
} finally {
  if (proxyStarted) docker(["rm", "--force", proxy]);
  if (started) docker(["rm", "--force", name]);
  else if (created) { try { docker(["rm", name]); } catch {} }
  if (created) docker(["volume", "rm", volume]);
  for (const target of extraVolumes) docker(["volume", "rm", target]);
  if (networkCreated) docker(["network", "rm", network]);
  rmSync(temporary, { recursive: true, force: true });
}
