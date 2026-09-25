import type { APIRoute } from "astro";
import { bus, type PlanEvent } from "../../lib/events";

// The minimal server-sent-events (SSE) pattern: a long-lived streaming
// response the browser consumes with `new EventSource("/api/events")`.
// SSE is one-directional (server → browser) and plain HTTP, which makes it
// the simplest live channel that works everywhere. Every plan change is
// broadcast here; a page filters for the plan it shows.
export const GET: APIRoute = () => {
  let onEvent: (event: PlanEvent) => void;
  let heartbeat: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<string>({
    start(controller) {
      // an opening comment so the client (and the post-deploy CI probe) sees
      // bytes immediately, and a periodic one so proxies don't drop the
      // connection as idle
      controller.enqueue(": connected\n\n");
      heartbeat = setInterval(() => controller.enqueue(": ping\n\n"), 30_000);
      onEvent = (event) => {
        controller.enqueue(`data: ${JSON.stringify(event)}\n\n`);
      };
      bus.on("plan", onEvent);
    },
    cancel() {
      clearInterval(heartbeat);
      bus.off("plan", onEvent);
    },
  });

  return new Response(stream.pipeThrough(new TextEncoderStream()), {
    headers: {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
    },
  });
};
