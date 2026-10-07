import type { Repository } from "./storage/repository.ts";
import { AppError } from "./errors.ts";

// Read-only, synthetic receipt aggregates. Never available in live mode.
export function workloadStats(repository: Repository, run: string, final = false) {
  if (!/^[A-F0-9]{16}$/.test(run)) throw new AppError("invalid_workload_run", 400);
  const db = repository.store.sqlite;
  const counts = db.prepare("SELECT count(*) AS received,sum(e.status='succeeded') AS decided,sum(o.status='succeeded') AS replied,sum(e.status IN ('pending','running')) AS pendingDecisions,sum(o.status IN ('pending','running')) AS pendingReplies,sum(e.status IN ('failed','uncertain') OR o.status IN ('failed','uncertain')) AS failures FROM receipts r LEFT JOIN jobs e ON e.id='event:'||r.id LEFT JOIN jobs o ON o.id='reply:'||r.id WHERE r.id LIKE ?").get(`${run}%`);
  let latencies: Record<string, number | null> | undefined;
  if (final) {
    const rows = db.prepare("SELECT e.due_at-r.received_at AS decision,o.due_at-r.received_at AS reply FROM receipts r JOIN jobs e ON e.id='event:'||r.id LEFT JOIN jobs o ON o.id='reply:'||r.id WHERE r.id LIKE ? AND e.status='succeeded' AND o.status='succeeded' LIMIT 200001").all(`${run}%`) as { decision: number; reply: number }[];
    if (rows.length > 200000) throw new AppError("workload_result_limit", 409);
    const p95 = (key: "decision" | "reply") => { const values = rows.map(row => row[key]).sort((a, b) => a - b); return values.length ? values[Math.ceil(values.length * .95) - 1] : null; };
    latencies = { receiptToDecisionP95Ms: p95("decision"), receiptToFixtureReplyP95Ms: p95("reply"), completedSamples: rows.length };
  }
  return { mode: "fixture", healthy: Date.now() - Number(repository.setting("worker_heartbeat")) < 30000, counts, rssBytes: process.memoryUsage().rss, latencies };
}
