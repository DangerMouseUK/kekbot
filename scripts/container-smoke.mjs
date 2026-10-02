import { execFileSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const name = `kekbot-ci-${process.pid}-${Date.now()}`;
const volume = `${name}-data`;
const backupVolume = `${name}-backup`;
const restoredVolume = `${name}-restored`;
const extraVolumes = [];
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
  const token = docker(["exec", name, "node", "-e", "process.stdout.write(require('node:fs').readFileSync('/data/fixture/secrets/proof.token','utf8').trim())"]);
  const capture = await fetch(`${origin}/api/foundation/kick/capture`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  if (!capture.ok) throw new Error("container_capture_arm_failed");
  docker(["exec", name, "node", "src/cli.ts", "fixture-event"]);
  let processed = false;
  for (let attempt = 0; attempt < 20; attempt++) {
    const status = await (await fetch(`${origin}/api/foundation/status`, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (status.fixtureLastReply) { processed = true; break; }
    await delay(250);
  }
  if (!processed) throw new Error("container_worker_did_not_process_fixture");
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
    for (const file of ['encryption.key','fixture-public.pem','fixture-private.pem']) fs.copyFileSync('/original/fixture/secrets/'+file,'/data/fixture/secrets/'+file);
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
    } finally { store.close(); }
  `]);
  process.stdout.write("Non-root container startup, protected capture, signed fixture, shutdown, read-only backup restore, assets and duplicate protection passed.\n");
} finally {
  if (started) docker(["rm", "--force", name]);
  else if (created) { try { docker(["rm", name]); } catch {} }
  if (created) docker(["volume", "rm", volume]);
  for (const target of extraVolumes) docker(["volume", "rm", target]);
}
