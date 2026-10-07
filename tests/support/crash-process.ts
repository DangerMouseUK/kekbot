import { readConfig } from "../../src/server/config.ts";
import { openStore } from "../../src/server/storage/database.ts";
import { Repository } from "../../src/server/storage/repository.ts";

try {
  const store = openStore(readConfig()), repo = new Repository(store);
  const operation = process.argv[2];
  if (operation === "migrate") { store.close(); process.exit(0); }
  repo.set("acknowledged", "survives_abrupt_termination");
  repo.enqueue("recover-local", "proof.record", {}, 0);
  repo.claim(100, 10);
  repo.enqueue("abandoned-send", "kick.reply", {}, 0);
  repo.claim(100, 10);
  store.sqlite.exec("BEGIN IMMEDIATE");
  repo.set("uncommitted", "must_roll_back");
  process.send?.({ ready: true });
  setInterval(() => {}, 1000);
} catch {
  process.stderr.write("isolated_migration_or_storage_failure\n");
  process.exitCode = 1;
}
