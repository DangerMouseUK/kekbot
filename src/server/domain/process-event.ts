import { eq } from "drizzle-orm";
import { z } from "zod";
import type { Job, Repository } from "../storage/repository.ts";
import { receipts } from "../storage/schema.ts";
import { AppError } from "../errors.ts";

export function processEvent(repository: Repository, job: Job) {
  const payload = z.object({ receiptId: z.string() }).parse(JSON.parse(job.payload));
  repository.store.sqlite.transaction(() => {
    const receipt = repository.store.orm.select().from(receipts).where(eq(receipts.id, payload.receiptId)).get();
    if (!receipt?.payload) throw new AppError("receipt_payload_missing", 500);
    const event = JSON.parse(receipt.payload) as { content?: string; is_live?: boolean };
    const lastReply = Number(repository.setting("proof_last_reply_decision_at") ?? 0);
    if (receipt.eventType === "chat.message.sent" && event.content?.trim().toLowerCase() === "!kekbot" && Date.now() - lastReply >= 10000) {
      repository.enqueue(`reply:${receipt.id}`, "kick.reply", { receiptId: receipt.id });
      repository.set("proof_last_reply_decision_at", String(Date.now()));
    }
    if (receipt.eventType === "livestream.status.updated") repository.set("stream_is_live", String(event.is_live));
    repository.set("last_processed_event", receipt.id);
    repository.finish(job, "succeeded");
  }).immediate();
}
