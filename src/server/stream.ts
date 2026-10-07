import { AppError } from "./errors.ts";
import { getRuntime } from "./runtime.ts";
import { requireAccount } from "./http.ts";

export function eventStream(request: Request, widgetId?: string) {
  const app = getRuntime();
  const token = new URL(request.url).searchParams.get("token") ?? "";
  const validate = () => widgetId ? app.bot.presentation.token(token, "widget", `widget:${widgetId}`) : requireAccount(request);
  validate();
  const encoder = new TextEncoder();
  let cursor = Number(request.headers.get("last-event-id") ?? new URL(request.url).searchParams.get("since") ?? 0);
  if (!Number.isSafeInteger(cursor) || cursor < 0) throw new AppError("invalid_event_cursor", 400);
  let timer: ReturnType<typeof setInterval> | undefined;
  let stopped = false;
  const stream = new ReadableStream({
    start(controller) {
      const stop = () => { if (!stopped) { stopped = true; clearInterval(timer); request.signal.removeEventListener("abort", stop); controller.close(); } };
      request.signal.addEventListener("abort", stop);
      const send = (event: string, id: number, data: unknown) => controller.enqueue(encoder.encode(`id: ${id}\nevent: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      let heartbeat = 0;
      const pump = () => {
        if (stopped) return;
        try {
          validate();
          const bounds = app.bot.state.db.prepare("SELECT min(id) AS first,max(id) AS last FROM live_events").get() as { first: number | null; last: number | null };
          if (cursor === 0 || cursor < (bounds.first ?? 0) - 1 || cursor > (bounds.last ?? 0)) {
            cursor = bounds.last ?? 0;
            send("snapshot", cursor, widgetId ? app.bot.presentation.widget(widgetId) : { recover: true });
          } else {
            const events = app.bot.state.db.prepare("SELECT id FROM live_events WHERE id>? ORDER BY id LIMIT 100").all(cursor) as { id: number }[];
            if (events.length) { cursor = events.at(-1)!.id; send("change", cursor, widgetId ? app.bot.presentation.widget(widgetId) : { recover: false }); }
          }
          if (++heartbeat % 60 === 0) controller.enqueue(encoder.encode(": heartbeat\n\n"));
        } catch { stop(); }
      };
      pump(); if (!stopped) timer = setInterval(pump, 250);
    },
    cancel() { stopped = true; clearInterval(timer); }
  });
  return new Response(stream, { headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-store, no-transform", "X-Accel-Buffering": "no", Connection: "keep-alive" } });
}
